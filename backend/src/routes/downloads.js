import express from 'express';
import logger from '../utils/logger.js';
import downloadQueue from '../services/downloadQueue.js';
import { searchYouTube, isValidYouTubeUrl, fetchVideoMetadata } from '../services/ytdlpDownloader.js';

const router = express.Router();

/**
 * Search YouTube for videos
 * GET /api/downloads/search?q=search+query&limit=10
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query is required',
      });
    }
    
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        error: 'Limit must be between 1 and 50',
      });
    }
    
    logger.info({ query, limit: limitNum }, 'YouTube search requested');
    
    const results = await searchYouTube(query, limitNum);
    
    res.json({
      query,
      results,
      count: results.length,
    });
    
  } catch (error) {
    logger.error({ error }, 'YouTube search failed');
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
    });
  }
});

/**
 * Add a new download job from direct URL
 * POST /api/downloads
 * Body: { youtubeUrl: string }
 */
router.post('/', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    
    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      return res.status(400).json({
        error: 'YouTube URL is required',
      });
    }
    
    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({
        error: 'Invalid YouTube URL',
      });
    }
    
    logger.info({ youtubeUrl }, 'Download job requested via URL');
    
    const job = await downloadQueue.addJob(youtubeUrl);
    
    res.status(201).json({
      message: 'Download job added to queue',
      job,
    });
    
  } catch (error) {
    logger.error({ error }, 'Failed to add download job');
    
    if (error.message.includes('already')) {
      return res.status(409).json({
        error: error.message,
      });
    }
    
    res.status(500).json({
      error: 'Failed to add download job',
      message: error.message,
    });
  }
});

/**
 * Add a new download job from search result
 * POST /api/downloads/from-search
 * Body: { video_id, title, channel, duration, thumbnail, url }
 */
router.post('/from-search', async (req, res) => {
  try {
    const { video_id, title, channel, duration, thumbnail, url } = req.body;
    
    if (!video_id || !url) {
      return res.status(400).json({
        error: 'video_id and url are required',
      });
    }
    
    logger.info({ video_id, title }, 'Download job requested from search result');
    
    // Prepare metadata from search result
    const metadata = {
      video_id,
      title,
      channel,
      duration,
      thumbnail,
      url,
    };
    
    const job = await downloadQueue.addJob(url, metadata);
    
    res.status(201).json({
      message: 'Download job added to queue',
      job,
    });
    
  } catch (error) {
    logger.error({ error }, 'Failed to add download job from search');
    
    if (error.message.includes('already')) {
      return res.status(409).json({
        error: error.message,
      });
    }
    
    res.status(500).json({
      error: 'Failed to add download job',
      message: error.message,
    });
  }
});

/**
 * Get all download jobs
 * GET /api/downloads?limit=50&offset=0&status=pending
 */
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    
    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      return res.status(400).json({
        error: 'Limit must be between 1 and 200',
      });
    }
    
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Offset must be non-negative',
      });
    }
    
    const validStatuses = ['pending', 'downloading', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }
    
    const jobs = downloadQueue.getAllJobs(limitNum, offsetNum, status || null);
    const queueStatus = downloadQueue.getQueueStatus();
    
    res.json({
      jobs,
      total: jobs.length,
      queueStatus,
    });
    
  } catch (error) {
    logger.error({ error }, 'Failed to get download jobs');
    res.status(500).json({
      error: 'Failed to get download jobs',
      message: error.message,
    });
  }
});

/**
 * Get queue status
 * GET /api/downloads/queue/status
 */
router.get('/queue/status', (req, res) => {
  try {
    const status = downloadQueue.getQueueStatus();
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Failed to get queue status');
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error.message,
    });
  }
});

/**
 * Get specific download job
 * GET /api/downloads/:jobId
 */
router.get('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = downloadQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
      });
    }
    
    res.json(job);
    
  } catch (error) {
    logger.error({ error }, 'Failed to get download job');
    res.status(500).json({
      error: 'Failed to get download job',
      message: error.message,
    });
  }
});

/**
 * Cancel a download job
 * DELETE /api/downloads/:jobId
 */
router.delete('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    downloadQueue.cancelJob(jobId);
    
    res.json({
      message: 'Job cancelled successfully',
      jobId,
    });
    
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to cancel job');
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * Retry a failed download job
 * POST /api/downloads/:jobId/retry
 */
router.post('/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await downloadQueue.retryJob(jobId);
    
    res.json({
      message: 'Job retried successfully',
      job,
    });
    
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to retry job');
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    
    res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * Delete a completed/failed job
 * POST /api/downloads/:jobId/delete
 */
router.post('/:jobId/delete', (req, res) => {
  try {
    const { jobId } = req.params;
    
    downloadQueue.deleteJob(jobId);
    
    res.json({
      message: 'Job deleted successfully',
      jobId,
    });
    
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Failed to delete job');
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message,
      });
    }
    
    res.status(400).json({
      error: error.message,
    });
  }
});

export default router;
