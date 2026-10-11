import { Maximize2, Mic, MicOff, Minimize2, MonitorUp, Phone, PhoneOff, Users, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Avatar } from '@/components/ui/Display';
import { useCurrentUser } from '@/features/auth/useAuth';
import { cn } from '@/lib/cn';

import { useCalls, type RemotePeer } from './CallProvider';
import { conversationName, personName } from './types';

// ─── Small pieces ───────────────────────────────────────────────────────────

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (!since) return null;
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** A short two-tone ring made with Web Audio, so no sound file is needed. */
function useRingtone(on: boolean, soft = false) {
  useEffect(() => {
    if (!on || typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    const ring = () => {
      const start = ctx.currentTime;
      for (const [offset, freq] of [
        [0, 880],
        [0.18, 660],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(soft ? 0.04 : 0.12, start + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, start + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + 0.2);
      }
    };
    ring();
    const timer = setInterval(ring, soft ? 3000 : 1600);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [on, soft]);
}

function MediaView({ stream, muted, mirrored, className }: { stream: MediaStream; muted?: boolean; mirrored?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn('h-full w-full object-cover', mirrored && '-scale-x-100', className)} />;
}

/** Plays a remote peer's audio. Kept separate from video tiles so audio continues while minimized. */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function ControlButton({
  label,
  onClick,
  active = true,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={danger ? undefined : !active}
      className={cn(
        'inline-flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-snappy active:scale-[0.94]',
        danger ? 'bg-red-600 text-white hover:bg-red-500' : active ? 'bg-white/12 text-white hover:bg-white/20' : 'bg-white text-[#110c37] hover:bg-white/90',
      )}
    >
      {children}
    </button>
  );
}

function Tile({ name, stream, video, muted, isMe, mirrored }: { name: string; stream: MediaStream | null; video: boolean; muted: boolean; isMe?: boolean; mirrored?: boolean }) {
  return (
    <div className="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
      {stream && video ? (
        <MediaView stream={stream} muted mirrored={mirrored} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Avatar name={name} size="lg" className="ring-4 ring-white/10" />
          {!stream ? <p className="text-xs text-white/60">Connecting…</p> : null}
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
        {muted ? <MicOff size={12} className="text-red-300" aria-label="Muted" /> : null}
        {isMe ? `${name} (you)` : name}
      </div>
    </div>
  );
}

// ─── Incoming call ──────────────────────────────────────────────────────────

export function IncomingCallCard() {
  const { incoming, acceptIncoming, declineIncoming, conversation } = useCalls();
  const me = useCurrentUser();
  useRingtone(Boolean(incoming));

  // Meetings stop ringing after a while; 1:1 calls are ended by the server.
  useEffect(() => {
    if (!incoming || incoming.conversationType !== 'GROUP') return;
    const timer = setTimeout(declineIncoming, 30_000);
    return () => clearTimeout(timer);
  }, [incoming, declineIncoming]);

  if (!incoming) return null;
  const chat = conversation(incoming.call.conversationId);
  const caller = chat?.participants.find((p) => p.userId === incoming.call.startedById);
  const callerName = caller ? personName(caller) : 'Someone';
  const video = incoming.call.media === 'video';
  const isMeeting = incoming.conversationType === 'GROUP';

  return (
    <div
      role="alertdialog"
      aria-label={`Incoming call from ${callerName}`}
      className="fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))] animate-pop rounded-2xl bg-[#110c37] p-4 text-white shadow-pop ring-1 ring-white/10"
    >
      <div className="flex items-center gap-3">
        <span className="relative">
          <Avatar name={callerName} />
          <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-sky-400/60" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{isMeeting ? (chat ? conversationName(chat, me.id) : incoming.title ?? 'Group meeting') : callerName}</p>
          <p className="truncate text-sm text-white/70">
            {isMeeting ? `${callerName} started a ${video ? 'video' : 'voice'} meeting` : `Incoming ${video ? 'video' : 'voice'} call…`}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={declineIncoming}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold hover:bg-red-500 active:scale-[0.97]"
        >
          <PhoneOff size={16} aria-hidden /> {isMeeting ? 'Dismiss' : 'Decline'}
        </button>
        <button
          type="button"
          onClick={() => void acceptIncoming()}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 active:scale-[0.97]"
        >
          {video ? <Video size={16} aria-hidden /> : <Phone size={16} aria-hidden />} {isMeeting ? 'Join' : 'Accept'}
        </button>
      </div>
    </div>
  );
}

// ─── In-call screen ─────────────────────────────────────────────────────────

export function CallOverlay() {
  const { active, hangUp, toggleMute, toggleCamera, toggleScreenShare, setMinimized, conversation } = useCalls();
  const me = useCurrentUser();
  const elapsed = useElapsed(active?.connectedAt ?? null);
  const remotes: RemotePeer[] = active ? Object.values(active.remotes) : [];
  const waiting = Boolean(active) && remotes.length === 0;
  const chat = active ? conversation(active.conversationId) : undefined;
  useRingtone(waiting && chat?.type === 'DIRECT', true);

  if (!active) return null;

  const title = chat ? conversationName(chat, me.id) : 'Call';
  const nameOf = (userId: string) => {
    const person = chat?.participants.find((p) => p.userId === userId);
    return person ? personName(person) : 'Participant';
  };
  const status = elapsed ?? (waiting ? (chat?.type === 'GROUP' ? 'Waiting for others to join…' : 'Calling…') : 'Connecting…');
  const hasCamera = active.localStream.getVideoTracks().length > 0;
  const canShare = hasCamera && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const audio = remotes.map((peer) => (peer.stream ? <RemoteAudio key={peer.userId} stream={peer.stream} /> : null));

  if (active.minimized) {
    return (
      <div className="fixed right-4 bottom-4 z-[55] flex animate-pop items-center gap-3 rounded-full bg-[#110c37] py-2 pr-2 pl-4 text-white shadow-pop ring-1 ring-white/10">
        {audio}
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
        <div className="min-w-0 leading-tight">
          <p className="max-w-40 truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-white/60 tabular-nums">{status}</p>
        </div>
        <button type="button" onClick={toggleMute} aria-label={active.muted ? 'Unmute' : 'Mute'} className="rounded-full p-2 hover:bg-white/10">
          {active.muted ? <MicOff size={16} className="text-red-300" /> : <Mic size={16} />}
        </button>
        <button type="button" onClick={() => setMinimized(false)} aria-label="Open call" className="rounded-full p-2 hover:bg-white/10">
          <Maximize2 size={16} />
        </button>
        <button type="button" onClick={hangUp} aria-label="Leave call" className="rounded-full bg-red-600 p-2 hover:bg-red-500">
          <PhoneOff size={16} />
        </button>
      </div>
    );
  }

  const tiles = remotes.length + 1;
  const grid = tiles <= 1 ? 'grid-cols-1' : tiles === 2 ? 'grid-cols-1 md:grid-cols-2' : tiles <= 4 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';

  return (
    <div role="dialog" aria-label={`Call with ${title}`} className="fixed inset-0 z-[55] flex animate-enter flex-col bg-[#08061f] text-white">
      {audio}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-display font-bold">{title}</p>
          <p className="flex items-center gap-1.5 text-sm text-white/60 tabular-nums">
            {chat?.type === 'GROUP' ? <Users size={14} aria-hidden /> : null}
            {status}
            {remotes.length > 0 && chat?.type === 'GROUP' ? ` · ${remotes.length + 1} in meeting` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setMinimized(true)} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Minimize call">
          <Minimize2 size={18} />
        </button>
      </div>

      <div className={cn('grid min-h-0 flex-1 content-center gap-3 overflow-y-auto px-4 sm:px-6', grid)}>
        {remotes.map((peer) => (
          <Tile key={peer.userId} name={nameOf(peer.userId)} stream={peer.stream} video={active.media === 'video' && !peer.cameraOff} muted={peer.muted} />
        ))}
        <Tile
          name={`${me.firstName} ${me.lastName}`}
          stream={active.localStream}
          video={hasCamera && (!active.cameraOff || active.sharing)}
          muted={active.muted}
          mirrored={!active.sharing}
          isMe
        />
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-5">
        <ControlButton label={active.muted ? 'Unmute' : 'Mute'} onClick={toggleMute} active={!active.muted}>
          {active.muted ? <MicOff size={20} /> : <Mic size={20} />}
        </ControlButton>
        {hasCamera ? (
          <ControlButton label={active.cameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={toggleCamera} active={!active.cameraOff}>
            {active.cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </ControlButton>
        ) : null}
        {canShare ? (
          <ControlButton label={active.sharing ? 'Stop sharing' : 'Share screen'} onClick={() => void toggleScreenShare()} active={!active.sharing}>
            <MonitorUp size={20} />
          </ControlButton>
        ) : null}
        <ControlButton label="Leave call" onClick={hangUp} danger>
          <PhoneOff size={20} />
        </ControlButton>
      </div>
    </div>
  );
}
