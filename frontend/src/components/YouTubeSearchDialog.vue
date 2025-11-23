<template>
  <div v-if="show" class="dialog-overlay">
    <div class="dialog-box">
      <div class="dialog-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="close" title="Close">&times;</button>
      </div>
      
      <div class="dialog-body">
        <!-- Folder Selection -->
        <div class="folder-selection">
          <FolderSelector
            v-model="selectedFolderIds"
            :folders="folders"
            label="Add downloads to folders (optional, hold Ctrl/Cmd to select multiple)"
            :show-track-counts="false"
            :multiple="true"
          />
        </div>

        <!-- Search Input -->
        <div class="search-section">
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            placeholder="Search YouTube or paste a YouTube link..."
            @keyup.enter="handleSearch"
            class="search-input"
          />
          <button 
            @click="handleSearch" 
            :disabled="searching || !searchQuery.trim()"
            class="search-btn"
          >
            {{ searching ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="searching" class="loading">
          <div class="spinner"></div>
          <p>Searching YouTube...</p>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="error-message">
          <p>{{ error }}</p>
          <button @click="error = null" class="dismiss-btn">Dismiss</button>
        </div>

        <!-- Success Message -->
        <div v-if="successMessage" class="success-message">
          <p>{{ successMessage }}</p>
          <button @click="successMessage = null" class="dismiss-btn">Dismiss</button>
        </div>

        <!-- Search Results -->
        <div v-if="results.length > 0 && !searching" class="results-section">
          <h4>Results ({{ results.length }})</h4>
          <div class="results-list">
            <div 
              v-for="result in results" 
              :key="result.video_id"
              class="result-item"
              :class="{ 'already-downloaded': isAlreadyDownloaded(result.video_id) }"
            >
              <!-- Thumbnail -->
              <div class="result-thumbnail">
                <img 
                  v-if="result.thumbnail" 
                  :src="result.thumbnail" 
                  :alt="result.title"
                  @error="handleImageError"
                />
                <div v-else class="thumbnail-placeholder">🎵</div>
              </div>

              <!-- Info -->
              <div class="result-info">
                <div class="result-title" :title="result.title">
                  {{ result.title }}
                </div>
                <div class="result-meta">
                  <span v-if="result.channel" class="result-channel">
                    {{ result.channel }}
                  </span>
                  <span v-if="result.duration" class="result-duration">
                    • {{ formatDuration(result.duration) }}
                  </span>
                </div>
              </div>

              <!-- Action Button -->
              <div class="result-action">
                <button 
                  v-if="isAlreadyDownloaded(result.video_id)"
                  class="downloaded-badge"
                  disabled
                  title="This video has already been downloaded"
                >
                  ✓ Downloaded
                </button>
                <button 
                  v-else-if="isDownloading(result.video_id)"
                  class="downloading-btn"
                  disabled
                >
                  ⏳ Downloading...
                </button>
                <button 
                  v-else
                  @click="handleDownload(result)"
                  class="download-btn"
                  :disabled="downloadingIds.has(result.video_id)"
                >
                  ⬇ Download
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="!searching && !error && results.length === 0 && hasSearched" class="empty-state">
          <p>No results found for "{{ lastSearchQuery }}"</p>
          <p class="hint">Try different keywords or check your spelling</p>
        </div>

        <!-- Initial State -->
        <div v-if="!searching && !error && !hasSearched" class="initial-state">
          <p>🔍 Search YouTube or paste a link</p>
          <p class="hint">Enter keywords to search, or paste a YouTube URL to download directly</p>
        </div>
      </div>

      <div class="dialog-footer">
        <button @click="close" class="cancel-btn">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import api from '../services/api';
import websocket from '../services/websocket';
import FolderSelector from './FolderSelector.vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Search YouTube Music'
  },
  downloadedVideoIds: {
    type: Set,
    default: () => new Set()
  },
  folders: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'download-started']);

// State
const searchQuery = ref('');
const lastSearchQuery = ref('');
const results = ref([]);
const searching = ref(false);
const error = ref(null);
const successMessage = ref(null);
const hasSearched = ref(false);
const searchInput = ref(null);
const downloadingIds = ref(new Set());
const selectedFolderIds = ref([]);

/**
 * Check if input is a YouTube URL
 */
const isYouTubeUrl = (text) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /^[a-zA-Z0-9_-]{11}$/, // Direct video ID
  ];
  return patterns.some(pattern => pattern.test(text));
};

/**
 * Handle search or URL download
 */
const handleSearch = async () => {
  if (!searchQuery.value.trim()) {
    return;
  }

  const query = searchQuery.value.trim();
  
  // Check if it's a URL - if so, try to add it directly as a download
  if (isYouTubeUrl(query)) {
    await handleDirectUrl(query);
  } else {
    await handleYouTubeSearch(query);
  }
};

/**
 * Handle direct URL download
 */
const handleDirectUrl = async (url) => {
  searching.value = true;
  error.value = null;
  results.value = [];
  lastSearchQuery.value = url;

  try {
    // Add download job with optional folder IDs
    const response = await api.addDownloadJob(
      url, 
      selectedFolderIds.value && selectedFolderIds.value.length > 0 
        ? selectedFolderIds.value 
        : null
    );
    
    // Show success message
    successMessage.value = 'Download started! Check the download queue for progress.';
    emit('download-started', response.job);
    
    // Clear the input and close after a short delay
    setTimeout(() => {
      successMessage.value = null;
      close();
    }, 2000);
    
  } catch (err) {
    console.error('Direct download failed:', err);
    
    if (err.message && err.message.includes('already')) {
      error.value = 'This video is already downloaded or in the queue';
    } else if (err.message && err.message.includes('Invalid')) {
      error.value = 'Invalid YouTube URL. Please check the link and try again.';
    } else {
      error.value = 'Failed to start download. Please check the URL and try again.';
    }
  } finally {
    searching.value = false;
  }
};

/**
 * Handle YouTube search
 */
const handleYouTubeSearch = async (query) => {
  searching.value = true;
  error.value = null;
  results.value = [];
  lastSearchQuery.value = query;

  try {
    const response = await api.searchYouTube(query, 10);
    results.value = response.results || [];
    hasSearched.value = true;
    
    if (results.value.length === 0) {
      error.value = 'No results found. Try different keywords.';
    }
  } catch (err) {
    console.error('Search failed:', err);
    error.value = 'Search failed. Please try again.';
  } finally {
    searching.value = false;
  }
};

/**
 * Handle download button click
 */
const handleDownload = async (result) => {
  try {
    downloadingIds.value.add(result.video_id);
    
    const downloadData = {
      video_id: result.video_id,
      title: result.title,
      channel: result.channel,
      duration: result.duration,
      thumbnail: result.thumbnail,
      url: result.url,
    };
    
    // Add folder_ids if selected
    if (selectedFolderIds.value && selectedFolderIds.value.length > 0) {
      downloadData.folder_ids = selectedFolderIds.value;
    }
    
    const response = await api.addDownloadFromSearch(downloadData);

    successMessage.value = `"${result.title}" added to download queue`;
    emit('download-started', response.job);

    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = null;
    }, 3000);

  } catch (err) {
    console.error('Download failed:', err);
    downloadingIds.value.delete(result.video_id);
    
    if (err.message && err.message.includes('already')) {
      error.value = 'This video is already downloaded or in the queue';
    } else {
      error.value = 'Failed to start download. Please try again.';
    }
  }
};

/**
 * Check if video is already downloaded
 */
const isAlreadyDownloaded = (videoId) => {
  return props.downloadedVideoIds.has(videoId);
};

/**
 * Check if video is currently downloading
 */
const isDownloading = (videoId) => {
  return downloadingIds.value.has(videoId);
};

/**
 * Format duration from seconds to MM:SS
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
};

/**
 * Close dialog
 */
const close = () => {
  emit('close');
};

/**
 * Focus search input when dialog opens
 */
watch(() => props.show, async (newVal) => {
  if (newVal) {
    await nextTick();
    searchInput.value?.focus();
  } else {
    // Reset state when closing
    searchQuery.value = '';
    results.value = [];
    error.value = null;
    successMessage.value = null;
    hasSearched.value = false;
    downloadingIds.value.clear();
    selectedFolderIds.value = [];
  }
});

/**
 * Handle download job completed event
 */
const handleDownloadCompleted = (data) => {
  if (data.job && data.job.youtube_video_id) {
    downloadingIds.value.delete(data.job.youtube_video_id);
  }
};

/**
 * Handle download job failed event
 */
const handleDownloadFailed = (data) => {
  if (data.youtube_video_id) {
    downloadingIds.value.delete(data.youtube_video_id);
  }
};

// Listen to WebSocket events
onMounted(() => {
  websocket.on('download_job_completed', handleDownloadCompleted);
  websocket.on('download_job_failed', handleDownloadFailed);
});

onUnmounted(() => {
  websocket.off('download_job_completed', handleDownloadCompleted);
  websocket.off('download_job_failed', handleDownloadFailed);
});
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dialog-box {
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-width: 700px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 20px;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.2em;
  color: white;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 2em;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #444;
  color: white;
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.folder-selection {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #333;
}

.search-section {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  padding: 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 1em;
}

.search-input:focus {
  outline: none;
  border-color: #42b983;
}

.search-btn {
  padding: 12px 24px;
  background: #42b983;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 1em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.search-btn:hover:not(:disabled) {
  background: #35a372;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 40px 20px;
}

.spinner {
  border: 4px solid #333;
  border-top: 4px solid #42b983;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message,
.success-message {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.error-message {
  background: #ff4444;
  color: white;
}

.success-message {
  background: #4CAF50;
  color: white;
}

.dismiss-btn {
  background: rgba(0, 0, 0, 0.2);
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
}

.dismiss-btn:hover {
  background: rgba(0, 0, 0, 0.4);
}

.results-section h4 {
  margin: 0 0 15px 0;
  color: #999;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #1a1a1a;
  border-radius: 6px;
  border: 1px solid #333;
  transition: all 0.2s;
}

.result-item:hover {
  border-color: #42b983;
  background: #222;
}

.result-item.already-downloaded {
  opacity: 0.6;
  border-color: #666;
}

.result-thumbnail {
  width: 120px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  font-size: 2em;
  color: #666;
}

.result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.result-title {
  font-size: 1em;
  font-weight: 500;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: white;
}

.result-meta {
  font-size: 0.85em;
  color: #999;
}

.result-channel {
  color: #aaa;
}

.result-duration {
  color: #777;
}

.result-action {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.download-btn {
  padding: 8px 16px;
  background: #4CAF50;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
  white-space: nowrap;
}

.download-btn:hover:not(:disabled) {
  background: #45a049;
  transform: translateY(-1px);
}

.download-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.downloaded-badge {
  padding: 8px 16px;
  background: #666;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: not-allowed;
  font-size: 0.9em;
  opacity: 0.7;
  white-space: nowrap;
}

.downloading-btn {
  padding: 8px 16px;
  background: #FF9800;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: not-allowed;
  font-size: 0.9em;
  white-space: nowrap;
}

.empty-state,
.initial-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state p:first-child,
.initial-state p:first-child {
  font-size: 1.2em;
  margin-bottom: 10px;
}

.hint {
  font-size: 0.9em;
  color: #666;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #444;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.cancel-btn {
  padding: 10px 20px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.95em;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #555;
}

/* Scrollbar styling */
.dialog-body::-webkit-scrollbar {
  width: 8px;
}

.dialog-body::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.dialog-body::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.dialog-body::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
