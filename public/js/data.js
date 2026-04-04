// ─── Data Tab Controller ─────────────────────────────────────────────────────

class DataManager {
  constructor() {
    this.historyData = [];
    this.filteredData = [];
    this.charts = {};
    this.lastLoadAction = null;
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

    // Time range change → auto-reload whatever was last loaded
    document.getElementById('api-time-range')?.addEventListener('change', () => {
      if (this.lastLoadAction) this.lastLoadAction();
    });

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

  // ─── Loading State ─────────────────────────────────────────────────────────

  setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Loading...';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.disabled = false;
    }
  }

  showError(btnId, msg) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.textContent = msg;
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = btn.dataset.originalText || 'Load';
    }, 3000);
  }

  // ─── API Data Loading ──────────────────────────────────────────────────────

  async loadRecentTracks() {
    this.lastLoadAction = () => this.loadRecentTracks();
    this.setButtonLoading('load-recent-btn', true);

    try {
      const data = await api.getRecentlyPlayed(50);
      if (!data.items || !data.items.length) {
        this.showError('load-recent-btn', 'No recent tracks found');
        return;
      }

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
      this.setButtonLoading('load-recent-btn', false);
    } catch (err) {
      console.error('Failed to load recent tracks:', err);
      this.showError('load-recent-btn', 'Failed to load');
    }
  }

  async loadTopTracks() {
    this.lastLoadAction = () => this.loadTopTracks();
    this.setButtonLoading('load-top-tracks-btn', true);

    try {
      const range = document.getElementById('api-time-range')?.value || 'medium_term';
      const data = await api.getTopTracks(range, 50);
      if (!data.items || !data.items.length) {
        this.showError('load-top-tracks-btn', 'No top tracks found');
        return;
      }

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
      this.setButtonLoading('load-top-tracks-btn', false);
    } catch (err) {
      console.error('Failed to load top tracks:', err);
      this.showError('load-top-tracks-btn', 'Failed to load');
    }
  }

  async loadTopArtists() {
    this.lastLoadAction = () => this.loadTopArtists();
    this.setButtonLoading('load-top-artists-btn', true);

    try {
      const range = document.getElementById('api-time-range')?.value || 'medium_term';
      const data = await api.getTopArtists(range, 50);
      if (!data.items || !data.items.length) {
        this.showError('load-top-artists-btn', 'No top artists found');
        return;
      }

      // Convert artists into track-like rows so summary/table/charts all work
      const artistRows = data.items.map((artist, i) => ({
        trackName: artist.genres?.slice(0, 2).join(', ') || '--',
        artistName: artist.name,
        albumName: `Popularity: ${artist.popularity}`,
        playedAt: null,
        durationMs: 0,
        trackId: null,
        rank: i + 1
      }));

      this.historyData = artistRows;
      this.filteredData = artistRows;
      this.updateUI();

      // Also render the dedicated doughnut chart with real artist data
      this.renderTopArtistsChart(data.items);
      this.setButtonLoading('load-top-artists-btn', false);
    } catch (err) {
      console.error('Failed to load top artists:', err);
      this.showError('load-top-artists-btn', 'Failed to load');
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
    this.clearAllCharts();
    this.updateCharts();
  }

  updateSummary() {
    const data = this.filteredData;
    const uniqueArtists = new Set(data.map(t => t.artistName));
    const totalMinutes = Math.round(data.reduce((sum, t) => sum + (t.durationMs || 0), 0) / 60000);

    const artistCounts = {};
    data.forEach(t => { artistCounts[t.artistName] = (artistCounts[t.artistName] || 0) + 1; });
    const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('total-tracks').textContent = data.length;
    document.getElementById('unique-artists').textContent = uniqueArtists.size;
    document.getElementById('total-minutes').textContent = totalMinutes > 0 ? totalMinutes.toLocaleString() : '--';
    document.getElementById('top-genre').textContent = topArtist ? topArtist[0].split(',')[0] : '--';
  }

  updateTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!this.filteredData.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:2rem">No data loaded</td></tr>';
      return;
    }

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

  clearAllCharts() {
    for (const [id, chart] of Object.entries(this.charts)) {
      chart.destroy();
      delete this.charts[id];
    }
  }

  updateCharts() {
    const hasTimestamps = this.filteredData.some(t => t.playedAt);

    // Always render these — they work with any data
    this.renderTopTracksChart();
    this.renderTopArtistsChartFromData();

    // These need timestamps — show a message if no timestamps available
    if (hasTimestamps) {
      this.renderTimelineChart();
      this.renderByHourChart();
    } else {
      this.renderEmptyChart('chart-timeline', 'No timestamp data (use "Load Recent Tracks" or upload JSON)');
      this.renderEmptyChart('chart-by-hour', 'No timestamp data (use "Load Recent Tracks" or upload JSON)');
    }
  }

  renderEmptyChart(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
      delete this.charts[canvasId];
    }

    // Draw a message on the canvas
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;
    ctx.fillStyle = '#a0a0b0';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, 100);
  }

  renderTimelineChart() {
    const data = this.filteredData.filter(t => t.playedAt);
    if (!data.length) return;

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
    if (!this.filteredData.length) return;

    const counts = {};
    this.filteredData.forEach(t => {
      const key = t.trackName;
      counts[key] = (counts[key] || 0) + 1;
    });

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    this.renderChart('chart-top-tracks', 'bar', {
      labels: top.map(t => t[0].length > 25 ? t[0].slice(0, 23) + '...' : t[0]),
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
    if (!this.filteredData.length) return;

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

    const maxHour = Math.max(...hours);
    this.renderChart('chart-by-hour', 'bar', {
      labels: hours.map((_, i) => `${i}:00`),
      datasets: [{
        label: 'Tracks',
        data: hours,
        backgroundColor: hours.map(v => {
          const intensity = maxHour > 0 ? v / maxHour : 0;
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
