/**
 * Room state management
 * Manages multiple rooms, each with its own playback state and playlist
 */

import { SessionState } from './sessionState.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

class RoomStateManager {
  constructor() {
    this.rooms = new Map();
    this.clientRooms = new Map(); // Maps clientId -> roomId
    this.initializeRooms();
  }

  /**
   * Initialize all rooms based on config
   */
  initializeRooms() {
    for (let i = 1; i <= config.roomCount; i++) {
      const roomId = `room-${i}`;
      this.rooms.set(roomId, {
        id: roomId,
        number: i,
        sessionState: new SessionState(),
        clients: new Set(),
        playlistCollectionId: `current-playlist-${roomId}`,
        positionCheckInterval: null,
      });
      logger.info({ roomId, number: i }, 'Room initialized');
    }
  }

  /**
   * Get room by ID
   */
  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }
    return room;
  }

  /**
   * Get room session state
   */
  getRoomState(roomId) {
    const room = this.getRoom(roomId);
    return room.sessionState;
  }

  /**
   * Get all rooms info
   */
  getAllRooms() {
    const rooms = [];
    for (const [roomId, room] of this.rooms) {
      rooms.push({
        id: roomId,
        number: room.number,
        clientCount: room.clients.size,
        hasTrack: room.sessionState.hasTrack(),
        isPlaying: room.sessionState.isPlaying(),
        currentTrack: room.sessionState.currentTrack,
        playlistCollectionId: room.playlistCollectionId,
      });
    }
    return rooms;
  }

  /**
   * Add client to room
   */
  joinRoom(clientId, roomId) {
    // Leave current room first if in one
    this.leaveRoom(clientId);

    const room = this.getRoom(roomId);
    room.clients.add(clientId);
    this.clientRooms.set(clientId, roomId);

    logger.info({ clientId, roomId, clientCount: room.clients.size }, 'Client joined room');
    
    return room;
  }

  /**
   * Remove client from current room
   */
  leaveRoom(clientId) {
    const currentRoomId = this.clientRooms.get(clientId);
    if (!currentRoomId) {
      return null;
    }

    const room = this.rooms.get(currentRoomId);
    if (room) {
      room.clients.delete(clientId);
      logger.info({ clientId, roomId: currentRoomId, clientCount: room.clients.size }, 'Client left room');
    }

    this.clientRooms.delete(clientId);
    return currentRoomId;
  }

  /**
   * Get client's current room
   */
  getClientRoom(clientId) {
    const roomId = this.clientRooms.get(clientId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  /**
   * Get client's current room ID
   */
  getClientRoomId(clientId) {
    return this.clientRooms.get(clientId) || null;
  }

  /**
   * Get all clients in a room
   */
  getRoomClients(roomId) {
    const room = this.getRoom(roomId);
    return Array.from(room.clients);
  }

  /**
   * Get room count for a specific room
   */
  getRoomClientCount(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.clients.size : 0;
  }

  /**
   * Get stats for all rooms
   */
  getRoomStats() {
    const stats = {};
    for (const [roomId, room] of this.rooms) {
      stats[roomId] = {
        number: room.number,
        clientCount: room.clients.size,
        hasTrack: room.sessionState.hasTrack(),
        isPlaying: room.sessionState.isPlaying(),
        currentTrackTitle: room.sessionState.currentTrack?.title || null,
      };
    }
    return stats;
  }

  /**
   * Get default room (room-1)
   */
  getDefaultRoom() {
    return this.getRoom('room-1');
  }

  /**
   * Check if room exists
   */
  roomExists(roomId) {
    return this.rooms.has(roomId);
  }

  /**
   * Set position check interval for a room
   */
  setRoomInterval(roomId, intervalId) {
    const room = this.getRoom(roomId);
    room.positionCheckInterval = intervalId;
  }

  /**
   * Clear position check interval for a room
   */
  clearRoomInterval(roomId) {
    const room = this.rooms.get(roomId);
    if (room && room.positionCheckInterval) {
      clearInterval(room.positionCheckInterval);
      room.positionCheckInterval = null;
    }
  }

  /**
   * Cleanup all room intervals
   */
  cleanup() {
    for (const [roomId, room] of this.rooms) {
      if (room.positionCheckInterval) {
        clearInterval(room.positionCheckInterval);
        room.positionCheckInterval = null;
      }
    }
    logger.info('All room intervals cleared');
  }
}

// Singleton instance
const roomStateManager = new RoomStateManager();

export default roomStateManager;
