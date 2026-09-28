import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { badRequest } from '../../common/errors.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { contentDisposition } from '../../lib/storage.js';
import { authorize } from '../../middleware/authorize.js';
import { singleFileUpload } from '../../middleware/upload.js';
import * as documentService from './document.service.js';

const viewer = (req: Request): documentService.DocumentViewer => ({
  canReadOfficerDocs: hasPermission(req, PERMISSIONS.DOCUMENTS_READ),
});

/** Mounted at /documents. */
export const documentRouter = Router();

documentRouter.get('/', async (req, res) => {
  res.json(await documentService.listDocuments(documentService.listDocumentsSchema.parse(req.query), viewer(req)));
});

documentRouter.post('/', authorize(PERMISSIONS.DOCUMENTS_MANAGE), singleFileUpload('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach the document in the "file" field.');
  const input = documentService.uploadDocumentSchema.parse(req.body);
  const actor = { ...actorContext(req), userId: getAuth(req).userId };
  res.status(201).json({ data: await documentService.uploadDocument(input, req.file, actor) });
});

documentRouter.get('/:id', async (req, res) => {
  res.json({ data: await documentService.getDocument(param(req, 'id'), viewer(req)) });
});

documentRouter.patch('/:id', authorize(PERMISSIONS.DOCUMENTS_MANAGE), async (req, res) => {
  const input = documentService.updateDocumentSchema.parse(req.body);
  res.json({ data: await documentService.updateDocument(param(req, 'id'), input, actorContext(req)) });
});

documentRouter.delete('/:id', authorize(PERMISSIONS.DOCUMENTS_MANAGE), async (req, res) => {
  await documentService.deleteDocument(param(req, 'id'), { ...actorContext(req), userId: getAuth(req).userId });
  res.status(204).end();
});

documentRouter.get('/:id/file', async (req, res) => {
  const { stream, mimeType, fileName } = await documentService.openDocumentFile(param(req, 'id'), viewer(req));
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', contentDisposition(fileName, req.query.inline === 'true'));
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', () => res.status(404).end());
  stream.pipe(res);
});
