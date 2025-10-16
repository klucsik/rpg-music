<template>
  <div class="folder-manager-panel">
    <div class="folder-header">
      <h3>Folders</h3>
      <button @click="showCreateDialog = true" class="create-btn">
        + New Folder
      </button>
    </div>

    <div class="folder-tree">
      <FolderNodeSimple
        v-for="folder in rootFolders"
        :key="folder.id"
        :folder="folder"
        :all-folders="folders"
        :expanded-folder-ids="expandedFolderIds"
        :active-folder-id="expandedFolderId"
        :folder-tracks="folderTracks"
        :current-track="currentTrack"
        :loading-tracks="loadingTracks"
        @toggle="toggleFolder"
        @edit="startEditFolder"
        @delete="confirmDeleteFolder"
        @play-folder="playFolder"
        @add-to-playlist="addFolderToPlaylist"
        @track-dblclick="handleTrackDoubleClick"
        @track-drop="handleDropTrack"
        @track-reorder="handleReorderTrack"
        @track-remove="handleRemoveTrack"
      />

      <div v-if="folders.length === 0" class="empty-folders">
        <p>No folders yet</p>
        <p class="empty-hint">Create a folder to organize your music</p>
      </div>
    </div>

    <!-- Create/Edit Folder Dialog -->
    <div v-if="showCreateDialog || showEditDialog" class="dialog-overlay" @click="showCreateDialog = false; showEditDialog = false">
      <div class="dialog" @click.stop>
        <h3>{{ showEditDialog ? 'Edit Folder' : 'Create New Folder' }}</h3>
        
        <div class="form-group">
          <label>Folder Name</label>
          <input
            v-model="newFolderName"
            type="text"
            placeholder="Folder name"
            @keyup.enter="showEditDialog ? saveEditFolder() : createFolder()"
            ref="folderNameInput"
          />
        </div>

        <div class="form-group">
          <label>Parent Folder (optional)</label>
          <select v-model="parentFolderId">
            <option :value="null">-- Root Level --</option>
            <option
              v-for="folder in folders"
              :key="folder.id"
              :value="folder.id"
              :disabled="showEditDialog && folder.id === editingFolder?.id"
            >
              {{ folder.name }}
            </option>
          </select>
        </div>
        
        <div class="dialog-actions">
          <button @click="showCreateDialog = false; showEditDialog = false" class="cancel-btn">Cancel</button>
          <button 
            @click="showEditDialog ? saveEditFolder() : createFolder()" 
            :disabled="!newFolderName.trim()" 
            class="create-btn"
          >
            {{ showEditDialog ? 'Save' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click="showDeleteDialog = false">
      <div class="dialog" @click.stop>
        <h3>Delete Folder?</h3>
        <p>Are you sure you want to delete "{{ folderToDelete?.name }}"?</p>
        <p class="warning">This will not delete the tracks, only the folder organization.</p>
        
        <div class="dialog-actions">
          <button @click="showDeleteDialog = false" class="cancel-btn">Cancel</button>
          <button @click="deleteFolder" class="delete-btn">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import FolderNodeSimple from './FolderNodeSimple.vue';
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
const expandedFolderIds = ref(new Set());
const expandedFolderId = ref(null); // Keep for track loading (which folder's tracks are currently shown)
const loadingFolders = ref(false);
const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const newFolderName = ref('');
const editingFolder = ref(null);
const folderToDelete = ref(null);
const parentFolderId = ref(null);
const folderNameInput = ref(null);

// Track collection for expanded folder
const {
  tracks: folderTracks,
  loading: loadingTracks,
  error: tracksError,
  removeTrack,
  handleTrackDrop: handleTrackDropComposable,
  handleTrackReorder: handleTrackReorderComposable,
  refresh: refreshFolderTracks
} = useTrackCollection(
  computed(() => expandedFolderId.value || null),
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
 * Get root folders (folders without parents)
 */
const rootFolders = computed(() => {
  return folders.value.filter(f => !f.parent_id);
});

/**
 * Get track count for a folder
 */
const getTrackCount = (folderId) => {
  if (expandedFolderId.value === folderId) {
    return folderTracks.value.length;
  }
  const folder = folders.value.find(f => f.id === folderId);
  return folder?.track_count || 0;
};

/**
 * Toggle folder expansion (show/hide tracks)
 */
const toggleFolder = async (folder) => {
  // Toggle expansion state
  if (expandedFolderIds.value.has(folder.id)) {
    expandedFolderIds.value.delete(folder.id);
    // If this was the folder showing tracks, clear it
    if (expandedFolderId.value === folder.id) {
      expandedFolderId.value = null;
    }
  } else {
    expandedFolderIds.value.add(folder.id);
    // Set this as the active folder for track display
    expandedFolderId.value = folder.id;
    await nextTick();
    await refreshFolderTracks();
  }
  
  // Trigger reactivity by creating a new Set
  expandedFolderIds.value = new Set(expandedFolderIds.value);
};

/**
 * Start editing a folder
 */
const startEditFolder = (folder) => {
  editingFolder.value = folder;
  newFolderName.value = folder.name;
  parentFolderId.value = folder.parent_id;
  showEditDialog.value = true;
};

/**
 * Save folder edits
 */
const saveEditFolder = async () => {
  if (!editingFolder.value) return;
  const name = newFolderName.value.trim();
  if (!name) return;

  try {
    await api.updateCollection(editingFolder.value.id, {
      name,
      parent_id: parentFolderId.value
    });
    showEditDialog.value = false;
    editingFolder.value = null;
    newFolderName.value = '';
    parentFolderId.value = null;
    await loadFolders();
  } catch (err) {
    console.error('Failed to update folder:', err);
    alert('Failed to update folder');
  }
};

/**
 * Create a new folder
 */
const createFolder = async () => {
  const name = newFolderName.value.trim();
  if (!name) return;

  try {
    await api.createCollection(name, 'folder', parentFolderId.value);
    newFolderName.value = '';
    parentFolderId.value = null;
    showCreateDialog.value = false;
    await loadFolders();
  } catch (err) {
    console.error('Failed to create folder:', err);
    alert('Failed to create folder');
  }
};

/**
 * Confirm folder deletion
 */
const confirmDeleteFolder = (folder) => {
  folderToDelete.value = folder;
  showDeleteDialog.value = true;
};

/**
 * Delete a folder
 */
const deleteFolder = async () => {
  if (!folderToDelete.value) return;

  try {
    await api.deleteCollection(folderToDelete.value.id);
    if (expandedFolderId.value === folderToDelete.value.id) {
      expandedFolderId.value = null;
    }
    showDeleteDialog.value = false;
    folderToDelete.value = null;
    await loadFolders();
  } catch (err) {
    console.error('Failed to delete folder:', err);
    alert('Failed to delete folder');
  }
};

/**
 * Play all tracks in a folder
 */
const playFolder = async (folder) => {
  try {
    // Clear current playlist and add all folder tracks
    await api.clearCollectionTracks('current-playlist');
    const folderData = await api.getCollection(folder.id);
    for (const track of folderData.tracks) {
      await api.addTrackToCollection('current-playlist', track.id);
    }
  } catch (err) {
    console.error('Failed to play folder:', err);
  }
};

/**
 * Add folder tracks to playlist
 */
const addFolderToPlaylist = async (folder) => {
  try {
    const folderData = await api.getCollection(folder.id);
    for (const track of folderData.tracks) {
      await api.addTrackToCollection('current-playlist', track.id);
    }
  } catch (err) {
    console.error('Failed to add folder to playlist:', err);
  }
};

/**
 * Handle remove track event from FolderNode
 */
const handleRemoveTrackFromFolder = async (data) => {
  // data contains { folderId, track, index, position }
  if (!data.folderId) return;
  
  try {
    await api.removeTrackFromCollection(data.folderId, data.track.id, data.position);
    // Refresh if it's the expanded folder
    if (expandedFolderId.value === data.folderId) {
      await refreshFolderTracks();
    }
    // Reload folders to update counts
    await loadFolders();
  } catch (err) {
    console.error('Failed to remove track from folder:', err);
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
  if (!data.folderId) return;
  
  try {
    // data contains { folderId, track, index, position }
    await removeTrack(data.track.id, data.position);
  } catch (err) {
    console.error('Failed to remove track from folder:', err);
  }
};

/**
 * Handle reordering tracks in folder
 */
const handleReorderTrack = async ({ folderId, track, oldIndex, newIndex }) => {
  // Only allow reorder in the currently expanded folder
  if (!folderId || folderId !== expandedFolderId.value) return;
  
  try {
    // Use the composable's reorder function
    await handleTrackReorderComposable(track, oldIndex, newIndex);
  } catch (err) {
    console.error('Failed to reorder track in folder:', err);
  }
};

/**
 * Handle dropping a track from library or another list
 */
const handleDropTrack = async ({ folderId, trackId, track, position }) => {
  if (!folderId) {
    console.error('No folderId provided to handleDropTrack');
    return;
  }
  
  try {
    console.log('Dropping track:', { folderId, trackId, position, expandedFolderId: expandedFolderId.value });
    
    // If dropping on the currently expanded folder, use the composable
    if (folderId === expandedFolderId.value) {
      console.log('Using composable for expanded folder');
      await handleTrackDropComposable(track, position);
    } else {
      // Otherwise, add directly via API
      console.log('Using API for non-expanded folder');
      await api.addTrackToCollection(folderId, trackId, position);
      // Reload folder list to update track counts
      await loadFolders();
    }
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

.folder-tree {
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

.dialog p {
  margin: 0 0 12px 0;
  color: #aaa;
}

.dialog .warning {
  color: #ff9800;
  font-size: 0.9em;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: #ccc;
  font-size: 0.9em;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 0.95em;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #42b983;
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
