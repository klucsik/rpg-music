import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import SyncController from './syncController.js';

let io = null;
let syncController = null;
const connectedClients = new Map();

/**
 * Initialize WebSocket server
 */
export function initWebSocket(httpServer) {
  // Create Socket.io server
  io = new Server(httpServer, {
    cors: {
      origin: '*', // TODO: Configure for production
      methods: ['GET', 'POST'],
    },
    pingInterval: config.wsPingInterval,
    pingTimeout: config.wsPingTimeout,
  });

  // Initialize sync controller
  syncController = new SyncController(io);
  syncController.init();

  // Connection handler
  io.on('connection', (socket) => {
    const clientId = socket.id;
    
    logger.info({ clientId }, 'Client connected');
    
    // Store client info
    connectedClients.set(clientId, {
      id: clientId,
      connectedAt: Date.now(),
      userAgent: socket.handshake.headers['user-agent'],
    });

    // Send current state to new client
    socket.emit('state_sync', syncController.getState());

    // Handle client requests for current state
    socket.on('request_state', () => {
      logger.debug({ clientId }, 'Client requested state');
      socket.emit('state_sync', syncController.getState());
    });

    // Handle position reports from clients
    socket.on('position_report', (data) => {
      syncController.handlePositionReport(clientId, data);
    });

    // Handle client errors
    socket.on('client_error', (data) => {
      syncController.handleClientError(clientId, data);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info({ clientId, reason }, 'Client disconnected');
      connectedClients.delete(clientId);
    });
  });

  logger.info('WebSocket server initialized');

  return { io, syncController };
}

/**
 * Get Socket.io instance
 */
export function getIO() {
  if (!io) {
    throw new Error('WebSocket not initialized. Call initWebSocket() first.');
  }
  return io;
}

/**
 * Get sync controller instance
 */
export function getSyncController() {
  if (!syncController) {
    throw new Error('WebSocket not initialized. Call initWebSocket() first.');
  }
  return syncController;
}

/**
 * Get connected clients info
 */
export function getConnectedClients() {
  return Array.from(connectedClients.values());
}

/**
 * Get client count
 */
export function getClientCount() {
  return connectedClients.size;
}

/**
 * Close WebSocket server
 */
export function closeWebSocket() {
  if (syncController) {
    syncController.cleanup();
  }
  
  if (io) {
    io.close();
    logger.info('WebSocket server closed');
  }
}

export default {
  initWebSocket,
  getIO,
  getSyncController,
  getConnectedClients,
  getClientCount,
  closeWebSocket,
};
