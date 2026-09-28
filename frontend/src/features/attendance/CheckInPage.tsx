import { CircleCheck, CircleX, Clock, QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ButtonLink } from '@/components/ui/Button';
import { Card, Spinner } from '@/components/ui/Display';
import { checkIn } from '@/features/events/api';
import { ApiError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { CheckInResult } from '@/types/api';

type State = { kind: 'working' } | { kind: 'done'; result: CheckInResult } | { kind: 'error'; code: string; message: string };

const HELP: Record<string, string> = {
  CODE_EXPIRED: 'Codes change every 30 seconds. Scan the code on the screen again.',
  NOT_REGISTERED: 'Only members who registered for this event can check in. Ask an officer at the venue for help.',
  SESSION_CLOSED: 'The check-in window has closed. Ask an officer at the venue for help.',
  INVALID_CODE: 'Make sure you are scanning the code shown on the event screen.',
  CONFLICT: 'Your attendance for this event is already recorded.',
};

/** Target of the QR code: performs the check-in for the signed-in member. */
export default function CheckInPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const [state, setState] = useState<State>(() =>
    code ? { kind: 'working' } : { kind: 'error', code: 'INVALID_CODE', message: 'No check-in code was found in the link.' },
  );
  const started = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode running the effect twice.
    if (started.current || !code) return;
    started.current = true;
    checkIn(code)
      .then((result) => setState({ kind: 'done', result }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          code: error instanceof ApiError ? error.code : 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Check-in failed.',
        }),
      );
  }, [code]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center">
        {state.kind === 'working' ? (
          <>
            <Spinner />
            <p className="mt-4 text-sm text-fg-muted">Recording your attendance…</p>
          </>
        ) : state.kind === 'done' ? (
          <>
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state.result.status === 'LATE' ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}
            >
              {state.result.status === 'LATE' ? <Clock size={32} aria-hidden /> : <CircleCheck size={32} aria-hidden />}
            </div>
            <h1 className="mt-5 text-xl font-semibold">{state.result.status === 'LATE' ? 'Checked in (late)' : 'You’re checked in!'}</h1>
            <p className="mt-2 text-sm text-fg-muted">
              {state.result.event.name} · {formatTime(state.result.checkedInAt)}
            </p>
            <ButtonLink to={`/events/${state.result.event.id}`} variant="secondary" className="mt-6">
              View event
            </ButtonLink>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
              {state.code === 'CODE_EXPIRED' ? <QrCode size={30} aria-hidden /> : <CircleX size={32} aria-hidden />}
            </div>
            <h1 className="mt-5 text-xl font-semibold">{state.code === 'CONFLICT' ? 'Already checked in' : 'Check-in failed'}</h1>
            <p className="mt-2 text-sm text-fg">{state.message}</p>
            {HELP[state.code] ? <p className="mt-2 text-sm text-fg-muted">{HELP[state.code]}</p> : null}
            <ButtonLink to="/events" variant="secondary" className="mt-6">
              Go to events
            </ButtonLink>
          </>
        )}
      </Card>
    </div>
  );
}
