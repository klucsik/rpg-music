-- Music tracks table
CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    filepath TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    format TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    file_size INTEGER,
    youtube_url TEXT,
    youtube_video_id TEXT,
    youtube_thumbnail TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Folders for organization
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Many-to-many relationship between tracks and folders
CREATE TABLE IF NOT EXISTS track_folders (
    track_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (track_id, folder_id),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracks_filepath ON tracks(filepath);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_youtube_video_id ON tracks(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_track_folders_folder ON track_folders(folder_id);
CREATE INDEX IF NOT EXISTS idx_track_folders_track ON track_folders(track_id);

-- Download jobs table for YouTube downloads
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
