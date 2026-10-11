/**
 * Live calls, kept in memory. A call belongs to one conversation: in a
 * direct chat it is a 1:1 voice/video call, in a group it is a meeting that
 * participants can join and leave. Media flows peer-to-peer over WebRTC;
 * the server only relays signalling, so nothing here touches audio or video.
 *
 * Calls do not survive an API restart. Clients notice the socket reconnect
 * and drop out of the call.
 */

export type CallMedia = 'audio' | 'video';

export type ActiveCall = {
  id: string;
  conversationId: string;
  media: CallMedia;
  startedById: string;
  startedAt: Date;
  /** First moment a second person joined; null while it is still ringing. */
  connectedAt: Date | null;
  /** Users currently in the call, mapped to the socket (browser tab) they joined from. */
  participants: Map<string, string>;
  /** Everyone who was ever in the call (for the summary message). */
  everJoined: Set<string>;
  ringTimer?: NodeJS.Timeout;
};

const byConversation = new Map<string, ActiveCall>();
const byId = new Map<string, ActiveCall>();

export const getCallForConversation = (conversationId: string) => byConversation.get(conversationId) ?? null;

export const getCall = (callId: string) => byId.get(callId) ?? null;

export const addCall = (call: ActiveCall) => {
  byConversation.set(call.conversationId, call);
  byId.set(call.id, call);
};

export const removeCall = (call: ActiveCall) => {
  if (call.ringTimer) clearTimeout(call.ringTimer);
  byConversation.delete(call.conversationId);
  byId.delete(call.id);
};

export const callsWithSocket = (socketId: string) =>
  [...byId.values()].filter((call) => [...call.participants.values()].includes(socketId));

/** Public shape sent to clients. */
export const describeCall = (call: ActiveCall | null) =>
  call
    ? {
        id: call.id,
        conversationId: call.conversationId,
        media: call.media,
        startedById: call.startedById,
        startedAt: call.startedAt.toISOString(),
        participantIds: [...call.participants.keys()],
      }
    : null;

/** Test helper. */
export const clearCalls = () => {
  for (const call of byId.values()) removeCall(call);
};
