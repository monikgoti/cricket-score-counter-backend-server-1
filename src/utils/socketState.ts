import type { Server as SocketIOServer } from "socket.io";

// Holds a module-level reference to the Socket.IO server instance so other
// modules (e.g. statsController) can read live connection info without
// importing server.ts directly, which would create a circular import.
let ioInstance: SocketIOServer | null = null;

export const setSocketServer = (io: SocketIOServer): void => {
  ioInstance = io;
};

export const getActiveUserCount = (): number => {
  return ioInstance ? ioInstance.engine.clientsCount : 0;
};
