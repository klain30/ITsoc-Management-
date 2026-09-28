import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { AppError } from '../common/errors.js';
import { logger } from '../lib/logger.js';

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

const send = (res: Parameters<ErrorRequestHandler>[2], status: number, body: ErrorBody) => res.status(status).json(body);

export const notFoundHandler: RequestHandler = (req, res) => {
  send(res, 404, { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.` } });
};

/**
 * Single place where errors become HTTP responses. Only AppError messages
 * and validation details reach the client; everything else is logged and
 * reported as a generic 500 so internals never leak.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof ZodError) {
    const { fieldErrors, formErrors } = err.flatten();
    return send(res, 400, {
      error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', details: { fieldErrors, formErrors } },
    });
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Invalid file upload.';
    return send(res, status, { error: { code: 'INVALID_UPLOAD', message } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.join(', ');
        return send(res, 409, {
          error: { code: 'CONFLICT', message: 'A record with the same unique value already exists.', details: { fields: target } },
        });
      }
      case 'P2025':
        return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Record not found.' } });
      case 'P2003':
        return send(res, 409, {
          error: { code: 'CONFLICT', message: 'This record is referenced by other records and cannot be changed or removed.' },
        });
      default:
        break;
    }
  }

  // body-parser errors (malformed JSON, oversized body)
  const status = (err as { status?: number; type?: string }).status;
  if (status === 400 && (err as { type?: string }).type === 'entity.parse.failed') {
    return send(res, 400, { error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' } });
  }
  if (status === 413) {
    return send(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  }

  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  return send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again later.' } });
};
