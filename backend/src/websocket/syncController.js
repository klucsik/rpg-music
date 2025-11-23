import { trackQueries } from '../db/database.js';
import logger from '../utils/logger.js';
import sessionState from './sessionState.js';
import config from '../config/config.js';

/**
 * Sync Controller - Handles playback synchronization commands
 * Simplified: Clients report when tracks end, server just syncs position for drift correction
 */
class SyncController {
  constructor(io) {
    this.io = io;
    this.positionCheckInterval = null;
  }

  /**
   * Initialize sync controller
   */
  init() {
    logger.info('Sync controller initialized');
    
    // Start periodic position checks for drift correction only
    this.startPositionChecks();
  }

  /**
   * Play a track
   */
  async playTrack(trackId, startPosition = 0) {
    try {
      logger.info({ trackId, startPosition }, 'Playing track');
      
      // Get track from database
      const track = trackQueries.getById(trackId);
      
      if (!track) {
        logger.warn({ trackId }, 'Track not found for playback');
        throw new Error('Track not found');
      }

      // Update session state
      sessionState.playTrack(track, startPosition);

      // Calculate scheduled start time (1 second from now for buffer)
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
        duration: track.duration
      }, 'Track playing');

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
    const stateBefore = sessionState.playbackState;
    sessionState.pause();
    const stateAfter = sessionState.playbackState;

    const payload = {
      event: 'pause',
      data: {
        position: sessionState.getCurrentPosition(),
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('pause', payload.data);

    logger.info({ 
      position: payload.data.position,
      stateBefore,
      stateAfter
    }, 'Playback paused');

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
   * Toggle repeat mode
   */
  toggleRepeat() {
    sessionState.toggleRepeat();

    const payload = {
      event: 'repeat_mode_change',
      data: {
        repeatMode: sessionState.repeatMode,
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('repeat_mode_change', payload.data);

    logger.info({ repeatMode: sessionState.repeatMode }, 'Repeat mode changed');

    return { success: true, state: sessionState.getState() };
  }

  /**
   * Toggle loop playlist mode
   */
  toggleLoop() {
    sessionState.toggleLoop();

    const payload = {
      event: 'loop_mode_change',
      data: {
        loopPlaylist: sessionState.loopPlaylist,
        serverTimestamp: Date.now(),
      },
    };

    this.io.emit('loop_mode_change', payload.data);

    logger.info({ loopPlaylist: sessionState.loopPlaylist }, 'Loop playlist mode changed');

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
      const { collectionQueries } = await import('../db/database.js');
      
      // Get current playlist (using collection system)
      // Note: getCollectionTracks returns { tracks, total }
      const result = collectionQueries.getCollectionTracks('current-playlist', 1000, 0);
      const playlist = result.tracks || [];
      
      logger.info({ 
        playlistLength: playlist.length, 
        currentTrack: sessionState.currentTrack?.title 
      }, 'Playing next track');
      
      if (playlist.length === 0) {
        logger.info('Playlist is empty, stopping playback');
        this.stop();
        return { success: false, reason: 'empty_playlist' };
      }

      const currentTrack = sessionState.currentTrack;
      if (!currentTrack) {
        // No current track, nothing to advance from
        logger.info('No current track, stopping playback');
        this.stop();
        return { success: false, reason: 'no_current_track' };
      }

      // Find current track in playlist
      const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
      
      if (currentIndex === -1) {
        // Current track not in playlist, can't advance
        logger.info('Current track not in playlist, stopping playback');
        this.stop();
        return { success: false, reason: 'track_not_in_playlist' };
      }

      // Check if there's a next track
      if (currentIndex < playlist.length - 1) {
        // Play next track
        const nextTrack = playlist[currentIndex + 1];
        logger.info({ 
          currentIndex, 
          nextIndex: currentIndex + 1, 
          nextTrackTitle: nextTrack.title 
        }, 'Playing next track in sequence');
        return await this.playTrack(nextTrack.id);
      }
      
      // We're at the end of the playlist
      if (sessionState.loopPlaylist && playlist.length > 0) {
        // Loop back to the first track
        const firstTrack = playlist[0];
        logger.info({ 
          firstTrackTitle: firstTrack.title,
          playlistLength: playlist.length 
        }, 'Looping playlist - playing first track');
        return await this.playTrack(firstTrack.id);
      }
      
      // No loop mode - just stop
      logger.info('End of playlist reached, stopping playback');
      this.stop();
      return { success: false, reason: 'end_of_playlist' };
      
    } catch (error) {
      logger.error({ error }, 'Failed to play next track');
      throw error;
    }
  }

  /**
   * Start periodic position checks
   * Only for drift correction - NOT for detecting track end
   */
  startPositionChecks() {
    // Clear existing interval
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
    }

    // Start new interval - only for drift correction
    this.positionCheckInterval = setInterval(() => {
      const currentPosition = sessionState.getCurrentPosition();
      const isPlaying = sessionState.isPlaying();
      
      // Only send position checks when actively playing
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
   * This is the ONLY place where track advancement happens
   */
  async handleTrackEnded(clientId) {
    logger.info({ 
      clientId, 
      currentTrack: sessionState.currentTrack?.title,
      repeatMode: sessionState.repeatMode
    }, 'Track ended event received from client');
    
    // Check if repeat mode is enabled
    if (sessionState.repeatMode && sessionState.currentTrack) {
      logger.info({ trackId: sessionState.currentTrack.id }, 'Repeat mode: replaying current track');
      try {
        await this.playTrack(sessionState.currentTrack.id, 0);
      } catch (error) {
        logger.error({ error, clientId }, 'Failed to replay track in repeat mode');
      }
      return;
    }
    
    // Not repeating - try to play next track in playlist
    try {
      await this.playNextTrack();
    } catch (error) {
      logger.error({ error, clientId }, 'Failed to play next track after track ended');
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
