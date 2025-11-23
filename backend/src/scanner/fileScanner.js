import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from 'music-metadata';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { trackQueries } from '../db/database.js';

// Supported audio formats
const SUPPORTED_FORMATS = ['.mp3', '.flac', '.ogg', '.m4a', '.aac', '.wav', '.opus'];

/**
 * Extract metadata from an audio file
 */
async function extractMetadata(filepath) {
  try {
    const metadata = await parseFile(filepath);
    const stats = await stat(filepath);
    
    return {
      title: metadata.common.title || null,
      artist: metadata.common.artist || null,
      album: metadata.common.album || null,
      duration: metadata.format.duration || null,
      format: metadata.format.container || extname(filepath).slice(1),
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
      sample_rate: metadata.format.sampleRate || null,
      file_size: stats.size,
    };
  } catch (error) {
    logger.warn({ filepath, error: error.message }, 'Failed to extract metadata');
    const stats = await stat(filepath);
    return {
      title: null,
      artist: null,
      album: null,
      duration: null,
      format: extname(filepath).slice(1),
      bitrate: null,
      sample_rate: null,
      file_size: stats.size,
    };
  }
}

/**
 * Recursively scan directory for audio files
 */
async function scanDirectory(dirPath, baseDir = null) {
  const actualBaseDir = baseDir || dirPath;
  const files = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await scanDirectory(fullPath, actualBaseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_FORMATS.includes(ext)) {
          const relativePath = relative(actualBaseDir, fullPath);
          files.push({
            fullPath,
            relativePath,
            filename: entry.name,
          });
        }
      }
    }
  } catch (error) {
    logger.error({ dirPath, error: error.message }, 'Failed to scan directory');
  }
  
  return files;
}

/**
 * Scan music directory and update database
 */
export async function scanMusicLibrary(onProgress = null) {
  const startTime = Date.now();
  logger.info({ musicDir: config.musicDir }, 'Starting music library scan');
  
  const stats = {
    scanned: 0,
    added: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
  };
  
  try {
    // Check if music directory exists
    try {
      await stat(config.musicDir);
    } catch (error) {
      logger.error({ musicDir: config.musicDir }, 'Music directory does not exist');
      throw new Error(`Music directory not found: ${config.musicDir}`);
    }
    
    // Scan for audio files
    logger.info('Discovering audio files...');
    const audioFiles = await scanDirectory(config.musicDir);
    logger.info({ count: audioFiles.length }, 'Audio files discovered');
    
    // Process each file
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      stats.scanned++;
      
      try {
        // Check if track already exists
        const existingTrack = trackQueries.getByFilepath(file.relativePath);
        
        // Extract metadata
        const metadata = await extractMetadata(file.fullPath);
        
        const trackData = {
          id: existingTrack?.id || uuidv4(),
          filepath: file.relativePath,
          filename: file.filename,
          title: metadata.title || file.filename.replace(extname(file.filename), ''),
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration,
          format: metadata.format,
          bitrate: metadata.bitrate,
          sample_rate: metadata.sample_rate,
          file_size: metadata.file_size,
          created_at: existingTrack?.created_at || Date.now(),
          updated_at: Date.now(),
        };
        
        if (existingTrack) {
          // Track already exists - skip it entirely
          // This preserves any user edits and prevents unnecessary updates
          stats.skipped++;
          logger.debug({ filepath: file.relativePath }, 'Track already exists, skipped');
        } else {
          // Insert new track
          trackQueries.insert(trackData);
          stats.added++;
          logger.debug({ filepath: file.relativePath }, 'Track added');
        }
        
        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: audioFiles.length,
            stats: { ...stats },
          });
        }
        
      } catch (error) {
        stats.errors++;
        logger.error({ 
          filepath: file.relativePath, 
          error: error.message 
        }, 'Failed to process file');
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      stats, 
      duration: `${(duration / 1000).toFixed(2)}s` 
    }, 'Music library scan completed');
    
    return {
      success: true,
      stats,
      duration,
    };
    
  } catch (error) {
    logger.error({ error: error.message }, 'Music library scan failed');
    return {
      success: false,
      error: error.message,
      stats,
    };
  }
}

/**
 * Get scan statistics without performing a scan
 */
export function getScanStats() {
  const trackCount = trackQueries.count();
  return {
    totalTracks: trackCount,
    lastScan: null, // TODO: Store in database
  };
}

export default {
  scanMusicLibrary,
  getScanStats,
  SUPPORTED_FORMATS,
};
