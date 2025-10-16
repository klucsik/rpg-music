<template>
  <div class="folder-manager-panel">
    <div class="folder-header">
      <h3>Folders</h3>
      <button @click="showCreateDialog = true" class="create-btn">
        + New Folder
      </button>
    </div>

    <div class="folder-list">
      <div
        v-for="folder in folders"
        :key="folder.id"
        :class="['folder-item', { active: selectedFolder?.id === folder.id }]"
        @click="selectFolder(folder)"
      >
        <span class="folder-icon">📁</span>
        <span class="folder-name">{{ folder.name }}</span>
        <span class="folder-count">({{ getTrackCount(folder.id) }})</span>
        <button 
          @click.stop="deleteFolder(folder)"
          class="delete-btn"
          title="Delete folder"
        >
          ×
        </button>
      </div>

      <div v-if="folders.length === 0" class="empty-folders">
        <p>No folders yet</p>
        <p class="empty-hint">Create a folder to organize your music</p>
      </div>
    </div>

    <!-- Selected Folder Tracks -->
    <div v-if="selectedFolder" class="folder-tracks">
      <OrderedTrackList
        :tracks="folderTracks"
        :current-track="currentTrack"
        :allow-reorder="true"
        :allow-remove="true"
        :allow-drop="true"
        :show-position="false"
        :enable-double-click="true"
        :enable-single-click="false"
        @track-dblclick="handleTrackDoubleClick"
        @track-remove="handleRemoveTrack"
        @track-reorder="handleReorderTrack"
        @track-drop="handleDropTrack"
      >
        <template #header>
          <div class="folder-tracks-header">
            <h4>{{ selectedFolder.name }}</h4>
          </div>
        </template>

        <template #empty>
          <div class="empty-folder-tracks">
            <p>No tracks in this folder</p>
            <p class="empty-hint">Drag tracks from the library to add them</p>
          </div>
        </template>
      </OrderedTrackList>
    </div>

    <!-- Create Folder Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click="showCreateDialog = false">
      <div class="dialog" @click.stop>
        <h3>Create New Folder</h3>
        <input
          v-model="newFolderName"
          type="text"
          placeholder="Folder name"
          @keyup.enter="createFolder"
          ref="folderNameInput"
        />
        <div class="dialog-actions">
          <button @click="showCreateDialog = false" class="cancel-btn">Cancel</button>
          <button @click="createFolder" :disabled="!newFolderName.trim()" class="create-btn">
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import OrderedTrackList from './OrderedTrackList.vue';
import { useTrackCollection } from '../composables/useTrackCollection';
import api from '../services/api';

const props = defineProps({
  currentTrack: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['track-play']);

// Folder management
const folders = ref([]);
const selectedFolder = ref(null);
const loadingFolders = ref(false);
const showCreateDialog = ref(false);
const newFolderName = ref('');
const folderNameInput = ref(null);

// Track collection for selected folder
const {
  tracks: folderTracks,
  loading: loadingTracks,
  error: tracksError,
  removeTrack,
  handleTrackDrop: handleTrackDropComposable,
  handleTrackReorder: handleTrackReorderComposable,
  refresh: refreshFolderTracks
} = useTrackCollection(
  computed(() => selectedFolder.value?.id || null),
  { autoLoad: false }
);

/**
 * Load all folders
 */
const loadFolders = async () => {
  loadingFolders.value = true;
  try {
    const result = await api.getCollections('folder');
    folders.value = result;
  } catch (err) {
    console.error('Failed to load folders:', err);
  } finally {
    loadingFolders.value = false;
  }
};

/**
 * Get track count for a folder
 */
const getTrackCount = (folderId) => {
  if (selectedFolder.value?.id === folderId) {
    return folderTracks.value.length;
  }
  const folder = folders.value.find(f => f.id === folderId);
  return folder?.track_count || 0;
};

/**
 * Select a folder to view its tracks
 */
const selectFolder = async (folder) => {
  selectedFolder.value = folder;
  await nextTick();
  await refreshFolderTracks();
};

/**
 * Create a new folder
 */
const createFolder = async () => {
  const name = newFolderName.value.trim();
  if (!name) return;

  try {
    await api.createCollection(name, 'folder');
    newFolderName.value = '';
    showCreateDialog.value = false;
    await loadFolders();
  } catch (err) {
    console.error('Failed to create folder:', err);
    alert('Failed to create folder');
  }
};

/**
 * Delete a folder
 */
const deleteFolder = async (folder) => {
  if (!confirm(`Delete folder "${folder.name}"?`)) return;

  try {
    await api.deleteCollection(folder.id);
    if (selectedFolder.value?.id === folder.id) {
      selectedFolder.value = null;
    }
    await loadFolders();
  } catch (err) {
    console.error('Failed to delete folder:', err);
    alert('Failed to delete folder');
  }
};

/**
 * Handle double-click to play track
 */
const handleTrackDoubleClick = (track) => {
  emit('track-play', track);
};

/**
 * Handle removing a track from folder
 */
const handleRemoveTrack = async (data) => {
  if (!selectedFolder.value) return;
  
  try {
    // data contains { track, index, position }
    await removeTrack(data.track.id, data.position);
  } catch (err) {
    console.error('Failed to remove track from folder:', err);
  }
};

/**
 * Handle reordering tracks in folder
 */
const handleReorderTrack = async ({ track, oldIndex, newIndex }) => {
  if (!selectedFolder.value) return;
  
  try {
    await handleTrackReorderComposable(track, oldIndex, newIndex);
  } catch (err) {
    console.error('Failed to reorder track in folder:', err);
  }
};

/**
 * Handle dropping a track from library
 */
const handleDropTrack = async ({ track, position }) => {
  if (!selectedFolder.value) return;
  
  try {
    await handleTrackDropComposable(track, position);
  } catch (err) {
    console.error('Failed to add track to folder:', err);
  }
};

// Watch for dialog open to focus input
watch(showCreateDialog, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      folderNameInput.value?.focus();
    });
  }
});

// Load folders on mount
loadFolders();

// Expose refresh method
defineExpose({
  refresh: loadFolders
});
</script>

<style scoped>
.folder-manager-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.folder-header {
  padding: 15px;
  border-bottom: 1px solid #333;
  background: #222;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.folder-header h3 {
  margin: 0;
  font-size: 1.1em;
}

.create-btn {
  padding: 6px 12px;
  background: #42b983;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
}

.create-btn:hover {
  background: #35a372;
}

.folder-list {
  flex: 0 0 auto;
  max-height: 200px;
  overflow-y: auto;
  border-bottom: 1px solid #333;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.folder-item:hover {
  background: #2a2a2a;
}

.folder-item.active {
  background: #1a5f7a;
}

.folder-icon {
  font-size: 1.2em;
}

.folder-name {
  flex: 1;
  font-size: 0.95em;
}

.folder-count {
  font-size: 0.85em;
  color: #999;
}

.delete-btn {
  background: transparent;
  border: none;
  color: #999;
  font-size: 1.5em;
  line-height: 1;
  padding: 0 8px;
  cursor: pointer;
  transition: color 0.2s;
}

.delete-btn:hover {
  color: #ff6b6b;
}

.empty-folders {
  text-align: center;
  padding: 20px;
  color: #666;
}

.empty-hint {
  font-size: 0.9em;
  margin-top: 8px;
}

.folder-tracks {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.folder-tracks-header {
  padding: 12px 15px;
  border-bottom: 1px solid #333;
  background: #222;
}

.folder-tracks-header h4 {
  margin: 0;
  font-size: 1em;
  font-weight: 500;
}

.empty-folder-tracks {
  text-align: center;
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
  border-radius: 8px;
  padding: 24px;
  min-width: 300px;
  max-width: 500px;
}

.dialog h3 {
  margin: 0 0 16px 0;
  font-size: 1.1em;
}

.dialog input {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 0.95em;
  margin-bottom: 16px;
}

.dialog input:focus {
  outline: none;
  border-color: #42b983;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
}

.cancel-btn {
  background: #444;
  color: white;
}

.cancel-btn:hover {
  background: #555;
}

.dialog-actions .create-btn {
  background: #42b983;
  color: white;
}

.dialog-actions .create-btn:hover:not(:disabled) {
  background: #35a372;
}

.dialog-actions .create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
