import { Award, Ban } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Pagination, SearchInput, Table, Td, Th, THead, Toolbar, Tr } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { formatDate } from '@/lib/format';
import type { Certificate } from '@/types/api';

import { useCertificates, useMyCertificates, useRevokeCertificate } from './api';
import { CertificateCard } from './CertificateCard';

export default function CertificatesPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const isIssuer = can('certificates:issue');

  return (
    <>
      <PageHeader title="Certificates" description="Certificates of participation for events you attended. Each has a QR code anyone can verify." />
      {isIssuer ? (
        <Tabs
          className="mb-6"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'mine', label: 'My certificates' },
            { key: 'all', label: 'All issued' },
          ]}
        />
      ) : null}
      {tab === 'mine' ? <MyCertificates /> : <AllCertificates />}
    </>
  );
}

function MyCertificates() {
  const query = useMyCertificates();
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data?.length) {
    return (
      <Card>
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Attend an event and check in with the QR code. Certificates are issued after the event is completed."
        />
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {query.data.map((certificate) => (
        <CertificateCard key={certificate.id} certificate={certificate} />
      ))}
    </div>
  );
}

export function CertificateTable({ eventId }: { eventId?: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const query = useCertificates({ page, eventId, search });
  const revoke = useRevokeCertificate();
  const toast = useToast();
  const [target, setTarget] = useState<Certificate | null>(null);

  return (
    <>
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, event or certificate ID"
          className="w-full sm:w-80"
        />
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
                <Th>Certificate ID</Th>
                <Th>Recipient</Th>
                {eventId ? null : <Th>Event</Th>}
                <Th>Issued</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {query.data.data.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs">{c.code}</Td>
                  <Td className="font-medium">{c.recipientName}</Td>
                  {eventId ? null : <Td className="text-fg-muted">{c.eventName}</Td>}
                  <Td className="text-fg-muted">{formatDate(c.issuedAt)}</Td>
                  <Td>{c.isValid ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Revoked</Badge>}</Td>
                  <Td className="text-right">
                    {c.isValid ? (
                      <Button size="sm" variant="danger-ghost" icon={Ban} onClick={() => setTarget(c)}>
                        Revoke
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-subtle" title={c.revokedReason ?? undefined}>
                        {formatDate(c.revokedAt)}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon={Award} title="No certificates issued" />
      )}
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Revoke certificate?"
        description={target ? `${target.code} for ${target.recipientName}. The public verification page will show it as revoked.` : undefined}
        confirmLabel="Revoke"
        tone="danger"
        reasonLabel="Reason"
        reasonRequired
        loading={revoke.isPending}
        onConfirm={(reason) =>
          target &&
          revoke.mutate(
            { id: target.id, reason },
            {
              onSuccess: () => {
                toast.success('Certificate revoked.');
                setTarget(null);
              },
              onError: toast.error,
            },
          )
        }
      />
    </>
  );
}

function AllCertificates() {
  return (
    <Card>
      <CertificateTable />
    </Card>
  );
}
