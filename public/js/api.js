// ─── Spotify API Client ──────────────────────────────────────────────────────

class SpotifyAPI {
  constructor() {
    this.sessionId = null;
    this.currentUser = null;
    this.pollInterval = null;
    this.currentTrack = null;
    this.onTrackChange = null;
    this.onPlaybackUpdate = null;
  }

  init() {
    // Check URL for session token
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const error = params.get('error');

    if (error) {
      console.error('Auth error:', error);
      return false;
    }

    if (session) {
      this.sessionId = session;
      localStorage.setItem('spotify_session', session);
      // Clean URL
      window.history.replaceState({}, '', '/');
      return true;
    }

    // Check localStorage
    const stored = localStorage.getItem('spotify_session');
    if (stored) {
      this.sessionId = stored;
      return true;
    }

    return false;
  }

  async checkSession() {
    if (!this.sessionId) return false;
    try {
      const res = await this.fetch('/api/session');
      return res.authenticated;
    } catch {
      return false;
    }
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.sessionId}`,
      'Content-Type': 'application/json'
    };
  }

  async fetch(url, options = {}) {
    const res = await window.fetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options.headers }
    });
    if (res.status === 401) {
      this.logout();
      throw new Error('Session expired');
    }
    return res.json();
  }

  async fetchSpotify(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `/api/spotify/${endpoint}${query ? '?' + query : ''}`;
    return this.fetch(url);
  }

  async postSpotify(endpoint, body = {}) {
    return this.fetch(`/api/spotify/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  // ─── User ──────────────────────────────────────────────────────────────────

  async getMe() {
    if (!this.currentUser) {
      this.currentUser = await this.fetchSpotify('me');
    }
    return this.currentUser;
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  async getCurrentPlayback() {
    return this.fetchSpotify('me/player/currently-playing');
  }

  startPolling(intervalMs = 3000) {
    this.stopPolling();
    this.pollPlayback();
    this.pollInterval = setInterval(() => this.pollPlayback(), intervalMs);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async pollPlayback() {
    try {
      const data = await this.getCurrentPlayback();
      if (data && data.item) {
        const trackId = data.item.id;
        const changed = !this.currentTrack || this.currentTrack.id !== trackId;
        this.currentTrack = data.item;

        if (this.onPlaybackUpdate) {
          this.onPlaybackUpdate(data);
        }
        if (changed && this.onTrackChange) {
          this.onTrackChange(data.item);
        }
      }
    } catch (err) {
      // Silently handle polling errors
    }
  }

  // ─── History & Top Items ───────────────────────────────────────────────────

  async getRecentlyPlayed(limit = 50) {
    return this.fetchSpotify('me/player/recently-played', { limit });
  }

  async getTopTracks(timeRange = 'medium_term', limit = 50) {
    return this.fetchSpotify('me/top/tracks', { time_range: timeRange, limit });
  }

  async getTopArtists(timeRange = 'medium_term', limit = 50) {
    return this.fetchSpotify('me/top/artists', { time_range: timeRange, limit });
  }

  // ─── Audio Features ────────────────────────────────────────────────────────

  async getAudioFeatures(trackIds) {
    // Spotify allows max 100 IDs at a time
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }
    const results = [];
    for (const chunk of chunks) {
      const data = await this.fetchSpotify('audio-features', { ids: chunk.join(',') });
      if (data.audio_features) {
        results.push(...data.audio_features);
      }
    }
    return results;
  }

  // ─── Recommendations ──────────────────────────────────────────────────────

  async getRecommendations(params) {
    return this.fetchSpotify('recommendations', params);
  }

  // ─── Playlists ─────────────────────────────────────────────────────────────

  async createPlaylist(userId, name, description = '', isPublic = true) {
    return this.postSpotify(`users/${userId}/playlists`, {
      name,
      description,
      public: isPublic
    });
  }

  async addTracksToPlaylist(playlistId, uris) {
    // Max 100 at a time
    for (let i = 0; i < uris.length; i += 100) {
      await this.postSpotify(`playlists/${playlistId}/tracks`, {
        uris: uris.slice(i, i + 100)
      });
    }
  }

  // ─── Profile ───────────────────────────────────────────────────────────────

  async saveProfile(userId, profileData) {
    return this.fetch(`/api/profile/${userId}`, {
      method: 'POST',
      body: JSON.stringify(profileData)
    });
  }

  async loadProfile(userId) {
    return this.fetch(`/api/profile/${userId}`);
  }

  // ─── Upload ────────────────────────────────────────────────────────────────

  async uploadHistoryFiles(files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await window.fetch('/api/upload-history', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.sessionId}` },
      body: formData
    });
    return res.json();
  }

  logout() {
    this.sessionId = null;
    this.currentUser = null;
    this.currentTrack = null;
    this.stopPolling();
    localStorage.removeItem('spotify_session');
    window.location.href = '/';
  }
}

// Global instance
const api = new SpotifyAPI();
