import { BadgeCheck, CircleX, SearchX } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Card, DetailList, Spinner } from '@/components/ui/Display';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { useVerification } from './api';

/** Public page opened by scanning the QR code on a certificate. */
export default function VerifyCertificatePage() {
  const { code = '' } = useParams();
  const query = useVerification(code);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg" />
        <p className="font-semibold text-fg">Certificate verification</p>
      </div>
      <Card className="w-full max-w-lg overflow-hidden">
        {query.isLoading ? (
          <div className="p-10 text-center">
            <Spinner />
          </div>
        ) : query.isError || !query.data ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-fg-subtle">
              <SearchX size={28} aria-hidden />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Certificate not found</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {query.error instanceof ApiError && query.error.status === 429
                ? query.error.message
                : `No certificate matches the ID “${code}”. Check the ID printed on the certificate.`}
            </p>
          </div>
        ) : (
          <>
            <div className={`flex items-center gap-4 px-6 py-5 ${query.data.status === 'VALID' ? 'bg-success-soft' : 'bg-danger-soft'}`}>
              {query.data.status === 'VALID' ? (
                <BadgeCheck size={36} className="shrink-0 text-success" aria-hidden />
              ) : (
                <CircleX size={36} className="shrink-0 text-danger" aria-hidden />
              )}
              <div>
                <h1 className={`text-lg font-semibold ${query.data.status === 'VALID' ? 'text-success' : 'text-danger'}`}>
                  {query.data.status === 'VALID' ? 'Verified certificate' : 'This certificate has been revoked'}
                </h1>
                <p className="text-sm text-fg-muted">
                  {query.data.status === 'VALID'
                    ? 'This certificate was issued by the organization and is authentic.'
                    : `Revoked on ${formatDate(query.data.revokedAt)}. It is no longer valid.`}
                </p>
              </div>
            </div>
            <div className="p-6">
              <DetailList
                items={[
                  { label: 'Certificate ID', value: <span className="font-mono">{query.data.certificateId}</span> },
                  { label: 'Verification status', value: query.data.status === 'VALID' ? 'Valid' : 'Revoked' },
                  { label: 'Recipient', value: query.data.recipientName },
                  { label: 'Event', value: query.data.event },
                  { label: 'Event date', value: formatDate(query.data.eventDate) },
                  { label: 'Date issued', value: formatDate(query.data.dateIssued) },
                  { label: 'Organization', value: query.data.organization },
                ]}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
