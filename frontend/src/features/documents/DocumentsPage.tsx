import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileImage, FileSpreadsheet, FileText, Trash, Upload } from 'lucide-react';
import { useState } from 'react';

import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { Pagination, SearchInput, Table, Td, Th, THead, Toolbar, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { ApiError, deleteRequest, getPage, postData } from '@/lib/api';
import { downloadFile, openFile } from '@/lib/files';
import { formatDate, formatFileSize } from '@/lib/format';
import { DOCUMENT_CATEGORY_LABELS, enumOptions } from '@/lib/labels';
import type { DocumentCategory, DocumentItem, DocumentVisibility, Paginated } from '@/types/api';

const iconFor = (mime: string) => (mime.startsWith('image/') ? FileImage : mime.includes('sheet') ? FileSpreadsheet : FileText);
const canPreview = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/');

export default function DocumentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<DocumentItem | null>(null);

  const query = useQuery({
    queryKey: ['documents', page, search, category],
    queryFn: () => getPage<Paginated<DocumentItem>>('/documents', { params: { page, search: search || undefined, category: category || undefined } }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRequest(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <>
      <PageHeader
        title="Documents"
        description={
          can('documents:read')
            ? 'Proposals, minutes, reports and other official files.'
            : 'Official files shared with all members.'
        }
        actions={
          can('documents:manage') ? (
            <Button icon={Upload} onClick={() => setUploading(true)}>
              Upload
            </Button>
          ) : null
        }
      />
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search documents"
            className="w-full sm:w-72"
          />
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as DocumentCategory | '');
              setPage(1);
            }}
            className="w-auto"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {enumOptions(DOCUMENT_CATEGORY_LABELS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Toolbar>
        {query.isLoading ? (
          <LoadingBlock />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.data.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <Th>Document</Th>
                  <Th>Category</Th>
                  <Th>Visible to</Th>
                  <Th>Uploaded</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {query.data.data.map((d) => {
                  const Icon = iconFor(d.mimeType);
                  return (
                    <Tr key={d.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Icon size={20} className="shrink-0 text-fg-subtle" aria-hidden />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{d.title}</p>
                            <p className="truncate text-xs text-fg-subtle">
                              {d.originalName} · {formatFileSize(d.sizeBytes)}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-fg-muted">{DOCUMENT_CATEGORY_LABELS[d.category]}</Td>
                      <Td>{d.visibility === 'MEMBERS' ? <Badge tone="info">All members</Badge> : <Badge>Officers</Badge>}</Td>
                      <Td className="whitespace-nowrap text-fg-muted">
                        {formatDate(d.createdAt)}
                        <span className="block text-xs text-fg-subtle">{d.uploadedBy}</span>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {canPreview(d.mimeType) ? (
                          <IconButton icon={Eye} label="View" onClick={() => openFile(`/documents/${d.id}/file?inline=true`).catch(toast.error)} />
                        ) : null}
                        <IconButton icon={Download} label="Download" onClick={() => downloadFile(`/documents/${d.id}/file`, d.originalName).catch(toast.error)} />
                        {can('documents:manage') ? <IconButton icon={Trash} label="Remove" onClick={() => setRemoving(d)} /> : null}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState icon={FileText} title="No documents found" />
        )}
      </Card>

      {uploading ? <UploadDialog onClose={() => setUploading(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this document?"
        description="It disappears from the list. The file and its record are kept for the audit trail."
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success('Document removed.');
              setRemoving(null);
            },
            onError: toast.error,
          })
        }
      />
    </>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('MEETING_MINUTES');
  const [visibility, setVisibility] = useState<DocumentVisibility>('OFFICERS');
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append('file', file!);
      body.append('title', title);
      body.append('category', category);
      body.append('visibility', visibility);
      if (description) body.append('description', description);
      return postData('/documents', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document uploaded.');
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Upload document"
      description="PDF, Word, Excel, PowerPoint or image files up to 5 MB."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!file || title.trim().length < 3} loading={upload.isPending} onClick={() => upload.mutate()}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={upload.error instanceof ApiError ? upload.error.message : null} />
        <Field label="File" required>
          {(f) => (
            <Input
              {...f}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp"
              className="h-auto py-1.5"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
              }}
            />
          )}
        </Field>
        <Field label="Title" required>
          {(f) => <Input {...f} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            {(f) => (
              <Select {...f} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                {enumOptions(DOCUMENT_CATEGORY_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Visible to">
            {(f) => (
              <Select {...f} value={visibility} onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}>
                <option value="OFFICERS">Officers only</option>
                <option value="MEMBERS">All members</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description">
          {(f) => <Textarea {...f} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
