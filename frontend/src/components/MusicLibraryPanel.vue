<template>
  <div class="music-library-panel">
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
            <h3>Library</h3>
            <button
              @click="handleManageLibraryClick"
              class="manage-library-btn"
              title="Manage library and download music"
            >
              ⚙️ Manage
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
        <div 
          class="track-info"
          draggable="true"
          @dragstart="handleDragStart(track, $event)"
        >
          <!-- Thumbnail -->
          <div v-if="track.youtube_thumbnail" class="track-thumbnail">
            <img 
              :src="track.youtube_thumbnail" 
              :alt="track.title"
              @error="handleImageError"
            />
          </div>
          <div v-else class="track-thumbnail-placeholder">
            🎵
          </div>
          
          <div class="track-text">
            <div class="track-title" :title="track.title">
              {{ track.title || 'Unknown' }}
              <span v-if="track.youtube_video_id" class="youtube-badge" title="Downloaded from YouTube">
                ▶️
              </span>
            </div>
            <div class="track-meta" :title="track.artist">
              {{ track.artist || 'Unknown Artist' }}
              <span v-if="track.duration"> • {{ formatDuration(track.duration) }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #empty>
        <div class="empty-library">
          <p>No tracks in library</p>
          <p class="empty-hint">Add music files to the music directory and scan</p>
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

    <!-- YouTube Search Dialog -->
    <YouTubeSearchDialog
      :show="showYouTubeSearchDialog"
      :downloaded-video-ids="downloadedVideoIds"
      :folders="folders"
      @close="handleYouTubeSearchClose"
      @download-started="handleDownloadStarted"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import SimpleDialog from './SimpleDialog.vue';
import YouTubeSearchDialog from './YouTubeSearchDialog.vue';
import { useTrackCollection } from '../composables/useTrackCollection';
import api from '../services/api';
import websocket from '../services/websocket';

const props = defineProps({
  currentTrack: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['track-play', 'open-manage-library']);

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
const showYouTubeSearchDialog = ref(false);
const addMusicUrl = ref('');
const addMusicText = ref('');
const downloadedVideoIds = ref(new Set());
const folders = ref([]);

// Load folders for YouTube dialog
const loadFolders = async () => {
  try {
    const result = await api.getCollections('folder');
    folders.value = result;
  } catch (err) {
    console.error('Failed to load folders:', err);
  }
};

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

// Load downloaded video IDs
const loadDownloadedVideoIds = () => {
  const ids = new Set();
  tracks.value.forEach(track => {
    if (track.youtube_video_id) {
      ids.add(track.youtube_video_id);
    }
  });
  downloadedVideoIds.value = ids;
};

// Watch tracks for changes to update downloaded video IDs
watch(tracks, () => {
  loadDownloadedVideoIds();
}, { deep: true });

const handleManageLibraryClick = () => {
  emit('open-manage-library');
};

const handleAddMusicClick = () => {
  // Always open YouTube search dialog
  showYouTubeSearchDialog.value = true;
};

const handleDialogClose = () => {
  showAddMusicDialog.value = false;
};

const handleYouTubeSearchClose = () => {
  showYouTubeSearchDialog.value = false;
};

const handleDownloadStarted = (job) => {
  console.log('Download started:', job);
  // Could show a notification here
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
 * Format duration
 */
const formatDuration = (seconds) => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Handle image loading errors
 */
const handleImageError = (event) => {
  event.target.style.display = 'none';
  event.target.parentElement.classList.add('error');
};

/**
 * Handle track updated from WebSocket
 */
const handleTrackUpdated = (data) => {
  console.log('Track updated, refreshing library:', data);
  refresh();
};

/**
 * Handle track deleted from WebSocket
 */
const handleTrackDeleted = (data) => {
  console.log('Track deleted, refreshing library:', data);
  refresh();
};

// Load system info on mount
onMounted(() => {
  loadSystemInfo();
  loadDownloadedVideoIds();
  websocket.on('track_updated', handleTrackUpdated);
  websocket.on('track_deleted', handleTrackDeleted);
});

onUnmounted(() => {
  websocket.off('track_updated', handleTrackUpdated);
  websocket.off('track_deleted', handleTrackDeleted);
});

// Expose refresh method
defineExpose({
  refresh
});
</script>

<style scoped>
.music-library-panel {
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

.manage-library-btn {
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

.manage-library-btn:hover {
  background: #45a049;
  border-color: #45a049;
}

.manage-library-btn:active {
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

.track-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: grab;
}

.track-info:active {
  cursor: grabbing;
}

.track-thumbnail {
  width: 71px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #333;
}

.track-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.track-thumbnail.error,
.track-thumbnail-placeholder {
  width: 71px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 4px;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2em;
  color: #666;
}

.track-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.track-title {
  font-size: 0.95em;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.youtube-badge {
  font-size: 0.8em;
  opacity: 0.7;
  flex-shrink: 0;
}

.track-meta {
  font-size: 0.8em;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
