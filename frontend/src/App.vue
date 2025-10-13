<template>
  <div id="app">
    <header class="app-header">
      <h1>🎵 RPG Music Streaming</h1>
      <div class="stats">
        <span class="stat">{{ stats.tracks }} tracks</span>
        <span class="stat">{{ stats.clients }} clients</span>
      </div>
    </header>

    <main class="app-main">
      <AudioPlayer 
        :current-track-id="currentTrackId"
        :has-next="trackListRef?.hasNext() || false"
        :has-previous="trackListRef?.hasPrevious() || false"
        @next-track="playNextTrack"
        @previous-track="playPreviousTrack"
      />
      
      <TrackList
        ref="trackListRef"
        :current-track-id="currentTrackId"
        @play-track="onPlayTrack"
      />
      
      <FolderManager />
    </main>

    <footer class="app-footer">
      <p>RPG Music Streaming Server • Session 4 • Synchronized Playback</p>
    </footer>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import AudioPlayer from './components/AudioPlayer.vue';
import TrackList from './components/TrackList.vue';
import FolderManager from './components/FolderManager.vue';
import api from './services/api';
import websocket from './services/websocket';

export default {
  name: 'App',
  components: {
    AudioPlayer,
    TrackList,
    FolderManager,
  },
  setup() {
    const currentTrackId = ref(null);
    const trackListRef = ref(null);
    const stats = ref({
      tracks: 0,
      clients: 0,
    });

    let statsInterval = null;

    const loadStats = async () => {
      try {
        const response = await api.getStats();
        stats.value = {
          tracks: response.tracks.total,
          clients: response.clients.connected,
        };
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    };

    const onPlayTrack = async (track) => {
      try {
        await api.playTrack(track.id);
        currentTrackId.value = track.id;
      } catch (error) {
        console.error('Failed to play track:', error);
        alert('Failed to play track. Check console for details.');
      }
    };

    const playNextTrack = () => {
      if (trackListRef.value) {
        trackListRef.value.playNextTrack();
      }
    };

    const playPreviousTrack = () => {
      if (trackListRef.value) {
        trackListRef.value.playPreviousTrack();
      }
    };

    const handleStateSync = (data) => {
      if (data.currentTrack) {
        currentTrackId.value = data.currentTrack.id;
      } else {
        currentTrackId.value = null;
      }
    };

    const handlePlayTrack = (data) => {
      currentTrackId.value = data.trackId;
    };

    const handleStop = () => {
      currentTrackId.value = null;
    };

    onMounted(() => {
      // Load initial stats
      loadStats();
      
      // Update stats periodically
      statsInterval = setInterval(loadStats, 10000); // Every 10 seconds
      
      // Listen to WebSocket events for current track updates
      websocket.on('state_sync', handleStateSync);
      websocket.on('play_track', handlePlayTrack);
      websocket.on('stop', handleStop);
    });

    onUnmounted(() => {
      if (statsInterval) {
        clearInterval(statsInterval);
      }
      
      websocket.off('state_sync', handleStateSync);
      websocket.off('play_track', handlePlayTrack);
      websocket.off('stop', handleStop);
    });

    return {
      currentTrackId,
      trackListRef,
      stats,
      onPlayTrack,
      playNextTrack,
      playPreviousTrack,
    };
  },
};
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #1a1a1a;
  color: #e0e0e0;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: #2a2a2a;
  padding: 20px;
  border-bottom: 2px solid #4CAF50;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-header h1 {
  margin: 0;
  font-size: 1.8em;
  color: #4CAF50;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat {
  padding: 8px 16px;
  background: #1a1a1a;
  border-radius: 6px;
  font-size: 0.9em;
  color: #999;
}

.app-main {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
}

.app-footer {
  background: #2a2a2a;
  padding: 15px 20px;
  text-align: center;
  border-top: 1px solid #444;
  font-size: 0.9em;
  color: #666;
}

.app-footer p {
  margin: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 10px;
}

::-webkit-scrollbar-track {
  background: #1a1a1a;
}

::-webkit-scrollbar-thumb {
  background: #4CAF50;
  border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
  background: #45a049;
}
</style>
