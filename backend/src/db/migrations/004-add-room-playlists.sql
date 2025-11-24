-- Create room-specific playlist collections
-- Room 1
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist-room-1', 'Room 1 Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Room 2
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist-room-2', 'Room 2 Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Room 3
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist-room-3', 'Room 3 Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Room 4
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist-room-4', 'Room 4 Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Room 5
INSERT OR IGNORE INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
VALUES ('current-playlist-room-5', 'Room 5 Playlist', 'playlist', NULL, 0, 1, strftime('%s', 'now'), strftime('%s', 'now'));
