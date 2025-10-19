import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import * as collectionQueriesModule from './collectionQueries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Initialize the database connection and create tables
 */
export async function initDatabase() {
  try {
    // Ensure the data directory exists
    const dbDir = dirname(config.databasePath);
    await mkdir(dbDir, { recursive: true });
    
    // Create database connection
    db = new Database(config.databasePath);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    logger.info({ path: config.databasePath }, 'Database connection established');
    
    // Run main schema
    const schema = readFileSync(`${__dirname}/schema.sql`, 'utf-8');
    db.exec(schema);
    
    logger.info('Database schema initialized');
    
    // Run collections schema (new unified system)
    try {
      const collectionsSchema = readFileSync(`${__dirname}/schema-collections.sql`, 'utf-8');
      db.exec(collectionsSchema);
      logger.info('Collections schema initialized');
    } catch (error) {
      // Collections schema is optional for now during transition
      logger.warn({ error }, 'Collections schema not found or failed to initialize');
    }
    
    return db;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Get the database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
}

// Track operations
export const trackQueries = {
  /**
   * Insert a new track
   */
  insert: (track) => {
    const stmt = getDb().prepare(`
      INSERT INTO tracks (id, filepath, filename, title, artist, album, duration, 
                         format, bitrate, sample_rate, file_size, created_at, updated_at)
      VALUES (@id, @filepath, @filename, @title, @artist, @album, @duration,
              @format, @bitrate, @sample_rate, @file_size, @created_at, @updated_at)
    `);
    return stmt.run(track);
  },

  /**
   * Get track by ID
   */
  getById: (id) => {
    const stmt = getDb().prepare('SELECT * FROM tracks WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Get track by filepath
   */
  getByFilepath: (filepath) => {
    const stmt = getDb().prepare('SELECT * FROM tracks WHERE filepath = ?');
    return stmt.get(filepath);
  },

  /**
   * Get all tracks with pagination and ordering
   * @param {number} limit - Maximum number of tracks
   * @param {number} offset - Offset for pagination
   * @param {string} orderBy - Order field: 'title', 'created_at'
   * @param {string} orderDir - Order direction: 'asc', 'desc'
   */
  getAll: (limit = 100, offset = 0, orderBy = 'title', orderDir = 'asc') => {
    // Validate orderBy to prevent SQL injection
    const validOrderBy = ['title', 'artist', 'album', 'created_at', 'updated_at'];
    const validOrderDir = ['asc', 'desc'];
    
    const safeOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'title';
    const safeOrderDir = validOrderDir.includes(orderDir.toLowerCase()) ? orderDir.toLowerCase() : 'asc';
    
    // Use COLLATE NOCASE for text fields
    const collate = ['title', 'artist', 'album'].includes(safeOrderBy) ? ' COLLATE NOCASE' : '';
    
    const stmt = getDb().prepare(`
      SELECT * FROM tracks 
      ORDER BY ${safeOrderBy}${collate} ${safeOrderDir.toUpperCase()}
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  /**
   * Search tracks by title, artist, or album
   */
  search: (query, limit = 100) => {
    const searchPattern = `%${query}%`;
    const stmt = getDb().prepare(`
      SELECT * FROM tracks 
      WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
      ORDER BY title COLLATE NOCASE
      LIMIT ?
    `);
    return stmt.all(searchPattern, searchPattern, searchPattern, limit);
  },

  /**
   * Get tracks in a folder
   */
  getByFolder: (folderId, limit = 100, offset = 0) => {
    const stmt = getDb().prepare(`
      SELECT t.* FROM tracks t
      INNER JOIN track_folders tf ON t.id = tf.track_id
      WHERE tf.folder_id = ?
      ORDER BY t.title COLLATE NOCASE
      LIMIT ? OFFSET ?
    `);
    return stmt.all(folderId, limit, offset);
  },

  /**
   * Count all tracks
   */
  count: () => {
    const stmt = getDb().prepare('SELECT COUNT(*) as count FROM tracks');
    return stmt.get().count;
  },

  /**
   * Delete track by ID
   */
  delete: (id) => {
    const stmt = getDb().prepare('DELETE FROM tracks WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Update track
   */
  update: (id, updates) => {
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = getDb().prepare(`
      UPDATE tracks 
      SET ${fields}, updated_at = @updated_at
      WHERE id = @id
    `);
    return stmt.run({ id, ...updates, updated_at: Date.now() });
  },
};

// Folder operations
export const folderQueries = {
  /**
   * Insert a new folder
   */
  insert: (folder) => {
    const stmt = getDb().prepare(`
      INSERT INTO folders (id, name, parent_id, sort_order, created_at)
      VALUES (@id, @name, @parent_id, @sort_order, @created_at)
    `);
    return stmt.run(folder);
  },

  /**
   * Get folder by ID
   */
  getById: (id) => {
    const stmt = getDb().prepare('SELECT * FROM folders WHERE id = ?');
    return stmt.get(id);
  },

  /**
   * Get all root folders (no parent)
   */
  getRoots: () => {
    const stmt = getDb().prepare(`
      SELECT * FROM folders 
      WHERE parent_id IS NULL 
      ORDER BY sort_order, name COLLATE NOCASE
    `);
    return stmt.all();
  },

  /**
   * Get child folders
   */
  getChildren: (parentId) => {
    const stmt = getDb().prepare(`
      SELECT * FROM folders 
      WHERE parent_id = ? 
      ORDER BY sort_order, name COLLATE NOCASE
    `);
    return stmt.all(parentId);
  },

  /**
   * Get all folders
   */
  getAll: () => {
    const stmt = getDb().prepare(`
      SELECT * FROM folders 
      ORDER BY sort_order, name COLLATE NOCASE
    `);
    return stmt.all();
  },

  /**
   * Update folder
   */
  update: (id, updates) => {
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = getDb().prepare(`
      UPDATE folders 
      SET ${fields}
      WHERE id = @id
    `);
    return stmt.run({ id, ...updates });
  },

  /**
   * Delete folder
   */
  delete: (id) => {
    const stmt = getDb().prepare('DELETE FROM folders WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * Count tracks in folder
   */
  countTracks: (folderId) => {
    const stmt = getDb().prepare(`
      SELECT COUNT(*) as count FROM track_folders 
      WHERE folder_id = ?
    `);
    return stmt.get(folderId).count;
  },
};

// Track-Folder relationship operations
export const trackFolderQueries = {
  /**
   * Add track to folder
   */
  add: (trackId, folderId) => {
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO track_folders (track_id, folder_id, added_at)
      VALUES (?, ?, ?)
    `);
    return stmt.run(trackId, folderId, Date.now());
  },

  /**
   * Remove track from folder
   */
  remove: (trackId, folderId) => {
    const stmt = getDb().prepare(`
      DELETE FROM track_folders 
      WHERE track_id = ? AND folder_id = ?
    `);
    return stmt.run(trackId, folderId);
  },

  /**
   * Get all folders for a track
   */
  getFoldersForTrack: (trackId) => {
    const stmt = getDb().prepare(`
      SELECT f.* FROM folders f
      INNER JOIN track_folders tf ON f.id = tf.folder_id
      WHERE tf.track_id = ?
      ORDER BY f.name COLLATE NOCASE
    `);
    return stmt.all(trackId);
  },

  /**
   * Remove track from all folders
   */
  removeTrackFromAll: (trackId) => {
    const stmt = getDb().prepare('DELETE FROM track_folders WHERE track_id = ?');
    return stmt.run(trackId);
  },

  /**
   * Remove all tracks from a folder
   */
  removeAllFromFolder: (folderId) => {
    const stmt = getDb().prepare('DELETE FROM track_folders WHERE folder_id = ?');
    return stmt.run(folderId);
  },

  /**
   * Get tracks by folder
   */
  getTracksByFolder: (folderId) => {
    const stmt = getDb().prepare(`
      SELECT t.* FROM tracks t
      INNER JOIN track_folders tf ON t.id = tf.track_id
      WHERE tf.folder_id = ?
      ORDER BY t.title COLLATE NOCASE
    `);
    return stmt.all(folderId);
  },

  /**
   * Get track-folder relationship
   */
  getByTrackAndFolder: (trackId, folderId) => {
    const stmt = getDb().prepare(`
      SELECT * FROM track_folders 
      WHERE track_id = ? AND folder_id = ?
    `);
    return stmt.get(trackId, folderId);
  },
};

// Collection operations (unified system replacing old playlist/folder systems)
export const collectionQueries = {
  getCollection: (collectionId) => 
    collectionQueriesModule.getCollection(getDb(), collectionId),
  
  getCollections: (type = null, parentId = null) => 
    collectionQueriesModule.getCollections(getDb(), type, parentId),
  
  createCollection: (data) => 
    collectionQueriesModule.createCollection(getDb(), data),
  
  updateCollection: (collectionId, updates) => 
    collectionQueriesModule.updateCollection(getDb(), collectionId, updates),
  
  deleteCollection: (collectionId) => 
    collectionQueriesModule.deleteCollection(getDb(), collectionId),
  
  addTrack: (collectionId, trackId, position = null) => 
    collectionQueriesModule.addTrack(getDb(), collectionId, trackId, position),
  
  removeTrack: (collectionId, trackId) => 
    collectionQueriesModule.removeTrack(getDb(), collectionId, trackId),
  
  reorderTrack: (collectionId, trackId, newPosition) => 
    collectionQueriesModule.reorderTrack(getDb(), collectionId, trackId, newPosition),
  
  clearTracks: (collectionId) => 
    collectionQueriesModule.clearTracks(getDb(), collectionId),
  
  getCollectionTracks: (collectionId, limit = 50, offset = 0) => 
    collectionQueriesModule.getCollectionTracks(getDb(), collectionId, limit, offset)
};

export default {
  initDatabase,
  getDb,
  closeDatabase,
  trackQueries,
  folderQueries,
  trackFolderQueries,
  collectionQueries,
};
