import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { forbidden } from '../../common/errors.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { contentDisposition } from '../../lib/storage.js';
import { authorize } from '../../middleware/authorize.js';
import { publicRateLimit } from '../../middleware/rate-limit.js';
import * as certificateService from './certificate.service.js';

/** Mounted at /certificates. */
export const certificateRouter = Router();

certificateRouter.get('/', authorize(PERMISSIONS.CERTIFICATES_ISSUE), async (req, res) => {
  res.json(await certificateService.listCertificates(certificateService.listCertificatesSchema.parse(req.query)));
});

certificateRouter.get('/me', async (req, res) => {
  res.json({ data: await certificateService.listMyCertificates(getAuth(req).memberId) });
});

const assertCanView = async (req: Request, id: string) => {
  const certificate = await certificateService.getCertificate(id);
  if (certificate.memberId !== getAuth(req).memberId && !hasPermission(req, PERMISSIONS.CERTIFICATES_ISSUE)) throw forbidden();
  return certificate;
};

certificateRouter.get('/:id', async (req, res) => {
  res.json({ data: await assertCanView(req, param(req, 'id')) });
});

certificateRouter.get('/:id/download', async (req, res) => {
  const id = param(req, 'id');
  await assertCanView(req, id);
  const { pdf, fileName } = await certificateService.renderPdf(id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

certificateRouter.patch('/:id/revoke', authorize(PERMISSIONS.CERTIFICATES_ISSUE), async (req, res) => {
  const { reason } = certificateService.revokeSchema.parse(req.body);
  res.json({ data: await certificateService.revokeCertificate(param(req, 'id'), reason, actorContext(req)) });
});

/** Mounted at /events/:eventId/certificates. */
export const eventCertificateRouter = Router({ mergeParams: true });

eventCertificateRouter.post('/', authorize(PERMISSIONS.CERTIFICATES_ISSUE), async (req, res) => {
  const actor = { ...actorContext(req), userId: getAuth(req).userId };
  res.status(201).json({ data: await certificateService.issueForEvent(param(req, 'eventId'), actor) });
});

/** Mounted at /public/certificates — no authentication. */
export const publicCertificateRouter = Router();

publicCertificateRouter.get('/:code', publicRateLimit, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await certificateService.verifyByCode(param(req, 'code')) });
});
