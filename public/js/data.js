// ─── Data Tab Controller ─────────────────────────────────────────────────────

class DataManager {
  constructor() {
    this.historyData = [];
    this.filteredData = [];
    this.charts = {};
    this.chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0a0b0', font: { size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    };
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Source toggle
    document.querySelectorAll('.source-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const source = btn.dataset.source;
        document.getElementById('api-source').classList.toggle('hidden', source !== 'api');
        document.getElementById('upload-source').classList.toggle('hidden', source !== 'upload');
      });
    });

    // API buttons
    document.getElementById('load-recent-btn')?.addEventListener('click', () => this.loadRecentTracks());
    document.getElementById('load-top-tracks-btn')?.addEventListener('click', () => this.loadTopTracks());
    document.getElementById('load-top-artists-btn')?.addEventListener('click', () => this.loadTopArtists());

    // Upload
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    uploadZone?.addEventListener('click', () => fileInput?.click());
    uploadZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this.handleUpload(e.dataTransfer.files);
    });
    fileInput?.addEventListener('change', () => {
      if (fileInput.files.length) this.handleUpload(fileInput.files);
    });

    // Filters
    document.getElementById('apply-filters-btn')?.addEventListener('click', () => this.applyFilters());
  }

  // ─── API Data Loading ──────────────────────────────────────────────────────

  async loadRecentTracks() {
    try {
      const data = await api.getRecentlyPlayed(50);
      if (!data.items) return;

      const tracks = data.items.map(item => ({
        trackName: item.track.name,
        artistName: item.track.artists.map(a => a.name).join(', '),
        albumName: item.track.album.name,
        playedAt: item.played_at,
        durationMs: item.track.duration_ms,
        trackId: item.track.id
      }));

      this.historyData = tracks;
      this.filteredData = tracks;
      this.updateUI();
    } catch (err) {
      console.error('Failed to load recent tracks:', err);
    }
  }

  async loadTopTracks() {
    try {
      const range = document.getElementById('api-time-range')?.value || 'medium_term';
      const data = await api.getTopTracks(range, 50);
      if (!data.items) return;

      const tracks = data.items.map((item, i) => ({
        trackName: item.name,
        artistName: item.artists.map(a => a.name).join(', '),
        albumName: item.album.name,
        playedAt: null,
        durationMs: item.duration_ms,
        trackId: item.id,
        rank: i + 1
      }));

      this.historyData = tracks;
      this.filteredData = tracks;
      this.updateUI();
    } catch (err) {
      console.error('Failed to load top tracks:', err);
    }
  }

  async loadTopArtists() {
    try {
      const range = document.getElementById('api-time-range')?.value || 'medium_term';
      const data = await api.getTopArtists(range, 50);
      if (!data.items) return;

      this.renderTopArtistsChart(data.items);
    } catch (err) {
      console.error('Failed to load top artists:', err);
    }
  }

  // ─── Upload Handling ───────────────────────────────────────────────────────

  async handleUpload(files) {
    const status = document.getElementById('upload-status');
    status.textContent = `Uploading ${files.length} file(s)...`;

    try {
      const result = await api.uploadHistoryFiles(files);
      if (result.success) {
        status.textContent = `Loaded ${result.count} records`;
        // Normalize Spotify export format
        this.historyData = this.normalizeUploadedData(result.data);
        this.filteredData = [...this.historyData];
        this.updateUI();
      } else {
        status.textContent = `Error: ${result.error}`;
      }
    } catch (err) {
      status.textContent = 'Upload failed';
      console.error(err);
    }
  }

  normalizeUploadedData(data) {
    return data.map(item => {
      // Handle both extended and standard Spotify export formats
      return {
        trackName: item.master_metadata_track_name || item.trackName || item.track_name || 'Unknown',
        artistName: item.master_metadata_album_artist_name || item.artistName || item.artist_name || 'Unknown',
        albumName: item.master_metadata_album_album_name || item.albumName || item.album_name || '',
        playedAt: item.ts || item.endTime || item.played_at || null,
        durationMs: item.ms_played || item.durationMs || item.duration_ms || 0,
        trackId: item.spotify_track_uri?.split(':').pop() || null
      };
    }).filter(item => item.trackName !== 'Unknown' || item.artistName !== 'Unknown');
  }

  // ─── Filters ───────────────────────────────────────────────────────────────

  applyFilters() {
    const startDate = document.getElementById('filter-start')?.value;
    const endDate = document.getElementById('filter-end')?.value;
    const minPlays = parseInt(document.getElementById('filter-min-plays')?.value) || 1;

    let filtered = [...this.historyData];

    if (startDate) {
      filtered = filtered.filter(t => t.playedAt && t.playedAt >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(t => t.playedAt && t.playedAt <= endDate + 'T23:59:59');
    }

    // Group by track for min plays filter
    if (minPlays > 1) {
      const counts = {};
      filtered.forEach(t => {
        const key = `${t.trackName}|${t.artistName}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      filtered = filtered.filter(t => {
        const key = `${t.trackName}|${t.artistName}`;
        return counts[key] >= minPlays;
      });
    }

    this.filteredData = filtered;
    this.updateUI();
  }

  // ─── UI Updates ────────────────────────────────────────────────────────────

  updateUI() {
    this.updateSummary();
    this.updateTable();
    this.updateCharts();
  }

  updateSummary() {
    const data = this.filteredData;
    const uniqueArtists = new Set(data.map(t => t.artistName));
    const totalMinutes = Math.round(data.reduce((sum, t) => sum + (t.durationMs || 0), 0) / 60000);

    // Top genre (approximate from artist names - would need API for real genres)
    const artistCounts = {};
    data.forEach(t => { artistCounts[t.artistName] = (artistCounts[t.artistName] || 0) + 1; });
    const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('total-tracks').textContent = data.length;
    document.getElementById('unique-artists').textContent = uniqueArtists.size;
    document.getElementById('total-minutes').textContent = totalMinutes.toLocaleString();
    document.getElementById('top-genre').textContent = topArtist ? topArtist[0].split(',')[0] : '--';
  }

  updateTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    const rows = this.filteredData.slice(0, 200).map(t => {
      const duration = t.durationMs ? `${Math.floor(t.durationMs / 60000)}:${String(Math.floor((t.durationMs % 60000) / 1000)).padStart(2, '0')}` : '--';
      const played = t.playedAt ? new Date(t.playedAt).toLocaleString() : (t.rank ? `#${t.rank}` : '--');
      return `<tr>
        <td>${this.escapeHtml(t.trackName)}</td>
        <td>${this.escapeHtml(t.artistName)}</td>
        <td>${this.escapeHtml(t.albumName)}</td>
        <td>${played}</td>
        <td>${duration}</td>
      </tr>`;
    }).join('');

    tbody.innerHTML = rows;
  }

  updateCharts() {
    this.renderTimelineChart();
    this.renderTopTracksChart();
    this.renderTopArtistsChartFromData();
    this.renderByHourChart();
  }

  renderTimelineChart() {
    const data = this.filteredData.filter(t => t.playedAt);
    if (!data.length) return;

    // Group by date
    const byDate = {};
    data.forEach(t => {
      const date = t.playedAt.split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    const sorted = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));

    this.renderChart('chart-timeline', 'line', {
      labels: sorted.map(d => d[0]),
      datasets: [{
        label: 'Tracks Played',
        data: sorted.map(d => d[1]),
        borderColor: '#1DB954',
        backgroundColor: 'rgba(29,185,84,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }]
    });
  }

  renderTopTracksChart() {
    const counts = {};
    this.filteredData.forEach(t => {
      const key = t.trackName;
      counts[key] = (counts[key] || 0) + 1;
    });

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    this.renderChart('chart-top-tracks', 'bar', {
      labels: top.map(t => t[0].slice(0, 25)),
      datasets: [{
        label: 'Play Count',
        data: top.map(t => t[1]),
        backgroundColor: 'rgba(29,185,84,0.6)',
        borderColor: '#1DB954',
        borderWidth: 1
      }]
    }, { indexAxis: 'y' });
  }

  renderTopArtistsChartFromData() {
    const counts = {};
    this.filteredData.forEach(t => {
      counts[t.artistName] = (counts[t.artistName] || 0) + 1;
    });

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const colors = ['#1DB954', '#1ed760', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    this.renderChart('chart-top-artists', 'doughnut', {
      labels: top.map(a => a[0]),
      datasets: [{
        data: top.map(a => a[1]),
        backgroundColor: colors
      }]
    }, { scales: {} });
  }

  renderTopArtistsChart(artists) {
    const top = artists.slice(0, 10);
    const colors = ['#1DB954', '#1ed760', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    this.renderChart('chart-top-artists', 'doughnut', {
      labels: top.map(a => a.name),
      datasets: [{
        data: top.map((a, i) => top.length - i),
        backgroundColor: colors
      }]
    }, { scales: {} });
  }

  renderByHourChart() {
    const data = this.filteredData.filter(t => t.playedAt);
    if (!data.length) return;

    const hours = new Array(24).fill(0);
    data.forEach(t => {
      const hour = new Date(t.playedAt).getHours();
      hours[hour]++;
    });

    this.renderChart('chart-by-hour', 'bar', {
      labels: hours.map((_, i) => `${i}:00`),
      datasets: [{
        label: 'Tracks',
        data: hours,
        backgroundColor: hours.map((v, i) => {
          const max = Math.max(...hours);
          const intensity = v / max;
          return `rgba(29,185,84,${0.2 + intensity * 0.6})`;
        }),
        borderRadius: 4
      }]
    });
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
      options: { ...this.chartDefaults, ...extraOptions }
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}

const dataManager = new DataManager();
