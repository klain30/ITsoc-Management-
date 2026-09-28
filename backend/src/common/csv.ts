import type { Response } from 'express';

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

/**
 * Escapes a cell for CSV and neutralises spreadsheet formula injection
 * (cells starting with = + - @ are prefixed with an apostrophe).
 */
const cell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = <T>(rows: T[], columns: CsvColumn<T>[]) =>
  [columns.map((c) => cell(c.header)).join(','), ...rows.map((row) => columns.map((c) => cell(c.value(row))).join(','))].join(
    '\r\n',
  );

const UTF8_BOM = String.fromCharCode(0xfeff);

export const sendCsv = (res: Response, fileName: string, csv: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"`);
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  res.send(`${UTF8_BOM}${csv}`);
};
