import { Maximize2, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Display';
import { useSessionQr } from '@/features/events/api';
import { formatTime } from '@/lib/format';

/**
 * Full-screen view for a projector at the venue. The code changes every
 * rotation period; the page re-fetches exactly when the current one expires.
 */
export default function QrDisplayPage() {
  const { sessionId = '' } = useParams();
  const query = useSessionQr(sessionId);
  const [now, setNow] = useState(() => Date.now());

  const rotatesAt = query.data ? new Date(query.data.rotatesAt).getTime() : 0;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!rotatesAt) return;
    const timer = setTimeout(() => void query.refetch(), Math.max(0, rotatesAt - Date.now()) + 300);
    return () => clearTimeout(timer);
  }, [rotatesAt, query]);

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <EmptyState
          icon={TriangleAlert}
          title="Check-in is not open"
          description={query.error instanceof Error ? query.error.message : 'This session is closed or does not exist.'}
        />
      </div>
    );
  }

  const { eventName, qrDataUrl, rotationSeconds, session } = query.data;
  const secondsLeft = Math.max(0, Math.ceil((rotatesAt - now) / 1000));
  const progress = Math.min(100, (secondsLeft / rotationSeconds) * 100);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface px-6 py-10 text-center">
      <div>
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Scan to check in</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{eventName}</h1>
        <p className="mt-2 text-fg-muted">
          Open your phone camera, scan the code and sign in. Arrive after {formatTime(session.lateAfter)} and you’ll be marked late.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-white p-5 shadow-pop">
        <img src={qrDataUrl} alt="Attendance QR code" className="h-[min(60vh,28rem)] w-[min(60vh,28rem)] [image-rendering:pixelated]" />
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-chart-track" aria-hidden>
          <div className="h-full rounded-full bg-chart transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-fg-muted">New code in {secondsLeft}s · screenshots stop working after a few minutes</p>
      </div>

      <div className="flex items-center gap-6">
        <p className="inline-flex items-center gap-2 text-lg font-medium">
          <Users size={20} className="text-fg-subtle" aria-hidden />
          <span className="tabular">{session.checkIns}</span> checked in
        </p>
        <Button variant="secondary" icon={Maximize2} onClick={() => void document.documentElement.requestFullscreen?.()}>
          Full screen
        </Button>
      </div>
    </div>
  );
}
