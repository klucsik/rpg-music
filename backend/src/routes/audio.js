import express from 'express';
import { createReadStream, statSync } from 'fs';
import { join } from 'path';
import { trackQueries } from '../db/database.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Get MIME type from file format
 */
function getMimeType(format) {
  const mimeTypes = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    opus: 'audio/opus',
  };
  return mimeTypes[format?.toLowerCase()] || 'audio/mpeg';
}

/**
 * Stream audio file with Range request support
 * GET /audio/:trackId
 */
router.get('/:trackId', (req, res) => {
  try {
    const trackId = req.params.trackId;
    
    // Get track from database
    const track = trackQueries.getById(trackId);
    
    if (!track) {
      logger.warn({ trackId }, 'Track not found');
      return res.status(404).json({
        error: 'Track not found',
        id: trackId,
      });
    }
    
    // Build full file path
    const filePath = join(config.musicDir, track.filepath);
    
    // Check if file exists and get stats
    let fileStats;
    try {
      fileStats = statSync(filePath);
    } catch (error) {
      logger.error({ trackId, filePath, error: error.message }, 'Audio file not found');
      return res.status(404).json({
        error: 'Audio file not found on disk',
        id: trackId,
        filepath: track.filepath,
      });
    }
    
    const fileSize = fileStats.size;
    const range = req.headers.range;
    
    // Set common headers
    const mimeType = getMimeType(track.format);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    
    if (range) {
      // Handle Range request (partial content)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }
      
      const chunkSize = (end - start) + 1;
      
      // Set partial content headers
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      
      // Stream the requested chunk
      const stream = createReadStream(filePath, { start, end });
      
      stream.on('error', (error) => {
        logger.error({ trackId, error: error.message }, 'Error streaming audio chunk');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      
      stream.pipe(res);
      
      logger.debug({ 
        trackId, 
        range: `${start}-${end}/${fileSize}`,
        title: track.title 
      }, 'Streaming audio chunk');
      
    } else {
      // No range request - stream entire file
      res.setHeader('Content-Length', fileSize);
      
      const stream = createReadStream(filePath);
      
      stream.on('error', (error) => {
        logger.error({ trackId, error: error.message }, 'Error streaming audio file');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      
      stream.pipe(res);
      
      logger.debug({ 
        trackId, 
        fileSize,
        title: track.title 
      }, 'Streaming full audio file');
    }
    
  } catch (error) {
    logger.error({ error, trackId: req.params.trackId }, 'Failed to stream audio');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream audio',
        message: error.message,
      });
    }
  }
});

export default router;
