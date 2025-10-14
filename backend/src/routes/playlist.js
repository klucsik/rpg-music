import express from 'express';
import { playlistQueries } from '../db/database.js';
import logger from '../utils/logger.js';
import { getIO } from '../websocket/socketServer.js';

const router = express.Router();

/**
 * GET /api/playlist
 * Get current playlist and settings
 */
router.get('/', (req, res) => {
  try {
    const playlist = playlistQueries.getAll();
    const loopAll = playlistQueries.getLoopAll();
    res.json({ playlist, loopAll });
  } catch (error) {
    logger.error({ error }, 'Failed to get playlist');
    res.status(500).json({ error: 'Failed to get playlist' });
  }
});

/**
 * PUT /api/playlist
 * Replace entire playlist
 */
router.put('/', (req, res) => {
  try {
    const { trackIds } = req.body;
    
    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    playlistQueries.replace(trackIds);
    
    // Get updated playlist and settings
    const playlist = playlistQueries.getAll();
    const loopAll = playlistQueries.getLoopAll();
    
    // Broadcast to all clients
    try {
      const io = getIO();
      io.emit('playlist_update', playlist);
      logger.info({ 
        playlistLength: playlist.length,
        trackIds: playlist.map(t => t.id),
        event: 'playlist_update'
      }, '📢 Broadcasting playlist update to all clients');
    } catch (error) {
      logger.warn({ error: error.message }, '⚠️ Could not broadcast playlist update');
    }
    
    res.json({ playlist, loopAll });
  } catch (error) {
    logger.error({ error }, 'Failed to update playlist');
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

/**
 * POST /api/playlist/reorder
 * Reorder playlist
 */
router.post('/reorder', (req, res) => {
  try {
    const { trackIds } = req.body;
    
    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    playlistQueries.reorder(trackIds);
    
    // Get updated playlist and settings
    const playlist = playlistQueries.getAll();
    const loopAll = playlistQueries.getLoopAll();
    
    // Broadcast to all clients
    try {
      const io = getIO();
      io.emit('playlist_update', playlist);
      logger.info({ 
        playlistLength: playlist.length,
        event: 'playlist_update'
      }, '📢 Broadcasting playlist reorder to all clients');
    } catch (error) {
      logger.warn({ error: error.message }, '⚠️ Could not broadcast playlist reorder');
    }
    
    res.json({ playlist, loopAll });
  } catch (error) {
    logger.error({ error }, 'Failed to reorder playlist');
    res.status(500).json({ error: 'Failed to reorder playlist' });
  }
});

/**
 * DELETE /api/playlist
 * Clear playlist
 */
router.delete('/', (req, res) => {
  try {
    playlistQueries.clear();
    
    // Broadcast to all clients
    try {
      const io = getIO();
      io.emit('playlist_update', []);
      logger.info({ event: 'playlist_update' }, '📢 Broadcasting playlist clear to all clients');
    } catch (error) {
      logger.warn({ error: error.message }, '⚠️ Could not broadcast playlist clear');
    }
    
    res.json({ message: 'Playlist cleared' });
  } catch (error) {
    logger.error({ error }, 'Failed to clear playlist');
    res.status(500).json({ error: 'Failed to clear playlist' });
  }
});

/**
 * POST /api/playlist/loop
 * Toggle loop-all setting
 */
router.post('/loop', (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    playlistQueries.setLoopAll(enabled);
    
    // Broadcast to all clients
    try {
      const io = getIO();
      io.emit('playlist_settings_update', { loopAll: enabled });
      logger.info({ 
        loopAll: enabled,
        event: 'playlist_settings_update'
      }, '📢 Broadcasting loop setting to all clients');
    } catch (error) {
      logger.warn({ error: error.message }, '⚠️ Could not broadcast loop setting');
    }
    
    res.json({ loopAll: enabled });
  } catch (error) {
    logger.error({ error }, 'Failed to update loop setting');
    res.status(500).json({ error: 'Failed to update loop setting' });
  }
});

export default router;
