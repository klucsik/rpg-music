<template>
  <transition name="toast">
    <div v-if="visible" class="toast" :class="type">
      <span class="toast-icon">{{ icon }}</span>
      <span class="toast-message">{{ message }}</span>
    </div>
  </transition>
</template>

<script>
import { ref, watch } from 'vue';

export default {
  name: 'Toast',
  props: {
    message: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      default: 'info', // info, success, warning, error
    },
    duration: {
      type: Number,
      default: 3000,
    },
    show: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['hide'],
  setup(props, { emit }) {
    const visible = ref(false);
    let timeout = null;

    const icon = ref('ℹ️');

    watch(() => props.type, (newType) => {
      switch (newType) {
        case 'success':
          icon.value = '✓';
          break;
        case 'warning':
          icon.value = '⚠️';
          break;
        case 'error':
          icon.value = '✕';
          break;
        default:
          icon.value = 'ℹ️';
      }
    }, { immediate: true });

    watch(() => props.show, (shouldShow) => {
      if (shouldShow) {
        visible.value = true;
        
        if (timeout) {
          clearTimeout(timeout);
        }
        
        timeout = setTimeout(() => {
          visible.value = false;
          emit('hide');
        }, props.duration);
      } else {
        visible.value = false;
      }
    });

    return {
      visible,
      icon,
    };
  },
};
</script>

<style scoped>
.toast {
  position: fixed;
  top: 80px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  min-width: 250px;
  max-width: 400px;
  border-left: 4px solid #4CAF50;
}

.toast.info {
  border-left-color: #2196F3;
}

.toast.success {
  border-left-color: #4CAF50;
}

.toast.warning {
  border-left-color: #FF9800;
}

.toast.error {
  border-left-color: #f44336;
}

.toast-icon {
  font-size: 1.5em;
  flex-shrink: 0;
}

.toast.success .toast-icon {
  color: #4CAF50;
  font-weight: bold;
}

.toast.warning .toast-icon {
  color: #FF9800;
}

.toast.error .toast-icon {
  color: #f44336;
}

.toast.info .toast-icon {
  color: #2196F3;
}

.toast-message {
  color: #e0e0e0;
  font-size: 0.95em;
  line-height: 1.4;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}
</style>
