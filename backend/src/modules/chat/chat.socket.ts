import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { verifyAccessToken } from '../../auth/access-token.js';
import { AppError } from '../../common/errors.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { emitToUsers, isUserOnline, setRealtimeServer, userRoom } from '../../lib/realtime.js';
import {
  addCall,
  callsWithSocket,
  describeCall,
  getCall,
  getCallForConversation,
  removeCall,
  type ActiveCall,
} from './call-registry.js';
import { assertParticipant, participantIds, recordCallMessage } from './chat.service.js';

/** A direct call that nobody answers stops ringing after this long. */
const RING_TIMEOUT_MS = 45_000;
/** WebRTC SDP/ICE payloads are a few KB; anything bigger is not signalling. */
const MAX_SIGNAL_BYTES = 64 * 1024;

type Ack = (response: { ok: true; [key: string]: unknown } | { ok: false; error: string }) => void;

const id = z.string().min(1).max(64);
const startSchema = z.object({ conversationId: id, media: z.enum(['audio', 'video']) });
const callRefSchema = z.object({ callId: id });
const signalSchema = z.object({ callId: id, to: id, data: z.unknown() });
const typingSchema = z.object({ conversationId: id });

const userIdOf = (socket: Socket) => socket.data.userId as string;

/** Per-socket budgets per event: [max events, per window ms]. Signalling is chatty (ICE candidates), the rest is not. */
const EVENT_LIMITS: Record<string, [number, number]> = {
  'chat:typing': [10, 10_000],
  'call:start': [5, 60_000],
  'call:join': [10, 60_000],
  'call:decline': [10, 60_000],
  'call:leave': [20, 60_000],
  'call:signal': [300, 10_000],
};

/** How often an open socket re-checks that its account is still active and its session still valid. */
const REVALIDATE_MS = 60_000;

const createEventLimiter = () => {
  const hits = new Map<string, number[]>();
  return (event: string) => {
    const limit = EVENT_LIMITS[event];
    if (!limit) return true;
    const [max, windowMs] = limit;
    const now = Date.now();
    const recent = (hits.get(event) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(event, recent);
      return false;
    }
    recent.push(now);
    hits.set(event, recent);
    return true;
  };
};

/** Everyone who shares at least one conversation with the user (for presence updates). */
const chatPartners = async (userId: string) => {
  const rows = await prisma.conversationParticipant.findMany({
    where: { leftAt: null, conversation: { participants: { some: { userId, leftAt: null } } }, userId: { not: userId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((row) => row.userId);
};

const formatDuration = (ms: number) => {
  const total = Math.max(1, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const summary = async (call: ActiveCall) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: call.conversationId }, select: { type: true } });
  const kind = call.media === 'video' ? 'video' : 'voice';
  if (conversation?.type === 'GROUP') {
    return call.connectedAt
      ? `Meeting · ${formatDuration(Date.now() - call.connectedAt.getTime())} · ${call.everJoined.size} joined`
      : `Meeting started (no one else joined)`;
  }
  return call.connectedAt ? `${kind === 'video' ? 'Video' : 'Voice'} call · ${formatDuration(Date.now() - call.connectedAt.getTime())}` : `Missed ${kind} call`;
};

const broadcastCallState = async (conversationId: string) => {
  const ids = await participantIds(prisma, conversationId);
  emitToUsers(ids, 'call:state', { conversationId, call: describeCall(getCallForConversation(conversationId)) });
};

const endCall = async (call: ActiveCall) => {
  if (!getCall(call.id)) return; // already ended
  removeCall(call);
  const ids = await participantIds(prisma, call.conversationId);
  emitToUsers(ids, 'call:ended', { callId: call.id, conversationId: call.conversationId });
  await broadcastCallState(call.conversationId);
  await recordCallMessage(call.conversationId, call.startedById, await summary(call));
};

const leaveCall = async (io: Server, call: ActiveCall, userId: string, socketId: string) => {
  if (call.participants.get(userId) !== socketId) return;
  call.participants.delete(userId);
  for (const peerSocket of call.participants.values()) {
    io.to(peerSocket).emit('call:peer-left', { callId: call.id, userId });
  }
  const conversation = await prisma.conversation.findUnique({ where: { id: call.conversationId }, select: { type: true } });
  // A 1:1 call ends when either side hangs up; a meeting ends when the last person leaves.
  if (call.participants.size === 0 || (conversation?.type === 'DIRECT' && call.participants.size < 2)) {
    await endCall(call);
  } else {
    await broadcastCallState(call.conversationId);
  }
};

/** Wraps a handler so validation and access errors go back through the ack instead of crashing the socket. */
const handle =
  <T>(schema: z.ZodType<T>, fn: (input: T, ack: Ack) => Promise<void>) =>
  async (raw: unknown, maybeAck?: unknown) => {
    const ack: Ack = typeof maybeAck === 'function' ? (maybeAck as Ack) : () => undefined;
    try {
      await fn(schema.parse(raw), ack);
    } catch (error) {
      if (error instanceof AppError) ack({ ok: false, error: error.message });
      else if (error instanceof z.ZodError) ack({ ok: false, error: 'Invalid request.' });
      else {
        logger.error({ err: error }, 'socket handler failed');
        ack({ ok: false, error: 'Something went wrong.' });
      }
    }
  };

export const attachRealtime = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    path: '/api/socket.io',
    serveClient: false,
    cors: { origin: env.corsOrigins, credentials: true },
    maxHttpBufferSize: MAX_SIGNAL_BYTES * 2,
  });

  // Same access token as the REST API, sent in the handshake (never in the URL).
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const claims = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, status: true, passwordChangedAt: true } });
      if (!user || user.status !== 'ACTIVE') throw new Error('inactive');
      if (user.passwordChangedAt && claims.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) throw new Error('revoked');
      socket.data.userId = user.id;
      socket.data.issuedAt = claims.iat;
      next();
    } catch (error) {
      const expired = error instanceof AppError && error.code === 'TOKEN_EXPIRED';
      next(new Error(expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = userIdOf(socket);

    // Drop events over budget instead of letting one socket flood the server or other users.
    const allow = createEventLimiter();
    socket.use(([event, ...rest], next) => {
      if (allow(event)) return next();
      const ack = rest.at(-1);
      if (typeof ack === 'function') (ack as Ack)({ ok: false, error: 'Too many requests. Please slow down.' });
    });

    // A long-lived socket must not outlive a disabled account or a password change.
    const revalidate = setInterval(() => {
      void prisma.user
        .findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } })
        .then((user) => {
          const revoked =
            !user ||
            user.status !== 'ACTIVE' ||
            (user.passwordChangedAt && (socket.data.issuedAt as number) < Math.floor(user.passwordChangedAt.getTime() / 1000));
          if (revoked) socket.disconnect(true);
        })
        .catch((error: unknown) => logger.error({ err: error }, 'socket revalidation failed'));
    }, REVALIDATE_MS);
    revalidate.unref();

    const wasOnline = isUserOnline(userId);
    void socket.join(userRoom(userId));
    if (!wasOnline) {
      void chatPartners(userId).then((ids) => emitToUsers(ids, 'presence:update', { userId, online: true }));
    }

    socket.on(
      'chat:typing',
      handle(typingSchema, async ({ conversationId }) => {
        await assertParticipant(prisma, conversationId, userId);
        const ids = (await participantIds(prisma, conversationId)).filter((other) => other !== userId);
        emitToUsers(ids, 'chat:typing', { conversationId, userId });
      }),
    );

    socket.on(
      'call:start',
      handle(startSchema, async ({ conversationId, media }, ack) => {
        await assertParticipant(prisma, conversationId, userId);
        const existing = getCallForConversation(conversationId);
        if (existing) {
          // Someone already started one: the client joins it instead.
          ack({ ok: true, call: describeCall(existing), existing: true });
          return;
        }
        const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { type: true, title: true } });
        const call: ActiveCall = {
          id: randomUUID(),
          conversationId,
          media,
          startedById: userId,
          startedAt: new Date(),
          connectedAt: null,
          participants: new Map([[userId, socket.id]]),
          everJoined: new Set([userId]),
        };
        addCall(call);
        if (conversation.type === 'DIRECT') {
          call.ringTimer = setTimeout(() => {
            if (!call.connectedAt) void endCall(call).catch((error: unknown) => logger.error({ err: error }, 'ending unanswered call failed'));
          }, RING_TIMEOUT_MS);
          call.ringTimer.unref();
        }
        const others = (await participantIds(prisma, conversationId)).filter((other) => other !== userId);
        emitToUsers(others, 'call:incoming', { call: describeCall(call), conversationType: conversation.type, title: conversation.title });
        await broadcastCallState(conversationId);
        ack({ ok: true, call: describeCall(call), existing: false });
      }),
    );

    socket.on(
      'call:join',
      handle(callRefSchema, async ({ callId }, ack) => {
        const call = getCall(callId);
        if (!call) throw new AppError(404, 'NOT_FOUND', 'This call has already ended.');
        await assertParticipant(prisma, call.conversationId, userId);
        const current = call.participants.get(userId);
        if (current && current !== socket.id) throw new AppError(409, 'CONFLICT', 'You are already in this call in another tab.');
        const peers = [...call.participants.keys()].filter((other) => other !== userId);
        call.participants.set(userId, socket.id);
        call.everJoined.add(userId);
        if (call.participants.size >= 2 && !call.connectedAt) {
          call.connectedAt = new Date();
          if (call.ringTimer) clearTimeout(call.ringTimer);
        }
        for (const peer of peers) {
          io.to(call.participants.get(peer)!).emit('call:peer-joined', { callId, userId });
        }
        await broadcastCallState(call.conversationId);
        // The newcomer sends an offer to each peer already in the call.
        ack({ ok: true, call: describeCall(call), peers });
      }),
    );

    socket.on(
      'call:signal',
      handle(signalSchema, async ({ callId, to, data }) => {
        const call = getCall(callId);
        if (!call || call.participants.get(userId) !== socket.id) return;
        const target = call.participants.get(to);
        if (!target) return;
        if (JSON.stringify(data ?? null).length > MAX_SIGNAL_BYTES) return;
        io.to(target).emit('call:signal', { callId, from: userId, data });
      }),
    );

    socket.on(
      'call:decline',
      handle(callRefSchema, async ({ callId }) => {
        const call = getCall(callId);
        if (!call) return;
        await assertParticipant(prisma, call.conversationId, userId);
        for (const peerSocket of call.participants.values()) {
          io.to(peerSocket).emit('call:declined', { callId, userId });
        }
        const conversation = await prisma.conversation.findUnique({ where: { id: call.conversationId }, select: { type: true } });
        if (conversation?.type === 'DIRECT' && !call.connectedAt) await endCall(call);
      }),
    );

    socket.on(
      'call:leave',
      handle(callRefSchema, async ({ callId }) => {
        const call = getCall(callId);
        if (call) await leaveCall(io, call, userId, socket.id);
      }),
    );

    socket.on('disconnect', () => {
      clearInterval(revalidate);
      void (async () => {
        for (const call of callsWithSocket(socket.id)) await leaveCall(io, call, userId, socket.id);
        if (!isUserOnline(userId)) emitToUsers(await chatPartners(userId), 'presence:update', { userId, online: false });
      })().catch((error: unknown) => logger.error({ err: error }, 'socket disconnect cleanup failed'));
    });
  });

  setRealtimeServer(io);
  return io;
};
