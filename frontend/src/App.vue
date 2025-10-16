<template>
  <div id="app-content">
    <header class="app-header">
      <h1>🎵 RPG Music Streaming</h1>
      <div class="header-actions">
        <div class="stats">
          <span class="stat">{{ stats.tracks }} tracks</span>
          <span class="stat">{{ stats.clients }} clients</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- Top Row: Player and Playlist -->
      <section class="top-row">
        <!-- Left: Audio Player -->
        <div class="player-column">
          <AudioPlayer 
            :current-track-id="currentTrackId"
            :has-next="hasNext"
            :has-previous="hasPrevious"
            @next-track="playNextTrack"
            @previous-track="playPreviousTrack"
          />
        </div>

        <!-- Right: Current Playlist -->
        <div class="playlist-column">
          <PlaylistPanel
            ref="playlistRef"
            :current-track="currentTrack"
            @track-play="onPlayTrack"
          />
        </div>
      </section>

      <!-- Bottom Row: Library and Folders -->
      <section class="bottom-row">
        <!-- Left: Music Library -->
        <div class="library-column">
          <MusicLibraryPanel
            ref="libraryRef"
            :current-track="currentTrack"
            @track-play="onAddTrackAndPlay"
          />
        </div>

        <!-- Right: Folder Management -->
        <div class="folders-column">
          <FolderManagerPanel
            ref="folderManagerRef"
            :current-track="currentTrack"
            @track-play="onAddTrackAndPlay"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import AudioPlayer from './components/AudioPlayer.vue';
import MusicLibraryPanel from './components/MusicLibraryPanel.vue';
import FolderManagerPanel from './components/FolderManagerPanel.vue';
import PlaylistPanel from './components/PlaylistPanel.vue';
import api from './services/api';
import websocket from './services/websocket';

export default {
  name: 'App',
  components: {
    AudioPlayer,
    MusicLibraryPanel,
    FolderManagerPanel,
    PlaylistPanel,
  },
  setup() {
    const currentTrackId = ref(null);
    const currentTrack = ref(null);
    const libraryRef = ref(null);
    const folderManagerRef = ref(null);
    const playlistRef = ref(null);
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
        currentTrack.value = track;
      } catch (error) {
        console.error('Failed to play track:', error);
        alert('Failed to play track. Check console for details.');
      }
    };

    const onAddTrackAndPlay = async (track) => {
      // Add track to playlist and play it
      try {
        await api.addTrackToCollection('current-playlist', track.id);
        // Refresh playlist to show new track
        if (playlistRef.value) {
          await playlistRef.value.refresh();
        }
        // Play the track
        await onPlayTrack(track);
      } catch (error) {
        console.error('Failed to add and play track:', error);
      }
    };

    const playNextTrack = () => {
      // TODO: Implement with new playlist structure
      console.log('Next track - to be implemented');
    };

    const playPreviousTrack = () => {
      // TODO: Implement with new playlist structure
      console.log('Previous track - to be implemented');
    };

    const handleStateSync = (data) => {
      if (data.currentTrack) {
        currentTrackId.value = data.currentTrack.id;
        currentTrack.value = data.currentTrack;
      } else {
        currentTrackId.value = null;
        currentTrack.value = null;
      }
    };

    const handlePlayTrack = (data) => {
      currentTrackId.value = data.trackId;
      // Fetch full track info if needed
      if (data.trackId) {
        api.getTrack(data.trackId)
          .then(track => {
            currentTrack.value = track;
          })
          .catch(err => console.error('Failed to fetch track info:', err));
      }
    };

    const handleStop = () => {
      currentTrackId.value = null;
      currentTrack.value = null;
    };

    // Computed properties for next/previous track availability
    // TODO: Implement properly with new collection structure
    const hasNext = computed(() => false);
    const hasPrevious = computed(() => false);

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
      currentTrack,
      libraryRef,
      folderManagerRef,
      playlistRef,
      stats,
      hasNext,
      hasPrevious,
      onPlayTrack,
      onAddTrackAndPlay,
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

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #1a1a1a;
  color: #e0e0e0;
}

#app-content {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.app-header {
  background: #2a2a2a;
  padding: 12px 20px;
  border-bottom: 2px solid #4CAF50;
  display: flex;
  justify-content: space-between;
  align-items: center;

}

.app-header h1 {
  margin: 0;
  font-size: 1.6em;
  color: #4CAF50;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stats {
  display: flex;
  gap: 15px;
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
  display: flex;
  flex-direction: column;
  max-width: 1920px;
  width: 100%;
  margin: 0 auto;
  padding: 15px;
  gap: 15px;
  overflow: hidden;
  min-height: 0;
}

/* Audio player always visible at top */
.top-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  flex-shrink: 0; /* Don't shrink the player */
  max-height: 320px; /* Limit player height */
}

/* Main content area - scrollable lists */
.bottom-row {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  min-height: 400px;
  overflow: hidden;
}

.player-column,
.playlist-column,
.library-column,
.folders-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.library-column,
.folders-column {
  min-height: 400px;
}

/* Responsive breakpoints */
@media (max-width: 1400px) {
  .top-row,
  .bottom-row {
    gap: 12px;
  }
  
  .app-main {
    padding: 12px;
  }
}

@media (max-width: 1024px) {
  .app-header h1 {
    font-size: 1.4em;
  }
  
  .top-row {
    grid-template-columns: 1fr;
    max-height: none;
  }
  
  .playlist-column {
    max-height: 300px;
    min-height: 250px;
  }
  
  .bottom-row {
    grid-template-columns: 1fr;
    min-height: 300px;
  }
  
  .library-column,
  .folders-column {
    min-height: 300px;
  }
}

@media (max-width: 768px) {
  .app-header {
    padding: 15px;
  }
  
  .app-header h1 {
    font-size: 1.2em;
  }
  
  .stats {
    gap: 5px;
  }
  
  .app-main {
    padding: 10px;
    gap: 10px;
  }
  
  .top-row,
  .bottom-row {
    gap: 10px;
  }
  
  .playlist-column {
    min-height: 200px;
  }
  
  .bottom-row {
    min-height: 250px;
  }
  
  .library-column,
  .folders-column {
    min-height: 250px;
  }
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
