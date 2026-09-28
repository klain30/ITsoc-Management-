import { Award, Copy, Download, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { downloadFile } from '@/lib/files';
import { formatDate } from '@/lib/format';
import type { Certificate } from '@/types/api';

export function CertificateCard({ certificate }: { certificate: Certificate }) {
  const toast = useToast();
  const verifyPath = `/verify/certificate/${certificate.code}`;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
          <Award size={20} aria-hidden />
        </span>
        {certificate.isValid ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Revoked</Badge>}
      </div>
      <h3 className="mt-4 font-semibold text-fg">{certificate.eventName}</h3>
      <p className="mt-1 text-sm text-fg-muted">Event date {formatDate(certificate.eventDate)}</p>
      <p className="text-sm text-fg-muted">Issued {formatDate(certificate.issuedAt)}</p>
      <p className="mt-3 font-mono text-xs text-fg-subtle">{certificate.code}</p>
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          icon={Download}
          disabled={!certificate.isValid}
          onClick={() => downloadFile(`/certificates/${certificate.id}/download`, `certificate-${certificate.code}.pdf`).catch(toast.error)}
        >
          Download PDF
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={Copy}
          onClick={() =>
            navigator.clipboard
              .writeText(certificate.verificationUrl)
              .then(() => toast.success('Verification link copied.'))
              .catch(() => toast.error('Could not copy the link.'))
          }
        >
          Copy link
        </Button>
        <a href={verifyPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 text-xs font-medium text-primary hover:underline">
          Verify <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </Card>
  );
}
