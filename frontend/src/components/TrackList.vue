<template>
  <div class="track-list">
    <div class="list-header">
      <h3>Music Library</h3>
      <div class="search-bar">
        <input
          type="text"
          v-model="searchQuery"
          @input="onSearch"
          placeholder="Search tracks..."
          class="search-input"
        />
      </div>
    </div>

    <div v-if="loading" class="loading">Loading tracks...</div>
    
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else-if="tracks.length === 0" class="no-tracks">
      No tracks found. Add music files to the backend/test-music directory.
    </div>

    <div v-else class="tracks">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="track-item"
        :class="{ playing: isCurrentTrack(track.id) }"
        @click="playTrack(track)"
      >
        <div class="track-icon">
          <span v-if="isCurrentTrack(track.id)">▶️</span>
          <span v-else>🎵</span>
        </div>
        <div class="track-info">
          <div class="track-title">{{ track.title }}</div>
          <div class="track-meta">
            <span v-if="track.artist" class="artist">{{ track.artist }}</span>
            <span class="duration">{{ formatDuration(track.duration) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="pagination && pagination.pages > 1" class="pagination">
      <button
        @click="loadPage(pagination.page - 1)"
        :disabled="pagination.page === 1"
        class="page-btn"
      >
        Previous
      </button>
      <span class="page-info">
        Page {{ pagination.page }} of {{ pagination.pages }}
      </span>
      <button
        @click="loadPage(pagination.page + 1)"
        :disabled="pagination.page === pagination.pages"
        class="page-btn"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import api from '../services/api';

export default {
  name: 'TrackList',
  props: {
    currentTrackId: {
      type: String,
      default: null,
    },
  },
  emits: ['play-track'],
  setup(props, { emit }) {
    const tracks = ref([]);
    const pagination = ref(null);
    const searchQuery = ref('');
    const loading = ref(false);
    const error = ref(null);
    let searchTimeout = null;

    const formatDuration = (seconds) => {
      if (!seconds) return '-:--';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const isCurrentTrack = (trackId) => {
      return props.currentTrackId === trackId;
    };

    const loadTracks = async (params = {}) => {
      loading.value = true;
      error.value = null;

      try {
        const response = await api.getTracks(params);
        tracks.value = response.tracks;
        pagination.value = response.pagination;
      } catch (err) {
        error.value = 'Failed to load tracks';
        console.error('Load tracks error:', err);
      } finally {
        loading.value = false;
      }
    };

    const loadPage = (page) => {
      const params = { page };
      if (searchQuery.value) {
        params.search = searchQuery.value;
      }
      loadTracks(params);
    };

    const onSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (searchQuery.value) {
          loadTracks({ search: searchQuery.value });
        } else {
          loadTracks();
        }
      }, 300);
    };

    const playTrack = (track) => {
      emit('play-track', track);
    };

    const getCurrentTrackIndex = () => {
      return tracks.value.findIndex(track => track.id === props.currentTrackId);
    };

    const playNextTrack = () => {
      const currentIndex = getCurrentTrackIndex();
      if (currentIndex >= 0 && currentIndex < tracks.value.length - 1) {
        const nextTrack = tracks.value[currentIndex + 1];
        playTrack(nextTrack);
      }
    };

    const playPreviousTrack = () => {
      const currentIndex = getCurrentTrackIndex();
      if (currentIndex > 0) {
        const prevTrack = tracks.value[currentIndex - 1];
        playTrack(prevTrack);
      }
    };

    const hasNext = () => {
      const currentIndex = getCurrentTrackIndex();
      return currentIndex >= 0 && currentIndex < tracks.value.length - 1;
    };

    const hasPrevious = () => {
      const currentIndex = getCurrentTrackIndex();
      return currentIndex > 0;
    };

    onMounted(() => {
      loadTracks();
    });

    return {
      tracks,
      pagination,
      searchQuery,
      loading,
      error,
      formatDuration,
      isCurrentTrack,
      loadPage,
      onSearch,
      playTrack,
      playNextTrack,
      playPreviousTrack,
      hasNext,
      hasPrevious,
    };
  },
};
</script>

<style scoped>
.track-list {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
}

.list-header {
  margin-bottom: 20px;
}

.list-header h3 {
  margin: 0 0 15px 0;
  color: #e0e0e0;
  font-size: 1.3em;
}

.search-bar {
  margin-bottom: 15px;
}

.search-input {
  width: 100%;
  padding: 10px 15px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 1em;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #4CAF50;
}

.search-input::placeholder {
  color: #666;
}

.loading,
.error,
.no-tracks {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

.error {
  color: #f44336;
}

.tracks {
  max-height: 500px;
  overflow-y: auto;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px;
  margin-bottom: 8px;
  background: #1a1a1a;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.track-item:hover {
  background: #333;
  transform: translateX(5px);
}

.track-item.playing {
  background: #2d4a2e;
  border-left: 4px solid #4CAF50;
}

.track-icon {
  font-size: 1.5em;
  min-width: 30px;
  text-align: center;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  color: #e0e0e0;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  display: flex;
  gap: 10px;
  font-size: 0.85em;
  color: #999;
}

.artist {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #444;
}

.page-btn {
  padding: 8px 16px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: #333;
  border-color: #4CAF50;
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  color: #999;
}
</style>
