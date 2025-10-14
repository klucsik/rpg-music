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

-- Current playlist (server-side shared state)
CREATE TABLE IF NOT EXISTS playlist (
    position INTEGER PRIMARY KEY,
    track_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Playlist settings
CREATE TABLE IF NOT EXISTS playlist_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initialize default settings
INSERT OR IGNORE INTO playlist_settings (key, value) VALUES ('loop_all', 'false');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracks_filepath ON tracks(filepath);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_track_folders_folder ON track_folders(folder_id);
CREATE INDEX IF NOT EXISTS idx_track_folders_track ON track_folders(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_track ON playlist(track_id);
