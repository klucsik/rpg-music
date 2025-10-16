-- Track Collections - Unified abstraction for playlists, folders, and library
-- This schema adds the new collection system while keeping existing tables for gradual migration

-- Collection types: 'library', 'playlist', 'folder'
CREATE TABLE IF NOT EXISTS track_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('library', 'playlist', 'folder')),
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    is_ordered INTEGER DEFAULT 1, -- 1 = ordered by position, 0 = ordered by title
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES track_collections(id) ON DELETE CASCADE
);

-- Many-to-many relationship between tracks and collections with ordering
CREATE TABLE IF NOT EXISTS collection_tracks (
    collection_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, track_id),
    UNIQUE (collection_id, position),
    FOREIGN KEY (collection_id) REFERENCES track_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_track_collections_type ON track_collections(type);
CREATE INDEX IF NOT EXISTS idx_track_collections_parent ON track_collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_collection ON collection_tracks(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_track ON collection_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_position ON collection_tracks(collection_id, position);

-- Create the special 'library' collection (ID: 'library')
-- The library is a virtual collection that shows all tracks ordered by title
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('library', 'Music Library', 'library', NULL, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'));

-- Create the special 'current-playlist' collection (ID: 'current-playlist')
-- This is the main playback queue
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist', 'Current Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));
