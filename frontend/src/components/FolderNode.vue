<template>
  <div class="folder-node">
    <div 
      class="folder-item"
      :class="{ selected: folder.id === selectedFolderId, 'drag-over': isDragOver }"
      @click.stop="$emit('select', folder)"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="folder-icon">
        {{ folder.children && folder.children.length > 0 ? '📂' : '📁' }}
      </span>
      <span class="folder-name">{{ folder.name }}</span>
      <div class="folder-actions">
        <button @click.stop="$emit('play-folder', folder)" title="Play folder contents">▶️</button>
        <button @click.stop="$emit('add-track', folder)" title="Add tracks">➕</button>
        <button @click.stop="$emit('edit', folder)" title="Edit">✏️</button>
        <button @click.stop="$emit('delete', folder)" title="Delete">🗑️</button>
      </div>
    </div>
    
    <!-- Show tracks if this folder is selected -->
    <div 
      v-if="folder.id === selectedFolderId && folderTracks && folderTracks.length > 0" 
      class="folder-tracks"
      :class="{ 'drag-over-tracks': isDragOverTracks }"
      @dragover.prevent="onDragOverTracks"
      @dragleave="onDragLeaveTracks"
      @drop="onDropOnTracks"
    >
      <div
        v-for="track in folderTracks"
        :key="track.id"
        class="track-item"
      >
        <span class="track-icon">🎵</span>
        <div class="track-info">
          <div class="track-title">{{ track.title }}</div>
          <div class="track-meta">{{ track.artist || 'Unknown' }}</div>
        </div>
        <button
          @click.stop="$emit('remove-track', { trackId: track.id, folderId: folder.id })"
          class="remove-btn"
          title="Remove from folder"
        >
          ✕
        </button>
      </div>
    </div>
    
    <div v-if="folder.children && folder.children.length > 0" class="folder-children">
      <FolderNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :selected-folder-id="selectedFolderId"
        :folder-tracks="folderTracks"
        @select="$emit('select', $event)"
        @edit="$emit('edit', $event)"
        @delete="$emit('delete', $event)"
        @add-track="$emit('add-track', $event)"
        @drop-track="$emit('drop-track', $event)"
        @remove-track="$emit('remove-track', $event)"
        @play-folder="$emit('play-folder', $event)"
      />
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  name: 'FolderNode',
  props: {
    folder: {
      type: Object,
      required: true,
    },
    selectedFolderId: {
      type: String,
      default: null,
    },
    folderTracks: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['select', 'edit', 'delete', 'add-track', 'drop-track', 'remove-track', 'play-folder'],
  setup(props, { emit }) {
    const isDragOver = ref(false);
    const isDragOverTracks = ref(false);

    const onDragOver = (event) => {
      event.preventDefault();
      isDragOver.value = true;
      event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = () => {
      isDragOver.value = false;
    };

    const onDrop = (event) => {
      event.preventDefault();
      isDragOver.value = false;
      
      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        if (data.trackId) {
          emit('drop-track', {
            trackId: data.trackId,
            folderId: props.folder.id,
            folderName: props.folder.name,
          });
        }
      } catch (err) {
        console.error('Failed to parse drop data:', err);
      }
    };

    const onDragOverTracks = (event) => {
      event.preventDefault();
      event.stopPropagation();
      isDragOverTracks.value = true;
      event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeaveTracks = () => {
      isDragOverTracks.value = false;
    };

    const onDropOnTracks = (event) => {
      event.preventDefault();
      event.stopPropagation();
      isDragOverTracks.value = false;
      
      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        if (data.trackId) {
          emit('drop-track', {
            trackId: data.trackId,
            folderId: props.folder.id,
            folderName: props.folder.name,
          });
        }
      } catch (err) {
        console.error('Failed to parse drop data:', err);
      }
    };

    return {
      isDragOver,
      isDragOverTracks,
      onDragOver,
      onDragLeave,
      onDrop,
      onDragOverTracks,
      onDragLeaveTracks,
      onDropOnTracks,
    };
  },
};
</script>

<style scoped>
.folder-node {
  margin-left: 0;
}

.folder-children {
  margin-left: 20px;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 4px;
  background: #1a1a1a;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.folder-item:hover {
  background: #333;
}

.folder-item.selected {
  background: #2d4a2e;
  border-left: 4px solid #4CAF50;
}

.folder-item.drag-over {
  background: #3a5a3c;
  border: 2px dashed #4CAF50;
  transform: scale(1.02);
}

.folder-icon {
  font-size: 1.2em;
}

.folder-name {
  flex: 1;
  color: #e0e0e0;
}

.folder-actions {
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity 0.2s;
}

.folder-item:hover .folder-actions {
  opacity: 1;
}

.folder-actions button {
  padding: 4px 8px;
  background: #444;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s;
}

.folder-actions button:hover {
  background: #555;
}

.folder-tracks {
  margin-left: 40px;
  margin-top: 8px;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.folder-tracks.drag-over-tracks {
  background: #2d4a2e;
  border: 2px dashed #4CAF50;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: #0d0d0d;
  border-radius: 6px;
  transition: all 0.2s;
}

.track-item:hover {
  background: #1a1a1a;
}

.track-icon {
  font-size: 1em;
  min-width: 20px;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  color: #e0e0e0;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  color: #999;
  font-size: 0.8em;
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

.track-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: #f44336;
}
</style>
