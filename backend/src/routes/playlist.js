import express from 'express';
import { playlistQueries } from '../db/database.js';
import logger from '../utils/logger.js';

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
    const io = req.app.get('io');
    if (io) {
      io.emit('playlist_update', { playlist, loopAll });
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
    const io = req.app.get('io');
    if (io) {
      io.emit('playlist_update', { playlist, loopAll });
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
    const io = req.app.get('io');
    if (io) {
      io.emit('playlist_update', { playlist: [], loopAll: playlistQueries.getLoopAll() });
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
    const io = req.app.get('io');
    if (io) {
      io.emit('playlist_settings_update', { loopAll: enabled });
    }
    
    res.json({ loopAll: enabled });
  } catch (error) {
    logger.error({ error }, 'Failed to update loop setting');
    res.status(500).json({ error: 'Failed to update loop setting' });
  }
});

export default router;
