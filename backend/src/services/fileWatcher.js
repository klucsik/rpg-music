import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from 'music-metadata';
import logger from '../utils/logger.js';
import { trackQueries, trackFolderQueries } from '../db/database.js';
import { broadcastLibraryUpdate } from '../websocket/socketServer.js';

class FileWatcher {
  constructor(musicDirectory) {
    // Resolve to absolute path to ensure consistency with chokidar
    this.musicDirectory = path.resolve(musicDirectory);
    this.watcher = null;
    this.isReady = false;
    
    // Debounce timer for batch processing
    this.pendingAdds = new Set();
    this.pendingDeletes = new Set();
    this.processTimer = null;
    this.DEBOUNCE_MS = 2000; // Wait 2 seconds before processing
  }

  start() {
    logger.info(`Starting file watcher on: ${this.musicDirectory}`);
    
    // Watch for audio files
    this.watcher = chokidar.watch(this.musicDirectory, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      depth: 10, // Watch subdirectories up to 10 levels deep
    });

    // File added
    this.watcher.on('add', (filePath) => {
      if (this.isReady) {
        this.handleFileAdd(filePath);
      }
    });

    // File deleted
    this.watcher.on('unlink', (filePath) => {
      if (this.isReady) {
        this.handleFileDelete(filePath);
      }
    });

    // File changed (re-scan metadata)
    this.watcher.on('change', (filePath) => {
      if (this.isReady) {
        this.handleFileChange(filePath);
      }
    });

    // Directory deleted
    this.watcher.on('unlinkDir', (dirPath) => {
      if (this.isReady) {
        logger.info(`Directory deleted: ${dirPath}`);
        // Files will be handled by individual unlink events
      }
    });

    // Watcher is ready
    this.watcher.on('ready', () => {
      this.isReady = true;
      logger.info('File watcher is ready and monitoring for changes');
    });

    // Error handling
    this.watcher.on('error', (error) => {
      logger.error('File watcher error:', error);
    });
  }

  handleFileAdd(filePath) {
    // Check if it's a supported audio file
    const ext = path.extname(filePath).toLowerCase();
    const supportedFormats = ['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.opus', '.aac'];
    
    if (!supportedFormats.includes(ext)) {
      return;
    }

    logger.info(`New file detected: ${filePath}`);
    this.pendingAdds.add(filePath);
    this.scheduleBatchProcess();
  }

  handleFileDelete(filePath) {
    logger.info(`File deleted: ${filePath}`);
    this.pendingDeletes.add(filePath);
    this.scheduleBatchProcess();
  }

  handleFileChange(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const supportedFormats = ['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.opus', '.aac'];
    
    if (!supportedFormats.includes(ext)) {
      return;
    }

    logger.info(`File changed: ${filePath}`);
    // Treat as delete + add to refresh metadata
    this.pendingDeletes.add(filePath);
    this.pendingAdds.add(filePath);
    this.scheduleBatchProcess();
  }

  scheduleBatchProcess() {
    // Clear existing timer
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }

    // Schedule new batch process
    this.processTimer = setTimeout(() => {
      this.processBatch();
    }, this.DEBOUNCE_MS);
  }

  async processBatch() {
    const adds = Array.from(this.pendingAdds);
    const deletes = Array.from(this.pendingDeletes);
    
    this.pendingAdds.clear();
    this.pendingDeletes.clear();

    try {
      // Process deletions first
      if (deletes.length > 0) {
        await this.processDeletes(deletes);
      }

      // Then process additions
      if (adds.length > 0) {
        await this.processAdds(adds);
      }

      logger.info(`Batch processed: ${adds.length} additions, ${deletes.length} deletions`);
    } catch (error) {
      logger.error('Error processing batch:', error);
    }
  }

  async processDeletes(filePaths) {
    const deletedTracks = [];
    
    for (const filePath of filePaths) {
      try {
        // Find track by file path
        const relativePath = path.relative(this.musicDirectory, filePath);
        logger.debug({ filePath, musicDirectory: this.musicDirectory, relativePath }, 'Processing delete');
        
        const track = trackQueries.getByFilepath(relativePath);
        
        if (track) {
          // Remove from all folders first
          trackFolderQueries.removeTrackFromAll(track.id);
          
          // Delete the track
          trackQueries.delete(track.id);
          logger.info({ filepath: relativePath, title: track.title }, 'Removed track from database');
          
          deletedTracks.push({
            id: track.id,
            title: track.title,
            filepath: relativePath,
          });
        } else {
          logger.warn({ filepath: filePath, relativePath }, 'Track not found in database for deletion');
        }
      } catch (error) {
        logger.error({ filepath: filePath, error: error.message }, 'Error deleting track');
      }
    }
    
    // Broadcast library update if tracks were deleted
    if (deletedTracks.length > 0) {
      broadcastLibraryUpdate({
        type: 'tracks_deleted',
        tracks: deletedTracks,
        count: deletedTracks.length,
      });
    }
  }

  /**
   * Extract metadata from an audio file
   */
  async extractMetadata(filepath) {
    try {
      const metadata = await parseFile(filepath);
      const stats = await fs.stat(filepath);
      
      return {
        title: metadata.common.title || null,
        artist: metadata.common.artist || null,
        album: metadata.common.album || null,
        duration: metadata.format.duration || null,
        format: metadata.format.container || path.extname(filepath).slice(1),
        bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
        sample_rate: metadata.format.sampleRate || null,
        file_size: stats.size,
      };
    } catch (error) {
      logger.warn({ filepath, error: error.message }, 'Failed to extract metadata');
      const stats = await fs.stat(filepath);
      return {
        title: null,
        artist: null,
        album: null,
        duration: null,
        format: path.extname(filepath).slice(1),
        bitrate: null,
        sample_rate: null,
        file_size: stats.size,
      };
    }
  }

  async processAdds(filePaths) {
    const addedTracks = [];
    
    for (const filePath of filePaths) {
      try {
        // Verify file still exists
        await fs.access(filePath);
        
        // Scan the single file
        const relativePath = path.relative(this.musicDirectory, filePath);
        const filename = path.basename(filePath);
        
        // Check if track already exists
        const existing = trackQueries.getByFilepath(relativePath);
        if (existing) {
          logger.info({ filepath: relativePath }, 'Track already exists, skipping');
          continue;
        }
        
        // Extract metadata
        const metadata = await this.extractMetadata(filePath);
        
        const trackData = {
          id: uuidv4(),
          filepath: relativePath,
          filename: filename,
          title: metadata.title || filename.replace(path.extname(filename), ''),
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration,
          format: metadata.format,
          bitrate: metadata.bitrate,
          sample_rate: metadata.sample_rate,
          file_size: metadata.file_size,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        
        trackQueries.insert(trackData);
        logger.info({ filepath: relativePath, title: trackData.title }, 'Added new track to database');
        
        addedTracks.push({
          id: trackData.id,
          title: trackData.title,
          artist: trackData.artist,
          filepath: relativePath,
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.warn({ filepath: filePath }, 'File no longer exists');
        } else {
          logger.error({ filepath: filePath, error: error.message }, 'Error adding track');
        }
      }
    }
    
    // Broadcast library update if tracks were added
    if (addedTracks.length > 0) {
      broadcastLibraryUpdate({
        type: 'tracks_added',
        tracks: addedTracks,
        count: addedTracks.length,
      });
    }
  }

  stop() {
    if (this.watcher) {
      logger.info('Stopping file watcher');
      this.watcher.close();
      this.watcher = null;
      this.isReady = false;
    }
    
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }
}

export default FileWatcher;
