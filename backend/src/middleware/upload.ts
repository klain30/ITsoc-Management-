import multer from 'multer';

import { env } from '../config/env.js';

/**
 * Buffers a single file in memory (size-capped) so the storage layer can
 * sniff its real type before anything touches the disk.
 */
export const singleFileUpload = (field = 'file') =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadBytes, files: 1, fields: 20 },
  }).single(field);
