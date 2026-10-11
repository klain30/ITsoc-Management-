import type { Server } from 'socket.io';

/**
 * Holds the Socket.IO server once it is attached (see modules/chat/chat.socket.ts).
 * Services push events through these helpers; when no server is attached
 * (tests, scripts) they do nothing, so REST behaviour never depends on sockets.
 */
let io: Server | null = null;

export const setRealtimeServer = (server: Server | null) => {
  io = server;
};

export const userRoom = (userId: string) => `user:${userId}`;

export const emitToUsers = (userIds: Iterable<string>, event: string, payload: unknown) => {
  if (!io) return;
  const rooms = [...new Set(userIds)].map(userRoom);
  if (rooms.length > 0) io.to(rooms).emit(event, payload);
};

export const isUserOnline = (userId: string) => (io ? (io.sockets.adapter.rooms.get(userRoom(userId))?.size ?? 0) > 0 : false);
