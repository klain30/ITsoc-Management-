import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { MemberPicker } from '@/features/members/MemberPicker';
import { getData, patchData, postData } from '@/lib/api';
import { formatDate, todayInput } from '@/lib/format';
import type { Position } from '@/types/api';

const usePositions = (includeInactive: boolean) =>
  useQuery({
    queryKey: ['positions', includeInactive],
    queryFn: () => getData<Position[]>('/positions', { params: { includeInactive } }),
  });

export default function OfficersPage() {
  const { can } = useAuth();
  const canManage = can('positions:manage');
  const query = usePositions(canManage);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Position | null>(null);
  const [ending, setEnding] = useState<{ assignmentId: string; name: string; position: string } | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['positions'] });
    void queryClient.invalidateQueries({ queryKey: ['members'] });
  };
  const endTerm = useMutation({
    mutationFn: (assignmentId: string) => patchData(`/position-assignments/${assignmentId}/end`, { endDate: todayInput() }),
    onSuccess: invalidate,
  });
  const toggleActive = useMutation({
    mutationFn: (p: Position) => patchData(`/positions/${p.id}`, { isActive: !p.isActive }),
    onSuccess: invalidate,
  });

  return (
    <>
      <PageHeader
        title="Officers"
        description="Positions are managed here; access rights come from each account’s role (Members → member → Account)."
        actions={
          canManage ? (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New position
            </Button>
          ) : null
        }
      />
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data && query.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map((position) => (
            <Card key={position.id} className={position.isActive ? 'p-5' : 'p-5 opacity-60'}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{position.name}</h2>
                  {position.description ? <p className="mt-0.5 text-sm text-fg-muted">{position.description}</p> : null}
                </div>
                {!position.isActive ? <Badge>Inactive</Badge> : null}
              </div>
              <ul className="mt-4 space-y-2">
                {position.holders.length === 0 ? <li className="text-sm text-fg-subtle">Vacant</li> : null}
                {position.holders.map((h) => (
                  <li key={h.assignmentId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <Link to={`/members/${h.memberId}`} className="font-medium hover:underline">
                        {h.name}
                      </Link>
                      <span className="block text-xs text-fg-subtle">since {formatDate(h.since)}</span>
                    </span>
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => setEnding({ assignmentId: h.assignmentId, name: h.name, position: position.name })}>
                        End term
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <div className="mt-4 flex gap-2 border-t border-border pt-3">
                  {position.isActive ? (
                    <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAssigning(position)}>
                      Assign
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleActive.mutate(position, { onError: toast.error })}
                    disabled={position.isActive && position.holders.length > 0}
                    title={position.isActive && position.holders.length > 0 ? 'End current terms first' : undefined}
                  >
                    {position.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={UserCog} title="No positions yet" />
        </Card>
      )}

      {creating ? <PositionDialog onClose={() => setCreating(false)} onSaved={invalidate} /> : null}
      {assigning ? <AssignDialog position={assigning} onClose={() => setAssigning(null)} onSaved={invalidate} /> : null}
      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title="End this term?"
        description={ending ? `${ending.name}’s term as ${ending.position} ends today.` : undefined}
        confirmLabel="End term"
        loading={endTerm.isPending}
        onConfirm={() =>
          ending &&
          endTerm.mutate(ending.assignmentId, {
            onSuccess: () => {
              toast.success('Term ended.');
              setEnding(null);
            },
            onError: toast.error,
          })
        }
      />
    </>
  );
}

function PositionDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({ mutationFn: () => postData('/positions', { name, description }) });
  return (
    <Dialog
      open
      onClose={onClose}
      title="New position"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2}
            loading={create.isPending}
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Position created.');
                  onSaved();
                  onClose();
                },
                onError: toast.error,
              })
            }
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Committee Head — Logistics" />}
        </Field>
        <Field label="Description">
          {(f) => <Textarea {...f} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

function AssignDialog({ position, onClose, onSaved }: { position: Position; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(todayInput());
  const assign = useMutation({ mutationFn: () => postData(`/positions/${position.id}/assignments`, { memberId, startDate }) });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Assign ${position.name}`}
      description="If the member already holds a position, that term ends on the start date."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!memberId}
            loading={assign.isPending}
            onClick={() =>
              assign.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Position assigned.');
                  onSaved();
                  onClose();
                },
                onError: toast.error,
              })
            }
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Member" required>
          {(f) => <MemberPicker id={f.id} value={memberId} onChange={setMemberId} />}
        </Field>
        <Field label="Start date" required>
          {(f) => <Input {...f} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
