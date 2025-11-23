-- Migration: Add YouTube support
-- Date: 2025-11-23
-- Description: Adds YouTube URL and video ID columns to tracks table, creates download_jobs table

-- Add YouTube columns to tracks table
ALTER TABLE tracks ADD COLUMN youtube_url TEXT;
ALTER TABLE tracks ADD COLUMN youtube_video_id TEXT;

-- Create index for youtube_video_id
CREATE INDEX IF NOT EXISTS idx_tracks_youtube_video_id ON tracks(youtube_video_id);

-- Create download jobs table
CREATE TABLE IF NOT EXISTS download_jobs (
    id TEXT PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    youtube_title TEXT,
    youtube_channel TEXT,
    youtube_thumbnail TEXT,
    youtube_duration INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    track_id TEXT,
    error_message TEXT,
    progress_percent INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL
);

-- Indexes for download jobs
CREATE INDEX IF NOT EXISTS idx_download_jobs_status ON download_jobs(status);
CREATE INDEX IF NOT EXISTS idx_download_jobs_video_id ON download_jobs(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_download_jobs_created_at ON download_jobs(created_at);
