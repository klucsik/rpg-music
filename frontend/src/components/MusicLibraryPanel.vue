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
            <h3>Music Library</h3>
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
          <div class="track-title" :title="track.title">
            {{ track.title || 'Unknown' }}
          </div>
          <div class="track-meta" :title="track.artist">
            {{ track.artist || 'Unknown Artist' }}
            <span v-if="track.duration"> • {{ formatDuration(track.duration) }}</span>
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
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import { useTrackCollection } from '../composables/useTrackCollection';

const props = defineProps({
  currentTrack: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['track-play']);

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
  enableWebSocket: false
});

// Search functionality
const searchQuery = ref('');
const searchTimeout = ref(null);

const handleSearch = () => {
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    // TODO: Implement search API call
    console.log('Search:', searchQuery.value);
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

.library-stats {
  font-size: 0.85em;
  color: #999;
  white-space: nowrap;
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
