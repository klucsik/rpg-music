import express from 'express';
import { getSyncController } from '../websocket/socketServer.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Play a track
 * POST /api/playback/play
 * Body: { trackId: string, startPosition?: number }
 */
router.post('/play', async (req, res) => {
  try {
    const { trackId, startPosition = 0 } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: 'Missing required field: trackId',
      });
    }

    const syncController = getSyncController();
    const result = await syncController.playTrack(trackId, startPosition);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to play track');
    res.status(500).json({
      error: 'Failed to play track',
      message: error.message,
    });
  }
});

/**
 * Pause playback
 * POST /api/playback/pause
 */
router.post('/pause', (req, res) => {
  try {
    const syncController = getSyncController();
    const result = syncController.pause();

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to pause playback');
    res.status(500).json({
      error: 'Failed to pause playback',
      message: error.message,
    });
  }
});

/**
 * Resume playback
 * POST /api/playback/resume
 */
router.post('/resume', (req, res) => {
  try {
    const syncController = getSyncController();
    const result = syncController.resume();

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to resume playback');
    res.status(500).json({
      error: 'Failed to resume playback',
      message: error.message,
    });
  }
});

/**
 * Stop playback
 * POST /api/playback/stop
 */
router.post('/stop', (req, res) => {
  try {
    const syncController = getSyncController();
    const result = syncController.stop();

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to stop playback');
    res.status(500).json({
      error: 'Failed to stop playback',
      message: error.message,
    });
  }
});

/**
 * Seek to position
 * POST /api/playback/seek
 * Body: { position: number }
 */
router.post('/seek', (req, res) => {
  try {
    const { position } = req.body;

    if (typeof position !== 'number') {
      return res.status(400).json({
        error: 'Missing or invalid field: position',
      });
    }

    const syncController = getSyncController();
    const result = syncController.seek(position);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to seek');
    res.status(500).json({
      error: 'Failed to seek',
      message: error.message,
    });
  }
});

/**
 * Set volume
 * POST /api/playback/volume
 * Body: { volume: number } (0.0 to 1.0)
 */
router.post('/volume', (req, res) => {
  try {
    const { volume } = req.body;

    if (typeof volume !== 'number') {
      return res.status(400).json({
        error: 'Missing or invalid field: volume',
      });
    }

    const syncController = getSyncController();
    const result = syncController.setVolume(volume);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to set volume');
    res.status(500).json({
      error: 'Failed to set volume',
      message: error.message,
    });
  }
});

/**
 * Get current playback state
 * GET /api/playback/state
 */
router.get('/state', (req, res) => {
  try {
    const syncController = getSyncController();
    const state = syncController.getState();

    res.json(state);
  } catch (error) {
    logger.error({ error }, 'Failed to get playback state');
    res.status(500).json({
      error: 'Failed to get playback state',
      message: error.message,
    });
  }
});

export default router;
