import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Megaphone, Pencil, Pin, Plus, Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/Form';
import { Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { ApiError, getPage, patchData, postData } from '@/lib/api';
import { formatDateTime, formatRelative, fromLocalInput, toLocalInput } from '@/lib/format';
import { ANNOUNCEMENT_STATUS } from '@/lib/labels';
import type { Announcement, AnnouncementStatus, Paginated } from '@/types/api';

type View = 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export default function AnnouncementsPage() {
  const { can } = useAuth();
  const manage = can('announcements:manage');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('PUBLISHED');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['announcements', manage ? view : 'live', page],
    queryFn: () => getPage<Paginated<Announcement>>('/announcements', { params: { page, pageSize: 10, status: manage ? view : undefined } }),
    placeholderData: keepPreviousData,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' }) => patchData(`/announcements/${id}/${action}`),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(v.action === 'publish' ? 'Published — members have been notified.' : 'Archived.');
    },
    onError: toast.error,
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description="News and reminders from the officers."
        actions={
          manage ? (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              New announcement
            </Button>
          ) : null
        }
      />
      {manage ? (
        <Tabs
          className="mb-6"
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
          items={[
            { key: 'PUBLISHED', label: 'Published' },
            { key: 'DRAFT', label: 'Drafts' },
            { key: 'ARCHIVED', label: 'Archived' },
          ]}
        />
      ) : null}
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data && query.data.data.length > 0 ? (
        <div className="space-y-4">
          {query.data.data.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {a.isPinned ? <Pin size={15} className="text-primary" aria-label="Pinned" /> : null}
                    {a.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {a.author} · {a.publishedAt ? formatRelative(a.publishedAt) : `created ${formatRelative(a.createdAt)}`}
                    {a.expiresAt ? ` · until ${formatDateTime(a.expiresAt)}` : ''}
                  </p>
                </div>
                {manage ? (
                  <div className="flex items-center gap-2">
                    <StatusBadge value={a.status as AnnouncementStatus} map={ANNOUNCEMENT_STATUS} />
                    {a.status !== 'ARCHIVED' ? (
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)}>
                        Edit
                      </Button>
                    ) : null}
                    {a.status === 'DRAFT' ? (
                      <Button size="sm" icon={Send} loading={act.isPending} onClick={() => act.mutate({ id: a.id, action: 'publish' })}>
                        Publish
                      </Button>
                    ) : null}
                    {a.status === 'PUBLISHED' ? (
                      <Button size="sm" variant="ghost" icon={Archive} onClick={() => act.mutate({ id: a.id, action: 'archive' })}>
                        Archive
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-fg">{a.content}</p>
            </Card>
          ))}
          <Card>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements here" />
        </Card>
      )}
      {editing ? <AnnouncementDialog announcement={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function AnnouncementDialog({ announcement, onClose }: { announcement?: Announcement; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [content, setContent] = useState(announcement?.content ?? '');
  const [isPinned, setPinned] = useState(announcement?.isPinned ?? false);
  const [expiresAt, setExpiresAt] = useState(toLocalInput(announcement?.expiresAt));
  const save = useMutation({
    mutationFn: (publish: boolean) => {
      const body = { title, content, isPinned, expiresAt: expiresAt ? fromLocalInput(expiresAt) : null };
      return announcement ? patchData(`/announcements/${announcement.id}`, body) : postData('/announcements', { ...body, publish });
    },
    onSuccess: (_d, publish) => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(announcement ? 'Announcement updated.' : publish ? 'Published — members have been notified.' : 'Saved as draft.');
      onClose();
    },
  });
  const valid = title.trim().length >= 3 && content.trim().length >= 3;

  return (
    <Dialog
      open
      onClose={onClose}
      title={announcement ? 'Edit announcement' : 'New announcement'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {announcement ? (
            <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(false)}>
              Save
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={!valid} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>
                Save draft
              </Button>
              <Button icon={Send} disabled={!valid} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>
                Publish now
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={save.error instanceof ApiError ? save.error.message : null} />
        <Field label="Title" required>
          {(f) => <Input {...f} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />}
        </Field>
        <Field label="Message" required>
          {(f) => <Textarea {...f} rows={6} value={content} onChange={(e) => setContent(e.target.value)} />}
        </Field>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Field label="Expires" hint="Optional — hidden from members after this time.">
            {(f) => <Input {...f} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
          </Field>
          <Checkbox label="Pin to the top" checked={isPinned} onChange={(e) => setPinned(e.target.checked)} className="pb-2" />
        </div>
      </div>
    </Dialog>
  );
}
