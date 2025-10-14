<template>
  <div class="audio-player">
    <!-- Audio Unlock Overlay -->
    <div v-if="needsAudioUnlock" class="audio-unlock-overlay" @click="unlockAudio">
      <div class="unlock-content">
        <div class="unlock-icon">🔊</div>
        <h3>Click to Enable Audio</h3>
        <p>Browser requires user interaction to play audio</p>
      </div>
    </div>

    <div class="now-playing">
      <div class="track-info">
        <h2 v-if="currentTrack">{{ currentTrack.title }}</h2>
        <h2 v-else class="no-track">No track playing</h2>
        <p v-if="currentTrack" class="artist">{{ currentTrack.artist || 'Unknown Artist' }}</p>
      </div>
      <div class="sync-status" :class="{ connected: isConnected, disconnected: !isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Connected' : 'Disconnected' }}
        <span v-if="isConnected" class="client-id"></span>
      </div>
    </div>

    <audio
      ref="audioElement"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @error="onError"
    ></audio>

    <div class="player-controls">
      <div class="progress-bar" @click="seekToPosition">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        <div class="progress-handle" :style="{ left: progressPercent + '%' }"></div>
      </div>

      <div class="time-display">
        <span class="current-time">{{ formatTime(currentTime) }}</span>
        <span class="duration">{{ formatTime(duration) }}</span>
      </div>

      <div class="control-buttons">
        <button 
          @click="handlePreviousClick" 
          class="control-btn"
          :disabled="!hasPrevious"
          title="Previous track"
        >
          ⏮️
        </button>
        <button 
          @click="handlePlayPauseClick" 
          class="control-btn play-pause"
          :disabled="!currentTrack"
          :title="isPlaying ? 'Pause' : 'Resume'"
        >
          {{ isPlaying ? '⏸️' : '▶️' }}
        </button>
        <button 
          @click="handleNextClick" 
          class="control-btn"
          :disabled="!hasNext"
          title="Next track"
        >
          ⏭️
        </button>
        <button 
          @click="toggleRepeat" 
          class="control-btn"
          :class="{ active: repeatMode }"
          :title="repeatMode ? 'Repeat: On' : 'Repeat: Off'"
        >
          🔁
        </button>
      </div>

      <div class="drift-info" v-if="showDrift && expectedPosition !== null">
        <span>Expected: {{ expectedPosition.toFixed(1) }}s</span>
        <span>Actual: {{ currentTime.toFixed(1) }}s</span>
        <span :class="{ 'drift-warning': drift > 5 }">
          Drift: {{ drift.toFixed(1) }}s
        </span>
      </div>
    </div>

    <div class="volume-control">
      <span class="volume-icon">🔊</span>
      <input
        type="range"
        min="0"
        max="100"
        :value="volume * 100"
        @input="onVolumeChange"
        class="volume-slider"
      />
      <span class="volume-value">{{ Math.round(volume * 100) }}%</span>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import websocket from '../services/websocket';
import api from '../services/api';

export default {
  name: 'AudioPlayer',
  props: {
    currentTrackId: {
      type: String,
      default: null,
    },
    hasNext: {
      type: Boolean,
      default: false,
    },
    hasPrevious: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['next-track', 'previous-track'],
  setup(props, { emit }) {
    const audioElement = ref(null);
    const currentTrack = ref(null);
    const currentTime = ref(0);
    const duration = ref(0);
    const volume = ref(0.7);
    const isConnected = ref(false);
    const clientId = ref(null);
    const expectedPosition = ref(null);
    const showDrift = ref(false);
    const isPlaying = ref(false);
    const repeatMode = ref(false);
    const needsAudioUnlock = ref(false);
    const audioUnlocked = ref(false);

    const progressPercent = computed(() => {
      if (duration.value === 0) return 0;
      return (currentTime.value / duration.value) * 100;
    });

    const drift = computed(() => {
      if (expectedPosition.value === null) return 0;
      return Math.abs(expectedPosition.value - currentTime.value);
    });

    // Format time as MM:SS
    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Audio element event handlers
    const onTimeUpdate = () => {
      if (audioElement.value) {
        currentTime.value = audioElement.value.currentTime;
      }
    };

    const onLoadedMetadata = () => {
      if (audioElement.value) {
        duration.value = audioElement.value.duration;
      }
    };

    const onPlay = () => {
      console.log('Audio playing');
      isPlaying.value = true;
    };

    const onPause = () => {
      console.log('Audio paused');
      isPlaying.value = false;
    };

    const onEnded = () => {
      console.log('Audio ended');
      isPlaying.value = false;
      
      // Report track ended to server - let server handle autoplay
      websocket.reportTrackEnded();
    };

    const onError = (event) => {
      console.error('Audio error:', event);
      websocket.reportError('Audio playback error', currentTrack.value?.id);
    };

    // Control button handlers
    const handlePlayPauseClick = async () => {
      try {
        if (isPlaying.value) {
          await api.pause();
        } else {
          await api.resume();
        }
      } catch (error) {
        console.error('Play/pause failed:', error);
      }
    };

    const handleStopClick = async () => {
      try {
        await api.stop();
      } catch (error) {
        console.error('Stop failed:', error);
      }
    };

    const handleNextClick = () => {
      emit('next-track');
    };

    const handlePreviousClick = () => {
      emit('previous-track');
    };

    const toggleRepeat = () => {
      repeatMode.value = !repeatMode.value;
      console.log('Repeat mode:', repeatMode.value ? 'ON' : 'OFF');
    };

    // Unlock audio context (handle browser autoplay policy)
    const unlockAudio = async () => {
      if (!audioElement.value) return;
      
      try {
        // Try to play and immediately pause to unlock audio context
        audioElement.value.muted = true;
        await audioElement.value.play();
        audioElement.value.pause();
        audioElement.value.muted = false;
        audioElement.value.currentTime = 0;
        
        audioUnlocked.value = true;
        needsAudioUnlock.value = false;
        console.log('✅ Audio context unlocked');
        
        // Request current state after unlock
        websocket.requestState();
      } catch (error) {
        console.warn('Failed to unlock audio:', error);
      }
    };

    // Seek to position on progress bar click
    const seekToPosition = async (event) => {
      if (!audioElement.value || !duration.value) return;
      
      const rect = event.currentTarget.getBoundingClientRect();
      const percent = (event.clientX - rect.left) / rect.width;
      const newTime = percent * duration.value;
      
      // Call API to sync seek across all clients
      try {
        await api.seek(newTime);
        console.log('Seek request sent to server:', newTime);
      } catch (error) {
        console.error('Failed to seek:', error);
        // Fallback to local seek if API fails
        audioElement.value.currentTime = newTime;
      }
    };

    // Volume change
    const onVolumeChange = (event) => {
      const newVolume = parseFloat(event.target.value) / 100;
      volume.value = newVolume;
      if (audioElement.value) {
        audioElement.value.volume = newVolume;
      }
    };

    // WebSocket event handlers
    const handleStateSync = (data) => {
      console.log('State sync:', data);
      
      if (data.currentTrack) {
        currentTrack.value = data.currentTrack;
        const audioUrl = api.getAudioUrl(data.currentTrack.id);
        
        if (audioElement.value.src !== audioUrl) {
          audioElement.value.src = audioUrl;
        }
        
        audioElement.value.currentTime = data.position;
        
        if (data.playbackState === 'playing') {
          audioElement.value.play().catch(e => {
            if (e.name === 'NotAllowedError') {
              console.warn('⚠️ Autoplay blocked - user interaction required');
              needsAudioUnlock.value = true;
            } else {
              console.warn('Autoplay blocked:', e);
              websocket.reportError('Autoplay blocked');
            }
          });
        } else if (data.playbackState === 'paused') {
          audioElement.value.pause();
        }
      }
      
      volume.value = data.volume;
      if (audioElement.value) {
        audioElement.value.volume = data.volume;
      }
    };

    const handlePlayTrack = (data) => {
      console.log('Play track:', data);
      
      // Set current track info
      currentTrack.value = {
        id: data.trackId,
        title: data.title,
        artist: data.artist,
        album: data.album,
        duration: data.duration,
      };
      
      const audioUrl = api.getAudioUrl(data.trackId);
      
      // Only reload if URL changed
      if (audioElement.value.src !== audioUrl) {
        audioElement.value.src = audioUrl;
        audioElement.value.load();
      }
      
      audioElement.value.currentTime = data.startPosition;
      
      // Schedule playback
      const serverTime = websocket.getServerTime();
      const timeUntilPlay = data.scheduledStartTime - serverTime;
      
      console.log(`Scheduled to play in ${timeUntilPlay}ms at position ${data.startPosition}s`);
      
      if (timeUntilPlay > 0) {
        setTimeout(() => {
          audioElement.value.play().catch(e => {
            if (e.name === 'NotAllowedError') {
              console.warn('⚠️ Play failed - user interaction required');
              needsAudioUnlock.value = true;
            } else {
              console.warn('Play failed:', e);
              websocket.reportError('Play failed: ' + e.message);
            }
          });
        }, timeUntilPlay);
      } else {
        // If we're already past the scheduled time, play immediately
        console.warn('Already past scheduled time, playing immediately');
        audioElement.value.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.warn('⚠️ Play failed - user interaction required');
            needsAudioUnlock.value = true;
          } else {
            console.warn('Play failed:', e);
            websocket.reportError('Play failed: ' + e.message);
          }
        });
      }
    };

    const handlePause = (data) => {
      console.log('Pause:', data);
      audioElement.value.pause();
      audioElement.value.currentTime = data.position;
    };

    const handleResume = (data) => {
      console.log('Resume:', data);
      audioElement.value.currentTime = data.position;
      
      const serverTime = websocket.getServerTime();
      const timeUntilPlay = data.scheduledStartTime - serverTime;
      
      if (timeUntilPlay > 0) {
        setTimeout(() => {
          audioElement.value.play().catch(e => {
            if (e.name === 'NotAllowedError') {
              console.warn('⚠️ Resume failed - user interaction required');
              needsAudioUnlock.value = true;
            } else {
              console.warn('Play failed:', e);
            }
          });
        }, timeUntilPlay);
      } else {
        audioElement.value.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.warn('⚠️ Resume failed - user interaction required');
            needsAudioUnlock.value = true;
          } else {
            console.warn('Play failed:', e);
          }
        });
      }
    };

    const handleSeek = (data) => {
      console.log('Seek:', data);
      audioElement.value.currentTime = data.position;
      
      if (data.scheduledStartTime) {
        const serverTime = websocket.getServerTime();
        const timeUntilPlay = data.scheduledStartTime - serverTime;
        
        if (timeUntilPlay > 0) {
          setTimeout(() => {
            audioElement.value.play().catch(e => console.warn('Play failed:', e));
          }, timeUntilPlay);
        }
      }
    };

    const handleStop = () => {
      console.log('Stop');
      audioElement.value.pause();
      audioElement.value.currentTime = 0;
    };

    const handleVolumeChange = (data) => {
      console.log('Volume change:', data);
      volume.value = data.volume;
      if (audioElement.value) {
        audioElement.value.volume = data.volume;
      }
    };

    const handlePositionCheck = (data) => {
      expectedPosition.value = data.expectedPosition;
      showDrift.value = true;
      
      const currentDrift = Math.abs(data.expectedPosition - currentTime.value);
      
      if (currentDrift > data.maxDrift && !audioElement.value.paused) {
        console.log(`Correcting drift: ${currentDrift.toFixed(2)}s > ${data.maxDrift}s`);
        audioElement.value.currentTime = data.expectedPosition;
      }
      
      // Hide drift info after a few seconds
      setTimeout(() => {
        showDrift.value = false;
      }, 5000);
    };

    const handleConnected = (data) => {
      isConnected.value = true;
      clientId.value = data.clientId;
    };

    const handleDisconnected = () => {
      isConnected.value = false;
      clientId.value = null;
    };

    // Lifecycle
    onMounted(() => {
      // Connect to WebSocket
      websocket.connect();
      
      // Set up event listeners
      websocket.on('connected', handleConnected);
      websocket.on('disconnected', handleDisconnected);
      websocket.on('state_sync', handleStateSync);
      websocket.on('play_track', handlePlayTrack);
      websocket.on('pause', handlePause);
      websocket.on('resume', handleResume);
      websocket.on('seek', handleSeek);
      websocket.on('stop', handleStop);
      websocket.on('volume_change', handleVolumeChange);
      websocket.on('position_check', handlePositionCheck);
      
      // Set initial volume
      if (audioElement.value) {
        audioElement.value.volume = volume.value;
      }
    });

    onUnmounted(() => {
      // Clean up event listeners
      websocket.off('connected', handleConnected);
      websocket.off('disconnected', handleDisconnected);
      websocket.off('state_sync', handleStateSync);
      websocket.off('play_track', handlePlayTrack);
      websocket.off('pause', handlePause);
      websocket.off('resume', handleResume);
      websocket.off('seek', handleSeek);
      websocket.off('stop', handleStop);
      websocket.off('volume_change', handleVolumeChange);
      websocket.off('position_check', handlePositionCheck);
    });

    return {
      audioElement,
      currentTrack,
      currentTime,
      duration,
      volume,
      isConnected,
      clientId,
      expectedPosition,
      showDrift,
      isPlaying,
      repeatMode,
      needsAudioUnlock,
      progressPercent,
      drift,
      formatTime,
      onTimeUpdate,
      onLoadedMetadata,
      onPlay,
      onPause,
      onEnded,
      handlePlayPauseClick,
      handleStopClick,
      handleNextClick,
      handlePreviousClick,
      toggleRepeat,
      unlockAudio,
      onError,
      seekToPosition,
      onVolumeChange,
    };
  },
};
</script>

<style scoped>
.audio-player {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  position: relative;
}

.now-playing {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.track-info h2 {
  margin: 0;
  font-size: 1.5em;
  color: #e0e0e0;
}

.track-info h2.no-track {
  color: #666;
}

.track-info .artist {
  margin: 5px 0 0 0;
  color: #999;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #1a1a1a;
  font-size: 0.9em;
}

.sync-status.connected {
  color: #4CAF50;
}

.sync-status.disconnected {
  color: #f44336;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.client-id {
  color: #666;
  font-size: 0.85em;
}

audio {
  display: none;
}

.player-controls {
  margin: 20px 0;
}

.progress-bar {
  height: 8px;
  background: #1a1a1a;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: #4CAF50;
  border-radius: 4px;
  transition: width 0.1s linear;
}

.progress-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  background: #4CAF50;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.time-display {
  display: flex;
  justify-content: space-between;
  color: #999;
  font-size: 0.9em;
  margin-bottom: 15px;
}

.control-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
}

.control-btn {
  padding: 12px 20px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 1.2em;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 50px;
}

.control-btn:hover:not(:disabled) {
  background: #333;
  border-color: #4CAF50;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(76, 175, 80, 0.2);
}

.control-btn:active:not(:disabled) {
  transform: translateY(0);
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.control-btn.play-pause {
  background: #4CAF50;
  border-color: #4CAF50;
  padding: 12px 24px;
  font-size: 1.3em;
}

.control-btn.play-pause:hover:not(:disabled) {
  background: #45a049;
  border-color: #45a049;
}

.control-btn.active {
  background: #4CAF50;
  border-color: #4CAF50;
}

.drift-info {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-top: 10px;
  padding: 8px;
  background: #1a1a1a;
  border-radius: 6px;
  font-size: 0.85em;
  color: #666;
}

.drift-warning {
  color: #ff9800 !important;
  font-weight: bold;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 15px;
}

.volume-icon {
  font-size: 1.2em;
}

.volume-slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #1a1a1a;
  outline: none;
  -webkit-appearance: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  border: none;
}

.volume-value {
  color: #999;
  font-size: 0.9em;
  min-width: 40px;
  text-align: right;
}

/* Audio Unlock Overlay */
.audio-unlock-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease;
}

.unlock-content {
  text-align: center;
  padding: 40px;
}

.unlock-icon {
  font-size: 4em;
  margin-bottom: 20px;
  animation: pulse 2s infinite;
}

.unlock-content h3 {
  color: #4CAF50;
  margin: 0 0 10px 0;
  font-size: 1.5em;
}

.unlock-content p {
  color: #999;
  margin: 0;
  font-size: 0.9em;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.audio-unlock-overlay:hover .unlock-content {
  transform: scale(1.05);
  transition: transform 0.2s ease;
}
</style>
