<template>
  <div class="manage-library-panel">
    <OrderedTrackList
      :tracks="tracks"
      :current-track="currentTrack"
      :allow-reorder="false"
      :allow-remove="false"
      :allow-drop="false"
      :show-position="false"
      :enable-double-click="true"
      :enable-single-click="false"
      @track-dblclick="handleTrackDoubleClick"
    >
      <template #header>
        <div class="library-header">
          <div class="header-row">
            <h3>Music Library</h3>
            <button @click="handleClose" class="close-btn">
              ✕ Close
            </button>
            <button
              v-if="addMusicUrl"
              @click="handleAddMusicClick"
              class="add-music-btn"
              title="Add new music"
            >
              ➕ Add
            </button>
            <div class="order-controls">
              <select v-model="orderBy" class="order-select" title="Sort by">
                <option value="title">Name</option>
                <option value="artist">Artist</option>
                <option value="album">Album</option>
                <option value="created_at">Date Added</option>
              </select>
              <button 
                @click="orderDir = orderDir === 'asc' ? 'desc' : 'asc'" 
                class="order-direction-btn"
                :title="orderDir === 'asc' ? 'Ascending' : 'Descending'"
              >
                {{ orderDir === 'asc' ? '↑' : '↓' }}
              </button>
            </div>
            <div class="library-search">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search tracks..."
                @input="handleSearch"
              />
            </div>
            <div class="library-stats">
              {{ trackCount }} tracks
              <span v-if="loading">• Loading...</span>
            </div>
          </div>
        </div>
      </template>

      <template #track="{ track }">
        <div class="track-row">
          <div 
            class="track-info"
            draggable="true"
            @dragstart="handleDragStart(track, $event)"
          >
            <div class="track-title" :title="track.title">
              {{ track.title || 'Unknown' }}
            </div>
            <div class="track-meta" :title="track.artist">
              {{ track.artist || 'Unknown Artist' }}
              <span v-if="track.duration"> • {{ formatDuration(track.duration) }}</span>
            </div>
          </div>
          <div class="track-actions">
            <button @click.stop="editTrack(track)" class="action-icon-btn" title="Edit metadata">
              ✏️
            </button>
            <button @click.stop="confirmDeleteTrack(track)" class="action-icon-btn delete" title="Delete track">
              🗑️
            </button>
          </div>
        </div>
      </template>

      <template #empty>
        <div class="empty-library">
          <p>No tracks in library</p>
          <p class="empty-hint">Add music files to the music directory</p>
        </div>
      </template>

      <template #footer>
        <div class="library-footer" v-if="hasMore">
          <button @click="loadMore" :disabled="loading">
            Load More
          </button>
        </div>
      </template>
    </OrderedTrackList>

    <!-- Add Music Dialog -->
    <SimpleDialog
      :show="showAddMusicDialog"
      title="Add Music"
      :message="addMusicText"
      :continue-url="addMusicUrl"
      @close="handleDialogClose"
      @continue="handleDialogClose"
    />

    <!-- Edit Track Dialog -->
    <div v-if="showEditDialog" class="dialog-overlay" @click.self="closeEditDialog">
      <div class="dialog edit-dialog">
        <h3>Edit Track Metadata</h3>
        
        <div class="form-group">
          <label>Title</label>
          <input
            v-model="editingTrackData.title"
            type="text"
            placeholder="Track title"
            ref="titleInput"
          />
        </div>

        <div class="form-group">
          <label>Artist</label>
          <input
            v-model="editingTrackData.artist"
            type="text"
            placeholder="Artist name"
          />
        </div>

        <div class="form-group">
          <label>Album</label>
          <input
            v-model="editingTrackData.album"
            type="text"
            placeholder="Album name"
          />
        </div>

        <div class="metadata-info">
          <div class="info-row" v-if="editingTrackData.filepath">
            <span class="label">Path:</span>
            <span class="value">{{ editingTrackData.filepath }}</span>
          </div>
          <div class="info-row">
            <span class="label">Duration:</span>
            <span class="value">{{ formatDuration(editingTrackData.duration) }}</span>
          </div>
          <div class="info-row">
            <span class="label">Format:</span>
            <span class="value">{{ editingTrackData.format || 'Unknown' }}</span>
          </div>
          <div class="info-row" v-if="editingTrackData.bitrate">
            <span class="label">Bitrate:</span>
            <span class="value">{{ editingTrackData.bitrate }} kbps</span>
          </div>
          <div class="info-row" v-if="editingTrackData.sample_rate">
            <span class="label">Sample Rate:</span>
            <span class="value">{{ editingTrackData.sample_rate }} Hz</span>
          </div>
          <div class="info-row" v-if="editingTrackData.file_size">
            <span class="label">File Size:</span>
            <span class="value">{{ formatFileSize(editingTrackData.file_size) }}</span>
          </div>
        </div>
        
        <div class="dialog-actions">
          <button @click="closeEditDialog" class="cancel-btn">Cancel</button>
          <button 
            @click="saveTrackMetadata" 
            :disabled="saving"
            class="save-btn"
          >
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="dialog">
        <h3>Delete Track?</h3>
        <p>Are you sure you want to delete "{{ trackToDelete?.title }}"?</p>
        <p class="warning">⚠️ This will remove the track from the library and all collections. The physical file will NOT be deleted.</p>
        
        <div class="dialog-actions">
          <button @click="showDeleteDialog = false" class="cancel-btn">Cancel</button>
          <button @click="deleteTrack" :disabled="deleting" class="delete-btn">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import SimpleDialog from './SimpleDialog.vue';
import { useTrackCollection } from '../composables/useTrackCollection';
import api from '../services/api';

const props = defineProps({
  currentTrack: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['track-play', 'close', 'refresh']);

// Ordering state
const orderBy = ref(localStorage.getItem('library-order-by') || 'title');
const orderDir = ref(localStorage.getItem('library-order-dir') || 'asc');

// Search functionality
const searchQuery = ref('');
const searchTimeout = ref(null);

// Use the collection composable for the library
const {
  tracks,
  loading,
  error,
  trackCount,
  loadCollection,
  refresh
} = useTrackCollection('library', {
  autoLoad: true,
  enableWebSocket: false,
  orderBy,
  orderDir,
  searchQuery
});

// Watch for order changes and reload
watch([orderBy, orderDir], () => {
  localStorage.setItem('library-order-by', orderBy.value);
  localStorage.setItem('library-order-dir', orderDir.value);
  loadCollection();
});

// Add Music Dialog
const showAddMusicDialog = ref(false);
const addMusicUrl = ref('');
const addMusicText = ref('');

// Edit Track Dialog
const showEditDialog = ref(false);
const editingTrack = ref(null);
const editingTrackData = ref({
  id: null,
  title: '',
  artist: '',
  album: '',
  filepath: '',
  duration: null,
  format: '',
  bitrate: null,
  sample_rate: null,
  file_size: null
});
const saving = ref(false);
const titleInput = ref(null);

// Delete Track Dialog
const showDeleteDialog = ref(false);
const trackToDelete = ref(null);
const deleting = ref(false);

// Load system config to get add music URL and text
const loadSystemInfo = async () => {
  try {
    const response = await api.getConfig();
    addMusicUrl.value = response.addMusicUrl || '';
    addMusicText.value = response.addMusicText || 'Click "Continue" to open the music source in a new tab.';
    console.log('Add Music config loaded:', { url: addMusicUrl.value, text: addMusicText.value });
  } catch (err) {
    console.error('Failed to load system config:', err);
  }
};

const handleAddMusicClick = () => {
  if (addMusicUrl.value) {
    showAddMusicDialog.value = true;
  }
};

const handleDialogClose = () => {
  showAddMusicDialog.value = false;
};

const handleSearch = () => {
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    loadCollection();
  }, 300);
};

// Pagination
const hasMore = computed(() => false); // TODO: Implement pagination

const loadMore = () => {
  // TODO: Implement load more
  console.log('Load more tracks');
};

/**
 * Handle double-click to play track
 */
const handleTrackDoubleClick = (track) => {
  emit('track-play', track);
};

/**
 * Handle drag start for dragging tracks to playlist/folders
 */
const handleDragStart = (track, event) => {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/json', JSON.stringify(track));
  event.dataTransfer.setData('text/plain', track.id);
};

/**
 * Open edit dialog for track
 */
const editTrack = async (track) => {
  try {
    // Load full track data including metadata
    const fullTrack = await api.getTrack(track.id);
    
    editingTrack.value = track;
    editingTrackData.value = {
      id: fullTrack.id,
      title: fullTrack.title || '',
      artist: fullTrack.artist || '',
      album: fullTrack.album || '',
      filepath: fullTrack.filepath || '',
      duration: fullTrack.duration,
      format: fullTrack.format,
      bitrate: fullTrack.bitrate,
      sample_rate: fullTrack.sample_rate,
      file_size: fullTrack.file_size
    };
    
    showEditDialog.value = true;
    
    nextTick(() => {
      titleInput.value?.focus();
    });
  } catch (err) {
    console.error('Failed to load track data:', err);
    alert('Failed to load track data');
  }
};

/**
 * Save track metadata
 */
const saveTrackMetadata = async () => {
  if (!editingTrackData.value.id) return;
  
  saving.value = true;
  
  try {
    const updates = {
      title: editingTrackData.value.title.trim(),
      artist: editingTrackData.value.artist.trim(),
      album: editingTrackData.value.album.trim()
    };
    
    await api.updateTrack(editingTrackData.value.id, updates);
    
    closeEditDialog();
    await refresh();
    emit('refresh');
  } catch (err) {
    console.error('Failed to update track:', err);
    alert('Failed to update track metadata');
  } finally {
    saving.value = false;
  }
};

/**
 * Close edit dialog
 */
const closeEditDialog = () => {
  showEditDialog.value = false;
  editingTrack.value = null;
  editingTrackData.value = {
    id: null,
    title: '',
    artist: '',
    album: '',
    filepath: '',
    duration: null,
    format: '',
    bitrate: null,
    sample_rate: null,
    file_size: null
  };
};

/**
 * Confirm track deletion
 */
const confirmDeleteTrack = (track) => {
  trackToDelete.value = track;
  showDeleteDialog.value = true;
};

/**
 * Delete track from database
 */
const deleteTrack = async () => {
  if (!trackToDelete.value) return;
  
  deleting.value = true;
  
  try {
    await api.deleteTrack(trackToDelete.value.id);
    
    showDeleteDialog.value = false;
    trackToDelete.value = null;
    
    await refresh();
    emit('refresh');
  } catch (err) {
    console.error('Failed to delete track:', err);
    alert('Failed to delete track');
  } finally {
    deleting.value = false;
  }
};

/**
 * Format duration
 */
const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format file size
 */
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Handle close button
 */
const handleClose = () => {
  emit('close');
};

// Load system info on mount
onMounted(() => {
  loadSystemInfo();
});

// Expose refresh method
defineExpose({
  refresh
});
</script>

<style scoped>
.manage-library-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.library-header {
  padding: 12px;
  border-bottom: 1px solid #333;
  background: #222;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.library-header h3 {
  margin: 0;
  font-size: 1em;
  white-space: nowrap;
}

.close-btn {
  padding: 6px 12px;
  background: #444;
  border: 1px solid #555;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
  white-space: nowrap;
}

.close-btn:hover {
  background: #555;
  border-color: #666;
}

.library-search {
  flex: 1;
}

.library-search input {
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 0.9em;
}

.library-search input:focus {
  outline: none;
  border-color: #42b983;
}

.add-music-btn {
  padding: 6px 12px;
  background: #4CAF50;
  border: 1px solid #4CAF50;
  border-radius: 4px;
  color: white;
  text-decoration: none;
  font-size: 0.9em;
  white-space: nowrap;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
}

.add-music-btn:hover {
  background: #45a049;
  border-color: #45a049;
}

.add-music-btn:active {
  transform: scale(0.98);
}

.order-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-select {
  padding: 6px 8px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.2s;
}

.order-select:hover {
  border-color: #4CAF50;
}

.order-select:focus {
  outline: none;
  border-color: #4CAF50;
}

.order-direction-btn {
  padding: 6px 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 1em;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.order-direction-btn:hover {
  background: #333;
  border-color: #4CAF50;
}

.order-direction-btn:active {
  background: #4CAF50;
}

.library-stats {
  font-size: 0.85em;
  color: #999;
  white-space: nowrap;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.track-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  cursor: grab;
}

.track-info:active {
  cursor: grabbing;
}

.track-title {
  font-size: 0.95em;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  font-size: 0.8em;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-actions {
  display: flex;
  gap: 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.track-row:hover .track-actions {
  opacity: 1;
}

.action-icon-btn {
  background: transparent;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9em;
}

.action-icon-btn:hover {
  background: #333;
  border-color: #4CAF50;
}

.action-icon-btn.delete:hover {
  background: #f44336;
  border-color: #f44336;
}

.empty-library {
  text-align: center;
}

.empty-hint {
  font-size: 0.9em;
  color: #666;
  margin-top: 8px;
}

.library-footer {
  padding: 10px;
  text-align: center;
  border-top: 1px solid #333;
}

.library-footer button {
  padding: 8px 16px;
  background: #42b983;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
}

.library-footer button:hover:not(:disabled) {
  background: #35a372;
}

.library-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 25px;
  min-width: 400px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog.edit-dialog {
  min-width: 500px;
}

.dialog h3 {
  margin: 0 0 20px 0;
  font-size: 1.2em;
  color: #e0e0e0;
}

.dialog p {
  margin: 10px 0;
  color: #e0e0e0;
}

.dialog .warning {
  color: #ff9800;
  font-size: 0.9em;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: #999;
  font-size: 0.9em;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 1em;
}

.form-group input:focus {
  outline: none;
  border-color: #4CAF50;
}

.metadata-info {
  background: #1a1a1a;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #333;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  color: #999;
  font-size: 0.85em;
}

.info-row .value {
  color: #e0e0e0;
  font-weight: 500;
  font-size: 0.85em;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-actions button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s;
  font-weight: 500;
}

.cancel-btn {
  background: #444;
  color: white;
}

.cancel-btn:hover {
  background: #555;
}

.save-btn {
  background: #4CAF50;
  color: white;
}

.save-btn:hover:not(:disabled) {
  background: #45a049;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn {
  background: #f44336;
  color: white;
}

.delete-btn:hover:not(:disabled) {
  background: #d32f2f;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
