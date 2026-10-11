import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useToast } from '@/components/ui/Toast';
import { useCurrentUser } from '@/features/auth/useAuth';

import { appendMessage, chatKeys, markConversationRead, removeConversation, replaceMessage, upsertConversation } from './api';
import { clearTyping, getOpenConversation, noteTyping } from './chatStore';
import { connectSocket, disconnectSocket } from './socket';
import { conversationName, type CallInfo, type ChatMessage, type Conversation } from './types';

// ─── Socket → cache wiring ─────────────────────────────────────────────────

/**
 * Mounted once inside the app shell. Owns the socket connection and keeps
 * the React Query caches in sync with server events, so every screen
 * (sidebar badge, conversation list, open thread) updates live.
 */
export function ChatRealtime() {
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const toast = useToast();
  const { pathname } = useLocation();
  const onMessagesPage = pathname.startsWith('/messages');

  useEffect(() => {
    const socket = connectSocket();
    const conversations = () => queryClient.getQueryData<Conversation[]>(chatKeys.conversations) ?? [];

    const onMessage = (message: ChatMessage) => {
      appendMessage(queryClient, message);
      if (message.senderId) clearTyping(message.conversationId, message.senderId);
      const known = conversations().find((c) => c.id === message.conversationId);
      if (!known) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
        return;
      }
      const fromOther = message.senderId !== null && message.senderId !== me.id;
      const viewing = getOpenConversation() === message.conversationId && document.visibilityState === 'visible';
      upsertConversation(
        queryClient,
        {
          ...known,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount: fromOther && !viewing ? known.unreadCount + 1 : known.unreadCount,
        },
        false,
      );
      if (fromOther && viewing) void markConversationRead(queryClient, message.conversationId);
      if (fromOther && !viewing && !onMessagesPage && message.kind === 'TEXT') {
        const sender = known.participants.find((p) => p.userId === message.senderId);
        const where = known.type === 'GROUP' ? ` in ${conversationName(known, me.id)}` : '';
        toast.info(`${sender?.firstName ?? 'Someone'}${where}: ${message.body.slice(0, 80)}`);
      }
    };

    const onMessageUpdated = (message: ChatMessage) => replaceMessage(queryClient, message);

    const onConversation = (conversation: Conversation) => {
      if (!conversation.participants.some((p) => p.userId === me.id)) removeConversation(queryClient, conversation.id);
      else upsertConversation(queryClient, conversation);
    };

    const onRead = ({ conversationId, userId, lastReadAt }: { conversationId: string; userId: string; lastReadAt: string }) => {
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) =>
        list?.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unreadCount: userId === me.id ? 0 : c.unreadCount,
                participants: c.participants.map((p) => (p.userId === userId ? { ...p, lastReadAt } : p)),
              }
            : c,
        ),
      );
    };

    const onPresence = ({ userId, online }: { userId: string; online: boolean }) => {
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) =>
        list?.map((c) => ({ ...c, participants: c.participants.map((p) => (p.userId === userId ? { ...p, online } : p)) })),
      );
    };

    const onTyping = ({ conversationId, userId }: { conversationId: string; userId: string }) => noteTyping(conversationId, userId);

    const onCallState = ({ conversationId, call }: { conversationId: string; call: CallInfo | null }) => {
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) =>
        list?.map((c) => (c.id === conversationId ? { ...c, activeCall: call } : c)),
      );
    };

    // After a reconnect we may have missed events: refetch everything chat-related.
    const onReconnect = () => void queryClient.invalidateQueries({ queryKey: chatKeys.all });

    socket.on('chat:message', onMessage);
    socket.on('chat:message-updated', onMessageUpdated);
    socket.on('chat:conversation', onConversation);
    socket.on('chat:read', onRead);
    socket.on('chat:typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('call:state', onCallState);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:message-updated', onMessageUpdated);
      socket.off('chat:conversation', onConversation);
      socket.off('chat:read', onRead);
      socket.off('chat:typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('call:state', onCallState);
      socket.io.off('reconnect', onReconnect);
    };
  }, [queryClient, me.id, toast, onMessagesPage]);

  // Disconnect only when the shell unmounts (sign-out), not when handlers re-bind.
  useEffect(() => () => disconnectSocket(), []);

  return null;
}
