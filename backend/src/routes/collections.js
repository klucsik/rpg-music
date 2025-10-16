/**
 * Unified Collections API Routes
 * Handles all track collections (library, playlists, folders)
 */

import express from 'express';
import { getDb } from '../db/database.js';
import * as collectionQueries from '../db/collectionQueries.js';
import { getIO } from '../websocket/socketServer.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Emit playlist update event if collection is the current playlist
 */
const emitPlaylistUpdate = (collectionId) => {
  if (collectionId === 'current-playlist') {
    try {
      const io = getIO();
      if (io) {
        io.emit('playlist_update', { collectionId });
        logger.info({ event: 'playlist_update' }, '📢 Broadcasting playlist update to all clients');
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to emit playlist update');
    }
  }
};

export default () => {
  // Get db lazily in each route to avoid initialization order issues

  /**
   * GET /api/collections
   * Get all collections, optionally filtered by type and parent
   */
  router.get('/', (req, res) => {
    try {
      const db = getDb();
      const { type, parent_id } = req.query;
      const collections = collectionQueries.getCollections(
        db, 
        type || null, 
        parent_id !== undefined ? parent_id : null
      );
      res.json(collections);
    } catch (error) {
      console.error('Error getting collections:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/collections/:id
   * Get a specific collection with all its tracks
   */
  router.get('/:id', (req, res) => {
    try {
      const db = getDb();
      const collection = collectionQueries.getCollection(db, req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      res.json(collection);
    } catch (error) {
      console.error('Error getting collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/collections/:id/tracks
   * Get tracks in a collection with pagination
   */
  router.get('/:id/tracks', (req, res) => {
    try {
      const db = getDb();
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const result = collectionQueries.getCollectionTracks(
        db, 
        req.params.id, 
        limit, 
        offset
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error getting collection tracks:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/collections
   * Create a new collection
   */
  router.post('/', (req, res) => {
    try {
      const db = getDb();
      const { name, type, parent_id, sort_order, is_ordered } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
      }

      if (!['library', 'playlist', 'folder'].includes(type)) {
        return res.status(400).json({ error: 'Invalid collection type' });
      }

      const collection = collectionQueries.createCollection(db, {
        name,
        type,
        parent_id,
        sort_order,
        is_ordered
      });

      res.status(201).json(collection);
    } catch (error) {
      console.error('Error creating collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/collections/:id
   * Update a collection
   */
  router.put('/:id', (req, res) => {
    try {
      const db = getDb();
      const { name, parent_id, sort_order, is_ordered } = req.body;
      
      const collection = collectionQueries.updateCollection(db, req.params.id, {
        name,
        parent_id,
        sort_order,
        is_ordered
      });

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      res.json(collection);
    } catch (error) {
      console.error('Error updating collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/collections/:id
   * Delete a collection
   */
  router.delete('/:id', (req, res) => {
    try {
      const db = getDb();
      collectionQueries.deleteCollection(db, req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting collection:', error);
      if (error.message.includes('Cannot delete protected')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  /**
   * POST /api/collections/:id/tracks
   * Add a track to a collection
   */
  router.post('/:id/tracks', (req, res) => {
    try {
      const db = getDb();
      const { track_id, position } = req.body;

      if (!track_id) {
        return res.status(400).json({ error: 'track_id is required' });
      }

      const collection = collectionQueries.addTrack(
        db, 
        req.params.id, 
        track_id, 
        position !== undefined ? position : null
      );

      // Emit WebSocket event if this is the current playlist
      emitPlaylistUpdate(req.params.id);

      res.json(collection);
    } catch (error) {
      console.error('Error adding track to collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/collections/:id/tracks/:trackId
   * Remove a track from a collection
   * Optional query param: position (to remove specific instance when duplicates exist)
   */
  router.delete('/:id/tracks/:trackId', (req, res) => {
    try {
      const db = getDb();
      const position = req.query.position !== undefined ? parseInt(req.query.position, 10) : null;
      
      const collection = collectionQueries.removeTrack(
        db, 
        req.params.id, 
        req.params.trackId,
        position
      );

      // Emit WebSocket event if this is the current playlist
      emitPlaylistUpdate(req.params.id);

      res.json(collection);
    } catch (error) {
      console.error('Error removing track from collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/collections/:id/tracks/:trackId/position
   * Reorder a track within a collection
   */
  router.put('/:id/tracks/:trackId/position', (req, res) => {
    try {
      const db = getDb();
      const { position } = req.body;

      if (position === undefined || position === null) {
        return res.status(400).json({ error: 'position is required' });
      }

      const collection = collectionQueries.reorderTrack(
        db, 
        req.params.id, 
        req.params.trackId, 
        position
      );

      // Emit WebSocket event if this is the current playlist
      emitPlaylistUpdate(req.params.id);

      res.json(collection);
    } catch (error) {
      console.error('Error reordering track in collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/collections/:id/tracks
   * Clear all tracks from a collection
   */
  router.delete('/:id/tracks', (req, res) => {
    try {
      const db = getDb();
      const collection = collectionQueries.clearTracks(db, req.params.id);
      
      // Emit WebSocket event if this is the current playlist
      emitPlaylistUpdate(req.params.id);
      
      res.json(collection);
    } catch (error) {
      console.error('Error clearing collection tracks:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
