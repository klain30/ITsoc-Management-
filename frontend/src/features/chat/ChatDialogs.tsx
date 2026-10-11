import { Check, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar, EmptyState, Spinner } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/cn';

import { useAddParticipants, useContacts, useCreateGroup, useOpenDirect, useRenameGroup, useLeaveGroup } from './api';
import { personName, type ChatPerson, type Conversation } from './types';

function useDebounced(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function PersonRow({ person, selected, onClick }: { person: ChatPerson; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover', selected && 'bg-primary-soft')}
    >
      <span className="relative">
        <Avatar name={personName(person)} />
        {person.online ? <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" aria-label="Online" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{personName(person)}</span>
        <span className="block truncate text-xs text-fg-subtle">{person.position ?? ROLE_LABELS[person.role]}</span>
      </span>
      {selected ? <Check size={16} className="text-primary" aria-hidden /> : null}
    </button>
  );
}

function ContactPicker({ selected, onToggle, exclude = [] }: { selected: string[]; onToggle: (person: ChatPerson) => void; exclude?: string[] }) {
  const [search, setSearch] = useState('');
  const query = useContacts(useDebounced(search.trim()));
  const people = (query.data ?? []).filter((p) => !exclude.includes(p.userId));
  const officers = people.filter((p) => p.role !== 'MEMBER');
  const members = people.filter((p) => p.role === 'MEMBER');

  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label="Search people" autoFocus />
      </div>
      <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">
        {query.isLoading ? (
          <div className="py-8 text-center">
            <Spinner />
          </div>
        ) : people.length === 0 ? (
          <EmptyState icon={Users} title="No one found" className="py-8" />
        ) : (
          [
            ['Officers', officers],
            ['Members', members],
          ].map(([label, list]) =>
            (list as ChatPerson[]).length > 0 ? (
              <div key={label as string}>
                <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{label as string}</p>
                {(list as ChatPerson[]).map((person) => (
                  <PersonRow key={person.userId} person={person} selected={selected.includes(person.userId)} onClick={() => onToggle(person)} />
                ))}
              </div>
            ) : null,
          )
        )}
      </div>
    </div>
  );
}

/** Pick one person to message. */
export function NewChatDialog({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (conversation: Conversation) => void }) {
  const openDirect = useOpenDirect();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} title="New message" description="Start a private chat with an officer or member.">
      {open ? (
        <ContactPicker
          selected={[]}
          onToggle={(person) =>
            openDirect.mutate(person.userId, {
              onSuccess: (conversation) => {
                onClose();
                onOpened(conversation);
              },
              onError: toast.error,
            })
          }
        />
      ) : null}
    </Dialog>
  );
}

/** Name a group and pick its members; optionally start a meeting right away. */
export function NewGroupDialog({
  open,
  onClose,
  onCreated,
  meeting = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
  meeting?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const create = useCreateGroup();
  const toast = useToast();
  const close = () => {
    setTitle('');
    setPicked([]);
    onClose();
  };
  const submit = () =>
    create.mutate(
      { title: title.trim() || (meeting ? 'Meeting' : 'Group chat'), userIds: picked.map((p) => p.userId) },
      {
        onSuccess: (conversation) => {
          close();
          onCreated(conversation);
        },
        onError: toast.error,
      },
    );

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      title={meeting ? 'New meeting' : 'New group'}
      description={meeting ? 'Invite people, then the meeting starts with video. Anyone invited can join from the group chat.' : 'Chat and hold meetings with a group of people.'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={picked.length === 0}>
            {meeting ? `Start meeting${picked.length ? ` (${picked.length + 1})` : ''}` : 'Create group'}
          </Button>
        </>
      }
    >
      {open ? (
        <div className="space-y-4">
          <Field label={meeting ? 'Meeting name' : 'Group name'}>
            {({ id }) => <Input id={id} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={meeting ? 'e.g. Officers’ weekly sync' : 'e.g. Executive board'} />}
          </Field>
          {picked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => setPicked((list) => list.filter((x) => x.userId !== p.userId))}
                  className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-soft-fg hover:opacity-80"
                >
                  {personName(p)} ×
                </button>
              ))}
            </div>
          ) : null}
          <ContactPicker
            selected={picked.map((p) => p.userId)}
            onToggle={(person) =>
              setPicked((list) => (list.some((p) => p.userId === person.userId) ? list.filter((p) => p.userId !== person.userId) : [...list, person]))
            }
          />
        </div>
      ) : null}
    </Dialog>
  );
}

/** Rename, add people to, or leave a group. */
export function GroupInfoDialog({ open, onClose, conversation, onLeft }: { open: boolean; onClose: () => void; conversation: Conversation; onLeft: () => void }) {
  const [title, setTitle] = useState(conversation.title ?? '');
  const [adding, setAdding] = useState<ChatPerson[]>([]);
  const rename = useRenameGroup(conversation.id);
  const add = useAddParticipants(conversation.id);
  const leave = useLeaveGroup(conversation.id);
  const toast = useToast();

  return (
    <Dialog open={open} onClose={onClose} title="Group details" size="md">
      {open ? (
        <div className="space-y-6">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== conversation.title) {
                rename.mutate(title.trim(), { onSuccess: () => toast.success('Group renamed.'), onError: toast.error });
              }
            }}
          >
            <Field label="Group name" className="flex-1">
              {({ id }) => <Input id={id} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary" loading={rename.isPending}>
              Save
            </Button>
          </form>

          <div>
            <p className="mb-2 text-sm font-semibold">{conversation.participants.length} people</p>
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {conversation.participants.map((p) => (
                <div key={p.userId} className="flex items-center gap-3 px-2.5 py-1.5">
                  <Avatar name={personName(p)} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{personName(p)}</span>
                  <span className="text-xs text-fg-subtle">{p.position ?? ROLE_LABELS[p.role]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Add people</p>
            <ContactPicker
              exclude={conversation.participants.map((p) => p.userId)}
              selected={adding.map((p) => p.userId)}
              onToggle={(person) =>
                setAdding((list) => (list.some((p) => p.userId === person.userId) ? list.filter((p) => p.userId !== person.userId) : [...list, person]))
              }
            />
            <Button
              className="mt-3"
              disabled={adding.length === 0}
              loading={add.isPending}
              onClick={() =>
                add.mutate(
                  adding.map((p) => p.userId),
                  {
                    onSuccess: () => {
                      setAdding([]);
                      toast.success('Added to the group.');
                    },
                    onError: toast.error,
                  },
                )
              }
            >
              Add {adding.length || ''}
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <Button
              variant="danger-ghost"
              loading={leave.isPending}
              onClick={() =>
                leave.mutate(undefined, {
                  onSuccess: () => {
                    onClose();
                    onLeft();
                  },
                  onError: toast.error,
                })
              }
            >
              Leave group
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
