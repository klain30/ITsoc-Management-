import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { authorize } from '../../middleware/authorize.js';
import { singleFileUpload } from '../../middleware/upload.js';
import * as memberService from './member.service.js';
import {
  changeAccountStatusSchema,
  changeRoleSchema,
  createMemberSchema,
  listMembersSchema,
  updateMemberSchema,
  updateOwnProfileSchema,
} from './member.schemas.js';

const officerActor = (req: Request) => ({ ...actorContext(req), userId: getAuth(req).userId });

/**
 * Officer accounts (anything above MEMBER) can only be edited, or sent an
 * invitation/reset link, by holders of roles:assign. Otherwise a secretary
 * could change the president's email, or claim a pending invitation for an
 * account that was just given an officer role.
 */
const assertCanManageAccount = async (req: Request, memberId: string) => {
  if (hasPermission(req, PERMISSIONS.ROLES_ASSIGN) || memberId === getAuth(req).memberId) return;
  if (await memberService.isOfficerAccount(memberId)) {
    throw forbidden('Only the president can change another officer’s record or account.');
  }
};

/** Mounted at /members. Every route requires authentication (see routes.ts). */
export const memberRouter = Router();

memberRouter.get('/', authorize(PERMISSIONS.MEMBERS_READ), async (req, res) => {
  res.json(await memberService.listMembers(listMembersSchema.parse(req.query)));
});

memberRouter.post('/', authorize(PERMISSIONS.MEMBERS_MANAGE), async (req, res) => {
  const result = await memberService.createMember(createMemberSchema.parse(req.body), officerActor(req));
  res.status(201).json({ data: result });
});

memberRouter.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  if (id !== getAuth(req).memberId && !hasPermission(req, PERMISSIONS.MEMBERS_READ)) throw forbidden();
  const [member, summary] = await Promise.all([memberService.getMember(id), memberService.getMemberSummary(id)]);
  res.json({ data: { ...member, summary } });
});

memberRouter.patch('/:id', authorize(PERMISSIONS.MEMBERS_MANAGE), async (req, res) => {
  const input = updateMemberSchema.parse(req.body);
  await assertCanManageAccount(req, param(req, 'id'));
  res.json({ data: await memberService.updateMember(param(req, 'id'), input, actorContext(req)) });
});

memberRouter.delete('/:id', authorize(PERMISSIONS.ROLES_ASSIGN), async (req, res) => {
  await memberService.deleteMember(param(req, 'id'), actorContext(req));
  res.status(204).end();
});

memberRouter.post('/:id/access-link', authorize(PERMISSIONS.MEMBERS_MANAGE), async (req, res) => {
  await assertCanManageAccount(req, param(req, 'id'));
  const link = await memberService.issueAccessLink(param(req, 'id'), officerActor(req), hasPermission(req, PERMISSIONS.ROLES_ASSIGN));
  res.status(201).json({ data: link });
});

memberRouter.patch('/:id/role', authorize(PERMISSIONS.ROLES_ASSIGN), async (req, res) => {
  const { role } = changeRoleSchema.parse(req.body);
  res.json({ data: await memberService.changeRole(param(req, 'id'), role, officerActor(req)) });
});

memberRouter.patch('/:id/account-status', authorize(PERMISSIONS.ROLES_ASSIGN), async (req, res) => {
  const { status } = changeAccountStatusSchema.parse(req.body);
  res.json({ data: await memberService.changeAccountStatus(param(req, 'id'), status, officerActor(req)) });
});

memberRouter.get('/:id/avatar', async (req, res) => {
  const id = param(req, 'id');
  if (id !== getAuth(req).memberId && !hasPermission(req, PERMISSIONS.MEMBERS_READ)) throw forbidden();
  const { stream, mimeType } = await memberService.getProfileImage(id);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  stream.on('error', () => res.status(404).end());
  stream.pipe(res);
});

/** Mounted at /profile — the signed-in member's own record. */
export const profileRouter = Router();

profileRouter.get('/', async (req, res) => {
  const { memberId } = getAuth(req);
  const [member, summary] = await Promise.all([memberService.getMember(memberId), memberService.getMemberSummary(memberId)]);
  res.json({ data: { ...member, summary } });
});

profileRouter.patch('/', async (req, res) => {
  const input = updateOwnProfileSchema.parse(req.body);
  res.json({ data: await memberService.updateMember(getAuth(req).memberId, input, actorContext(req)) });
});

profileRouter.put('/avatar', singleFileUpload('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "file" field.');
  await memberService.setProfileImage(getAuth(req).memberId, req.file, actorContext(req));
  res.status(204).end();
});
