// ─── Analytics Tab Controller ────────────────────────────────────────────────

class AnalyticsManager {
  constructor() {
    this.charts = {};
    this.generatedTracks = [];
    this.topTracksCache = null;
    this.audioFeaturesCache = {};
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('analyze-trends-btn')?.addEventListener('click', () => this.analyzeTrends());
    document.getElementById('behavior-btn')?.addEventListener('click', () => this.generateBehaviorReport());
    document.getElementById('generate-playlist-btn')?.addEventListener('click', () => this.generatePlaylist());
    document.getElementById('save-playlist-btn')?.addEventListener('click', () => this.savePlaylistToSpotify());
    document.getElementById('save-profile-btn')?.addEventListener('click', () => this.saveProfile());
    document.getElementById('load-profile-btn')?.addEventListener('click', () => this.loadProfile());
  }

  // ─── Trend Analysis ────────────────────────────────────────────────────────

  async analyzeTrends() {
    const metric = document.getElementById('trend-metric')?.value || 'energy';
    const period = document.getElementById('trend-period')?.value || 'medium_term';

    try {
      // Get top tracks for the period
      const topData = await api.getTopTracks(period, 50);
      if (!topData.items) return;

      this.topTracksCache = topData.items;
      const trackIds = topData.items.map(t => t.id);
      const features = await api.getAudioFeatures(trackIds);

      // Cache features
      features.forEach(f => {
        if (f) this.audioFeaturesCache[f.id] = f;
      });

      // Plot trends
      this.renderTrendChart(topData.items, features, metric);
      this.renderRadarChart(features);
      this.renderGenreChart(topData.items);
    } catch (err) {
      console.error('Trend analysis failed:', err);
    }
  }

  renderTrendChart(tracks, features, metric) {
    const validFeatures = features.filter(f => f !== null);
    const labels = tracks.slice(0, validFeatures.length).map((t, i) => `#${i + 1}`);
    const data = validFeatures.map(f => f[metric] || 0);

    // Moving average
    const windowSize = 5;
    const movingAvg = data.map((_, i) => {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      const slice = data.slice(start, end);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });

    this.renderChart('chart-trends', 'line', {
      labels,
      datasets: [
        {
          label: metric.charAt(0).toUpperCase() + metric.slice(1),
          data,
          borderColor: '#1DB954',
          backgroundColor: 'rgba(29,185,84,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        },
        {
          label: 'Trend (Moving Avg)',
          data: movingAvg,
          borderColor: '#ff6b6b',
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    });
  }

  renderRadarChart(features) {
    const validFeatures = features.filter(f => f !== null);
    const metrics = ['energy', 'danceability', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'liveness'];

    const avgValues = metrics.map(m => {
      const sum = validFeatures.reduce((acc, f) => acc + (f[m] || 0), 0);
      return sum / validFeatures.length;
    });

    this.renderChart('chart-radar', 'radar', {
      labels: metrics.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
      datasets: [{
        label: 'Your Average',
        data: avgValues,
        borderColor: '#1DB954',
        backgroundColor: 'rgba(29,185,84,0.2)',
        pointBackgroundColor: '#1DB954',
        pointRadius: 4
      }]
    }, {
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.1)' },
          grid: { color: 'rgba(255,255,255,0.1)' },
          pointLabels: { color: '#a0a0b0' },
          ticks: { display: false },
          min: 0,
          max: 1
        }
      }
    });
  }

  renderGenreChart(tracks) {
    // Aggregate genres from track artists (simplified: group by first artist)
    const artistCounts = {};
    tracks.forEach(t => {
      const artist = t.artists[0]?.name || 'Unknown';
      artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });

    const top = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const colors = ['#1DB954', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];

    this.renderChart('chart-genres', 'polarArea', {
      labels: top.map(a => a[0]),
      datasets: [{
        data: top.map(a => a[1]),
        backgroundColor: colors.map(c => c + '80')
      }]
    }, {
      scales: {
        r: {
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { display: false }
        }
      }
    });
  }

  // ─── Behavior Report ───────────────────────────────────────────────────────

  async generateBehaviorReport() {
    try {
      const [recentData, topShort, topLong] = await Promise.all([
        api.getRecentlyPlayed(50),
        api.getTopTracks('short_term', 50),
        api.getTopTracks('long_term', 50)
      ]);

      // Analyze listening times
      const hours = new Array(24).fill(0);
      const days = new Array(7).fill(0);

      if (recentData.items) {
        recentData.items.forEach(item => {
          const d = new Date(item.played_at);
          hours[d.getHours()]++;
          days[d.getDay()]++;
        });
      }

      this.renderHeatmap(hours, days);

      // Get audio features for behavior analysis
      if (topShort.items) {
        const ids = topShort.items.map(t => t.id);
        const features = await api.getAudioFeatures(ids);
        features.forEach(f => { if (f) this.audioFeaturesCache[f.id] = f; });
      }
    } catch (err) {
      console.error('Behavior report failed:', err);
    }
  }

  renderHeatmap(hours, days) {
    const canvas = document.getElementById('chart-heatmap');
    if (!canvas) return;

    if (this.charts['chart-heatmap']) {
      this.charts['chart-heatmap'].destroy();
    }

    const ctx = canvas.getContext('2d');
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Create a simple heatmap-like bar chart grouped by time of day
    const timeSlots = ['Morning (6-12)', 'Afternoon (12-18)', 'Evening (18-24)', 'Night (0-6)'];
    const slotData = [
      hours.slice(6, 12).reduce((a, b) => a + b, 0),
      hours.slice(12, 18).reduce((a, b) => a + b, 0),
      hours.slice(18, 24).reduce((a, b) => a + b, 0),
      hours.slice(0, 6).reduce((a, b) => a + b, 0)
    ];

    this.charts['chart-heatmap'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: timeSlots,
        datasets: [
          {
            label: 'Listening Activity',
            data: slotData,
            backgroundColor: ['#feca57', '#ff6b6b', '#1DB954', '#45b7d1'],
            borderRadius: 6
          },
          {
            label: 'By Day',
            data: days,
            backgroundColor: 'rgba(29,185,84,0.4)',
            borderColor: '#1DB954',
            borderWidth: 1,
            type: 'bar',
            xAxisID: 'x2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#a0a0b0' } }
        },
        scales: {
          x: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x2: {
            labels: dayLabels,
            position: 'top',
            ticks: { color: '#a0a0b0' },
            grid: { display: false }
          },
          y: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // ─── Playlist Generation ───────────────────────────────────────────────────

  async generatePlaylist() {
    const btn = document.getElementById('generate-playlist-btn');
    const seedType = document.getElementById('playlist-seed')?.value || 'top-tracks';
    const targetEnergy = (document.getElementById('target-energy')?.value || 50) / 100;
    const targetValence = (document.getElementById('target-valence')?.value || 50) / 100;
    const targetDance = (document.getElementById('target-dance')?.value || 50) / 100;
    const count = parseInt(document.getElementById('playlist-count')?.value) || 20;

    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
      // First try the recommendations endpoint
      let tracks = await this.tryRecommendations(seedType, targetEnergy, targetValence, targetDance, count);

      // If recommendations failed (deprecated/unavailable), fall back to
      // filtering the user's own top tracks by audio features
      if (!tracks || !tracks.length) {
        tracks = await this.fallbackGenerateFromTopTracks(targetEnergy, targetValence, targetDance, count);
      }

      if (!tracks || !tracks.length) {
        btn.textContent = 'No tracks found — try different settings';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Generate Playlist'; }, 3000);
        return;
      }

      // Get audio features for the generated tracks
      const trackIds = tracks.map(t => t.id).filter(Boolean);
      let featureMap = {};
      if (trackIds.length) {
        try {
          const features = await api.getAudioFeatures(trackIds);
          features.forEach(f => { if (f) featureMap[f.id] = f; });
        } catch (e) {
          // Features are optional for display
        }
      }

      this.generatedTracks = tracks;
      this.renderPlaylistPreview(tracks, featureMap);

      document.getElementById('save-playlist-btn')?.classList.remove('hidden');
      btn.textContent = 'Generate Playlist';
      btn.disabled = false;
    } catch (err) {
      console.error('Playlist generation failed:', err);
      btn.textContent = 'Error — try again';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Generate Playlist'; }, 3000);
    }
  }

  async tryRecommendations(seedType, targetEnergy, targetValence, targetDance, count) {
    try {
      let seedTracks = [];

      switch (seedType) {
        case 'top-tracks': {
          const data = await api.getTopTracks('medium_term', 5);
          if (data.items) seedTracks = data.items.map(t => t.id).slice(0, 5);
          break;
        }
        case 'recent': {
          const data = await api.getRecentlyPlayed(5);
          if (data.items) seedTracks = data.items.map(i => i.track.id).slice(0, 5);
          break;
        }
        case 'mood':
        case 'energy': {
          const data = await api.getTopTracks('short_term', 5);
          if (data.items) seedTracks = data.items.map(t => t.id).slice(0, 5);
          break;
        }
      }

      if (!seedTracks.length) return null;

      const params = {
        seed_tracks: seedTracks.join(','),
        limit: count,
        target_energy: targetEnergy,
        target_valence: targetValence,
        target_danceability: targetDance
      };

      const recs = await api.getRecommendations(params);
      if (recs.tracks && recs.tracks.length) {
        return recs.tracks;
      }
      return null;
    } catch (err) {
      console.log('Recommendations endpoint unavailable, using fallback');
      return null;
    }
  }

  async fallbackGenerateFromTopTracks(targetEnergy, targetValence, targetDance, count) {
    // Pull a large pool from all three time ranges
    const [short, medium, long] = await Promise.all([
      api.getTopTracks('short_term', 50).catch(() => ({ items: [] })),
      api.getTopTracks('medium_term', 50).catch(() => ({ items: [] })),
      api.getTopTracks('long_term', 50).catch(() => ({ items: [] }))
    ]);

    // Deduplicate by track ID
    const seen = new Set();
    const pool = [];
    for (const list of [short.items, medium.items, long.items]) {
      if (!list) continue;
      for (const t of list) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          pool.push(t);
        }
      }
    }

    if (!pool.length) return null;

    // Get audio features for all tracks in the pool
    const ids = pool.map(t => t.id);
    let features;
    try {
      features = await api.getAudioFeatures(ids);
    } catch (e) {
      // If features unavailable, just return a shuffled subset
      return this.shuffle(pool).slice(0, count);
    }

    const featureMap = {};
    features.forEach(f => { if (f) featureMap[f.id] = f; });

    // Score each track by distance to target features
    const scored = pool.map(t => {
      const f = featureMap[t.id];
      if (!f) return { track: t, score: 999 };
      const dist = Math.sqrt(
        Math.pow((f.energy || 0) - targetEnergy, 2) +
        Math.pow((f.valence || 0) - targetValence, 2) +
        Math.pow((f.danceability || 0) - targetDance, 2)
      );
      return { track: t, score: dist };
    });

    // Sort by closest match, take top N
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, count).map(s => s.track);
  }

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  renderPlaylistPreview(tracks, featureMap) {
    const container = document.getElementById('playlist-tracks');
    const preview = document.getElementById('generated-playlist');
    if (!container || !preview) return;

    preview.classList.remove('hidden');

    container.innerHTML = tracks.map(t => {
      const f = featureMap[t.id];
      const art = t.album.images[t.album.images.length - 1]?.url || '';
      const featuresHtml = f ? `
        <div class="track-features">
          <span class="feature-badge">E: ${(f.energy * 100).toFixed(0)}%</span>
          <span class="feature-badge">D: ${(f.danceability * 100).toFixed(0)}%</span>
          <span class="feature-badge">V: ${(f.valence * 100).toFixed(0)}%</span>
        </div>
      ` : '';

      return `
        <div class="playlist-track-item">
          ${art ? `<img src="${this.escapeAttr(art)}" alt="">` : ''}
          <div class="track-info">
            <div class="track-name">${this.escapeHtml(t.name)}</div>
            <div class="track-artist">${this.escapeHtml(t.artists.map(a => a.name).join(', '))}</div>
          </div>
          ${featuresHtml}
        </div>
      `;
    }).join('');
  }

  async savePlaylistToSpotify() {
    if (!this.generatedTracks.length) return;

    const btn = document.getElementById('save-playlist-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      const user = await api.getMe();
      const name = document.getElementById('playlist-name')?.value || 'Spotify Viz Playlist';

      // Create the playlist
      const playlist = await api.createPlaylist(user.id, name, 'Generated by Spotify Viz');

      if (!playlist || playlist.error || !playlist.id) {
        const errMsg = playlist?.error?.message || playlist?.error || 'Failed to create playlist';
        console.error('Playlist creation failed:', playlist);
        btn.textContent = `Error: ${errMsg}`;
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Save to Spotify'; }, 4000);
        return;
      }

      // Build URIs — ensure each track has a valid URI
      const uris = this.generatedTracks
        .map(t => t.uri || (t.id ? `spotify:track:${t.id}` : null))
        .filter(Boolean);

      if (!uris.length) {
        btn.textContent = 'Error: No valid track URIs';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Save to Spotify'; }, 3000);
        return;
      }

      await api.addTracksToPlaylist(playlist.id, uris);

      btn.textContent = `Saved! (${uris.length} tracks)`;
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = 'Save to Spotify';
      }, 4000);
    } catch (err) {
      console.error('Failed to save playlist:', err);
      btn.textContent = 'Save failed — check console';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save to Spotify'; }, 4000);
    }
  }

  // ─── Profile Management ────────────────────────────────────────────────────

  async saveProfile() {
    try {
      const user = await api.getMe();
      const topTracks = await api.getTopTracks('medium_term', 20);
      const topArtists = await api.getTopArtists('medium_term', 20);

      let features = [];
      if (topTracks.items) {
        const ids = topTracks.items.map(t => t.id);
        features = await api.getAudioFeatures(ids);
      }

      const profile = {
        userId: user.id,
        displayName: user.display_name,
        snapshotDate: new Date().toISOString(),
        topTracks: topTracks.items?.map(t => ({
          name: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          id: t.id
        })),
        topArtists: topArtists.items?.map(a => ({
          name: a.name,
          genres: a.genres,
          popularity: a.popularity
        })),
        avgFeatures: this.computeAvgFeatures(features)
      };

      await api.saveProfile(user.id, profile);
      alert('Profile snapshot saved!');
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
  }

  async loadProfile() {
    try {
      const user = await api.getMe();
      const profile = await api.loadProfile(user.id);
      if (profile.error) {
        alert('No saved profile found. Save one first!');
        return;
      }
      console.log('Loaded profile:', profile);
      alert(`Profile loaded from ${new Date(profile.snapshotDate).toLocaleDateString()}`);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }

  computeAvgFeatures(features) {
    const valid = features.filter(f => f !== null);
    if (!valid.length) return {};

    const metrics = ['energy', 'danceability', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'liveness', 'tempo'];
    const avgs = {};
    metrics.forEach(m => {
      avgs[m] = valid.reduce((sum, f) => sum + (f[m] || 0), 0) / valid.length;
    });
    return avgs;
  }

  // ─── Chart Helper ──────────────────────────────────────────────────────────

  renderChart(canvasId, type, data, extraOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    this.charts[canvasId] = new Chart(canvas, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#a0a0b0', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        ...extraOptions
      }
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

const analyticsManager = new AnalyticsManager();
