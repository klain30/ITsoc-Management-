/* eslint-disable react/only-export-components -- provider + hook live together */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '@/components/ui/Toast';
import { useCurrentUser } from '@/features/auth/useAuth';

import { chatKeys } from './api';
import { CallOverlay, IncomingCallCard } from './CallUi';
import { getSocket, request } from './socket';
import { personName, type CallInfo, type CallMedia, type Conversation } from './types';

/**
 * Voice/video calls and group meetings over WebRTC.
 *
 * Topology is a mesh: every participant holds one RTCPeerConnection to every
 * other participant, and the API only relays the signalling messages (offer,
 * answer, ICE candidates). That keeps media private and needs no media
 * server, and works well for 1:1 calls and small meetings (up to ~6 people).
 *
 * Whoever joins a call sends an offer to everyone already in it, so two
 * peers never offer to each other at the same time.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

type Signal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'state'; muted: boolean; cameraOff: boolean };

type Peer = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] };

export type RemotePeer = { userId: string; stream: MediaStream | null; muted: boolean; cameraOff: boolean };

export type ActiveCall = {
  callId: string;
  conversationId: string;
  media: CallMedia;
  /** Set when the first other person connects. */
  connectedAt: number | null;
  localStream: MediaStream;
  remotes: Record<string, RemotePeer>;
  muted: boolean;
  cameraOff: boolean;
  sharing: boolean;
  minimized: boolean;
};

export type IncomingCall = { call: CallInfo; conversationType: 'DIRECT' | 'GROUP'; title: string | null };

type CallContextValue = {
  active: ActiveCall | null;
  incoming: IncomingCall | null;
  busy: boolean;
  startCall: (conversationId: string, media: CallMedia) => Promise<void>;
  joinCall: (call: CallInfo) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  setMinimized: (minimized: boolean) => void;
  conversation: (conversationId: string) => Conversation | undefined;
};

const CallContext = createContext<CallContextValue | null>(null);

export const useCalls = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCalls must be used inside <CallProvider>');
  return context;
};

const mediaError = (error: unknown) => {
  if (!window.isSecureContext) return 'Calls need a secure connection (https or localhost) to use the camera and microphone.';
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'Allow microphone and camera access in your browser to make calls.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No microphone or camera was found on this device.';
  return error instanceof Error ? error.message : 'Could not start the call.';
};

const getMedia = async (media: CallMedia) => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(mediaError(null));
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: media === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  } catch (error) {
    // No camera? Fall back to voice so the call still happens.
    if (media === 'video' && error instanceof DOMException && error.name === 'NotFoundError') {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    throw new Error(mediaError(error));
  }
};

export function CallProvider({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const screenTrack = useRef<MediaStreamTrack | null>(null);

  const update = useCallback((fn: (call: ActiveCall) => ActiveCall) => {
    if (!activeRef.current) return;
    activeRef.current = fn(activeRef.current);
    setActive(activeRef.current);
  }, []);

  const conversation = useCallback(
    (conversationId: string) => queryClient.getQueryData<Conversation[]>(chatKeys.conversations)?.find((c) => c.id === conversationId),
    [queryClient],
  );

  const nameOf = useCallback(
    (conversationId: string, userId: string) => {
      const person = conversation(conversationId)?.participants.find((p) => p.userId === userId);
      return person ? personName(person) : 'Someone';
    },
    [conversation],
  );

  // ─── Signalling helpers ──────────────────────────────────────────────────

  const sendSignal = useCallback((to: string, data: Signal) => {
    const call = activeRef.current;
    if (call) getSocket().emit('call:signal', { callId: call.callId, to, data });
  }, []);

  const sendState = useCallback(
    (to?: string) => {
      const call = activeRef.current;
      if (!call) return;
      const state: Signal = { type: 'state', muted: call.muted, cameraOff: call.cameraOff };
      for (const userId of to ? [to] : peers.current.keys()) sendSignal(userId, state);
    },
    [sendSignal],
  );

  const closePeer = useCallback((userId: string) => {
    peers.current.get(userId)?.pc.close();
    peers.current.delete(userId);
  }, []);

  const createPeer = useCallback(
    (userId: string) => {
      closePeer(userId);
      const call = activeRef.current!;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      for (const track of call.localStream.getTracks()) {
        // While screen sharing, new peers get the screen instead of the camera.
        const outgoing = track.kind === 'video' && screenTrack.current ? screenTrack.current : track;
        pc.addTrack(outgoing, call.localStream);
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) sendSignal(userId, { type: 'candidate', candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        update((c) => ({
          ...c,
          connectedAt: c.connectedAt ?? Date.now(),
          remotes: { ...c.remotes, [userId]: { ...(c.remotes[userId] ?? { userId, muted: false, cameraOff: false }), stream } },
        }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce();
      };
      const peer = { pc, pending: [] };
      peers.current.set(userId, peer);
      update((c) => ({
        ...c,
        remotes: { ...c.remotes, [userId]: c.remotes[userId] ?? { userId, stream: null, muted: false, cameraOff: false } },
      }));
      return peer;
    },
    [closePeer, sendSignal, update],
  );

  const flushCandidates = async (peer: Peer) => {
    for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate).catch(() => undefined);
  };

  const cleanup = useCallback(() => {
    for (const userId of [...peers.current.keys()]) closePeer(userId);
    activeRef.current?.localStream.getTracks().forEach((track) => track.stop());
    screenTrack.current?.stop();
    screenTrack.current = null;
    activeRef.current = null;
    setActive(null);
  }, [closePeer]);

  // ─── Joining and leaving ─────────────────────────────────────────────────

  const enter = useCallback(
    async (call: CallInfo, stream: MediaStream) => {
      activeRef.current = {
        callId: call.id,
        conversationId: call.conversationId,
        media: call.media,
        connectedAt: null,
        localStream: stream,
        remotes: {},
        muted: false,
        cameraOff: stream.getVideoTracks().length === 0,
        sharing: false,
        minimized: false,
      };
      setActive(activeRef.current);
      try {
        const { peers: existing } = await request<{ peers: string[] }>('call:join', { callId: call.id });
        for (const userId of existing) {
          const peer = createPeer(userId);
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          sendSignal(userId, { type: 'offer', sdp: offer });
        }
      } catch (error) {
        cleanup();
        throw error;
      }
    },
    [cleanup, createPeer, sendSignal],
  );

  const joinCall = useCallback(
    async (call: CallInfo) => {
      if (activeRef.current) {
        toast.error('You are already in a call.');
        return;
      }
      setIncoming((current) => (current?.call.id === call.id ? null : current));
      let stream: MediaStream;
      try {
        stream = await getMedia(call.media);
      } catch (error) {
        toast.error(error);
        return;
      }
      try {
        await enter(call, stream);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        toast.error(error);
      }
    },
    [enter, toast],
  );

  const startCall = useCallback(
    async (conversationId: string, media: CallMedia) => {
      if (activeRef.current) {
        toast.error('You are already in a call.');
        return;
      }
      let stream: MediaStream;
      try {
        stream = await getMedia(media);
      } catch (error) {
        toast.error(error);
        return;
      }
      try {
        const { call, existing } = await request<{ call: CallInfo; existing: boolean }>('call:start', { conversationId, media });
        if (existing) {
          // Someone else started one a moment earlier: join theirs (with its media type).
          stream.getTracks().forEach((track) => track.stop());
          await joinCall(call);
          return;
        }
        // We are the only participant; enter() would send no offers, so just set up local state.
        activeRef.current = {
          callId: call.id,
          conversationId,
          media,
          connectedAt: null,
          localStream: stream,
          remotes: {},
          muted: false,
          cameraOff: stream.getVideoTracks().length === 0,
          sharing: false,
          minimized: false,
        };
        setActive(activeRef.current);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        toast.error(error);
      }
    },
    [joinCall, toast],
  );

  const hangUp = useCallback(() => {
    const call = activeRef.current;
    if (!call) return;
    getSocket().emit('call:leave', { callId: call.callId });
    cleanup();
  }, [cleanup]);

  const acceptIncoming = useCallback(async () => {
    if (incoming) await joinCall(incoming.call);
  }, [incoming, joinCall]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    getSocket().emit('call:decline', { callId: incoming.call.id });
    setIncoming(null);
  }, [incoming]);

  // ─── Controls ────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    update((c) => {
      const muted = !c.muted;
      c.localStream.getAudioTracks().forEach((track) => (track.enabled = !muted));
      return { ...c, muted };
    });
    sendState();
  }, [sendState, update]);

  const toggleCamera = useCallback(() => {
    update((c) => {
      if (c.localStream.getVideoTracks().length === 0) return c;
      const cameraOff = !c.cameraOff;
      c.localStream.getVideoTracks().forEach((track) => (track.enabled = !cameraOff));
      return { ...c, cameraOff };
    });
    sendState();
  }, [sendState, update]);

  const replaceOutgoingVideo = (track: MediaStreamTrack) => {
    for (const { pc } of peers.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      void sender?.replaceTrack(track);
    }
  };

  const stopSharing = useCallback(() => {
    const camera = activeRef.current?.localStream.getVideoTracks()[0];
    screenTrack.current?.stop();
    screenTrack.current = null;
    if (camera) replaceOutgoingVideo(camera);
    update((c) => ({ ...c, sharing: false }));
  }, [update]);

  const toggleScreenShare = useCallback(async () => {
    const call = activeRef.current;
    if (!call) return;
    if (call.sharing) {
      stopSharing();
      return;
    }
    if (call.localStream.getVideoTracks().length === 0) {
      toast.info('Screen sharing works in video calls and meetings.');
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const [track] = display.getVideoTracks();
      screenTrack.current = track;
      track.onended = stopSharing;
      replaceOutgoingVideo(track);
      update((c) => ({ ...c, sharing: true }));
    } catch {
      // The user closed the picker.
    }
  }, [stopSharing, toast, update]);

  const setMinimized = useCallback((minimized: boolean) => update((c) => ({ ...c, minimized })), [update]);

  // ─── Socket events ───────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (payload: IncomingCall) => {
      if (payload.call.startedById === me.id) return;
      if (activeRef.current) return; // busy: the caller just sees no answer
      setIncoming(payload);
      // Make sure we know the conversation (and caller's name) even if it is brand new.
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };

    const onState = ({ conversationId, call }: { conversationId: string; call: CallInfo | null }) => {
      // Answered on another tab or device: stop ringing here.
      setIncoming((current) =>
        current && current.call.conversationId === conversationId && (!call || call.participantIds.includes(me.id)) ? null : current,
      );
    };

    const onEnded = ({ callId }: { callId: string }) => {
      setIncoming((current) => (current?.call.id === callId ? null : current));
      if (activeRef.current?.callId === callId) cleanup();
    };

    const onPeerJoined = ({ callId, userId }: { callId: string; userId: string }) => {
      if (activeRef.current?.callId !== callId) return;
      update((c) => ({
        ...c,
        remotes: { ...c.remotes, [userId]: c.remotes[userId] ?? { userId, stream: null, muted: false, cameraOff: false } },
      }));
    };

    const onPeerLeft = ({ callId, userId }: { callId: string; userId: string }) => {
      if (activeRef.current?.callId !== callId) return;
      closePeer(userId);
      update((c) => {
        const remotes = { ...c.remotes };
        delete remotes[userId];
        return { ...c, remotes };
      });
    };

    const onDeclined = ({ callId, userId }: { callId: string; userId: string }) => {
      const call = activeRef.current;
      if (call?.callId === callId) toast.info(`${nameOf(call.conversationId, userId)} declined the call.`);
    };

    const onSignal = async ({ callId, from, data }: { callId: string; from: string; data: Signal }) => {
      if (activeRef.current?.callId !== callId) return;
      try {
        if (data.type === 'offer') {
          const peer = createPeer(from);
          await peer.pc.setRemoteDescription(data.sdp);
          await flushCandidates(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          sendSignal(from, { type: 'answer', sdp: answer });
          sendState(from);
        } else if (data.type === 'answer') {
          const peer = peers.current.get(from);
          if (!peer) return;
          await peer.pc.setRemoteDescription(data.sdp);
          await flushCandidates(peer);
          sendState(from);
        } else if (data.type === 'candidate') {
          const peer = peers.current.get(from);
          if (!peer) return;
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => undefined);
          else peer.pending.push(data.candidate);
        } else if (data.type === 'state') {
          update((c) =>
            c.remotes[from]
              ? { ...c, remotes: { ...c.remotes, [from]: { ...c.remotes[from], muted: data.muted, cameraOff: data.cameraOff } } }
              : c,
          );
        }
      } catch (error) {
        console.error('call signalling failed', error);
      }
    };

    // Calls do not survive a dropped connection; the server already removed us.
    const onDisconnect = () => {
      if (activeRef.current) {
        cleanup();
        toast.error('Connection lost. The call ended.');
      }
      setIncoming(null);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:state', onState);
    socket.on('call:ended', onEnded);
    socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft);
    socket.on('call:declined', onDeclined);
    socket.on('call:signal', onSignal);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:state', onState);
      socket.off('call:ended', onEnded);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:declined', onDeclined);
      socket.off('call:signal', onSignal);
      socket.off('disconnect', onDisconnect);
    };
  }, [cleanup, closePeer, createPeer, me.id, nameOf, queryClient, sendSignal, sendState, toast, update]);

  // Leave the call if the tab closes or the user signs out.
  useEffect(() => {
    const onUnload = () => {
      if (activeRef.current) getSocket().emit('call:leave', { callId: activeRef.current.callId });
    };
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      onUnload();
      cleanup();
    };
  }, [cleanup]);

  const value = useMemo<CallContextValue>(
    () => ({
      active,
      incoming,
      busy: active !== null,
      startCall,
      joinCall,
      acceptIncoming,
      declineIncoming,
      hangUp,
      toggleMute,
      toggleCamera,
      toggleScreenShare,
      setMinimized,
      conversation,
    }),
    [active, incoming, startCall, joinCall, acceptIncoming, declineIncoming, hangUp, toggleMute, toggleCamera, toggleScreenShare, setMinimized, conversation],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <IncomingCallCard />
      <CallOverlay />
    </CallContext.Provider>
  );
}
