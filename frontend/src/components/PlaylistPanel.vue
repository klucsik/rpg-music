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
              🔀 Shuffle
            </button>
            <button
              @click="showSaveDialog = true"
              :disabled="isEmpty || loading"
              class="save-btn"
              title="Save to folder"
            >
              💾 Save to Folder
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

    <!-- Save to Folder Dialog -->
    <div v-if="showSaveDialog" class="dialog-overlay" @click.self="showSaveDialog = false">
      <div class="dialog">
        <h3>Save Playlist to Folder</h3>
        <p>Select a folder to save the current playlist to. This will replace the folder's current contents.</p>
        
        <div class="form-group">
          <label>Select Folder</label>
          <select v-model="selectedFolderId" required>
            <option :value="null" disabled>-- Choose a folder --</option>
            <option v-for="folder in folders" :key="folder.id" :value="folder.id">
              {{ folder.name }}
            </option>
          </select>
        </div>

        <div class="dialog-actions">
          <button @click="showSaveDialog = false" class="cancel-btn">Cancel</button>
          <button 
            @click="saveToFolder" 
            :disabled="!selectedFolderId || savingToFolder"
            class="save-confirm-btn"
          >
            {{ savingToFolder ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import { useTrackCollection } from '../composables/useTrackCollection';
import api from '../services/api';

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

// State for save to folder dialog
const showSaveDialog = ref(false);
const folders = ref([]);
const selectedFolderId = ref(null);
const savingToFolder = ref(false);

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
  if (isEmpty.value) return;
  
  try {
    // Create shuffled array of track IDs
    const shuffled = [...tracks.value]
      .map((track, index) => ({ track, random: Math.random(), originalIndex: index }))
      .sort((a, b) => a.random - b.random);
    
    // Clear and re-add in new order
    await clearTracks();
    
    for (const item of shuffled) {
      await api.addTrackToCollection('current-playlist', item.track.id);
    }
    
    await refresh();
  } catch (err) {
    console.error('Failed to shuffle playlist:', err);
  }
};

/**
 * Load folders for save dialog
 */
const loadFolders = async () => {
  try {
    const data = await api.getCollections('folder');
    folders.value = data || [];
  } catch (err) {
    console.error('Failed to load folders:', err);
  }
};

/**
 * Save playlist to folder
 */
const saveToFolder = async () => {
  if (!selectedFolderId.value || isEmpty.value) return;
  
  savingToFolder.value = true;
  try {
    // Clear folder first
    await api.clearCollectionTracks(selectedFolderId.value);
    
    // Add all tracks from playlist
    for (const track of tracks.value) {
      await api.addTrackToCollection(selectedFolderId.value, track.id);
    }
    
    showSaveDialog.value = false;
    selectedFolderId.value = null;
  } catch (err) {
    console.error('Failed to save playlist to folder:', err);
    alert('Failed to save playlist to folder');
  } finally {
    savingToFolder.value = false;
  }
};

// Load folders when dialog opens
watch(showSaveDialog, (show) => {
  if (show) {
    loadFolders();
  }
});

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

.save-btn {
  background: #1976d2 !important;
  border-color: #1976d2 !important;
}

.save-btn:hover:not(:disabled) {
  background: #1565c0 !important;
  border-color: #1565c0 !important;
}

/* Dialog Styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog h3 {
  margin: 0 0 12px 0;
  font-size: 1.3em;
}

.dialog p {
  margin: 0 0 20px 0;
  color: #aaa;
  font-size: 0.95em;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #ccc;
  font-size: 0.95em;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 1em;
}

.form-group select:focus,
.form-group input:focus {
  outline: none;
  border-color: #1976d2;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-actions button {
  padding: 10px 20px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 1em;
  transition: all 0.2s;
}

.cancel-btn {
  background: #444;
  color: white;
}

.cancel-btn:hover {
  background: #555;
}

.save-confirm-btn {
  background: #1976d2;
  color: white;
}

.save-confirm-btn:hover:not(:disabled) {
  background: #1565c0;
}

.save-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
