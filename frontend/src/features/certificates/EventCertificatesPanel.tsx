import { Award } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useIssueCertificates } from '@/features/events/api';
import type { EventItem } from '@/types/api';

import { CertificateTable } from './CertificatesPage';

export function EventCertificatesPanel({ event }: { event: EventItem }) {
  const issue = useIssueCertificates(event.id);
  const toast = useToast();

  if (event.status !== 'COMPLETED') {
    return (
      <EmptyState
        icon={Award}
        title="Certificates are issued after the event"
        description="Mark the event as completed; then issue certificates to everyone who checked in (present or late)."
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
        <p className="text-sm text-fg-muted">Issues a certificate to each attendee who does not have one yet. Safe to run again.</p>
        <Button
          icon={Award}
          loading={issue.isPending}
          onClick={() =>
            issue.mutate(undefined, {
              onSuccess: (result) =>
                toast.success(result?.issued ? `${result.issued} certificates issued and recipients notified.` : 'Everyone eligible already has a certificate.'),
              onError: toast.error,
            })
          }
        >
          Issue certificates
        </Button>
      </div>
      <CertificateTable eventId={event.id} />
    </div>
  );
}
