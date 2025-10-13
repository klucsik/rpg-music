<template>
  <div class="playlist">
    <div class="playlist-header">
      <h3>🎼 Current Playlist</h3>
      <div class="playlist-info">
        {{ playlist.length }} track{{ playlist.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <div class="playlist-actions">
      <button 
        @click="randomize" 
        :disabled="playlist.length === 0"
        class="action-btn"
        title="Randomize playlist order"
      >
        🔀 Shuffle
      </button>
      <button 
        @click="confirmClear" 
        :disabled="playlist.length === 0"
        class="action-btn"
        title="Clear playlist"
      >
        🗑️ Clear
      </button>
      <button 
        @click="showSaveDialog = true" 
        :disabled="playlist.length === 0"
        class="action-btn save-btn"
        title="Save to folder"
      >
        💾 Save to Folder
      </button>
    </div>

    <div 
      class="playlist-tracks"
      :class="{ 'drag-over': isDragOver }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div v-if="playlist.length === 0" class="no-tracks">
        <p>No tracks in playlist</p>
        <p class="hint">Drag tracks here or click "Play Folder" on a folder</p>
      </div>
      
      <div
        v-for="(track, index) in playlist"
        :key="`${track.id}-${index}`"
        class="playlist-track"
        :class="{ 
          playing: isCurrentTrack(track.id),
          'drop-above': dropIndicatorIndex === index,
          'drop-below': dropIndicatorIndex === index + 1 && index === playlist.length - 1
        }"
        draggable="true"
        @dragstart="onTrackDragStart($event, index)"
        @dragend="onTrackDragEnd"
        @dragover.prevent="onTrackDragOver($event, index)"
        @drop="onTrackDrop($event, index)"
        @click="playTrack(track)"
      >
        <div class="track-number">{{ index + 1 }}</div>
        <div class="track-icon">
          <span v-if="isCurrentTrack(track.id)">▶️</span>
          <span v-else>🎵</span>
        </div>
        <div class="track-info">
          <div class="track-title">{{ track.title }}</div>
          <div class="track-meta">{{ track.artist || 'Unknown' }}</div>
        </div>
        <button
          @click.stop="removeTrack(index)"
          class="remove-btn"
          title="Remove from playlist"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Save to Folder Dialog -->
    <div v-if="showSaveDialog" class="dialog-overlay" @click.self="showSaveDialog = false">
      <div class="dialog">
        <h3>Save Playlist to Folder</h3>
        <p>Select a folder to save the current playlist to. This will replace the folder's current contents.</p>
        
        <div class="form-group">
          <label>Select Folder</label>
          <select v-model="selectedFolderId" required>
            <option :value="null" disabled>-- Choose a folder --</option>
            <option
              v-for="folder in foldersWithPaths"
              :key="folder.id"
              :value="folder.id"
            >
              {{ folder.path }}
            </option>
          </select>
        </div>
        
        <div class="form-actions">
          <button @click="showSaveDialog = false" class="cancel-btn">
            Cancel
          </button>
          <button @click="saveToFolder" :disabled="!selectedFolderId" class="submit-btn">
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Clear Confirmation -->
    <div v-if="showClearConfirm" class="dialog-overlay" @click.self="showClearConfirm = false">
      <div class="dialog confirm-dialog">
        <h3>Clear Playlist?</h3>
        <p>Are you sure you want to clear all {{ playlist.length }} track{{ playlist.length !== 1 ? 's' : '' }} from the playlist?</p>
        
        <div class="form-actions">
          <button @click="showClearConfirm = false" class="cancel-btn">
            Cancel
          </button>
          <button @click="clearPlaylist" class="delete-btn">
            Clear
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';

export default {
  name: 'Playlist',
  props: {
    currentTrackId: {
      type: String,
      default: null,
    },
    foldersWithPaths: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['play-track', 'save-to-folder'],
  setup(props, { emit }) {
    const playlist = ref([]);
    const isDragOver = ref(false);
    const draggingIndex = ref(null);
    const dropIndicatorIndex = ref(null);
    
    const showSaveDialog = ref(false);
    const showClearConfirm = ref(false);
    const selectedFolderId = ref(null);

    const isCurrentTrack = (trackId) => {
      return props.currentTrackId === trackId;
    };

    const addTrack = (track) => {
      // Check if track already exists
      const exists = playlist.value.some(t => t.id === track.id);
      if (!exists) {
        playlist.value.push(track);
      }
    };

    const addTracks = (tracks) => {
      // Add multiple tracks (e.g., from a folder)
      tracks.forEach(track => addTrack(track));
    };

    const removeTrack = (index) => {
      playlist.value.splice(index, 1);
    };

    const clearPlaylist = () => {
      playlist.value = [];
      showClearConfirm.value = false;
    };

    const confirmClear = () => {
      showClearConfirm.value = true;
    };

    const randomize = () => {
      // Fisher-Yates shuffle
      const shuffled = [...playlist.value];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      playlist.value = shuffled;
    };

    const playTrack = (track) => {
      emit('play-track', track);
    };

    const saveToFolder = () => {
      if (!selectedFolderId.value) return;
      
      const trackIds = playlist.value.map(t => t.id);
      emit('save-to-folder', {
        folderId: selectedFolderId.value,
        trackIds,
      });
      
      showSaveDialog.value = false;
      selectedFolderId.value = null;
    };

    // Helper: get drop index based on mouse position
    const getDropIndex = (event, targetIndex = null) => {
      // If we have a specific target, use mouse position relative to it
      if (targetIndex !== null) {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const mouseY = event.clientY;
        // If mouse is in top half, insert before; otherwise after
        return mouseY < rect.top + rect.height / 2 ? targetIndex : targetIndex + 1;
      }
      
      // For container drops, find which track we're over
      const container = event.currentTarget;
      const children = Array.from(container.querySelectorAll('.playlist-track'));
      if (children.length === 0) return 0;
      
      const mouseY = event.clientY;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (mouseY < rect.top + rect.height / 2) {
          return i;
        }
      }
      return children.length;
    };

    // Drag and Drop from external source (library)
    const onDragOver = (event) => {
      event.preventDefault();
      isDragOver.value = true;
      event.dataTransfer.dropEffect = 'copy';
      // Update drop indicator
      dropIndicatorIndex.value = getDropIndex(event);
    };

    const onDragLeave = (event) => {
      // Only clear if we're leaving the container itself
      if (event.currentTarget === event.target) {
        isDragOver.value = false;
        dropIndicatorIndex.value = null;
      }
    };

    const onDrop = (event) => {
      event.preventDefault();
      isDragOver.value = false;
      dropIndicatorIndex.value = null;
      
      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        if (data.trackId && data.title) {
          const track = {
            id: data.trackId,
            title: data.title,
            artist: data.artist,
          };
          
          // Find drop index
          let dropIndex = getDropIndex(event);
          
          // Remove if already exists
          const existingIndex = playlist.value.findIndex(t => t.id === track.id);
          if (existingIndex !== -1) {
            playlist.value.splice(existingIndex, 1);
            // Adjust drop index if we removed an item before it
            if (existingIndex < dropIndex) {
              dropIndex--;
            }
          }
          
          // Insert at drop position
          playlist.value.splice(dropIndex, 0, track);
        }
      } catch (err) {
        console.error('Failed to parse drop data:', err);
      }
    };

    // Drag and Drop for reordering within playlist
    const onTrackDragStart = (event, index) => {
      draggingIndex.value = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    };

    const onTrackDragEnd = () => {
      draggingIndex.value = null;
      dropIndicatorIndex.value = null;
    };

    const onTrackDragOver = (event, index) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      // Update drop indicator based on mouse position relative to track
      dropIndicatorIndex.value = getDropIndex(event, index);
    };

    const onTrackDrop = (event, targetIndex) => {
      event.preventDefault();
      event.stopPropagation();
      dropIndicatorIndex.value = null;
      
      // Check if this is an internal reorder or external drop
      if (draggingIndex.value !== null) {
        // Internal reorder
        const dragIndex = draggingIndex.value;
        let dropIndex = getDropIndex(event, targetIndex);
        
        if (dragIndex === dropIndex) return;
        
        // Reorder
        const items = [...playlist.value];
        const [removed] = items.splice(dragIndex, 1);
        
        // Adjust drop index if we removed an item before it
        if (dragIndex < dropIndex) {
          dropIndex--;
        }
        
        items.splice(dropIndex, 0, removed);
        playlist.value = items;
        draggingIndex.value = null;
      } else {
        // External drop (from library) - handle same as container drop
        try {
          const data = JSON.parse(event.dataTransfer.getData('application/json'));
          if (data.trackId && data.title) {
            const track = {
              id: data.trackId,
              title: data.title,
              artist: data.artist,
            };
            
            let dropIndex = getDropIndex(event, targetIndex);
            
            // Remove if already exists
            const existingIndex = playlist.value.findIndex(t => t.id === track.id);
            if (existingIndex !== -1) {
              playlist.value.splice(existingIndex, 1);
              // Adjust drop index if we removed an item before it
              if (existingIndex < dropIndex) {
                dropIndex--;
              }
            }
            
            // Insert at drop position
            playlist.value.splice(dropIndex, 0, track);
          }
        } catch (err) {
          console.error('Failed to parse drop data:', err);
        }
      }
    };

    return {
      playlist,
      isDragOver,
      dropIndicatorIndex,
      showSaveDialog,
      showClearConfirm,
      selectedFolderId,
      isCurrentTrack,
      addTrack,
      addTracks,
      removeTrack,
      clearPlaylist,
      confirmClear,
      randomize,
      playTrack,
      saveToFolder,
      onDragOver,
      onDragLeave,
      onDrop,
      onTrackDragStart,
      onTrackDragEnd,
      onTrackDragOver,
      onTrackDrop,
    };
  },
};
</script>

<style scoped>
.playlist {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.playlist-header h3 {
  margin: 0;
  color: #e0e0e0;
  font-size: 1.3em;
}

.playlist-info {
  color: #999;
  font-size: 0.9em;
}

.playlist-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 12px;
  background: #444;
  border: none;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn:hover:not(:disabled) {
  background: #555;
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.save-btn {
  background: #4CAF50;
  margin-left: auto;
}

.action-btn.save-btn:hover:not(:disabled) {
  background: #45a049;
}

.playlist-tracks {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border: 2px dashed transparent;
  border-radius: 8px;
  padding: 4px;
  transition: all 0.2s;
  min-height: 200px;
}

.playlist-tracks.drag-over {
  background: #2d4a2e;
  border-color: #4CAF50;
}

.no-tracks {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.no-tracks p {
  margin: 10px 0;
}

.no-tracks .hint {
  font-size: 0.9em;
  color: #555;
}

.playlist-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 4px;
  background: #1a1a1a;
  border-radius: 6px;
  cursor: move;
  transition: all 0.2s;
  position: relative;
}

.playlist-track:hover {
  background: #333;
  transform: translateX(3px);
}

.playlist-track.playing {
  background: #2d4a2e;
  border-left: 4px solid #4CAF50;
}

/* Drop indicator - shows where track will be inserted */
.playlist-track.drop-above::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 3px;
  background: #4CAF50;
  border-radius: 2px;
  box-shadow: 0 0 8px #4CAF50;
}

.playlist-track.drop-below::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  right: 0;
  height: 3px;
  background: #4CAF50;
  border-radius: 2px;
  box-shadow: 0 0 8px #4CAF50;
}

.track-number {
  color: #666;
  font-size: 0.9em;
  min-width: 24px;
  text-align: right;
}

.track-icon {
  font-size: 1.2em;
  min-width: 24px;
  text-align: center;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  color: #e0e0e0;
  font-size: 0.95em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  color: #999;
  font-size: 0.85em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-btn {
  padding: 4px 8px;
  background: #d32f2f;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  opacity: 0;
  transition: all 0.2s;
}

.playlist-track:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: #f44336;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #2a2a2a;
  padding: 30px;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog h3 {
  margin: 0 0 15px 0;
  color: #e0e0e0;
}

.dialog p {
  color: #ccc;
  margin: 10px 0;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #e0e0e0;
  font-weight: 500;
}

.form-group select {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 1em;
  cursor: pointer;
}

.form-group select:focus {
  outline: none;
  border-color: #4CAF50;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.cancel-btn,
.submit-btn,
.delete-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1em;
  transition: all 0.2s;
}

.cancel-btn {
  background: #444;
  color: #e0e0e0;
}

.cancel-btn:hover {
  background: #555;
}

.submit-btn {
  background: #4CAF50;
  color: white;
}

.submit-btn:hover:not(:disabled) {
  background: #45a049;
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.delete-btn {
  background: #d32f2f;
  color: white;
}

.delete-btn:hover {
  background: #f44336;
}

.confirm-dialog p {
  margin: 15px 0;
}
</style>
