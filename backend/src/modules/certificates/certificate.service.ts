import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { notFound, unprocessable } from '../../common/errors.js';
import { paginated, paginationSchema, searchSchema, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { randomCode } from '../../lib/tokens.js';
import { recordAudit } from '../audit/audit.service.js';
import { notifyMembers } from '../notifications/notification.service.js';
import { getOrganization } from '../organization/organization.service.js';
import { renderCertificatePdf, verificationUrl } from './certificate-pdf.js';

export const revokeSchema = z.object({ reason: z.string().trim().min(5).max(300) });

export const listCertificatesSchema = paginationSchema.extend({
  eventId: z.string().max(40).optional(),
  search: searchSchema,
});

const newCode = () => `ITSOC-${randomCode(4)}-${randomCode(4)}`;

const certificateSelect = {
  id: true,
  code: true,
  recipientName: true,
  eventName: true,
  eventDate: true,
  issuedAt: true,
  revokedAt: true,
  revokedReason: true,
  eventId: true,
  memberId: true,
} satisfies Prisma.CertificateSelect;

type CertificateRow = Prisma.CertificateGetPayload<{ select: typeof certificateSelect }>;

const toDto = (row: CertificateRow) => ({ ...row, verificationUrl: verificationUrl(row.code), isValid: !row.revokedAt });

/**
 * Issues certificates to every member who attended (PRESENT or LATE) a
 * completed event and does not have one yet. Safe to run repeatedly.
 */
export const issueForEvent = async (eventId: string, actor: ActorContext & { userId: string }) => {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('Event');
  if (event.status !== 'COMPLETED') throw unprocessable('Certificates can only be issued for completed events.');

  const eligible = await prisma.attendance.findMany({
    where: { eventId, status: { in: ['PRESENT', 'LATE'] }, member: { certificates: { none: { eventId } } } },
    select: { member: { select: { id: true, firstName: true, middleName: true, lastName: true } } },
  });
  if (eligible.length === 0) return { issued: 0 };

  const rows = eligible.map(({ member }) => ({
    code: newCode(),
    eventId,
    memberId: member.id,
    recipientName: [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' '),
    eventName: event.name,
    eventDate: event.startsAt,
    issuedById: actor.userId,
  }));

  const issued = await prisma.$transaction(async (tx) => {
    // skipDuplicates covers a concurrent run; a code collision (≈1 in 10^12) aborts and can be retried.
    const result = await tx.certificate.createMany({ data: rows, skipDuplicates: true });
    await notifyMembers(
      tx,
      rows.map((row) => row.memberId),
      {
        type: 'CERTIFICATE_AVAILABLE',
        title: 'Certificate available',
        body: `Your certificate for "${event.name}" is ready to download.`,
        link: '/certificates',
      },
    );
    await recordAudit(tx, actor, {
      action: 'certificate.issued',
      entityType: 'Event',
      entityId: eventId,
      metadata: { event: event.name, count: result.count },
    });
    return result.count;
  });
  return { issued };
};

export const listCertificates = async (input: z.infer<typeof listCertificatesSchema>) => {
  const where: Prisma.CertificateWhereInput = {
    eventId: input.eventId,
    OR: input.search
      ? [
          { recipientName: { contains: input.search, mode: 'insensitive' } },
          { code: { contains: input.search, mode: 'insensitive' } },
          { eventName: { contains: input.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [rows, total] = await prisma.$transaction([
    prisma.certificate.findMany({ where, select: certificateSelect, orderBy: { issuedAt: 'desc' }, ...toSkipTake(input) }),
    prisma.certificate.count({ where }),
  ]);
  return paginated(rows.map(toDto), total, input);
};

export const listMyCertificates = async (memberId: string) => {
  const rows = await prisma.certificate.findMany({ where: { memberId }, select: certificateSelect, orderBy: { issuedAt: 'desc' } });
  return rows.map(toDto);
};

export const getCertificate = async (id: string) => {
  const row = await prisma.certificate.findUnique({ where: { id }, select: certificateSelect });
  if (!row) throw notFound('Certificate');
  return toDto(row);
};

export const revokeCertificate = async (id: string, reason: string, actor: ActorContext) => {
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) throw notFound('Certificate');
  if (certificate.revokedAt) throw unprocessable('This certificate has already been revoked.');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.certificate.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
      select: certificateSelect,
    });
    await recordAudit(tx, actor, {
      action: 'certificate.revoked',
      entityType: 'Certificate',
      entityId: id,
      metadata: { code: certificate.code, reason },
    });
    return toDto(updated);
  });
};

export const renderPdf = async (id: string) => {
  const certificate = await getCertificate(id);
  if (!certificate.isValid) throw unprocessable('This certificate has been revoked.');

  const [organization, president] = await Promise.all([
    getOrganization(),
    prisma.positionAssignment.findFirst({
      where: { endDate: null, position: { name: 'President' } },
      select: { member: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const signatories = president
    ? [{ name: `${president.member.firstName} ${president.member.lastName}`, title: `President, ${organization.shortName}` }]
    : [];

  const pdf = await renderCertificatePdf({ ...certificate, organization, signatories });
  return { pdf, fileName: `certificate-${certificate.code}.pdf` };
};

/**
 * Public verification. Returns only what is printed on the certificate
 * itself — no email, student ID or other private details.
 */
export const verifyByCode = async (code: string) => {
  const normalised = code.trim().toUpperCase();
  if (!/^ITSOC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalised)) throw notFound('Certificate');
  const [certificate, organization] = await Promise.all([
    prisma.certificate.findUnique({
      where: { code: normalised },
      select: { code: true, recipientName: true, eventName: true, eventDate: true, issuedAt: true, revokedAt: true },
    }),
    getOrganization(),
  ]);
  if (!certificate) throw notFound('Certificate');
  return {
    certificateId: certificate.code,
    recipientName: certificate.recipientName,
    event: certificate.eventName,
    eventDate: certificate.eventDate,
    organization: `${organization.name} — ${organization.university}`,
    dateIssued: certificate.issuedAt,
    status: certificate.revokedAt ? ('REVOKED' as const) : ('VALID' as const),
    revokedAt: certificate.revokedAt,
  };
};
