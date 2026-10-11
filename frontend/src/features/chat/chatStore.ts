import { useSyncExternalStore } from 'react';

/**
 * Small client-side stores shared by the socket wiring and the Messages page.
 */

// ─── Which conversation is on screen (set by the Messages page) ────────────

let openConversationId: string | null = null;
export const getOpenConversation = () => openConversationId;
export const setOpenConversation = (id: string | null) => {
  openConversationId = id;
};

// ─── Typing indicators ─────────────────────────────────────────────────────

const TYPING_TTL_MS = 4000;
let typing: Record<string, Record<string, number>> = {};
const typingListeners = new Set<() => void>();
const emitTyping = () => typingListeners.forEach((listener) => listener());

/** Drops expired entries (with new object identities, so subscribers re-render). */
const pruneTyping = () => {
  const now = Date.now();
  let changed = false;
  const next: typeof typing = {};
  for (const [conversationId, users] of Object.entries(typing)) {
    const live = Object.fromEntries(Object.entries(users).filter(([, until]) => until > now));
    const expired = Object.keys(live).length !== Object.keys(users).length;
    next[conversationId] = expired ? live : users;
    changed ||= expired;
  }
  if (changed) {
    typing = next;
    emitTyping();
  }
};

export const noteTyping = (conversationId: string, userId: string) => {
  typing = { ...typing, [conversationId]: { ...typing[conversationId], [userId]: Date.now() + TYPING_TTL_MS } };
  emitTyping();
  setTimeout(pruneTyping, TYPING_TTL_MS + 50);
};

export const clearTyping = (conversationId: string, userId: string) => {
  if (!typing[conversationId]?.[userId]) return;
  const rest = { ...typing[conversationId] };
  delete rest[userId];
  typing = { ...typing, [conversationId]: rest };
  emitTyping();
};

/** User ids currently typing in a conversation. */
export const useTyping = (conversationId: string | undefined) => {
  const snapshot = useSyncExternalStore(
    (listener) => {
      typingListeners.add(listener);
      return () => typingListeners.delete(listener);
    },
    () => (conversationId ? typing[conversationId] : undefined),
  );
  return Object.keys(snapshot ?? {});
};
