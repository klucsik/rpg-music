<template>
  <div class="folder-manager">
    <div class="manager-header">
      <h3>📁 Folders</h3>
      <button @click="showCreateDialog = true" class="create-btn">
        ➕ New Folder
      </button>
    </div>

    <div v-if="loading" class="loading">Loading folders...</div>
    
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="folder-tree">
      <div v-if="folders.length === 0" class="no-folders">
        No folders yet. Create one to organize your tracks!
      </div>
      
      <FolderNode
        v-for="folder in folders"
        :key="folder.id"
        :folder="folder"
        :selected-folder-id="selectedFolderId"
        :folder-tracks="selectedFolder?.tracks || []"
        @select="selectFolder"
        @edit="editFolder"
        @delete="confirmDelete"
        @add-track="openTrackSelector"
        @drop-track="handleDropTrack"
        @remove-track="handleRemoveTrack"
      />
    </div>

    <!-- Create/Edit Dialog -->
    <div v-if="showCreateDialog || showEditDialog" class="dialog-overlay" @click.self="closeDialogs">
      <div class="dialog">
        <h3>{{ showEditDialog ? 'Edit Folder' : 'Create Folder' }}</h3>
        <form @submit.prevent="showEditDialog ? saveEdit() : createFolder()">
          <div class="form-group">
            <label>Folder Name</label>
            <input
              v-model="folderForm.name"
              type="text"
              placeholder="e.g., Combat Music, Tavern, Boss Battles"
              required
              autofocus
            />
          </div>
          
          <div class="form-group">
            <label>Parent Folder (optional)</label>
            <select v-model="folderForm.parent_id">
              <option :value="null">-- Root Level --</option>
              <option
                v-for="folder in foldersWithPaths"
                :key="folder.id"
                :value="folder.id"
                :disabled="showEditDialog && folder.id === editingFolder?.id"
              >
                {{ folder.path }}
              </option>
            </select>
          </div>
          
          <div class="form-actions">
            <button type="button" @click="closeDialogs" class="cancel-btn">
              Cancel
            </button>
            <button type="submit" class="submit-btn">
              {{ showEditDialog ? 'Save' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Track Selector Dialog -->
    <div v-if="showTrackSelector" class="dialog-overlay" @click.self="closeTrackSelector">
      <div class="dialog track-selector-dialog">
        <h3>Add Tracks to "{{ trackSelectorFolder?.name }}"</h3>
        
        <div class="search-bar">
          <input
            v-model="trackSearchQuery"
            type="text"
            placeholder="Search tracks..."
            @input="searchTracks"
          />
        </div>
        
        <div class="available-tracks">
          <div v-if="availableTracks.length === 0" class="no-tracks">
            No tracks available
          </div>
          <div
            v-for="track in availableTracks"
            :key="track.id"
            class="track-item"
            @click="addTrackToSelectedFolder(track.id)"
          >
            <span class="track-icon">🎵</span>
            <div class="track-info">
              <div class="track-title">{{ track.title }}</div>
              <div class="track-meta">{{ track.artist || 'Unknown' }}</div>
            </div>
            <button class="add-btn">➕</button>
          </div>
        </div>
        
        <div class="form-actions">
          <button @click="closeTrackSelector" class="cancel-btn">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div v-if="showDeleteConfirm" class="dialog-overlay" @click.self="showDeleteConfirm = false">
      <div class="dialog confirm-dialog">
        <h3>Delete Folder?</h3>
        <p>Are you sure you want to delete "{{ folderToDelete?.name }}"?</p>
        <p class="warning">This will not delete the tracks, only the folder organization.</p>
        
        <div class="form-actions">
          <button @click="showDeleteConfirm = false" class="cancel-btn">
            Cancel
          </button>
          <button @click="deleteFolder" class="delete-btn">
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Toast
      :message="toastMessage"
      :type="toastType"
      :show="showToast"
      @hide="showToast = false"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import api from '../services/api';
import FolderNode from './FolderNode.vue';
import Toast from './Toast.vue';

export default {
  name: 'FolderManager',
  components: { FolderNode, Toast },
  setup() {
    const folders = ref([]);
    const flatFolders = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const selectedFolder = ref(null);
    const selectedFolderId = ref(null);
    
    const showCreateDialog = ref(false);
    const showEditDialog = ref(false);
    const editingFolder = ref(null);
    const folderForm = ref({ name: '', parent_id: null });
    
    const showDeleteConfirm = ref(false);
    const folderToDelete = ref(null);
    
    const showTrackSelector = ref(false);
    const trackSelectorFolder = ref(null);
    const availableTracks = ref([]);
    const trackSearchQuery = ref('');

    // Toast notification
    const showToast = ref(false);
    const toastMessage = ref('');
    const toastType = ref('info');

    const showNotification = (message, type = 'info') => {
      toastMessage.value = message;
      toastType.value = type;
      showToast.value = true;
    };

    // Build folder path for display
    const buildFolderPath = (folder, flatList) => {
      if (!folder) return '';
      const path = [];
      let current = folder;
      while (current) {
        path.unshift(current.name);
        current = current.parent_id ? flatList.find(f => f.id === current.parent_id) : null;
      }
      return '/' + path.join('/');
    };

    // Recursively flatten the folder tree in parent-child order
    function flattenFoldersTree(tree, flatList, result = []) {
      for (const folder of tree) {
        result.push({
          ...folder,
          path: buildFolderPath(folder, flatList)
        });
        if (folder.children && folder.children.length > 0) {
          flattenFoldersTree(folder.children, flatList, result);
        }
      }
      return result;
    }

    // Computed property for folders with paths, sorted by tree order
    const foldersWithPaths = computed(() => {
      return flattenFoldersTree(folders.value, flatFolders.value);
    });

    const loadFolders = async () => {
      loading.value = true;
      error.value = null;
      try {
        const response = await api.getFolders();
        folders.value = response.folders;
        
        // Also load flat list for parent selector
        const flatResponse = await api.getFoldersFlat();
        flatFolders.value = flatResponse.folders;
      } catch (err) {
        error.value = 'Failed to load folders';
        console.error(err);
      } finally {
        loading.value = false;
      }
    };

    const selectFolder = async (folder) => {
      try {
        const response = await api.getFolder(folder.id);
        selectedFolder.value = response;
        selectedFolderId.value = folder.id;
      } catch (err) {
        console.error('Failed to load folder details:', err);
      }
    };

    const createFolder = async () => {
      try {
        await api.createFolder(
          folderForm.value.name,
          folderForm.value.parent_id
        );
        closeDialogs();
        await loadFolders();
        showNotification('Folder created successfully', 'success');
      } catch (err) {
        console.error('Failed to create folder:', err);
        showNotification('Failed to create folder', 'error');
      }
    };

    const editFolder = (folder) => {
      editingFolder.value = folder;
      folderForm.value = {
        name: folder.name,
        parent_id: folder.parent_id,
      };
      showEditDialog.value = true;
    };

    const saveEdit = async () => {
      if (!editingFolder.value) {
        console.error('No folder being edited');
        return;
      }
      
      try {
        const folderId = editingFolder.value.id;
        await api.updateFolder(folderId, folderForm.value);
        
        const wasSelected = selectedFolderId.value === folderId;
        
        closeDialogs();
        await loadFolders();
        
        if (wasSelected) {
          await selectFolder({ id: folderId });
        }
        showNotification('Folder updated successfully', 'success');
      } catch (err) {
        console.error('Failed to update folder:', err);
        showNotification('Failed to update folder', 'error');
      }
    };

    const confirmDelete = (folder) => {
      folderToDelete.value = folder;
      showDeleteConfirm.value = true;
    };

    const deleteFolder = async () => {
      try {
        await api.deleteFolder(folderToDelete.value.id);
        showDeleteConfirm.value = false;
        if (selectedFolderId.value === folderToDelete.value.id) {
          selectedFolder.value = null;
          selectedFolderId.value = null;
        }
        await loadFolders();
        showNotification('Folder deleted successfully', 'success');
      } catch (err) {
        console.error('Failed to delete folder:', err);
        showNotification(err.message || 'Failed to delete folder', 'error');
      }
    };

    const openTrackSelector = async (folder) => {
      trackSelectorFolder.value = folder;
      showTrackSelector.value = true;
      await loadAvailableTracks();
    };

    const loadAvailableTracks = async () => {
      try {
        const response = await api.getTracks();
        availableTracks.value = response.tracks;
      } catch (err) {
        console.error('Failed to load tracks:', err);
      }
    };

    const searchTracks = async () => {
      try {
        if (trackSearchQuery.value) {
          const response = await api.searchTracks(trackSearchQuery.value);
          availableTracks.value = response.tracks;
        } else {
          await loadAvailableTracks();
        }
      } catch (err) {
        console.error('Failed to search tracks:', err);
      }
    };

    const addTrackToSelectedFolder = async (trackId) => {
      try {
        await api.addTrackToFolder(trackSelectorFolder.value.id, trackId);
        if (selectedFolderId.value === trackSelectorFolder.value.id) {
          await selectFolder(trackSelectorFolder.value);
        }
        showNotification('Track added to folder', 'success');
      } catch (err) {
        console.error('Failed to add track to folder:', err);
        if (err.message?.includes('already exists')) {
          showNotification('Track is already in this folder', 'warning');
        } else {
          showNotification(err.message || 'Failed to add track', 'error');
        }
      }
    };

    const removeTrackFromFolder = async (trackId) => {
      try {
        await api.removeTrackFromFolder(selectedFolder.value.id, trackId);
        await selectFolder({ id: selectedFolder.value.id });
      } catch (err) {
        console.error('Failed to remove track:', err);
      }
    };

    const handleDropTrack = async ({ trackId, folderId, folderName }) => {
      try {
        await api.addTrackToFolder(folderId, trackId);
        showNotification(`Track added to "${folderName}"`, 'success');
        
        // Refresh selected folder if it's the one we dropped into
        if (selectedFolderId.value === folderId) {
          await selectFolder({ id: folderId });
        }
      } catch (err) {
        console.error('Failed to add track to folder:', err);
        if (err.message?.includes('already exists')) {
          showNotification(`Track is already in "${folderName}"`, 'warning');
        } else {
          showNotification('Failed to add track to folder', 'error');
        }
      }
    };

    const handleRemoveTrack = async ({ trackId, folderId }) => {
      try {
        await api.removeTrackFromFolder(folderId, trackId);
        await selectFolder({ id: folderId });
        showNotification('Track removed from folder', 'success');
      } catch (err) {
        console.error('Failed to remove track:', err);
        showNotification('Failed to remove track from folder', 'error');
      }
    };

    const closeDialogs = () => {
      showCreateDialog.value = false;
      showEditDialog.value = false;
      editingFolder.value = null;
      folderForm.value = { name: '', parent_id: null };
    };

    const closeTrackSelector = () => {
      showTrackSelector.value = false;
      trackSelectorFolder.value = null;
      trackSearchQuery.value = '';
    };

    onMounted(() => {
      loadFolders();
    });

    return {
      folders,
      flatFolders,
      foldersWithPaths,
      loading,
      error,
      selectedFolder,
      selectedFolderId,
      showCreateDialog,
      showEditDialog,
      editingFolder,
      folderForm,
      showDeleteConfirm,
      folderToDelete,
      showTrackSelector,
      trackSelectorFolder,
      availableTracks,
      trackSearchQuery,
      showToast,
      toastMessage,
      toastType,
      selectFolder,
      createFolder,
      editFolder,
      saveEdit,
      confirmDelete,
      deleteFolder,
      openTrackSelector,
      searchTracks,
      addTrackToSelectedFolder,
      removeTrackFromFolder,
      handleDropTrack,
      handleRemoveTrack,
      closeDialogs,
      closeTrackSelector,
    };
  },
};
</script>

<style scoped>
.folder-manager {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.manager-header h3 {
  margin: 0;
  color: #e0e0e0;
  font-size: 1.3em;
}

.create-btn {
  padding: 8px 16px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s;
}

.create-btn:hover {
  background: #45a049;
}

.folder-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin-bottom: 20px;
}

.folder-tracks {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 15px;
  margin-top: auto;
}

.tracks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.tracks-header h4 {
  margin: 0;
  color: #4CAF50;
}

.add-track-btn {
  padding: 6px 12px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.85em;
  transition: background 0.2s;
}

.add-track-btn:hover {
  background: #4CAF50;
}

.tracks-list {
  max-height: 300px;
  overflow-y: auto;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  margin-bottom: 4px;
  background: #2a2a2a;
  border-radius: 4px;
  transition: background 0.2s;
}

.track-item:hover {
  background: #333;
}

.track-icon {
  font-size: 1.2em;
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
}

.remove-btn {
  padding: 4px 8px;
  background: #f44336;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.track-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: #d32f2f;
}

.loading, .error, .no-folders, .no-tracks {
  padding: 20px;
  text-align: center;
  color: #999;
}

.error {
  color: #f44336;
}

/* Dialog Styles */
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
  border-radius: 12px;
  padding: 25px;
  min-width: 400px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}

.track-selector-dialog {
  min-width: 500px;
}

.dialog h3 {
  margin: 0 0 20px 0;
  color: #e0e0e0;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #999;
  font-size: 0.9em;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 1em;
}

.form-group input:focus,
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
  font-size: 0.9em;
  transition: background 0.2s;
}

.cancel-btn {
  background: #444;
  color: white;
}

.cancel-btn:hover {
  background: #555;
}

.submit-btn {
  background: #4CAF50;
  color: white;
}

.submit-btn:hover {
  background: #45a049;
}

.delete-btn {
  background: #f44336;
  color: white;
}

.delete-btn:hover {
  background: #d32f2f;
}

.confirm-dialog p {
  color: #e0e0e0;
  margin: 10px 0;
}

.warning {
  color: #ff9800 !important;
  font-size: 0.9em;
}

.search-bar {
  margin-bottom: 15px;
}

.search-bar input {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e0e0e0;
}

.available-tracks {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 15px;
}

.available-tracks .track-item {
  cursor: pointer;
}

.add-btn {
  padding: 4px 8px;
  background: #4CAF50;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.track-item:hover .add-btn {
  opacity: 1;
}
</style>
