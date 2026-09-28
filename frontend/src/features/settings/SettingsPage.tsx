import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Field, FormError, Input } from '@/components/ui/Form';
import { Table, Td, Th, THead, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useRoleMatrix } from '@/features/members/api';
import { ApiError, getData, patchData } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';
import type { Organization } from '@/types/api';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Organization profile and the access each role grants." />
      <div className="space-y-6">
        <OrganizationCard />
        <RoleMatrixCard />
      </div>
    </>
  );
}

function OrganizationCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['organization'], queryFn: () => getData<Organization>('/organization') });
  if (!query.data) return <LoadingBlock />;
  return <OrganizationForm key={JSON.stringify(query.data)} initial={query.data} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['organization'] })} toast={toast} />;
}

function OrganizationForm({ initial, onSaved, toast }: { initial: Organization; onSaved: () => void; toast: ReturnType<typeof useToast> }) {
  const [form, setForm] = useState<Organization>(initial);
  const save = useMutation({
    mutationFn: () => patchData<Organization>('/organization', { ...form, email: form.email || null }),
    onSuccess: () => {
      onSaved();
      toast.success('Organization updated.');
    },
  });

  return (
    <Card>
      <CardHeader title="Organization" description="Shown on the sign-in page, certificates and the verification page." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={save.error instanceof ApiError ? save.error.message : null} />
        </div>
        <Field label="Name">{(f) => <Input {...f} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Short name">{(f) => <Input {...f} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />}</Field>
        <Field label="University / college">{(f) => <Input {...f} value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />}</Field>
        <Field label="Contact email">{(f) => <Input {...f} type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <div>
          <Button icon={Save} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function RoleMatrixCard() {
  const query = useRoleMatrix();
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const { roles, permissions } = query.data;
  return (
    <Card>
      <CardHeader title="Roles & permissions" description="Enforced by the API on every request. Change a member’s role from their profile." />
      <Table>
        <THead>
          <tr>
            <Th>Permission</Th>
            {roles.map((r) => (
              <Th key={r.name} className="text-center">
                {ROLE_LABELS[r.name]}
                <span className="block font-normal text-fg-subtle">{r.activeUsers} active</span>
              </Th>
            ))}
          </tr>
        </THead>
        <tbody>
          {permissions.map((p) => (
            <Tr key={p.key}>
              <Td>
                <span className="font-mono text-xs">{p.key}</span>
                <span className="block text-xs text-fg-subtle">{p.description}</span>
              </Td>
              {roles.map((r) => (
                <Td key={r.name} className="text-center">
                  {r.permissions.includes(p.key) ? <Check size={16} className="mx-auto text-success" aria-label="Granted" /> : <span className="text-fg-subtle" aria-label="Not granted">·</span>}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
