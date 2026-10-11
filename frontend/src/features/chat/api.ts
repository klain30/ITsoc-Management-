import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import { api, deleteRequest, getData, patchData, postData } from '@/lib/api';

import type { ChatMessage, ChatPerson, Conversation } from './types';

export const chatKeys = {
  all: ['chat'] as const,
  conversations: ['chat', 'conversations'] as const,
  messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  contacts: (search: string) => ['chat', 'contacts', search] as const,
};

type MessagePage = { data: ChatMessage[]; meta: { hasMore: boolean } };
export type MessagesCache = InfiniteData<MessagePage, string | undefined>;

// ─── Queries ────────────────────────────────────────────────────────────────

export const useConversations = (enabled = true) =>
  useQuery({
    queryKey: chatKeys.conversations,
    queryFn: () => getData<Conversation[]>('/chat/conversations'),
    enabled,
    // Live updates arrive over the socket; this is only a safety net.
    refetchInterval: 120_000,
  });

export const useTotalUnread = () => {
  const { data } = useConversations();
  return data?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
};

export const useContacts = (search: string, enabled = true) =>
  useQuery({
    queryKey: chatKeys.contacts(search),
    queryFn: () => getData<ChatPerson[]>('/chat/contacts', { params: { search: search || undefined } }),
    enabled,
  });

export const useMessages = (conversationId: string | undefined) =>
  useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.get<MessagePage>(`/chat/conversations/${conversationId}/messages`, { params: { before: pageParam, limit: 40 } })).data,
    // Pages go newest → oldest; the next page is everything before the oldest message we have.
    getNextPageParam: (last) => (last.meta.hasMore ? last.data[0]?.id : undefined),
    staleTime: 30_000,
  });

// ─── Cache helpers (used by mutations and socket events) ────────────────────

export const upsertConversation = (queryClient: QueryClient, conversation: Conversation, keepUnread = true) => {
  queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) => {
    if (!list) return list;
    const existing = list.find((c) => c.id === conversation.id);
    const merged = { ...conversation, unreadCount: keepUnread && existing ? existing.unreadCount : conversation.unreadCount };
    const others = list.filter((c) => c.id !== conversation.id);
    return [merged, ...others].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  });
};

export const removeConversation = (queryClient: QueryClient, conversationId: string) => {
  queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) => list?.filter((c) => c.id !== conversationId));
};

/** Adds a message to the open thread's cache, ignoring duplicates (socket + HTTP response). */
export const appendMessage = (queryClient: QueryClient, message: ChatMessage) => {
  queryClient.setQueryData<MessagesCache>(chatKeys.messages(message.conversationId), (cache) => {
    if (!cache) return cache;
    if (cache.pages.some((page) => page.data.some((m) => m.id === message.id))) return cache;
    const [newest, ...older] = cache.pages;
    return { ...cache, pages: [{ ...newest, data: [...newest.data, message] }, ...older] };
  });
};

export const replaceMessage = (queryClient: QueryClient, message: ChatMessage) => {
  queryClient.setQueryData<MessagesCache>(chatKeys.messages(message.conversationId), (cache) =>
    cache ? { ...cache, pages: cache.pages.map((page) => ({ ...page, data: page.data.map((m) => (m.id === message.id ? message : m)) })) } : cache,
  );
  queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) =>
    list?.map((c) => (c.lastMessage?.id === message.id ? { ...c, lastMessage: message } : c)),
  );
};

// ─── Mutations ──────────────────────────────────────────────────────────────

export const useOpenDirect = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => postData<Conversation>('/chat/conversations/direct', { userId }),
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
};

export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; userIds: string[] }) => postData<Conversation>('/chat/conversations/group', input),
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
};

export const useRenameGroup = (conversationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => patchData<Conversation>(`/chat/conversations/${conversationId}`, { title }),
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
};

export const useAddParticipants = (conversationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => postData<Conversation>(`/chat/conversations/${conversationId}/participants`, { userIds }),
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
};

export const useLeaveGroup = (conversationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/chat/conversations/${conversationId}/leave`),
    onSuccess: () => removeConversation(queryClient, conversationId),
  });
};

export const useSendMessage = (conversationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postData<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { body }),
    onSuccess: (message) => appendMessage(queryClient, message),
  });
};

export const useDeleteMessage = () =>
  useMutation({
    mutationFn: (messageId: string) => deleteRequest(`/chat/messages/${messageId}`),
  });

export const markConversationRead = async (queryClient: QueryClient, conversationId: string) => {
  queryClient.setQueryData<Conversation[]>(chatKeys.conversations, (list) =>
    list?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
  );
  await api.post(`/chat/conversations/${conversationId}/read`);
};
