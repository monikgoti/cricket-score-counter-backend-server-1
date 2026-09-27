"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveUserCount = exports.setSocketServer = void 0;
// Holds a module-level reference to the Socket.IO server instance so other
// modules (e.g. statsController) can read live connection info without
// importing server.ts directly, which would create a circular import.
let ioInstance = null;
const setSocketServer = (io) => {
    ioInstance = io;
};
exports.setSocketServer = setSocketServer;
const getActiveUserCount = () => {
    return ioInstance ? ioInstance.engine.clientsCount : 0;
};
exports.getActiveUserCount = getActiveUserCount;
//# sourceMappingURL=socketState.js.map