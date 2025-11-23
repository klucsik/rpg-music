-- Migration: Add folder_id to download_jobs table
-- This allows downloads to be automatically added to a specific folder

-- Add folder_id column to download_jobs
ALTER TABLE download_jobs ADD COLUMN folder_id TEXT REFERENCES collections(id) ON DELETE SET NULL;

-- Create index for faster folder queries
CREATE INDEX IF NOT EXISTS idx_download_jobs_folder_id ON download_jobs(folder_id);
