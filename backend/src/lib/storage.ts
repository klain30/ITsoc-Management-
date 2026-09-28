import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import { fileTypeFromBuffer } from 'file-type';

import { badRequest } from '../common/errors.js';
import { env } from '../config/env.js';

export type FileKind = 'receipt' | 'document' | 'avatar';

type AllowedType = { ext: string; mime: string };

const IMAGE_TYPES: AllowedType[] = [
  { ext: 'jpg', mime: 'image/jpeg' },
  { ext: 'png', mime: 'image/png' },
  { ext: 'webp', mime: 'image/webp' },
];
const PDF: AllowedType = { ext: 'pdf', mime: 'application/pdf' };
const OFFICE_TYPES: AllowedType[] = [
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

const ALLOWED: Record<FileKind, AllowedType[]> = {
  receipt: [...IMAGE_TYPES, PDF],
  document: [PDF, ...OFFICE_TYPES, ...IMAGE_TYPES],
  avatar: IMAGE_TYPES,
};

export const allowedExtensions = (kind: FileKind) => ALLOWED[kind].map((type) => type.ext);

export type StoredFile = { key: string; mimeType: string; sizeBytes: number; originalName: string };

const KEY_PATTERN = /^(receipt|document|avatar)s\/[a-f0-9-]{36}\.[a-z]+$/;

/**
 * Local-disk storage. Keys are generated here and never come from the
 * client, and the key pattern check blocks path traversal on reads. Swap
 * this module for an S3-compatible implementation in production.
 */
export const storage = {
  /** Validates the real file type from its magic bytes, then writes it. */
  async save(kind: FileKind, file: { buffer: Buffer; originalname: string }): Promise<StoredFile> {
    const detected = await fileTypeFromBuffer(file.buffer);
    const allowed = ALLOWED[kind].find((type) => type.mime === detected?.mime);
    if (!detected || !allowed) {
      throw badRequest(`Unsupported file type. Allowed: ${allowedExtensions(kind).join(', ')}.`);
    }

    const key = `${kind}s/${crypto.randomUUID()}.${allowed.ext}`;
    const fullPath = path.join(env.uploadDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer, { flag: 'wx' });

    return {
      key,
      mimeType: allowed.mime,
      sizeBytes: file.buffer.length,
      originalName: sanitizeFileName(file.originalname, allowed.ext),
    };
  },

  open(key: string): Readable {
    if (!KEY_PATTERN.test(key)) {
      throw badRequest('Invalid file reference.');
    }
    return createReadStream(path.join(env.uploadDir, key));
  },

  async remove(key: string) {
    if (!KEY_PATTERN.test(key)) return;
    await fs.rm(path.join(env.uploadDir, key), { force: true });
  },
};

/** Keeps a readable, header-safe download name. */
export const sanitizeFileName = (name: string, ext: string) => {
  const base = path
    .basename(name)
    .replace(/\.[^.]*$/, '')
    .replace(/[^\w\- ().]+/g, '_')
    .slice(0, 100)
    .trim();
  return `${base || 'file'}.${ext}`;
};

export const contentDisposition = (fileName: string, inline = false) =>
  `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
