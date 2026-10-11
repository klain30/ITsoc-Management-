import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Info,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Search,
  SendHorizontal,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Avatar, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Display';
import { Input, Textarea } from '@/components/ui/Form';
import { MenuItem, Popover } from '@/components/ui/Popover';
import { useToast } from '@/components/ui/Toast';
import { useCurrentUser } from '@/features/auth/useAuth';
import { cn } from '@/lib/cn';
import { formatLongDate, formatTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';

import { markConversationRead, useConversations, useDeleteMessage, useMessages, useSendMessage } from './api';
import { useCalls } from './CallProvider';
import { GroupInfoDialog, NewChatDialog, NewGroupDialog } from './ChatDialogs';
import { setOpenConversation, useTyping } from './chatStore';
import { getSocket } from './socket';
import { conversationName, otherParticipant, personName, type ChatMessage, type Conversation } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

const listTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatTime(date);
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function ConversationAvatar({ conversation, myId, size = 'md' }: { conversation: Conversation; myId: string; size?: 'sm' | 'md' }) {
  if (conversation.type === 'GROUP') {
    return (
      <span
        aria-hidden
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg', size === 'sm' ? 'h-7 w-7' : 'h-9 w-9')}
      >
        <Users size={size === 'sm' ? 14 : 16} />
      </span>
    );
  }
  const other = otherParticipant(conversation, myId);
  return (
    <span className="relative shrink-0">
      <Avatar name={other ? personName(other) : '?'} size={size} />
      {other?.online ? <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" aria-label="Online" /> : null}
    </span>
  );
}

const preview = (conversation: Conversation, myId: string) => {
  const message = conversation.lastMessage;
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'Message removed';
  if (message.kind !== 'TEXT') return message.body;
  const mine = message.senderId === myId;
  const sender = conversation.participants.find((p) => p.userId === message.senderId);
  const prefix = mine ? 'You: ' : conversation.type === 'GROUP' && sender ? `${sender.firstName}: ` : '';
  return prefix + message.body;
};

// ─── Conversation list ──────────────────────────────────────────────────────

function ConversationList({ conversations, selectedId, onSelect }: { conversations: Conversation[]; selectedId?: string; onSelect: (id: string) => void }) {
  const me = useCurrentUser();
  const [filter, setFilter] = useState('');
  const shown = conversations.filter((c) => conversationName(c, me.id).toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" className="pl-9" aria-label="Search chats" />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.length === 0 ? (
          <EmptyState icon={MessageCircle} title={conversations.length ? 'No matching chats' : 'No chats yet'} description={conversations.length ? undefined : 'Start one with the button above.'} />
        ) : (
          shown.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={c.id === selectedId ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                    c.id === selectedId ? 'bg-primary-soft' : 'hover:bg-hover',
                  )}
                >
                  <ConversationAvatar conversation={c} myId={me.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-sm', unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{conversationName(c, me.id)}</span>
                      <span className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-primary' : 'text-fg-subtle')}>{listTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn('truncate text-xs', unread ? 'font-medium text-fg' : 'text-fg-subtle')}>
                        {c.activeCall ? <span className="font-medium text-success">● {c.type === 'GROUP' ? 'Meeting live' : 'On a call'} · </span> : null}
                        {preview(c, me.id)}
                      </span>
                      {unread ? (
                        <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg tabular-nums">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}

// ─── Thread ─────────────────────────────────────────────────────────────────

function CallBubble({ message }: { message: ChatMessage }) {
  const missed = message.body.startsWith('Missed') || message.body.includes('no one else joined');
  const Icon = missed ? PhoneMissed : message.body.startsWith('Meeting') ? Users : PhoneIncoming;
  return (
    <div className="my-2 flex justify-center">
      <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium', missed ? 'bg-danger-soft text-danger' : 'bg-muted text-fg-muted')}>
        <Icon size={14} aria-hidden />
        {message.body}
        <span className="text-fg-subtle">· {formatTime(message.createdAt)}</span>
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  showSender,
  senderName,
  showAvatar,
}: {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  senderName: string;
  showAvatar: boolean;
}) {
  const remove = useDeleteMessage();
  const toast = useToast();
  const deleted = Boolean(message.deletedAt);

  return (
    <div className={cn('group flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine ? <span className="w-7 shrink-0">{showAvatar ? <Avatar name={senderName} size="sm" /> : null}</span> : null}
      {mine && !deleted ? (
        <button
          type="button"
          onClick={() => remove.mutate(message.id, { onError: toast.error })}
          className="mb-1 rounded-md p-1 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
          aria-label="Remove message"
          title="Remove message"
        >
          <Trash2 size={14} />
        </button>
      ) : null}
      <div className={cn('max-w-[78%] sm:max-w-[65%]', mine ? 'items-end' : 'items-start', 'flex flex-col')}>
        {showSender ? <span className="mb-0.5 px-1 text-[11px] font-medium text-fg-subtle">{senderName}</span> : null}
        <div
          title={formatTime(message.createdAt)}
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
            deleted
              ? 'border border-dashed border-border text-fg-subtle italic'
              : mine
                ? 'rounded-br-md bg-primary text-primary-fg'
                : 'rounded-bl-md bg-muted text-fg',
          )}
        >
          {deleted ? 'Message removed' : message.body}
        </div>
      </div>
    </div>
  );
}

function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState('');
  const send = useSendMessage(conversationId);
  const toast = useToast();
  const lastTyping = useRef(0);

  const submit = () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setBody(''), onError: toast.error });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        // The thread remounts per conversation, so this focuses each newly opened chat.
        autoFocus
        value={body}
        rows={1}
        maxLength={4000}
        onChange={(e) => {
          setBody(e.target.value);
          // Tell others we are typing, at most every 2.5 s.
          if (Date.now() - lastTyping.current > 2500) {
            lastTyping.current = Date.now();
            getSocket().emit('chat:typing', { conversationId });
          }
        }}
        onKeyDown={onKeyDown}
        placeholder="Write a message…"
        aria-label="Message"
        className="field-sizing-content max-h-36 min-h-10 resize-none py-2"
      />
      <Button type="submit" icon={SendHorizontal} loading={send.isPending} disabled={!body.trim()} aria-label="Send" className="h-10 w-10 px-0" />
    </form>
  );
}

function Thread({ conversation, onBack, onLeft }: { conversation: Conversation; onBack: () => void; onLeft: () => void }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const calls = useCalls();
  const [info, setInfo] = useState(false);
  const query = useMessages(conversation.id);
  const typingIds = useTyping(conversation.id);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = useMemo(() => (query.data ? [...query.data.pages].reverse().flatMap((page) => page.data) : []), [query.data]);
  const name = conversationName(conversation, me.id);
  const other = conversation.type === 'DIRECT' ? otherParticipant(conversation, me.id) : undefined;
  const byId = new Map(conversation.participants.map((p) => [p.userId, p]));

  // Read receipts: clear unread when the thread is open and the tab is visible.
  useEffect(() => {
    if (conversation.unreadCount === 0) return;
    if (document.visibilityState === 'visible') void markConversationRead(queryClient, conversation.id);
  }, [conversation.id, conversation.unreadCount, queryClient]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void markConversationRead(queryClient, conversation.id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [conversation.id, queryClient]);

  // Keep the view pinned to the newest message unless the user scrolled up to read history.
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, typingIds.length]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [conversation.id]);

  const loadOlder = async () => {
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    await query.fetchNextPage();
    // Keep the same message under the reader's eyes after older ones are added above.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - before;
    });
  };

  // "Seen" under my latest message in a 1:1 chat.
  const myLast = [...messages].reverse().find((m) => m.senderId === me.id && m.kind === 'TEXT');
  const seen = other && myLast && new Date(other.lastReadAt) >= new Date(myLast.createdAt);

  const call = conversation.activeCall;
  const inThisCall = calls.active?.conversationId === conversation.id;
  const typingNames = typingIds.map((id) => byId.get(id)?.firstName).filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-fg-muted hover:bg-muted lg:hidden" aria-label="Back to chats">
          <ArrowLeft size={18} />
        </button>
        <ConversationAvatar conversation={conversation} myId={me.id} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-fg-subtle">
            {other
              ? `${other.position ?? ROLE_LABELS[other.role]} · ${other.online ? 'Online' : 'Offline'}`
              : `${conversation.participants.length} people · ${conversation.participants.filter((p) => p.online && p.userId !== me.id).length} online`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void calls.startCall(conversation.id, 'audio')}
            disabled={calls.busy}
            className="rounded-lg p-2 text-primary hover:bg-primary-soft disabled:opacity-40"
            aria-label={conversation.type === 'GROUP' ? 'Start voice meeting' : 'Voice call'}
            title={conversation.type === 'GROUP' ? 'Start voice meeting' : 'Voice call'}
          >
            <Phone size={18} />
          </button>
          <button
            type="button"
            onClick={() => void calls.startCall(conversation.id, 'video')}
            disabled={calls.busy}
            className="rounded-lg p-2 text-primary hover:bg-primary-soft disabled:opacity-40"
            aria-label={conversation.type === 'GROUP' ? 'Start video meeting' : 'Video call'}
            title={conversation.type === 'GROUP' ? 'Start video meeting' : 'Video call'}
          >
            <Video size={18} />
          </button>
          {conversation.type === 'GROUP' ? (
            <button type="button" onClick={() => setInfo(true)} className="rounded-lg p-2 text-fg-muted hover:bg-muted" aria-label="Group details" title="Group details">
              <Info size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {call && !inThisCall ? (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-success-soft px-4 py-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
            {conversation.type === 'GROUP' ? `Meeting in progress · ${call.participantIds.length} in call` : 'Call in progress'}
          </span>
          <Button size="sm" icon={call.media === 'video' ? Video : Phone} onClick={() => void calls.joinCall(call)} disabled={calls.busy}>
            Join
          </Button>
        </div>
      ) : null}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {query.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {query.hasNextPage ? (
              <div className="mb-3 flex justify-center">
                <Button size="sm" variant="secondary" onClick={() => void loadOlder()} loading={query.isFetchingNextPage}>
                  Load earlier messages
                </Button>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={`Say hi to ${other ? other.firstName : name}`}
                description="Messages are delivered instantly. You can also start a voice or video call from the top right."
              />
            ) : null}
            <div className="space-y-1">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const next = messages[index + 1];
                const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
                const separator = newDay ? (
                  <div className="my-4 flex items-center gap-3 text-[11px] font-medium text-fg-subtle">
                    <span className="h-px flex-1 bg-border" />
                    {formatLongDate(message.createdAt)}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null;

                if (message.kind === 'SYSTEM') {
                  return (
                    <Fragment key={message.id}>
                      {separator}
                      <p className="my-2 text-center text-xs text-fg-subtle">{message.body}</p>
                    </Fragment>
                  );
                }
                if (message.kind === 'CALL') {
                  return (
                    <Fragment key={message.id}>
                      {separator}
                      <CallBubble message={message} />
                    </Fragment>
                  );
                }
                const mine = message.senderId === me.id;
                const sender = message.senderId ? byId.get(message.senderId) : undefined;
                const senderName = sender ? personName(sender) : 'Former member';
                const groupedWithPrevious =
                  !newDay && previous?.senderId === message.senderId && previous.kind === 'TEXT' && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
                const groupedWithNext =
                  next && next.senderId === message.senderId && next.kind === 'TEXT' && sameDay(next.createdAt, message.createdAt) && new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() < 5 * 60_000;
                return (
                  <Fragment key={message.id}>
                    {separator}
                    <div className={cn(!groupedWithPrevious && 'pt-2')}>
                      <MessageBubble
                        message={message}
                        mine={mine}
                        senderName={senderName}
                        showSender={!mine && conversation.type === 'GROUP' && !groupedWithPrevious}
                        showAvatar={!mine && !groupedWithNext}
                      />
                    </div>
                    {message.id === myLast?.id && seen ? <p className="pr-1 text-right text-[11px] text-fg-subtle">Seen</p> : null}
                  </Fragment>
                );
              })}
            </div>
            {typingNames.length > 0 ? (
              <div className="mt-2 flex items-center gap-2 pl-9 text-xs text-fg-subtle" aria-live="polite">
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
              </div>
            ) : null}
          </>
        )}
      </div>

      <Composer conversationId={conversation.id} />

      {conversation.type === 'GROUP' ? <GroupInfoDialog key={conversation.id} open={info} onClose={() => setInfo(false)} conversation={conversation} onLeft={onLeft} /> : null}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const calls = useCalls();
  const query = useConversations();
  const [dialog, setDialog] = useState<'direct' | 'group' | 'meeting' | null>(null);
  const selected = query.data?.find((c) => c.id === id);

  useEffect(() => {
    setOpenConversation(id ?? null);
    return () => setOpenConversation(null);
  }, [id]);

  const open = (conversationId: string) => navigate(`/messages/${conversationId}`);

  return (
    <Card className="flex h-[calc(100dvh-7rem)] overflow-hidden lg:h-[calc(100dvh-8rem)]">
      <aside className={cn('flex w-full flex-col border-border lg:w-80 lg:shrink-0 lg:border-r', id ? 'hidden lg:flex' : 'flex')}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
          <h1 className="font-display text-lg font-bold">Messages</h1>
          <Popover
            className="w-56 p-1.5"
            trigger={({ toggle, ...aria }) => (
              <Button size="sm" icon={MessageSquarePlus} onClick={toggle} {...aria}>
                New
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<MessageCircle size={16} aria-hidden />}
                  onClick={() => {
                    close();
                    setDialog('direct');
                  }}
                >
                  New message
                </MenuItem>
                <MenuItem
                  icon={<Users size={16} aria-hidden />}
                  onClick={() => {
                    close();
                    setDialog('group');
                  }}
                >
                  New group
                </MenuItem>
                <MenuItem
                  icon={<Video size={16} aria-hidden />}
                  onClick={() => {
                    close();
                    setDialog('meeting');
                  }}
                >
                  New meeting
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
        {query.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <ConversationList conversations={query.data ?? []} selectedId={id} onSelect={open} />
        )}
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden lg:flex')}>
        {selected ? (
          <Thread key={selected.id} conversation={selected} onBack={() => navigate('/messages')} onLeft={() => navigate('/messages')} />
        ) : id && query.isSuccess ? (
          <EmptyState icon={MessageCircle} title="Chat not found" description="It may have been removed, or you left it." className="m-auto" />
        ) : (
          <EmptyState
            icon={MessageCircle}
            title={`Hi ${me.firstName}`}
            description="Pick a chat, or start a new message, group or meeting. Calls and meetings run right in your browser."
            className="m-auto"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={MessageCircle} onClick={() => setDialog('direct')}>
                  New message
                </Button>
                <Button variant="secondary" icon={Video} onClick={() => setDialog('meeting')}>
                  New meeting
                </Button>
              </div>
            }
          />
        )}
      </section>

      <NewChatDialog open={dialog === 'direct'} onClose={() => setDialog(null)} onOpened={(c) => open(c.id)} />
      <NewGroupDialog open={dialog === 'group'} onClose={() => setDialog(null)} onCreated={(c) => open(c.id)} />
      <NewGroupDialog
        meeting
        open={dialog === 'meeting'}
        onClose={() => setDialog(null)}
        onCreated={(c) => {
          open(c.id);
          void calls.startCall(c.id, 'video');
        }}
      />
    </Card>
  );
}
