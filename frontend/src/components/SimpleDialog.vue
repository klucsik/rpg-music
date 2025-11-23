<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="show" class="dialog-overlay">
        <div class="dialog-container" @click.stop>
          <div class="dialog-header">
            <h3>{{ title }}</h3>
            <button class="close-btn" @click="handleClose" title="Close">×</button>
          </div>
          
          <div class="dialog-content">
            <p>{{ message }}</p>
          </div>
          
          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="handleClose">
              Back
            </button>
            <a 
              v-if="continueUrl" 
              :href="continueUrl" 
              target="_blank" 
              rel="noopener noreferrer"
              class="btn btn-primary"
              @click="handleContinue"
            >
              Continue
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Confirmation'
  },
  message: {
    type: String,
    required: true
  },
  continueUrl: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'continue']);

const handleClose = () => {
  emit('close');
};

const handleContinue = () => {
  emit('continue');
};
</script>

<style scoped>
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
  z-index: 9999;
  padding: 20px;
}

.dialog-container {
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-width: 500px;
  width: 100%;
  border: 1px solid #444;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #444;
  background: #222;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.2em;
  color: white;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 2em;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  line-height: 1;
}

.close-btn:hover {
  background: #333;
  color: white;
}

.dialog-content {
  padding: 24px 20px;
  color: #ddd;
  line-height: 1.6;
}

.dialog-content p {
  margin: 0;
  font-size: 1em;
}

.dialog-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #444;
  background: #222;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 0.95em;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
}

.btn-secondary {
  background: #444;
  color: white;
}

.btn-secondary:hover {
  background: #555;
}

.btn-primary {
  background: #4CAF50;
  color: white;
}

.btn-primary:hover {
  background: #45a049;
}

/* Dialog transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog-container,
.dialog-leave-active .dialog-container {
  transition: transform 0.2s ease;
}

.dialog-enter-from .dialog-container,
.dialog-leave-to .dialog-container {
  transform: scale(0.9);
}
</style>
