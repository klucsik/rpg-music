// API base URL - defaults to current origin for bundled deployment
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * API client for backend communication
 */
class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Tracks
  async getTracks(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/tracks${queryString ? `?${queryString}` : ''}`);
  }

  async getTrack(id) {
    return this.request(`/api/tracks/${id}`);
  }

  async searchTracks(query) {
    return this.getTracks({ search: query });
  }

  // Folders
  async getFolders() {
    return this.request('/api/folders');
  }

  async getFolderTracks(folderId) {
    return this.getTracks({ folder_id: folderId });
  }

  // Playback
  async playTrack(trackId, startPosition = 0) {
    return this.request('/api/playback/play', {
      method: 'POST',
      body: JSON.stringify({ trackId, startPosition }),
    });
  }

  async pause() {
    return this.request('/api/playback/pause', { method: 'POST' });
  }

  async resume() {
    return this.request('/api/playback/resume', { method: 'POST' });
  }

  async stop() {
    return this.request('/api/playback/stop', { method: 'POST' });
  }

  async seek(position) {
    return this.request('/api/playback/seek', {
      method: 'POST',
      body: JSON.stringify({ position }),
    });
  }

  async setVolume(volume) {
    return this.request('/api/playback/volume', {
      method: 'POST',
      body: JSON.stringify({ volume }),
    });
  }

  async getPlaybackState() {
    return this.request('/api/playback/state');
  }

  // System
  async getStats() {
    return this.request('/api/stats');
  }

  async getClients() {
    return this.request('/api/clients');
  }

  // Audio stream URL
  getAudioUrl(trackId) {
    // If baseUrl is empty, use relative path
    const base = this.baseUrl || '';
    return `${base}/audio/${trackId}`;
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
