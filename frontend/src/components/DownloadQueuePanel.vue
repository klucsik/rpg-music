<template>
  <div class="download-queue-panel">
    <div class="queue-header">
      <h3>Downloads</h3>
      <div class="queue-stats">
        <span v-if="queueStatus.downloading > 0" class="status-badge downloading">
          ⏳ {{ queueStatus.downloading }} downloading
        </span>
        <span v-if="queueStatus.pending > 0" class="status-badge pending">
          ⏸ {{ queueStatus.pending }} pending
        </span>
        <span v-if="queueStatus.failed > 0" class="status-badge failed">
          ❌ {{ queueStatus.failed }} failed
        </span>
      </div>
    </div>

    <div class="queue-body">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <p>Loading downloads...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="jobs.length === 0" class="empty-state">
        <p>📥 No downloads</p>
        <p class="hint">Search for music to start downloading</p>
      </div>

      <!-- Jobs List -->
      <div v-else class="jobs-list">
        <div 
          v-for="job in jobs" 
          :key="job.id"
          class="job-item"
          :class="`status-${job.status}`"
        >
          <!-- Thumbnail -->
          <div class="job-thumbnail">
            <img 
              v-if="job.youtube_thumbnail" 
              :src="job.youtube_thumbnail" 
              :alt="job.youtube_title"
              @error="handleImageError"
            />
            <div v-else class="thumbnail-placeholder">🎵</div>
          </div>

          <!-- Info -->
          <div class="job-info">
            <div class="job-title" :title="job.youtube_title || job.youtube_url">
              {{ job.youtube_title || 'Unknown Title' }}
            </div>
            <div class="job-meta">
              <span v-if="job.youtube_channel" class="job-channel">
                {{ job.youtube_channel }}
              </span>
              <span v-if="job.youtube_duration" class="job-duration">
                • {{ formatDuration(job.youtube_duration) }}
              </span>
            </div>
            
            <!-- Status -->
            <div class="job-status">
              <span v-if="job.status === 'pending'" class="status-text pending">
                ⏸ Pending
              </span>
              <span v-else-if="job.status === 'downloading'" class="status-text downloading">
                ⏳ Downloading {{ job.progress_percent }}%
              </span>
              <span v-else-if="job.status === 'completed'" class="status-text completed">
                ✓ Completed
              </span>
              <span v-else-if="job.status === 'failed'" class="status-text failed">
                ❌ Failed: {{ job.error_message || 'Unknown error' }}
              </span>
            </div>

            <!-- Progress Bar -->
            <div v-if="job.status === 'downloading'" class="progress-bar">
              <div class="progress-fill" :style="{ width: `${job.progress_percent}%` }"></div>
            </div>
          </div>

          <!-- Actions -->
          <div class="job-actions">
            <button 
              v-if="job.status === 'pending'"
              @click="cancelJob(job.id)"
              class="action-btn cancel-btn"
              title="Cancel download"
            >
              ✕
            </button>
            <button 
              v-if="job.status === 'failed'"
              @click="retryJob(job.id)"
              class="action-btn retry-btn"
              title="Retry download"
            >
              ↻
            </button>
            <button 
              v-if="job.status === 'completed' || job.status === 'failed'"
              @click="deleteJob(job.id)"
              class="action-btn delete-btn"
              title="Remove from list"
            >
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="queue-footer">
      <button @click="refresh" class="refresh-btn" :disabled="loading">
        ↻ Refresh
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import api from '../services/api';
import websocket from '../services/websocket';

const emit = defineEmits(['download-completed']);

// State
const jobs = ref([]);
const loading = ref(false);
const queueStatus = ref({
  total: 0,
  pending: 0,
  downloading: 0,
  completed: 0,
  failed: 0,
});

/**
 * Load download jobs
 */
const loadJobs = async () => {
  loading.value = true;
  try {
    const response = await api.getDownloadJobs(100, 0);
    jobs.value = response.jobs || [];
    queueStatus.value = response.queueStatus || queueStatus.value;
  } catch (error) {
    console.error('Failed to load download jobs:', error);
  } finally {
    loading.value = false;
  }
};

/**
 * Refresh jobs list
 */
const refresh = () => {
  loadJobs();
};

/**
 * Cancel a pending job
 */
const cancelJob = async (jobId) => {
  try {
    await api.cancelDownloadJob(jobId);
    // Job will be removed via WebSocket event
  } catch (error) {
    console.error('Failed to cancel job:', error);
    alert('Failed to cancel download: ' + error.message);
  }
};

/**
 * Retry a failed job
 */
const retryJob = async (jobId) => {
  try {
    await api.retryDownloadJob(jobId);
    // Job will be updated via WebSocket event
  } catch (error) {
    console.error('Failed to retry job:', error);
    alert('Failed to retry download: ' + error.message);
  }
};

/**
 * Delete a completed/failed job
 */
const deleteJob = async (jobId) => {
  try {
    await api.deleteDownloadJob(jobId);
    // Job will be removed via WebSocket event
  } catch (error) {
    console.error('Failed to delete job:', error);
    alert('Failed to delete job: ' + error.message);
  }
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
 * Handle WebSocket events
 */
const handleJobAdded = (job) => {
  // Add to beginning of list
  jobs.value.unshift(job);
  updateQueueStatus();
};

const handleJobStarted = (job) => {
  const index = jobs.value.findIndex(j => j.id === job.id);
  if (index !== -1) {
    jobs.value[index] = job;
  }
  updateQueueStatus();
};

const handleJobProgress = (job) => {
  const index = jobs.value.findIndex(j => j.id === job.id);
  if (index !== -1) {
    jobs.value[index] = job;
  }
};

const handleJobCompleted = (data) => {
  const index = jobs.value.findIndex(j => j.id === data.job.id);
  if (index !== -1) {
    jobs.value[index] = data.job;
  }
  updateQueueStatus();
  emit('download-completed', data.track);
};

const handleJobFailed = (job) => {
  const index = jobs.value.findIndex(j => j.id === job.id);
  if (index !== -1) {
    jobs.value[index] = job;
  }
  updateQueueStatus();
};

const handleQueueUpdated = (status) => {
  queueStatus.value = status;
  // Refresh full list to ensure consistency
  loadJobs();
};

const updateQueueStatus = () => {
  queueStatus.value = {
    total: jobs.value.length,
    pending: jobs.value.filter(j => j.status === 'pending').length,
    downloading: jobs.value.filter(j => j.status === 'downloading').length,
    completed: jobs.value.filter(j => j.status === 'completed').length,
    failed: jobs.value.filter(j => j.status === 'failed').length,
  };
};

// Lifecycle
onMounted(() => {
  loadJobs();
  
  // Listen to WebSocket events
  websocket.on('download_job_added', handleJobAdded);
  websocket.on('download_job_started', handleJobStarted);
  websocket.on('download_job_progress', handleJobProgress);
  websocket.on('download_job_completed', handleJobCompleted);
  websocket.on('download_job_failed', handleJobFailed);
  websocket.on('download_queue_updated', handleQueueUpdated);
});

onUnmounted(() => {
  websocket.off('download_job_added', handleJobAdded);
  websocket.off('download_job_started', handleJobStarted);
  websocket.off('download_job_progress', handleJobProgress);
  websocket.off('download_job_completed', handleJobCompleted);
  websocket.off('download_job_failed', handleJobFailed);
  websocket.off('download_queue_updated', handleQueueUpdated);
});

// Expose refresh method
defineExpose({
  refresh,
  loadJobs,
});
</script>

<style scoped>
.download-queue-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.queue-header {
  padding: 12px;
  border-bottom: 1px solid #333;
  background: #222;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.queue-header h3 {
  margin: 0;
  font-size: 1em;
}

.queue-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75em;
  font-weight: 500;
  white-space: nowrap;
}

.status-badge.downloading {
  background: #FF9800;
  color: white;
}

.status-badge.pending {
  background: #2196F3;
  color: white;
}

.status-badge.failed {
  background: #f44336;
  color: white;
}

.queue-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.empty-state p:first-child {
  font-size: 2em;
  margin-bottom: 10px;
}

.hint {
  font-size: 0.9em;
  color: #666;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.job-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #2a2a2a;
  border-radius: 6px;
  border: 1px solid #333;
  transition: all 0.2s;
}

.job-item:hover {
  border-color: #444;
}

.job-item.status-downloading {
  border-color: #FF9800;
}

.job-item.status-failed {
  border-color: #f44336;
}

.job-item.status-completed {
  opacity: 0.7;
}

.job-thumbnail {
  width: 80px;
  height: 45px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.job-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  font-size: 1.5em;
  color: #666;
}

.job-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.job-title {
  font-size: 0.95em;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: white;
}

.job-meta {
  font-size: 0.8em;
  color: #999;
}

.job-channel {
  color: #aaa;
}

.job-duration {
  color: #777;
}

.job-status {
  font-size: 0.85em;
  margin-top: 2px;
}

.status-text {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85em;
}

.status-text.pending {
  color: #2196F3;
}

.status-text.downloading {
  color: #FF9800;
}

.status-text.completed {
  color: #4CAF50;
}

.status-text.failed {
  color: #f44336;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF9800, #FFB347);
  transition: width 0.3s ease;
}

.job-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.1em;
  transition: all 0.2s;
}

.cancel-btn {
  background: #666;
  color: white;
}

.cancel-btn:hover {
  background: #777;
}

.retry-btn {
  background: #FF9800;
  color: white;
}

.retry-btn:hover {
  background: #FFB347;
}

.delete-btn {
  background: #666;
  color: white;
}

.delete-btn:hover {
  background: #f44336;
}

.queue-footer {
  padding: 10px 12px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: center;
}

.refresh-btn {
  padding: 8px 16px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #555;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Scrollbar styling */
.queue-body::-webkit-scrollbar {
  width: 6px;
}

.queue-body::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.queue-body::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.queue-body::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
