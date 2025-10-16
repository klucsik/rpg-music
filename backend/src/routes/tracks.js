import express from 'express';
import { trackQueries, trackFolderQueries } from '../db/database.js';
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

export default router;
