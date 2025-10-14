import { trackQueries } from '../db/database.js';
import logger from '../utils/logger.js';
import sessionState from './sessionState.js';
import config from '../config/config.js';

/**
 * Sync Controller - Handles playback synchronization commands
 */
class SyncController {
  constructor(io) {
    this.io = io;
    this.positionCheckInterval = null;
    this.currentTrackEndedHandled = false; // Flag to prevent multiple track-end handling
  }

  /**
   * Initialize sync controller
   */
  init() {
    logger.info('Sync controller initialized');
    
    // Start periodic position checks if playing
    this.startPositionChecks();
  }

  /**
   * Play a track
   */
  async playTrack(trackId, startPosition = 0) {
    try {
      // Reset track ended flag for new track
      this.currentTrackEndedHandled = false;
      
      // Get track from database
      const track = trackQueries.getById(trackId);
      
      if (!track) {
        logger.warn({ trackId }, 'Track not found for playback');
        throw new Error('Track not found');
      }

      // Update session state
      sessionState.playTrack(track, startPosition);

      // Calculate scheduled start time (1 seconds from now for buffer)
      const scheduledStartTime = Date.now() + 1000;

      // Broadcast to all clients
      const payload = {
        event: 'play_track',
        data: {
          trackId: track.id,
          streamUrl: `/audio/${track.id}`,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          startPosition,
          scheduledStartTime,
          serverTimestamp: Date.now(),
        },
      };

      this.io.emit('play_track', payload.data);

      logger.info({ 
        trackId, 
        title: track.title,
        scheduledStartTime 
      }, 'Playing track');

      return { success: true, state: sessionState.getState() };
    } catch (error) {
      logger.error({ error, trackId }, 'Failed to play track');
      throw error;
    }
  }

  /**
   * Pause playback
   */
  pause() {
    sessionState.pause();

    const payload = {
      event: 'pause',
      data: {
        position: sessionState.getCurrentPosition(),
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('pause', payload.data);

    logger.info({ position: payload.data.position }, 'Playback paused');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Resume playback
   */
  resume() {
    if (!sessionState.hasTrack()) {
      throw new Error('No track to resume');
    }

    sessionState.resume();

    // Calculate scheduled start time
    const scheduledStartTime = Date.now() + 1000;

    const payload = {
      event: 'resume',
      data: {
        position: sessionState.getCurrentPosition(),
        scheduledStartTime,
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('resume', payload.data);

    logger.info({ position: payload.data.position }, 'Playback resumed');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Stop playback
   */
  stop() {
    sessionState.stop();

    const payload = {
      event: 'stop',
      data: {
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('stop', payload.data);

    logger.info('Playback stopped');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Seek to position
   */
  seek(position) {
    if (!sessionState.hasTrack()) {
      throw new Error('No track loaded');
    }

    sessionState.seek(position);

    // Calculate scheduled start time if playing
    const scheduledStartTime = sessionState.isPlaying() 
      ? Date.now() + 1000 
      : null;

    const payload = {
      event: 'seek',
      data: {
        position,
        scheduledStartTime,
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('seek', payload.data);

    logger.info({ position }, 'Seeked to position');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Set volume
   */
  setVolume(volume) {
    sessionState.setVolume(volume);

    const payload = {
      event: 'volume_change',
      data: {
        volume: sessionState.volume,
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('volume_change', payload.data);

    logger.info({ volume: sessionState.volume }, 'Volume changed');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Get current state
   */
  getState() {
    return sessionState.getState();
  }

  /**
   * Play next track in playlist
   */
  async playNextTrack() {
    try {
      const { playlistQueries } = await import('../db/database.js');
      const playlist = playlistQueries.getAll();
      const loopAll = playlistQueries.getLoopAll();
      
      if (playlist.length === 0) {
        logger.info('Playlist is empty, cannot play next track');
        return { success: false, reason: 'empty_playlist' };
      }

      const currentTrack = sessionState.currentTrack;
      if (!currentTrack) {
        // No current track, play first one
        return await this.playTrack(playlist[0].id);
      }

      // Find current track in playlist
      const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
      
      if (currentIndex === -1) {
        // Current track not in playlist, play first one
        return await this.playTrack(playlist[0].id);
      }

      // Check if there's a next track
      if (currentIndex < playlist.length - 1) {
        // Play next track
        const nextTrack = playlist[currentIndex + 1];
        return await this.playTrack(nextTrack.id);
      } else if (loopAll) {
        // Loop back to first track
        return await this.playTrack(playlist[0].id);
      } else {
        // End of playlist, stop
        this.stop();
        return { success: false, reason: 'end_of_playlist' };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to play next track');
      throw error;
    }
  }

  /**
   * Start periodic position checks
   */
  startPositionChecks() {
    // Clear existing interval
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
    }

    // Start new interval
    this.positionCheckInterval = setInterval(async () => {
      const { playlistQueries } = await import('../db/database.js');
      const playlist = playlistQueries.getAll();
      
      // Update session position to check if track has ended
      sessionState.updatePosition();
      
      const currentTrack = sessionState.currentTrack;
      const currentPosition = sessionState.getCurrentPosition();
      const isPlaying = sessionState.isPlaying();
      
      // If we have a playlist and nothing is playing, start the next track
      if (!isPlaying && playlist.length > 0) {
        logger.info({ 
          playlistLength: playlist.length,
          currentTrack: currentTrack?.title,
          position: currentPosition?.toFixed(2)
        }, 'Nothing playing, starting next track from playlist');
        
        try {
          await this.playNextTrack();
        } catch (err) {
          logger.error({ error: err }, 'Failed to start next track');
        }
      }
      
      // Send position checks when playing
      if (isPlaying) {

        const payload = {
          event: 'position_check',
          data: {
            expectedPosition: currentPosition,
            maxDrift: config.maxDriftSeconds,
            serverTimestamp: Date.now(),
          },
        };

        this.io.emit('position_check', payload.data);

        logger.debug({ 
          position: currentPosition.toFixed(2)
        }, 'Position check sent');
      }
    }, config.positionCheckInterval);

    logger.info({ 
      interval: config.positionCheckInterval 
    }, 'Position check interval started');
  }

  /**
   * Stop position checks
   */
  stopPositionChecks() {
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
      this.positionCheckInterval = null;
      logger.info('Position check interval stopped');
    }
  }

  /**
   * Handle client position report (for monitoring)
   */
  handlePositionReport(clientId, data) {
    logger.debug({ 
      clientId, 
      position: data.position,
      state: data.state 
    }, 'Client position report');
  }

  /**
   * Handle client error
   */
  handleClientError(clientId, error) {
    logger.error({ clientId, error }, 'Client reported error');
  }

  /**
   * Handle track ended event from client
   */
  async handleTrackEnded(clientId) {
    if (!this.currentTrackEndedHandled) {
      logger.info({ clientId }, 'Track ended event received from client');
      this.currentTrackEndedHandled = true;
      
      // Check if we have a playlist and should auto-advance
      const { playlistQueries } = await import('../db/database.js');
      const playlist = playlistQueries.getAll();
      if (playlist.length > 0) {
        try {
          await this.playNextTrack();
        } catch (error) {
          logger.error({ error, clientId }, 'Failed to play next track after ended event');
        }
      }
    } else {
      logger.debug({ clientId }, 'Track ended event ignored (already handled)');
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopPositionChecks();
  }
}

export default SyncController;
