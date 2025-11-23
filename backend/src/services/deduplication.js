import { unlink } from 'fs/promises';
import { join } from 'path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { trackQueries, trackFolderQueries, collectionQueries } from '../db/database.js';

/**
 * Normalize string for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two tracks are duplicates based on metadata
 * Matches on: title, artist, and duration (within 2 seconds tolerance)
 */
function isMetadataDuplicate(track1, track2) {
  // Normalize titles and artists for comparison
  const title1 = normalizeString(track1.title);
  const title2 = normalizeString(track2.title);
  const artist1 = normalizeString(track1.artist);
  const artist2 = normalizeString(track2.artist);
  
  // Check title match
  if (!title1 || !title2 || title1 !== title2) {
    return false;
  }
  
  // Check artist match (if both have artists)
  if (artist1 && artist2 && artist1 !== artist2) {
    return false;
  }
  
  // Check duration match (within 2 seconds tolerance)
  if (track1.duration && track2.duration) {
    const durationDiff = Math.abs(track1.duration - track2.duration);
    if (durationDiff > 2) {
      return false;
    }
  }
  
  return true;
}

/**
 * Find duplicate track by comparing metadata (title, artist, duration)
 * @param {object} trackMetadata - Metadata of the new track (title, artist, duration)
 * @param {string} excludeFilepath - Filepath to exclude from search (the new track itself)
 * @returns {Promise<object|null>} - Existing track if duplicate found, null otherwise
 */
export async function findDuplicateByMetadata(trackMetadata, excludeFilepath = null) {
  try {
    logger.debug({ 
      title: trackMetadata.title, 
      artist: trackMetadata.artist, 
      duration: trackMetadata.duration 
    }, 'Searching for duplicate by metadata');
    
    // Search all tracks to find one with matching metadata
    const allTracks = trackQueries.getAll(10000, 0); // Get all tracks
    
    for (const track of allTracks) {
      // Skip the track itself if filepath matches
      if (excludeFilepath && track.filepath === excludeFilepath) {
        continue;
      }
      
      if (isMetadataDuplicate(trackMetadata, track)) {
        logger.info({ 
          newTrack: { 
            title: trackMetadata.title, 
            artist: trackMetadata.artist, 
            duration: trackMetadata.duration 
          },
          existingTrack: { 
            id: track.id,
            title: track.title, 
            artist: track.artist, 
            duration: track.duration,
            filepath: track.filepath
          }
        }, 'Duplicate track detected by metadata');
        return track;
      }
    }
    
    return null;
  } catch (error) {
    logger.error({ trackMetadata, error }, 'Error checking for duplicates');
    throw error;
  }
}

/**
 * Merge duplicate track into existing track
 * - Updates existing track with YouTube metadata if not already present
 * - Merges folder associations
 * - Deletes the duplicate file and track record
 * 
 * @param {string} duplicateTrackId - ID of the newly created duplicate track
 * @param {string} existingTrackId - ID of the existing track to keep
 * @param {object} youtubeMetadata - YouTube metadata from download (url, video_id, thumbnail)
 * @param {array} folderIds - Folder IDs that the duplicate was being added to
 * @returns {Promise<object>} - Updated existing track
 */
export async function mergeDuplicateTracks(duplicateTrackId, existingTrackId, youtubeMetadata = null, folderIds = null) {
  try {
    const duplicateTrack = trackQueries.getById(duplicateTrackId);
    const existingTrack = trackQueries.getById(existingTrackId);
    
    if (!duplicateTrack || !existingTrack) {
      throw new Error('Track not found');
    }
    
    logger.info({ 
      duplicateTrackId, 
      existingTrackId,
      duplicateFile: duplicateTrack.filepath,
      existingFile: existingTrack.filepath
    }, 'Merging duplicate tracks');
    
    // Prepare updates for existing track
    const updates = {};
    
    // Update YouTube metadata if existing track doesn't have it
    if (youtubeMetadata) {
      if (!existingTrack.youtube_url && youtubeMetadata.url) {
        updates.youtube_url = youtubeMetadata.url;
      }
      if (!existingTrack.youtube_video_id && youtubeMetadata.video_id) {
        updates.youtube_video_id = youtubeMetadata.video_id;
      }
      if (!existingTrack.youtube_thumbnail && youtubeMetadata.thumbnail) {
        updates.youtube_thumbnail = youtubeMetadata.thumbnail;
      }
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      trackQueries.update(existingTrackId, updates);
      logger.info({ existingTrackId, updates }, 'Updated existing track with YouTube metadata');
    }
    
    // Get folders from duplicate track
    const duplicateFolders = trackFolderQueries.getFoldersForTrack(duplicateTrackId);
    
    // Merge folder associations from duplicate to existing
    for (const folder of duplicateFolders) {
      const existing = trackFolderQueries.getByTrackAndFolder(existingTrackId, folder.id);
      if (!existing) {
        trackFolderQueries.add(existingTrackId, folder.id);
        logger.debug({ trackId: existingTrackId, folderId: folder.id }, 'Merged folder association');
      }
    }
    
    // Add to new folders if specified
    if (folderIds && Array.isArray(folderIds)) {
      for (const folderId of folderIds) {
        try {
          // Check if already in collection
          const existingInCollection = trackFolderQueries.getByTrackAndFolder(existingTrackId, folderId);
          if (!existingInCollection) {
            collectionQueries.addTrack(folderId, existingTrackId);
            logger.debug({ trackId: existingTrackId, folderId }, 'Added existing track to new folder');
          }
        } catch (error) {
          logger.warn({ error, folderId }, 'Failed to add track to folder');
        }
      }
    }
    
    // Delete the duplicate file
    try {
      const duplicateFullPath = join(config.musicDir, duplicateTrack.filepath);
      await unlink(duplicateFullPath);
      logger.info({ filepath: duplicateTrack.filepath }, 'Deleted duplicate file');
    } catch (error) {
      logger.error({ filepath: duplicateTrack.filepath, error }, 'Failed to delete duplicate file');
      // Continue even if file deletion fails
    }
    
    // Delete the duplicate track from database
    trackQueries.delete(duplicateTrackId);
    logger.info({ duplicateTrackId }, 'Deleted duplicate track from database');
    
    // Return the updated existing track
    const updatedTrack = trackQueries.getById(existingTrackId);
    return updatedTrack;
    
  } catch (error) {
    logger.error({ duplicateTrackId, existingTrackId, error }, 'Failed to merge duplicate tracks');
    throw error;
  }
}

export default {
  findDuplicateByMetadata,
  mergeDuplicateTracks,
};
