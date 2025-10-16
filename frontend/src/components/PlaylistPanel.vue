<template>
  <div class="playlist-panel">
    <OrderedTrackList
      :tracks="tracks"
      :current-track="currentTrack"
      :allow-reorder="true"
      :allow-remove="true"
      :allow-drop="true"
      :show-position="true"
      :enable-double-click="true"
      :enable-single-click="false"
      @track-dblclick="handleTrackDoubleClick"
      @track-remove="handleRemoveTrack"
      @track-reorder="handleReorderTrack"
      @track-drop="handleDropTrack"
    >
      <template #header>
        <div class="playlist-header">
          <h3>Current Playlist</h3>
          <div class="playlist-controls">
            <button 
              @click="handleClear" 
              :disabled="isEmpty || loading"
              class="clear-btn"
              title="Clear playlist"
            >
              Clear
            </button>
            <button
              @click="handleShuffle"
              :disabled="isEmpty || loading"
              class="shuffle-btn"
              title="Shuffle playlist"
            >
              🔀
            </button>
          </div>
          <div class="playlist-stats">
            {{ trackCount }} tracks
            <span v-if="loading">• Loading...</span>
          </div>
        </div>
      </template>

      <template #empty>
        <div class="empty-playlist">
          <p>Playlist is empty</p>
          <p class="empty-hint">Double-click tracks from the library or drag them here</p>
        </div>
      </template>
    </OrderedTrackList>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import { useTrackCollection } from '../composables/useTrackCollection';

const props = defineProps({
  currentTrack: {
    type: Object,
    default: null
  }
});

const emit = defineEmits([
  'track-play',
  'playlist-updated'
]);

// Use the collection composable for current playlist
const {
  tracks,
  loading,
  error,
  trackCount,
  isEmpty,
  loadCollection,
  refresh,
  removeTrack,
  reorderTrack: reorderTrackInCollection,
  clearTracks,
  handleTrackDrop: handleTrackDropComposable,
  handleTrackReorder: handleTrackReorderComposable
} = useTrackCollection('current-playlist', {
  autoLoad: true,
  enableWebSocket: true,
  webSocketEvents: [
    {
      event: 'playlist_update',
      handler: (data, { refresh }) => {
        console.log('Playlist updated via WebSocket');
        refresh();
      }
    }
  ]
});

// Watch for track changes and emit update event
watch(tracks, (newTracks) => {
  emit('playlist-updated', newTracks);
}, { deep: true });

/**
 * Handle double-click to play track
 */
const handleTrackDoubleClick = (track) => {
  emit('track-play', track);
};

/**
 * Handle removing a track
 */
const handleRemoveTrack = async (data) => {
  try {
    // data contains { track, index, position }
    await removeTrack(data.track.id, data.position);
  } catch (err) {
    console.error('Failed to remove track from playlist:', err);
  }
};

/**
 * Handle reordering tracks
 */
const handleReorderTrack = async ({ track, oldIndex, newIndex }) => {
  try {
    await handleTrackReorderComposable(track, oldIndex, newIndex);
  } catch (err) {
    console.error('Failed to reorder track in playlist:', err);
  }
};

/**
 * Handle dropping a track from library
 */
const handleDropTrack = async ({ track, position }) => {
  try {
    await handleTrackDropComposable(track, position);
  } catch (err) {
    console.error('Failed to add track to playlist:', err);
  }
};

/**
 * Clear the entire playlist
 */
const handleClear = async () => {
  if (!confirm('Clear the entire playlist?')) return;
  
  try {
    await clearTracks();
  } catch (err) {
    console.error('Failed to clear playlist:', err);
  }
};

/**
 * Shuffle the playlist
 */
const handleShuffle = async () => {
  // TODO: Implement shuffle (reorder with randomized positions)
  console.log('Shuffle not yet implemented');
};

// Expose refresh method
defineExpose({
  refresh
});
</script>

<style scoped>
.playlist-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.playlist-header {
  padding: 15px;
  border-bottom: 1px solid #333;
  background: #222;
}

.playlist-header h3 {
  margin: 0 0 10px 0;
  font-size: 1.1em;
}

.playlist-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.playlist-controls button {
  padding: 6px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
}

.playlist-controls button:hover:not(:disabled) {
  background: #333;
  border-color: #555;
}

.playlist-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn:hover:not(:disabled) {
  background: #d32f2f !important;
  border-color: #d32f2f !important;
}

.playlist-stats {
  font-size: 0.85em;
  color: #999;
}

.empty-playlist {
  text-align: center;
}

.empty-hint {
  font-size: 0.9em;
  color: #666;
  margin-top: 8px;
}
</style>
