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
        <div class="status-line">
          <span class="status-dot"></span>
          {{ isConnected ? 'Connected' : 'Disconnected' }}
          <span v-if="isConnected" class="client-id"></span>
        </div>
        <div v-if="drift !== null" class="drift-line" :class="{ 'drift-warning': drift > 5 }">
          Drift: {{ drift.toFixed(2) }}s
        </div>
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
    const volume = ref(0.3);
    const isConnected = ref(false);
    const clientId = ref(null);
    const expectedPosition = ref(null);
    const drift = ref(null);  // Only updated on position check from server
    const isPlaying = ref(false);
    const repeatMode = ref(false);
    const needsAudioUnlock = ref(false);
    const audioUnlocked = ref(false);
    const manuallyPausing = ref(false);  // Flag to prevent ended event during manual pause

    const progressPercent = computed(() => {
      if (duration.value === 0) return 0;
      return (currentTime.value / duration.value) * 100;
    });

    // Format time as MM:SS
    const formatTime = (seconds) => {
      if (!seconds) return '0:00';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };    // Audio element event handlers
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
      manuallyPausing.value = false;  // Clear pause flag when playing
    };

    const onPause = () => {
      console.log('Audio paused');
      isPlaying.value = false;
    };

    const onEnded = () => {
      console.log('Audio ended', 'currentTime:', currentTime.value, 'duration:', duration.value);
      isPlaying.value = false;
      
      // Don't report track ended if we're in the middle of a manual pause
      if (manuallyPausing.value) {
        console.log('Ended event during manual pause, ignoring');
        manuallyPausing.value = false;
        return;
      }
      
      // Report track ended to server - let server handle repeat/autoplay
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
          // Set flag to prevent ended event from triggering during pause
          manuallyPausing.value = true;
          await api.pause();
          // Clear flag after a short delay (in case ended event is delayed)
          setTimeout(() => {
            manuallyPausing.value = false;
          }, 500);
        } else {
          await api.resume();
        }
      } catch (error) {
        console.error('Play/pause failed:', error);
        manuallyPausing.value = false;
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

    const toggleRepeat = async () => {
      try {
        await api.toggleRepeat();
        console.log('Repeat mode toggle sent to server');
      } catch (error) {
        console.error('Failed to toggle repeat mode:', error);
      }
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
      
      // Sync repeat mode
      if (typeof data.repeatMode === 'boolean') {
        repeatMode.value = data.repeatMode;
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
      // Pause first
      audioElement.value.pause();
      // Set position - but set the flag first to prevent ended event
      manuallyPausing.value = true;
      audioElement.value.currentTime = data.position;
      // Clear flag after a short delay
      setTimeout(() => {
        manuallyPausing.value = false;
      }, 100);
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
      expectedPosition.value = data.position;
      
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

    const handleRepeatModeChange = (data) => {
      console.log('Repeat mode change:', data);
      repeatMode.value = data.repeatMode;
    };

    const handlePositionCheck = (data) => {
      expectedPosition.value = data.expectedPosition;
      
      // Calculate drift at this moment only
      const currentDrift = Math.abs(data.expectedPosition - currentTime.value);
      drift.value = currentDrift;
      
      if (currentDrift > data.maxDrift && !audioElement.value.paused) {
        console.log(`Correcting drift: ${currentDrift.toFixed(2)}s > ${data.maxDrift}s`);
        audioElement.value.currentTime = data.expectedPosition;
      }
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
      websocket.on('repeat_mode_change', handleRepeatModeChange);
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
      websocket.off('repeat_mode_change', handleRepeatModeChange);
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
      drift,
      isPlaying,
      repeatMode,
      needsAudioUnlock,
      progressPercent,
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
  border-radius: 8px;
  padding: 12px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

.now-playing {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  gap: 8px;
  min-height: 50px;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-info h2 {
  margin: 0 0 3px 0;
  font-size: 1.1em;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-info h2.no-track {
  color: #666;
}

.track-info .artist {
  margin: 0;
  color: #999;
  font-size: 0.95em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sync-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #1a1a1a;
  font-size: 0.85em;
  flex-shrink: 0;
}

.sync-status.connected {
  color: #4CAF50;
}

.sync-status.disconnected {
  color: #f44336;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
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

.drift-line {
  font-size: 0.85em;
  color: #4CAF50;
  padding-left: 16px;
}

.drift-line.drift-warning {
  color: #ff9800;
  font-weight: bold;
}

audio {
  display: none;
}

.player-controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.progress-bar {
  height: 8px;
  background: #1a1a1a;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  margin-bottom: 8px;
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
  font-size: 0.85em;
  margin-bottom: 10px;
}

.control-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}

.control-btn {
  padding: 10px 16px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 1.1em;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 45px;
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
  padding: 10px 20px;
  font-size: 1.2em;
}

.control-btn.play-pause:hover:not(:disabled) {
  background: #45a049;
  border-color: #45a049;
}

.control-btn.active {
  background: #4CAF50;
  border-color: #4CAF50;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
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
  appearance: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
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

/* Responsive styles */
@media (max-width: 1024px) {
  .audio-player {
    padding: 12px;
  }
  
  .track-info h2 {
    font-size: 1.1em;
  }
  
  .control-btn {
    padding: 8px 12px;
    font-size: 1em;
  }
  
  .control-btn.play-pause {
    padding: 8px 16px;
    font-size: 1.1em;
  }
}

@media (max-width: 768px) {
  .now-playing {
    flex-direction: column;
    align-items: stretch;
  }
  
  .sync-status {
    align-self: flex-end;
  }
  
  .control-buttons {
    gap: 6px;
  }
  
  .control-btn {
    padding: 6px 10px;
    font-size: 0.95em;
    min-width: 40px;
  }
  
  .control-btn.play-pause {
    padding: 6px 14px;
  }
}
</style>
