import express from 'express';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { trackQueries, trackFolderQueries } from '../db/database.js';
import { getIO } from '../websocket/socketServer.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Get all tracks with pagination and search
 * GET /api/tracks?page=1&limit=50&search=mysong&folder_id=uuid&order_by=title&order_dir=asc
 */
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500); // Max 500
    const offset = (page - 1) * limit;
    const search = req.query.search;
    const folderId = req.query.folder_id;
    const orderBy = req.query.order_by || 'title';
    const orderDir = req.query.order_dir || 'asc';
    
    let tracks;
    let total;
    
    if (folderId) {
      // Get tracks in specific folder
      tracks = trackQueries.getByFolder(folderId, limit, offset);
      total = trackQueries.count(); // TODO: Add count by folder
    } else if (search) {
      // Search tracks
      tracks = trackQueries.search(search, limit);
      total = tracks.length;
    } else {
      // Get all tracks with ordering
      tracks = trackQueries.getAll(limit, offset, orderBy, orderDir);
      total = trackQueries.count();
    }
    
    res.json({
      tracks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get tracks');
    res.status(500).json({
      error: 'Failed to retrieve tracks',
      message: error.message,
    });
  }
});

/**
 * Get track by ID
 * GET /api/tracks/:id
 */
router.get('/:id', (req, res) => {
  try {
    const track = trackQueries.getById(req.params.id);
    
    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        id: req.params.id,
      });
    }
    
    // Get folders this track belongs to
    const folders = trackFolderQueries.getFoldersForTrack(track.id);
    
    res.json({
      ...track,
      folders,
    });
  } catch (error) {
    logger.error({ error, trackId: req.params.id }, 'Failed to get track');
    res.status(500).json({
      error: 'Failed to retrieve track',
      message: error.message,
    });
  }
});

/**
 * Get track metadata
 * GET /api/tracks/:id/metadata
 */
router.get('/:id/metadata', (req, res) => {
  try {
    const track = trackQueries.getById(req.params.id);
    
    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        id: req.params.id,
      });
    }
    
    res.json({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      format: track.format,
      bitrate: track.bitrate,
      sample_rate: track.sample_rate,
      file_size: track.file_size,
    });
  } catch (error) {
    logger.error({ error, trackId: req.params.id }, 'Failed to get track metadata');
    res.status(500).json({
      error: 'Failed to retrieve track metadata',
      message: error.message,
    });
  }
});

/**
 * Update track metadata
 * PUT /api/tracks/:id
 */
router.put('/:id', (req, res) => {
  try {
    const trackId = req.params.id;
    
    // Check if track exists
    const existingTrack = trackQueries.getById(trackId);
    if (!existingTrack) {
      return res.status(404).json({
        error: 'Track not found',
        id: trackId,
      });
    }
    
    // Validate and sanitize input
    const allowedFields = ['title', 'artist', 'album'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Validate that it's a string
        if (typeof req.body[field] !== 'string') {
          return res.status(400).json({
            error: 'Invalid field type',
            field,
            expected: 'string',
          });
        }
        
        // Trim whitespace and limit length
        const value = req.body[field].trim().substring(0, 500);
        updates[field] = value;
      }
    }
    
    // Check if there are any valid updates
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        allowedFields,
      });
    }
    
    // Perform update
    const result = trackQueries.update(trackId, updates);
    
    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Track not found or no changes made',
        id: trackId,
      });
    }
    
    // Get updated track
    const updatedTrack = trackQueries.getById(trackId);
    
    logger.info({ trackId, updates }, 'Track metadata updated');
    
    // Broadcast track update to all clients
    try {
      const io = getIO();
      if (io) {
        io.emit('track_updated', { 
          trackId, 
          updates: updatedTrack 
        });
        logger.info({ event: 'track_updated', trackId }, '📢 Broadcasting track update to all clients');
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to emit track update');
    }
    
    res.json({
      message: 'Track updated successfully',
      track: updatedTrack,
    });
  } catch (error) {
    logger.error({ error, trackId: req.params.id }, 'Failed to update track');
    res.status(500).json({
      error: 'Failed to update track',
      message: error.message,
    });
  }
});

/**
 * Delete track
 * DELETE /api/tracks/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    
    // Check if track exists
    const track = trackQueries.getById(trackId);
    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        id: trackId,
      });
    }
    
    const filepath = track.filepath;
    
    // Remove track from all collections
    trackFolderQueries.removeTrackFromAll(trackId);
    
    // Delete the track from database
    const result = trackQueries.delete(trackId);
    
    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Track not found',
        id: trackId,
      });
    }
    
    logger.info({ trackId, filepath }, 'Track deleted from database');
    
    // Try to delete the physical file
    let fileDeleted = false;
    try {
      // If filepath is relative, prepend music directory
      const absolutePath = filepath.startsWith('/') 
        ? filepath 
        : join(config.musicDir, filepath);
      
      await unlink(absolutePath);
      fileDeleted = true;
      logger.info({ filepath: absolutePath }, 'Physical file deleted successfully');
    } catch (fileError) {
      logger.warn({ error: fileError, filepath }, 'Failed to delete physical file (file may not exist or permission denied)');
    }
    
    // Broadcast track deletion to all clients
    try {
      const io = getIO();
      if (io) {
        io.emit('track_deleted', { trackId });
        logger.info({ event: 'track_deleted', trackId }, '📢 Broadcasting track deletion to all clients');
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to emit track deletion');
    }
    
    res.json({
      message: 'Track deleted successfully',
      id: trackId,
      fileDeleted,
      note: fileDeleted 
        ? 'Both database entry and physical file were deleted.' 
        : 'Database entry deleted, but physical file could not be deleted.',
    });
  } catch (error) {
    logger.error({ error, trackId: req.params.id }, 'Failed to delete track');
    res.status(500).json({
      error: 'Failed to delete track',
      message: error.message,
    });
  }
});

export default router;
