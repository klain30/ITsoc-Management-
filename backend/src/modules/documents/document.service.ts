import { DocumentCategory, DocumentVisibility, Prisma } from '@prisma/client';
import { z } from 'zod';

import { notFound } from '../../common/errors.js';
import { paginated, paginationSchema, searchSchema, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';

const metadataFields = {
  title: z.string().trim().min(3).max(150),
  description: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((value) => value || null),
  category: z.nativeEnum(DocumentCategory),
  visibility: z.nativeEnum(DocumentVisibility).default('OFFICERS'),
};

/** Multipart text fields arrive as strings; these schemas validate them. */
export const uploadDocumentSchema = z.object(metadataFields);
export const updateDocumentSchema = z
  .object({ ...metadataFields, visibility: z.nativeEnum(DocumentVisibility) })
  .partial()
  .strict();

export const listDocumentsSchema = paginationSchema.extend({
  category: z.nativeEnum(DocumentCategory).optional(),
  search: searchSchema,
});

/** Officers with documents:read see everything; members only see MEMBERS-visible documents. */
export type DocumentViewer = { canReadOfficerDocs: boolean };

const visibilityFilter = (viewer: DocumentViewer): Prisma.DocumentWhereInput =>
  viewer.canReadOfficerDocs ? {} : { visibility: 'MEMBERS' };

const documentSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  visibility: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { member: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.DocumentSelect;

const toDto = ({ uploadedBy, ...doc }: Prisma.DocumentGetPayload<{ select: typeof documentSelect }>) => ({
  ...doc,
  uploadedBy: `${uploadedBy.member.firstName} ${uploadedBy.member.lastName}`,
});

export const listDocuments = async (input: z.infer<typeof listDocumentsSchema>, viewer: DocumentViewer) => {
  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    category: input.category,
    ...visibilityFilter(viewer),
    OR: input.search
      ? [
          { title: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
          { originalName: { contains: input.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [rows, total] = await prisma.$transaction([
    prisma.document.findMany({ where, select: documentSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(input) }),
    prisma.document.count({ where }),
  ]);
  return paginated(rows.map(toDto), total, input);
};

const findVisible = async (id: string, viewer: DocumentViewer) => {
  const document = await prisma.document.findFirst({ where: { id, deletedAt: null, ...visibilityFilter(viewer) } });
  // Hidden documents look exactly like missing ones.
  if (!document) throw notFound('Document');
  return document;
};

export const getDocument = async (id: string, viewer: DocumentViewer) => {
  await findVisible(id, viewer);
  return toDto(await prisma.document.findUniqueOrThrow({ where: { id }, select: documentSelect }));
};

export const uploadDocument = async (
  input: z.infer<typeof uploadDocumentSchema>,
  file: { buffer: Buffer; originalname: string },
  actor: ActorContext & { userId: string },
) => {
  const stored = await storage.save('document', file);
  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          ...input,
          fileKey: stored.key,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          uploadedById: actor.userId,
        },
        select: documentSelect,
      });
      await recordAudit(tx, actor, {
        action: 'document.uploaded',
        entityType: 'Document',
        entityId: document.id,
        metadata: { title: document.title, category: document.category, visibility: document.visibility, fileName: stored.originalName },
      });
      return toDto(document);
    });
  } catch (error) {
    await storage.remove(stored.key);
    throw error;
  }
};

export const updateDocument = async (id: string, input: z.infer<typeof updateDocumentSchema>, actor: ActorContext) => {
  const before = await findVisible(id, { canReadOfficerDocs: true });
  return prisma.$transaction(async (tx) => {
    const document = await tx.document.update({ where: { id }, data: input, select: documentSelect });
    await recordAudit(tx, actor, {
      action: 'document.updated',
      entityType: 'Document',
      entityId: id,
      metadata: { changes: diffFields(before, input) },
    });
    return toDto(document);
  });
};

/** Soft delete: the record and file are kept for the audit trail. */
export const deleteDocument = async (id: string, actor: ActorContext & { userId: string }) => {
  const document = await findVisible(id, { canReadOfficerDocs: true });
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.userId } });
    await recordAudit(tx, actor, {
      action: 'document.deleted',
      entityType: 'Document',
      entityId: id,
      metadata: { title: document.title },
    });
  });
};

export const openDocumentFile = async (id: string, viewer: DocumentViewer) => {
  const document = await findVisible(id, viewer);
  return { stream: storage.open(document.fileKey), mimeType: document.mimeType, fileName: document.originalName };
};
