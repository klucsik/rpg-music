-- Migration to allow duplicate tracks in collections
-- Removes the PRIMARY KEY constraint on (collection_id, track_id)
-- Adds an auto-increment ID column instead

-- Step 1: Create new table with updated schema
CREATE TABLE IF NOT EXISTS collection_tracks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    UNIQUE (collection_id, position),
    FOREIGN KEY (collection_id) REFERENCES track_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Step 2: Copy existing data
INSERT INTO collection_tracks_new (collection_id, track_id, position, added_at)
SELECT collection_id, track_id, position, added_at
FROM collection_tracks;

-- Step 3: Drop old table
DROP TABLE collection_tracks;

-- Step 4: Rename new table
ALTER TABLE collection_tracks_new RENAME TO collection_tracks;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_collection_tracks_collection ON collection_tracks(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_track ON collection_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_position ON collection_tracks(collection_id, position);
