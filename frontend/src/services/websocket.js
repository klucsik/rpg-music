import { io } from 'socket.io-client';

// WebSocket URL
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.serverTimeOffset = 0;
    this.listeners = new Map();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket) {
      return;
    }

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      this.connected = true;
      this.emit('connected', { clientId: this.socket.id });
      
      // Request current state
      this.socket.emit('request_state');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.connected = false;
      this.emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.emit('error', { error: error.message });
    });

    // Sync events from server
    this.socket.on('state_sync', (data) => {
      this.calculateTimeOffset(data.serverTime);
      this.emit('state_sync', data);
    });

    this.socket.on('play_track', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('play_track', data);
    });

    this.socket.on('pause', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('pause', data);
    });

    this.socket.on('resume', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('resume', data);
    });

    this.socket.on('seek', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('seek', data);
    });

    this.socket.on('stop', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('stop', data);
    });

    this.socket.on('volume_change', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('volume_change', data);
    });

    this.socket.on('position_check', (data) => {
      this.calculateTimeOffset(data.serverTimestamp);
      this.emit('position_check', data);
    });

    return this.socket;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Calculate time offset between client and server
   */
  calculateTimeOffset(serverTimestamp) {
    const clientTime = Date.now();
    this.serverTimeOffset = serverTimestamp - clientTime;
  }

  /**
   * Get server time
   */
  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Request current state from server
   */
  requestState() {
    if (this.socket && this.connected) {
      this.socket.emit('request_state');
    }
  }

  /**
   * Report position to server (optional)
   */
  reportPosition(trackId, position, state) {
    if (this.socket && this.connected) {
      this.socket.emit('position_report', {
        clientId: this.socket.id,
        trackId,
        position,
        state,
        clientTimestamp: Date.now(),
      });
    }
  }

  /**
   * Report error to server
   */
  reportError(error, trackId = null) {
    if (this.socket && this.connected) {
      this.socket.emit('client_error', {
        clientId: this.socket.id,
        error,
        trackId,
      });
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.listeners.has(event)) {
      return;
    }
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Emit event to local listeners
   */
  emit(event, data) {
    if (!this.listeners.has(event)) {
      return;
    }
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get client ID
   */
  getClientId() {
    return this.socket?.id || null;
  }
}

// Singleton instance
export const websocket = new WebSocketService();
export default websocket;
