# Ordered Track List Refactoring Plan

## Executive Summary

Refactor the application to use a unified "Ordered Track List" abstraction that serves as the foundation for:
- **Music Library** - All tracks in the database (read-only, can be filtered/searched)
- **Folders** - Named collections of ordered tracks
- **Playlist** - Special ordered list that the player works from

## Current State Analysis

### Backend

#### Database Schema
```
tracks                  - Physical tracks on disk
  ├─ id, filepath, title, artist, album, duration, etc.

track_folders          - Many-to-many (NO POSITION!)
  ├─ track_id, folder_id, added_at

playlist               - Ordered list (HAS POSITION!)
  ├─ position, track_id, added_at

folders                - Folder metadata
  ├─ id, name, parent_id, sort_order
```

**Key Issues:**
1. ❌ `track_folders` has NO position column - tracks not ordered
2. ❌ `playlist` has position but different structure
3. ❌ No unified abstraction for ordered lists
4. ❌ Music library queries all tracks with pagination (not stored as list)

#### Query Patterns
```javascript
// Playlist - HAS ORDER
playlistQueries.getAll()      // ORDER BY position
playlistQueries.add(trackId, position)
playlistQueries.reorder(trackIds)

// Folders - NO ORDER (currently alphabetical)
trackFolderQueries.getTracksByFolder(folderId)  // ORDER BY title
trackFolderQueries.add(trackId, folderId)       // No position!

// Library - PAGINATED
trackQueries.getAll(limit, offset)              // Pagination
trackQueries.search(query)                      // Search
```

### Frontend

#### Components

**TrackList.vue** (Music Library)
- Props: `currentTrackId`
- Features: Search, pagination, drag source
- Emits: `play-track`, `add-track-next`
- State: `tracks[]`, `pagination`, `searchQuery`

**Playlist.vue** (Current Playlist)
- Props: `currentTrackId`, `foldersWithPaths`
- Features: Drag-drop reorder, add/remove, shuffle, clear, save to folder
- Emits: `play-track`, `save-to-folder`
- State: `playlist[]`, `isDragOver`, `dropIndicatorIndex`

**FolderNode.vue** (Folder Tracks)
- Props: `folder`, `selectedFolderId`, `folderTracks`
- Features: Display tracks (no reorder currently), drag target, remove
- Emits: `drop-track`, `remove-track`, `play-folder`
- State: `isDragOver`, `isDragOverTracks`

#### Common Patterns Identified

All three components share:
1. ✅ Display list of tracks with title/artist/duration
2. ✅ Show current playing track indicator
3. ✅ Double-click to play track
4. ✅ Drag tracks (source or target)
5. ✅ Track tooltips for truncated text
6. ⚠️ **Only Playlist has reorder** (drag within list)
7. ⚠️ **Different data sources** (API, websocket, props)

## Proposed Architecture

### Unified Concept: "TrackCollection"

A `TrackCollection` represents an ordered, identifiable list of tracks with operations:

```typescript
interface TrackCollection {
  id: string           // 'library', folder_id, 'playlist'
  type: 'library' | 'folder' | 'playlist'
  name: string         // Display name
  tracks: Track[]      // Ordered list
  readonly?: boolean   // Can tracks be reordered?
  
  // Operations
  add(track, position?)
  remove(trackId)
  reorder(trackIds)
  clear()
  shuffle()
}
```

### Backend Refactoring

#### 1. New Unified Schema

```sql
-- Ordered track collections (unified storage)
CREATE TABLE track_collections (
    id TEXT PRIMARY KEY,          -- 'playlist' or folder_id
    type TEXT NOT NULL,           -- 'playlist' or 'folder'
    name TEXT,                    -- Display name (NULL for playlist)
    metadata TEXT,                -- JSON for extra config (loop, etc)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Ordered tracks in collections
CREATE TABLE collection_tracks (
    collection_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,    -- 0, 1, 2, ...
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, track_id),
    FOREIGN KEY (collection_id) REFERENCES track_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE INDEX idx_collection_tracks_position 
    ON collection_tracks(collection_id, position);
```

**Migration Strategy:**
1. Create new tables
2. Migrate playlist → `track_collections` (type='playlist', id='playlist')
3. Migrate folders → keep `folders` table for hierarchy, but use `track_collections` for tracks
4. Drop old `playlist` and `track_folders` tables

#### 2. Unified Query Interface

```javascript
// backend/src/db/collections.js
export const collectionQueries = {
  // Get collection with tracks
  get(collectionId) {
    // Returns { id, type, name, tracks: [] }
  },
  
  // Add track at position (or end)
  addTrack(collectionId, trackId, position = -1) {
    // If position = -1, append to end
    // Otherwise insert at position, shift others
  },
  
  // Remove track
  removeTrack(collectionId, trackId) {
    // Remove and compact positions
  },
  
  // Reorder entire collection
  reorder(collectionId, trackIds) {
    // Transaction: delete all, re-insert in order
  },
  
  // Clear collection
  clear(collectionId) {
    // Delete all tracks from collection
  },
  
  // Special: get library collection (virtual - all tracks)
  getLibrary(filters = {}) {
    // Returns pseudo-collection with all tracks
    // Supports search, pagination
  }
};
```

#### 3. Unified API Endpoints

```javascript
// GET /api/collections/:id
// - Returns collection with ordered tracks
// - For 'library': virtual collection with pagination/search

// POST /api/collections/:id/tracks
// - Add track { trackId, position? }

// DELETE /api/collections/:id/tracks/:trackId
// - Remove track

// PUT /api/collections/:id/reorder
// - Reorder tracks { trackIds: [...] }

// DELETE /api/collections/:id/clear
// - Clear all tracks

// POST /api/collections/:id/shuffle
// - Randomize order
```

### Frontend Refactoring

#### 1. Base Component: `OrderedTrackList.vue`

**Purpose:** Reusable component for displaying/managing ordered track lists

```vue
<template>
  <div class="ordered-track-list" :class="[listType]">
    <!-- Header Slot -->
    <div class="list-header">
      <slot name="header" :count="tracks.length">
        <h3>{{ title }}</h3>
      </slot>
    </div>
    
    <!-- Actions Slot -->
    <div v-if="$slots.actions" class="list-actions">
      <slot name="actions" :tracks="tracks" />
    </div>
    
    <!-- Track Items -->
    <div class="track-container" 
         @dragover.prevent="onContainerDragOver"
         @drop="onContainerDrop">
      <div v-if="tracks.length === 0" class="no-tracks">
        <slot name="empty">No tracks</slot>
      </div>
      
      <div v-for="(track, index) in tracks"
           :key="`${track.id}-${index}`"
           class="track-item"
           :class="trackClasses(track, index)"
           :draggable="draggable"
           @dragstart="onDragStart($event, track, index)"
           @dragend="onDragEnd"
           @dragover.prevent="onDragOver($event, index)"
           @drop="onDrop($event, index)"
           @dblclick="onDoubleClick(track)">
        
        <!-- Drag Handle (if reorderable) -->
        <div v-if="reorderable" class="drag-handle">⋮⋮</div>
        
        <!-- Track Number (if showNumbers) -->
        <div v-if="showNumbers" class="track-number">{{ index + 1 }}</div>
        
        <!-- Track Icon -->
        <div class="track-icon">
          <span v-if="isCurrentTrack(track.id)">▶️</span>
          <span v-else>🎵</span>
        </div>
        
        <!-- Track Info -->
        <div class="track-info">
          <div class="track-title" :title="track.title">{{ track.title }}</div>
          <div class="track-meta">
            <span v-if="track.artist" :title="track.artist">{{ track.artist }}</span>
            <span v-if="showDuration" class="duration">{{ formatDuration(track.duration) }}</span>
          </div>
        </div>
        
        <!-- Actions Slot (per track) -->
        <div v-if="$slots.trackActions" class="track-actions">
          <slot name="trackActions" :track="track" :index="index" />
        </div>
      </div>
    </div>
    
    <!-- Footer Slot (pagination, etc) -->
    <div v-if="$slots.footer" class="list-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script>
export default {
  props: {
    tracks: Array,              // Ordered array of tracks
    currentTrackId: String,     // Currently playing track
    title: String,              // List title
    listType: String,           // 'library' | 'folder' | 'playlist'
    
    // Behavior flags
    draggable: { type: Boolean, default: true },
    reorderable: { type: Boolean, default: false },
    showNumbers: { type: Boolean, default: false },
    showDuration: { type: Boolean, default: true },
    acceptDrops: { type: Boolean, default: true },
  },
  
  emits: [
    'track-dblclick',           // Double-click track
    'track-drag-start',         // Track drag started
    'track-drop',               // External track dropped
    'reorder',                  // Tracks reordered
  ]
};
</script>
```

#### 2. Specialized Components (Thin Wrappers)

**MusicLibrary.vue**
```vue
<template>
  <OrderedTrackList
    :tracks="tracks"
    :currentTrackId="currentTrackId"
    title="Music Library"
    listType="library"
    :reorderable="false"
    :draggable="true"
    :acceptDrops="false"
    @track-dblclick="onAddTrackNext"
  >
    <template #header="{ count }">
      <h3>Music Library</h3>
      <a :href="addMusicUrl" class="add-music-btn">➕ Add Music</a>
    </template>
    
    <template #actions>
      <input v-model="searchQuery" placeholder="Search..." />
    </template>
    
    <template #footer>
      <Pagination :page="page" :pages="pages" @change="loadPage" />
    </template>
  </OrderedTrackList>
</template>
```

**PlaylistPanel.vue**
```vue
<template>
  <OrderedTrackList
    :tracks="playlist"
    :currentTrackId="currentTrackId"
    title="Current Playlist"
    listType="playlist"
    :reorderable="true"
    :showNumbers="true"
    @track-dblclick="onPlayTrack"
    @reorder="onReorder"
    @track-drop="onAddTrack"
  >
    <template #actions="{ tracks }">
      <button @click="shuffle">🔀 Shuffle</button>
      <button @click="clear">🗑️ Clear</button>
      <button @click="saveToFolder">💾 Save</button>
    </template>
    
    <template #trackActions="{ track, index }">
      <button @click="removeTrack(index)">✕</button>
    </template>
  </OrderedTrackList>
</template>
```

**FolderTracks.vue**
```vue
<template>
  <OrderedTrackList
    :tracks="folderTracks"
    :currentTrackId="currentTrackId"
    :title="folderName"
    listType="folder"
    :reorderable="true"
    @track-dblclick="onAddTrackNext"
    @reorder="onReorder"
    @track-drop="onAddTrack"
  >
    <template #trackActions="{ track }">
      <button @click="removeTrack(track.id)">✕</button>
    </template>
  </OrderedTrackList>
</template>
```

#### 3. Composable: `useTrackCollection`

```javascript
// frontend/src/composables/useTrackCollection.js
export function useTrackCollection(collectionId, options = {}) {
  const tracks = ref([]);
  const loading = ref(false);
  
  const load = async () => {
    loading.value = true;
    const response = await api.getCollection(collectionId);
    tracks.value = response.tracks;
    loading.value = false;
  };
  
  const addTrack = async (trackId, position) => {
    await api.addTrackToCollection(collectionId, trackId, position);
    await load();
  };
  
  const removeTrack = async (trackId) => {
    await api.removeTrackFromCollection(collectionId, trackId);
    await load();
  };
  
  const reorder = async (trackIds) => {
    await api.reorderCollection(collectionId, trackIds);
    tracks.value = trackIds.map(id => tracks.value.find(t => t.id === id));
  };
  
  const clear = async () => {
    await api.clearCollection(collectionId);
    tracks.value = [];
  };
  
  const shuffle = async () => {
    await api.shuffleCollection(collectionId);
    await load();
  };
  
  // WebSocket sync
  if (options.syncWebSocket) {
    websocket.on(`collection_${collectionId}_update`, load);
  }
  
  onMounted(load);
  
  return {
    tracks,
    loading,
    addTrack,
    removeTrack,
    reorder,
    clear,
    shuffle,
    refresh: load,
  };
}
```

## Implementation Phases

### Phase 1: Backend Foundation (2-3 days)
1. ✅ Create new `track_collections` and `collection_tracks` tables
2. ✅ Implement `collectionQueries` module
3. ✅ Create unified API routes `/api/collections/*`
4. ✅ Write migration script for existing data
5. ✅ Update tests

### Phase 2: Backend Migration (1 day)
1. ✅ Migrate playlist data to new schema
2. ✅ Migrate folder tracks to new schema
3. ✅ Keep old APIs for backwards compatibility (deprecated)
4. ✅ Test migration with real data

### Phase 3: Frontend Base Component (2 days)
1. ✅ Create `OrderedTrackList.vue` base component
2. ✅ Create `useTrackCollection` composable
3. ✅ Create new API client methods
4. ✅ Test in isolation

### Phase 4: Frontend Migration - Playlist (1 day)
1. ✅ Create `PlaylistPanel.vue` using `OrderedTrackList`
2. ✅ Replace old `Playlist.vue`
3. ✅ Test all functionality (reorder, clear, shuffle, etc)

### Phase 5: Frontend Migration - Folders (1 day)
1. ✅ Create `FolderTracks.vue` using `OrderedTrackList`
2. ✅ Update `FolderNode.vue` to use new component
3. ✅ Add reorder functionality
4. ✅ Test folder operations

### Phase 6: Frontend Migration - Library (1 day)
1. ✅ Create `MusicLibrary.vue` using `OrderedTrackList`
2. ✅ Replace old `TrackList.vue`
3. ✅ Keep search/pagination working
4. ✅ Test drag operations

### Phase 7: Cleanup (1 day)
1. ✅ Remove old backend routes
2. ✅ Remove old frontend components
3. ✅ Remove old database tables
4. ✅ Update documentation
5. ✅ Final testing

### Phase 8: Polish (1 day)
1. ✅ Remove console.logs
2. ✅ Add loading states
3. ✅ Add error handling
4. ✅ Optimize performance
5. ✅ UI/UX improvements

## Benefits of Refactoring

### Code Quality
- ✅ **DRY**: One component instead of three similar ones
- ✅ **Maintainable**: Single source of truth for track list behavior
- ✅ **Testable**: Shared logic easier to test
- ✅ **Consistent**: Same UX across all lists

### Features
- ✅ **Folders can be reordered** (currently missing)
- ✅ **Unified drag-drop** behavior
- ✅ **Consistent double-click** behavior
- ✅ **Same visual style** everywhere

### Database
- ✅ **Ordered folders**: Tracks in folders have explicit order
- ✅ **Unified structure**: Same pattern for all collections
- ✅ **Easier queries**: One set of functions for all lists
- ✅ **Better performance**: Indexed positions

### API
- ✅ **Consistent endpoints**: Same patterns for library/folders/playlist
- ✅ **Fewer routes**: One set of CRUD operations
- ✅ **Easier to extend**: Add new collection types easily

## Risks & Mitigations

### Risk: Data Loss During Migration
**Mitigation:** 
- Backup database before migration
- Test migration script on copy first
- Keep old tables during transition
- Rollback plan documented

### Risk: Breaking Changes
**Mitigation:**
- Keep old API endpoints during transition
- Feature flags for new components
- Gradual migration (one component at a time)
- Extensive testing at each phase

### Risk: Performance Issues
**Mitigation:**
- Add database indexes on positions
- Paginate library view
- Lazy load folder tracks
- Profile and optimize queries

### Risk: Complex UI State
**Mitigation:**
- Use composables for shared logic
- Clear separation of concerns
- Comprehensive state management
- Unit tests for state transitions

## Success Criteria

- ✅ All three views (library, folders, playlist) use `OrderedTrackList`
- ✅ Folders support drag-drop reordering
- ✅ Zero data loss during migration
- ✅ No regression in existing features
- ✅ Code reduction: >40% less component code
- ✅ Performance: No slower than current implementation
- ✅ All tests passing

## Open Questions

1. Should library tracks be orderable? (Probably no - too many tracks)
2. Should we support multiple playlists in future? (Yes - architecture supports it)
3. How to handle very large folders? (Pagination like library)
4. WebSocket sync for folder changes? (Yes, for consistency)

## Next Steps

1. **Review this plan** - Get approval from team/stakeholders
2. **Setup branch** - Create feature branch `feature/unified-track-collections`
3. **Start Phase 1** - Begin backend foundation work
4. **Daily sync** - Review progress, adjust plan as needed

---

**Estimated Total Time:** 10-12 days
**Complexity:** Medium-High
**Impact:** High (major refactoring)
**Priority:** High (fixes fundamental architecture issues)
