-- Migration: Remove old playlist tables
-- These have been replaced by the track_collections system

-- Drop old playlist tables
DROP TABLE IF EXISTS playlist;
DROP TABLE IF EXISTS playlist_settings;

-- Drop old playlist index if it exists
DROP INDEX IF EXISTS idx_playlist_track;
