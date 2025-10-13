<template>
  <div class="folder-node">
    <div 
      class="folder-item"
      :class="{ selected: folder.id === selectedFolderId }"
      @click.stop="$emit('select', folder)"
    >
      <span class="folder-icon">
        {{ folder.children && folder.children.length > 0 ? '📂' : '📁' }}
      </span>
      <span class="folder-name">{{ folder.name }}</span>
      <div class="folder-actions">
        <button @click.stop="$emit('add-track', folder)" title="Add tracks">➕</button>
        <button @click.stop="$emit('edit', folder)" title="Edit">✏️</button>
        <button @click.stop="$emit('delete', folder)" title="Delete">🗑️</button>
      </div>
    </div>
    <div v-if="folder.children && folder.children.length > 0" class="folder-children">
      <FolderNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :selected-folder-id="selectedFolderId"
        @select="$emit('select', $event)"
        @edit="$emit('edit', $event)"
        @delete="$emit('delete', $event)"
        @add-track="$emit('add-track', $event)"
      />
    </div>
  </div>
</template>

<script>
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
  },
  emits: ['select', 'edit', 'delete', 'add-track'],
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
</style>
