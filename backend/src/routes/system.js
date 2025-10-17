import express from 'express';
import { trackQueries, folderQueries } from '../db/database.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { getClientCount, getConnectedClients } from '../websocket/socketServer.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  try {
    // Test database connection
    const trackCount = trackQueries.count();
    
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      version: '1.0.0',
      environment: config.env,
      database: 'connected',
      stats: {
        tracks: trackCount,
      }
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error.message,
    });
  }
});

/**
 * Get system configuration (non-sensitive)
 */
router.get('/config', (req, res) => {
  res.json({
    maxDriftSeconds: config.maxDriftSeconds,
    positionCheckInterval: config.positionCheckInterval,
    defaultBitrate: config.defaultBitrate,
    addMusicUrl: config.addMusicUrl,
    addMusicText: config.addMusicText,
  });
});

/**
 * Get system statistics
 */
router.get('/stats', (req, res) => {
  try {
    const trackCount = trackQueries.count();
    const folders = folderQueries.getAll();
    
    let clientCount = 0;
    try {
      clientCount = getClientCount();
    } catch (e) {
      // WebSocket not initialized yet
    }
    
    res.json({
      tracks: {
        total: trackCount,
      },
      folders: {
        total: folders.length,
      },
      clients: {
        connected: clientCount,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get stats');
    res.status(500).json({
      error: 'Failed to get system statistics',
      message: error.message,
    });
  }
});

/**
 * Get connected clients info
 */
router.get('/clients', (req, res) => {
  try {
    const clients = getConnectedClients();
    res.json({
      count: clients.length,
      clients,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get clients');
    res.status(500).json({
      error: 'Failed to get connected clients',
      message: error.message,
    });
  }
});

export default router;
