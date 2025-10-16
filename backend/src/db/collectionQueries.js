/**
 * Unified Collection Queries
 * Handles all operations for track collections (library, playlists, folders)
 */

import logger from '../utils/logger.js';

/**
 * Get a collection by ID with its tracks
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @returns {Object|null} Collection with tracks array
 */
function getCollection(db, collectionId) {
  try {
    // Get collection metadata
    const collection = db.prepare(`
      SELECT * FROM track_collections WHERE id = ?
    `).get(collectionId);

    if (!collection) {
      return null;
    }

    // Get tracks in this collection
    let tracks;
    if (collection.type === 'library') {
      // Library shows all tracks, ordered by title
      tracks = db.prepare(`
        SELECT 
          t.*,
          ct.position,
          ct.added_at
        FROM tracks t
        LEFT JOIN collection_tracks ct ON t.id = ct.track_id AND ct.collection_id = ?
        ORDER BY t.title ASC, t.artist ASC
      `).all(collectionId);
    } else {
      // Other collections show only their tracks, ordered by position
      tracks = db.prepare(`
        SELECT 
          t.*,
          ct.position,
          ct.added_at
        FROM collection_tracks ct
        JOIN tracks t ON ct.track_id = t.id
        WHERE ct.collection_id = ?
        ORDER BY ct.position ASC
      `).all(collectionId);
    }

    return {
      ...collection,
      tracks: tracks || []
    };
  } catch (error) {
    logger.error('Error getting collection:', error);
    throw error;
  }
}

/**
 * Get all collections of a specific type
 * @param {Object} db - Database instance
 * @param {string} type - Collection type ('library', 'playlist', 'folder')
 * @param {string} parentId - Optional parent ID for hierarchical collections
 * @returns {Array} Array of collections
 */
function getCollections(db, type = null, parentId = null) {
  try {
    let query = 'SELECT * FROM track_collections WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (parentId !== null) {
      if (parentId === '') {
        query += ' AND parent_id IS NULL';
      } else {
        query += ' AND parent_id = ?';
        params.push(parentId);
      }
    }

    query += ' ORDER BY sort_order ASC, name ASC';

    return db.prepare(query).all(...params);
  } catch (error) {
    logger.error('Error getting collections:', error);
    throw error;
  }
}

/**
 * Create a new collection
 * @param {Object} db - Database instance
 * @param {Object} data - Collection data
 * @returns {Object} Created collection
 */
function createCollection(db, data) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const id = data.id || `${data.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare(`
      INSERT INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.type,
      data.parent_id || null,
      data.sort_order || 0,
      data.is_ordered !== undefined ? data.is_ordered : 1,
      now,
      now
    );

    return getCollection(db, id);
  } catch (error) {
    logger.error('Error creating collection:', error);
    throw error;
  }
}

/**
 * Update a collection
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated collection
 */
function updateCollection(db, collectionId, updates) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.parent_id !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parent_id);
    }
    if (updates.sort_order !== undefined) {
      fields.push('sort_order = ?');
      values.push(updates.sort_order);
    }
    if (updates.is_ordered !== undefined) {
      fields.push('is_ordered = ?');
      values.push(updates.is_ordered);
    }

    fields.push('updated_at = ?');
    values.push(now);

    values.push(collectionId);

    const stmt = db.prepare(`
      UPDATE track_collections 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return getCollection(db, collectionId);
  } catch (error) {
    logger.error('Error updating collection:', error);
    throw error;
  }
}

/**
 * Delete a collection
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 */
function deleteCollection(db, collectionId) {
  try {
    // Protected collections cannot be deleted
    if (collectionId === 'library' || collectionId === 'current-playlist') {
      throw new Error('Cannot delete protected collection');
    }

    const stmt = db.prepare('DELETE FROM track_collections WHERE id = ?');
    stmt.run(collectionId);
  } catch (error) {
    logger.error('Error deleting collection:', error);
    throw error;
  }
}

/**
 * Add a track to a collection at a specific position
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @param {string} trackId - Track ID
 * @param {number} position - Position to insert at (null = end)
 * @returns {Object} Updated collection
 */
function addTrack(db, collectionId, trackId, position = null) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Check if track already exists in collection
    const existing = db.prepare(`
      SELECT position FROM collection_tracks 
      WHERE collection_id = ? AND track_id = ?
    `).get(collectionId, trackId);

    if (existing) {
      // Track already in collection, just reorder if position specified
      if (position !== null && position !== existing.position) {
        return reorderTrack(db, collectionId, trackId, position);
      }
      return getCollection(db, collectionId);
    }

    // Get max position if position not specified
    if (position === null) {
      const maxPos = db.prepare(`
        SELECT COALESCE(MAX(position), -1) as max_pos 
        FROM collection_tracks 
        WHERE collection_id = ?
      `).get(collectionId);
      position = maxPos.max_pos + 1;
    } else {
      // Shift existing tracks down
      db.prepare(`
        UPDATE collection_tracks 
        SET position = position + 1 
        WHERE collection_id = ? AND position >= ?
      `).run(collectionId, position);
    }

    // Insert track
    db.prepare(`
      INSERT INTO collection_tracks (collection_id, track_id, position, added_at)
      VALUES (?, ?, ?, ?)
    `).run(collectionId, trackId, position, now);

    // Update collection timestamp
    db.prepare(`
      UPDATE track_collections 
      SET updated_at = ? 
      WHERE id = ?
    `).run(now, collectionId);

    return getCollection(db, collectionId);
  } catch (error) {
    logger.error('Error adding track to collection:', error);
    throw error;
  }
}

/**
 * Remove a track from a collection
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @param {string} trackId - Track ID
 * @returns {Object} Updated collection
 */
function removeTrack(db, collectionId, trackId) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Get position of track to remove
    const track = db.prepare(`
      SELECT position FROM collection_tracks 
      WHERE collection_id = ? AND track_id = ?
    `).get(collectionId, trackId);

    if (!track) {
      return getCollection(db, collectionId);
    }

    // Delete track
    db.prepare(`
      DELETE FROM collection_tracks 
      WHERE collection_id = ? AND track_id = ?
    `).run(collectionId, trackId);

    // Shift remaining tracks up
    db.prepare(`
      UPDATE collection_tracks 
      SET position = position - 1 
      WHERE collection_id = ? AND position > ?
    `).run(collectionId, track.position);

    // Update collection timestamp
    db.prepare(`
      UPDATE track_collections 
      SET updated_at = ? 
      WHERE id = ?
    `).run(now, collectionId);

    return getCollection(db, collectionId);
  } catch (error) {
    logger.error('Error removing track from collection:', error);
    throw error;
  }
}

/**
 * Reorder a track within a collection
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @param {string} trackId - Track ID
 * @param {number} newPosition - New position
 * @returns {Object} Updated collection
 */
function reorderTrack(db, collectionId, trackId, newPosition) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Get current position
    const track = db.prepare(`
      SELECT position FROM collection_tracks 
      WHERE collection_id = ? AND track_id = ?
    `).get(collectionId, trackId);

    if (!track) {
      throw new Error('Track not found in collection');
    }

    const oldPosition = track.position;
    if (oldPosition === newPosition) {
      return getCollection(db, collectionId);
    }

    // Use a transaction for atomic reordering
    const reorder = db.transaction(() => {
      if (newPosition > oldPosition) {
        // Moving down: shift tracks up between old and new position
        db.prepare(`
          UPDATE collection_tracks 
          SET position = position - 1 
          WHERE collection_id = ? AND position > ? AND position <= ?
        `).run(collectionId, oldPosition, newPosition);
      } else {
        // Moving up: shift tracks down between new and old position
        db.prepare(`
          UPDATE collection_tracks 
          SET position = position + 1 
          WHERE collection_id = ? AND position >= ? AND position < ?
        `).run(collectionId, newPosition, oldPosition);
      }

      // Update the track's position
      db.prepare(`
        UPDATE collection_tracks 
        SET position = ? 
        WHERE collection_id = ? AND track_id = ?
      `).run(newPosition, collectionId, trackId);

      // Update collection timestamp
      db.prepare(`
        UPDATE track_collections 
        SET updated_at = ? 
        WHERE id = ?
      `).run(now, collectionId);
    });

    reorder();

    return getCollection(db, collectionId);
  } catch (error) {
    logger.error('Error reordering track in collection:', error);
    throw error;
  }
}

/**
 * Clear all tracks from a collection
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @returns {Object} Updated collection
 */
function clearTracks(db, collectionId) {
  try {
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      DELETE FROM collection_tracks 
      WHERE collection_id = ?
    `).run(collectionId);

    // Update collection timestamp
    db.prepare(`
      UPDATE track_collections 
      SET updated_at = ? 
      WHERE id = ?
    `).run(now, collectionId);

    return getCollection(db, collectionId);
  } catch (error) {
    logger.error('Error clearing collection tracks:', error);
    throw error;
  }
}

/**
 * Get tracks in a collection with pagination
 * @param {Object} db - Database instance
 * @param {string} collectionId - Collection ID
 * @param {number} limit - Number of tracks per page
 * @param {number} offset - Offset for pagination
 * @returns {Object} Tracks and total count
 */
function getCollectionTracks(db, collectionId, limit = 50, offset = 0) {
  try {
    const collection = db.prepare(`
      SELECT * FROM track_collections WHERE id = ?
    `).get(collectionId);

    if (!collection) {
      return { tracks: [], total: 0 };
    }

    let tracks;
    let total;

    if (collection.type === 'library') {
      // Library shows all tracks
      total = db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;
      
      tracks = db.prepare(`
        SELECT 
          t.*,
          ct.position,
          ct.added_at
        FROM tracks t
        LEFT JOIN collection_tracks ct ON t.id = ct.track_id AND ct.collection_id = ?
        ORDER BY t.title ASC, t.artist ASC
        LIMIT ? OFFSET ?
      `).all(collectionId, limit, offset);
    } else {
      // Other collections
      total = db.prepare(`
        SELECT COUNT(*) as count 
        FROM collection_tracks 
        WHERE collection_id = ?
      `).get(collectionId).count;

      tracks = db.prepare(`
        SELECT 
          t.*,
          ct.position,
          ct.added_at
        FROM collection_tracks ct
        JOIN tracks t ON ct.track_id = t.id
        WHERE ct.collection_id = ?
        ORDER BY ct.position ASC
        LIMIT ? OFFSET ?
      `).all(collectionId, limit, offset);
    }

    return { tracks, total };
  } catch (error) {
    logger.error('Error getting collection tracks:', error);
    throw error;
  }
}

export {
  getCollection,
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  addTrack,
  removeTrack,
  reorderTrack,
  clearTracks,
  getCollectionTracks
};
