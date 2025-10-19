/**
 * Session state management
 * Tracks the current playback state across all clients
 * Simplified: Server only tracks state, clients handle timing and report when tracks end
 */

class SessionState {
  constructor() {
    this.currentTrack = null;
    this.playbackState = 'stopped'; // 'playing', 'paused', 'stopped'
    this.position = 0; // Current position in seconds
    this.lastUpdateTime = null; // Server timestamp of last state change
    this.volume = 0.7; // 0.0 to 1.0
    this.repeatMode = false; // Whether to repeat the current track
  }

  /**
   * Start playing a track
   */
  playTrack(track, startPosition = 0) {
    this.currentTrack = track;
    this.playbackState = 'playing';
    this.position = startPosition;
    this.lastUpdateTime = Date.now();
    
    return this.getState();
  }

  /**
   * Pause playback
   */
  pause() {
    if (this.playbackState === 'playing') {
      // Update position to current time
      if (this.lastUpdateTime) {
        const elapsed = (Date.now() - this.lastUpdateTime) / 1000;
        this.position += elapsed;
      }
      // Cap position at duration if exceeded
      if (this.currentTrack && this.position > this.currentTrack.duration) {
        this.position = this.currentTrack.duration;
      }
    }
    
    this.playbackState = 'paused';
    this.lastUpdateTime = Date.now();
    
    return this.getState();
  }

  /**
   * Resume playback
   */
  resume() {
    if (this.playbackState === 'paused' && this.currentTrack) {
      this.playbackState = 'playing';
      this.lastUpdateTime = Date.now();
    }
    
    return this.getState();
  }

  /**
   * Stop playback
   */
  stop() {
    this.playbackState = 'stopped';
    this.position = 0;
    this.lastUpdateTime = Date.now();
    this.currentTrack = null; // Clear track to prevent auto-restart
    
    return this.getState();
  }

  /**
   * Seek to a specific position
   */
  seek(position) {
    this.position = position;
    this.lastUpdateTime = Date.now();
    
    return this.getState();
  }

  /**
   * Set volume
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    return this.getState();
  }

  /**
   * Toggle repeat mode
   */
  toggleRepeat() {
    this.repeatMode = !this.repeatMode;
    return this.getState();
  }

  /**
   * Set repeat mode
   */
  setRepeat(enabled) {
    this.repeatMode = !!enabled;
    return this.getState();
  }

  /**
   * Get current expected position (for sync checks)
   */
  getCurrentPosition() {
    if (this.playbackState === 'playing' && this.lastUpdateTime) {
      const elapsed = (Date.now() - this.lastUpdateTime) / 1000;
      return this.position + elapsed;
    }
    return this.position;
  }

  /**
   * Get complete state object
   */
  getState() {
    return {
      currentTrack: this.currentTrack,
      playbackState: this.playbackState,
      position: this.getCurrentPosition(),
      lastUpdateTime: this.lastUpdateTime,
      volume: this.volume,
      repeatMode: this.repeatMode,
      serverTime: Date.now(),
    };
  }

  /**
   * Check if a track is currently loaded
   */
  hasTrack() {
    return this.currentTrack !== null;
  }

  /**
   * Check if currently playing
   */
  isPlaying() {
    return this.playbackState === 'playing';
  }
}

// Singleton instance
const sessionState = new SessionState();

export default sessionState;
