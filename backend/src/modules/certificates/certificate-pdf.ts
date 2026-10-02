import PDFDocument from 'pdfkit';

import { env } from '../../config/env.js';
import { renderQrDataUrl } from '../attendance/qr-code.js';

export type CertificatePdfData = {
  code: string;
  recipientName: string;
  eventName: string;
  eventDate: Date;
  issuedAt: Date;
  organization: { name: string; shortName: string; university: string };
  signatories: { name: string; title: string }[];
};

export const verificationUrl = (code: string) => `${env.appUrl}/verify/certificate/${encodeURIComponent(code)}`;

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: env.timezone }).format(date);

const INK = '#0f172a';
const MUTED = '#475569';
// ITSoc seal ring blue.
const ACCENT = '#0170bf';

/** Renders a landscape A4 certificate with a QR code that links to the public verification page. */
export const renderCertificatePdf = async (data: CertificatePdfData): Promise<Buffer> => {
  const qrDataUrl = await renderQrDataUrl(verificationUrl(data.code));
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: { Title: `Certificate ${data.code}`, Author: data.organization.name, Subject: data.eventName },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const { width, height } = doc.page;

  // Frame
  doc.rect(24, 24, width - 48, height - 48).lineWidth(3).stroke(ACCENT);
  doc.rect(34, 34, width - 68, height - 68).lineWidth(0.75).stroke(ACCENT);

  const center = (text: string, y: number, font: string, size: number, color = INK) =>
    doc.font(font).fontSize(size).fillColor(color).text(text, 60, y, { width: width - 120, align: 'center' });

  center(data.organization.university.toUpperCase(), 70, 'Helvetica', 11, MUTED);
  center(data.organization.name, 88, 'Helvetica-Bold', 16, ACCENT);
  center('CERTIFICATE OF PARTICIPATION', 140, 'Times-Bold', 34);
  center('This certificate is proudly presented to', 200, 'Helvetica', 13, MUTED);
  center(data.recipientName, 228, 'Times-BoldItalic', 36);
  doc
    .moveTo(width / 2 - 200, 275)
    .lineTo(width / 2 + 200, 275)
    .lineWidth(0.75)
    .stroke(MUTED);
  center('for actively participating in', 292, 'Helvetica', 13, MUTED);
  center(data.eventName, 314, 'Helvetica-Bold', 20);
  center(`held on ${formatDate(data.eventDate)}`, 344, 'Helvetica', 12, MUTED);

  // Signatories
  const sigY = 440;
  const slots = data.signatories.slice(0, 2);
  slots.forEach((signatory, index) => {
    const x = slots.length === 1 ? width / 2 - 110 : index === 0 ? 120 : 330;
    doc.moveTo(x, sigY).lineTo(x + 220, sigY).lineWidth(0.75).stroke(INK);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(signatory.name, x, sigY + 6, { width: 220, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(signatory.title, x, sigY + 22, { width: 220, align: 'center' });
  });

  // Verification block
  const qrSize = 96;
  const qrX = width - 60 - qrSize - 40;
  const qrY = height - 60 - qrSize - 30;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(`Certificate ID: ${data.code}`, qrX - 60, qrY + qrSize + 6, { width: qrSize + 120, align: 'center' })
    .text('Scan to verify authenticity', qrX - 60, qrY + qrSize + 18, { width: qrSize + 120, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Issued ${formatDate(data.issuedAt)}`, 60, height - 80, { width: 300 });

  doc.end();
  return finished;
};
