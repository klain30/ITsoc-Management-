import type { ISODate, Role } from '@/types/api';

export type ChatPerson = {
  userId: string;
  firstName: string;
  lastName: string;
  role: Role;
  position: string | null;
  online: boolean;
};

export type ChatParticipant = ChatPerson & { lastReadAt: ISODate };

export type MessageKind = 'TEXT' | 'CALL' | 'SYSTEM';

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string;
  createdAt: ISODate;
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
};

export type CallMedia = 'audio' | 'video';

export type CallInfo = {
  id: string;
  conversationId: string;
  media: CallMedia;
  startedById: string;
  startedAt: ISODate;
  participantIds: string[];
};

export type Conversation = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  createdById: string;
  lastMessageAt: ISODate;
  createdAt: ISODate;
  participants: ChatParticipant[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  activeCall: CallInfo | null;
};

export const personName = (person: Pick<ChatPerson, 'firstName' | 'lastName'>) => `${person.firstName} ${person.lastName}`;

/** The other person in a direct chat (or the first other member of a group). */
export const otherParticipant = (conversation: Conversation, myId: string) =>
  conversation.participants.find((p) => p.userId !== myId) ?? conversation.participants[0];

export const conversationName = (conversation: Conversation, myId: string) => {
  if (conversation.type === 'GROUP') {
    return conversation.title ?? conversation.participants.map((p) => p.firstName).join(', ');
  }
  const other = otherParticipant(conversation, myId);
  return other ? personName(other) : 'Conversation';
};
