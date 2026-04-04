// ─── Industry Data Controller ────────────────────────────────────────────────

class IndustryManager {
  constructor() {
    this.charts = {};
  }

  init() {
    document.getElementById('artist-lookup-btn')?.addEventListener('click', () => this.lookupArtist());
    document.getElementById('compare-global-btn')?.addEventListener('click', () => this.compareToGlobal());
    document.getElementById('enrich-top-btn')?.addEventListener('click', () => this.enrichTopArtists());

    // Enter key on artist search
    document.getElementById('industry-artist-query')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.lookupArtist();
    });
  }

  showResults() {
    document.getElementById('industry-results')?.classList.remove('hidden');
  }

  // ─── MusicBrainz Artist Lookup ─────────────────────────────────────────────

  async lookupArtist() {
    const query = document.getElementById('industry-artist-query')?.value?.trim();
    if (!query) return;

    const btn = document.getElementById('artist-lookup-btn');
    btn.textContent = 'Searching...';
    btn.disabled = true;

    try {
      // Search for the artist
      const searchRes = await this.fetchJSON(`/api/musicbrainz/artist?query=${encodeURIComponent(query)}`);

      if (!searchRes.artists || !searchRes.artists.length) {
        btn.textContent = 'No results found';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Lookup Artist'; }, 3000);
        return;
      }

      const artist = searchRes.artists[0];
      const mbid = artist.id;

      // Fetch full details and releases in parallel
      const [details, releases] = await Promise.all([
        this.fetchJSON(`/api/musicbrainz/artist/${mbid}`),
        this.fetchJSON(`/api/musicbrainz/releases/${mbid}`)
      ]);

      this.showResults();
      this.renderArtistInfo(artist, details);
      this.renderDiscography(releases);
      this.renderArtistTags(details);

      btn.textContent = 'Lookup Artist';
      btn.disabled = false;
    } catch (err) {
      console.error('Artist lookup failed:', err);
      btn.textContent = 'Lookup failed';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Lookup Artist'; }, 3000);
    }
  }

  renderArtistInfo(artist, details) {
    const container = document.getElementById('artist-info-content');
    if (!container) return;

    const tags = (details.tags || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(t => `<span class="tag-badge">${this.escapeHtml(t.name)}</span>`)
      .join('');

    const lifeSpan = artist['life-span'] || {};
    const active = lifeSpan.begin
      ? `${lifeSpan.begin.slice(0, 4)}${lifeSpan.ended ? ' – ' + (lifeSpan.end || '').slice(0, 4) : ' – present'}`
      : '';

    const rating = details.rating?.value
      ? `${(details.rating.value).toFixed(1)}/5 (${details.rating['votes-count']} votes)`
      : '';

    container.innerHTML = `
      <div class="artist-info-grid">
        <div class="artist-info-main">
          <h3>${this.escapeHtml(artist.name)}</h3>
          <div class="artist-meta">
            ${artist.type ? `<span class="meta-item">Type: ${artist.type}</span>` : ''}
            ${artist.country ? `<span class="meta-item">Country: ${artist.country}</span>` : ''}
            ${active ? `<span class="meta-item">Active: ${active}</span>` : ''}
            ${rating ? `<span class="meta-item">Rating: ${rating}</span>` : ''}
            ${artist.disambiguation ? `<span class="meta-item">${this.escapeHtml(artist.disambiguation)}</span>` : ''}
          </div>
          ${tags ? `<div class="artist-tags">${tags}</div>` : ''}
        </div>
        <div class="artist-info-links">
          <a href="https://musicbrainz.org/artist/${artist.id}" target="_blank" rel="noopener" class="info-link">MusicBrainz</a>
        </div>
      </div>
    `;
  }

  renderDiscography(releases) {
    const groups = releases['release-groups'] || releases['release_groups'] || [];
    if (!groups.length) return;

    // Group by year
    const byYear = {};
    groups.forEach(rg => {
      const year = rg['first-release-date']?.slice(0, 4) || 'Unknown';
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(rg);
    });

    const years = Object.keys(byYear).filter(y => y !== 'Unknown').sort();
    const counts = years.map(y => byYear[y].length);

    this.renderChart('chart-discography', 'bar', {
      labels: years,
      datasets: [{
        label: 'Releases',
        data: counts,
        backgroundColor: 'rgba(29,185,84,0.6)',
        borderColor: '#1DB954',
        borderWidth: 1,
        borderRadius: 4
      }]
    });
  }

  renderArtistTags(details) {
    const tags = (details.tags || []).sort((a, b) => b.count - a.count).slice(0, 12);
    if (!tags.length) return;

    const colors = ['#1DB954', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#f368e0', '#ff9f43'];

    this.renderChart('chart-artist-tags', 'polarArea', {
      labels: tags.map(t => t.name),
      datasets: [{
        data: tags.map(t => t.count),
        backgroundColor: colors.slice(0, tags.length).map(c => c + '80')
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

  // ─── Last.fm Global Chart Comparison ───────────────────────────────────────

  async compareToGlobal() {
    const btn = document.getElementById('compare-global-btn');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
      // Get user's top artists from Spotify
      const topArtists = await api.getTopArtists('medium_term', 20);
      const userArtistNames = topArtists.items?.map(a => a.name) || [];

      if (!userArtistNames.length) {
        btn.textContent = 'No top artists found';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Compare to Global Charts'; }, 3000);
        return;
      }

      // Try Last.fm for global top artists
      let globalArtists = [];
      try {
        const lastfmData = await this.fetchJSON('/api/lastfm/chart.getTopArtists?limit=50');
        if (lastfmData.artists?.artist) {
          globalArtists = lastfmData.artists.artist.map(a => ({
            name: a.name,
            listeners: parseInt(a.listeners) || 0,
            playcount: parseInt(a.playcount) || 0
          }));
        }
      } catch (e) {
        // Last.fm not configured — use MusicBrainz popularity as fallback
        console.log('Last.fm not available, using score-based comparison');
      }

      this.showResults();

      if (globalArtists.length) {
        this.renderGlobalComparison(userArtistNames, globalArtists);
      } else {
        // Fallback: compare user's top artists by MusicBrainz score
        await this.renderMBComparison(userArtistNames);
      }

      btn.textContent = 'Compare to Global Charts';
      btn.disabled = false;
    } catch (err) {
      console.error('Global comparison failed:', err);
      btn.textContent = 'Comparison failed';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Compare to Global Charts'; }, 3000);
    }
  }

  renderGlobalComparison(userArtists, globalArtists) {
    const globalNames = globalArtists.map(a => a.name.toLowerCase());
    const globalTop20 = globalArtists.slice(0, 20);

    // Find overlap: how many of user's top artists are in global top 50
    const overlap = userArtists.filter(name =>
      globalNames.includes(name.toLowerCase())
    );

    // Build chart: show global top 20 with user's artists highlighted
    const labels = globalTop20.map(a => a.name.length > 20 ? a.name.slice(0, 18) + '...' : a.name);
    const listeners = globalTop20.map(a => a.listeners);
    const isUserArtist = globalTop20.map(a =>
      userArtists.some(u => u.toLowerCase() === a.name.toLowerCase())
    );

    const infoContainer = document.getElementById('artist-info-content');
    if (infoContainer && !document.getElementById('global-summary')) {
      const summaryHtml = `
        <div id="global-summary" class="global-summary">
          <div class="stat-card compact">
            <span class="stat-value">${overlap.length}</span>
            <span class="stat-label">of your top ${userArtists.length} in global top 50</span>
          </div>
          ${overlap.length > 0 ? `<div class="overlap-artists">
            <span class="overlap-label">Matching:</span>
            ${overlap.map(n => `<span class="tag-badge">${this.escapeHtml(n)}</span>`).join('')}
          </div>` : ''}
        </div>
      `;
      infoContainer.insertAdjacentHTML('beforeend', summaryHtml);
    }

    this.renderChart('chart-global-compare', 'bar', {
      labels,
      datasets: [{
        label: 'Global Listeners',
        data: listeners,
        backgroundColor: isUserArtist.map(is =>
          is ? 'rgba(29,185,84,0.8)' : 'rgba(255,255,255,0.15)'
        ),
        borderColor: isUserArtist.map(is =>
          is ? '#1DB954' : 'rgba(255,255,255,0.3)'
        ),
        borderWidth: 1,
        borderRadius: 4
      }]
    }, { indexAxis: 'y' });
  }

  async renderMBComparison(userArtists) {
    // Lookup each user artist on MusicBrainz to get score
    const results = [];
    for (const name of userArtists.slice(0, 10)) {
      try {
        const data = await this.fetchJSON(`/api/musicbrainz/artist?query=${encodeURIComponent(name)}`);
        if (data.artists?.[0]) {
          results.push({
            name: data.artists[0].name,
            score: data.artists[0].score || 0
          });
        }
        // Rate limit: MusicBrainz allows 1 req/sec
        await new Promise(r => setTimeout(r, 1100));
      } catch (e) {
        // Skip failed lookups
      }
    }

    if (!results.length) return;

    this.renderChart('chart-global-compare', 'bar', {
      labels: results.map(r => r.name.length > 20 ? r.name.slice(0, 18) + '...' : r.name),
      datasets: [{
        label: 'MusicBrainz Match Score',
        data: results.map(r => r.score),
        backgroundColor: 'rgba(29,185,84,0.6)',
        borderColor: '#1DB954',
        borderWidth: 1,
        borderRadius: 4
      }]
    }, { indexAxis: 'y' });
  }

  // ─── Enrich Top Artists ────────────────────────────────────────────────────

  async enrichTopArtists() {
    const btn = document.getElementById('enrich-top-btn');
    btn.textContent = 'Enriching...';
    btn.disabled = true;

    try {
      const topArtists = await api.getTopArtists('medium_term', 10);
      if (!topArtists.items?.length) {
        btn.textContent = 'No top artists';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Enrich My Top Artists'; }, 3000);
        return;
      }

      // Lookup each on MusicBrainz for genre tags
      const enriched = [];
      for (const artist of topArtists.items.slice(0, 10)) {
        try {
          const search = await this.fetchJSON(`/api/musicbrainz/artist?query=${encodeURIComponent(artist.name)}`);
          if (search.artists?.[0]) {
            const mb = search.artists[0];
            const mbid = mb.id;
            const details = await this.fetchJSON(`/api/musicbrainz/artist/${mbid}`);
            enriched.push({
              name: artist.name,
              spotifyGenres: artist.genres || [],
              mbTags: (details.tags || []).sort((a, b) => b.count - a.count).slice(0, 5),
              country: mb.country || '',
              type: mb.type || '',
              begin: mb['life-span']?.begin?.slice(0, 4) || ''
            });
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 1100));
        } catch (e) {
          // Skip
        }
      }

      this.showResults();
      this.renderEnrichedArtists(enriched);

      btn.textContent = 'Enrich My Top Artists';
      btn.disabled = false;
    } catch (err) {
      console.error('Enrichment failed:', err);
      btn.textContent = 'Enrichment failed';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Enrich My Top Artists'; }, 3000);
    }
  }

  renderEnrichedArtists(artists) {
    const container = document.getElementById('artist-info-content');
    if (!container) return;

    const html = `
      <div class="enriched-artists">
        <h4 style="margin-bottom:0.75rem">Your Top Artists — Enriched</h4>
        ${artists.map((a, i) => `
          <div class="enriched-artist-row">
            <span class="enriched-rank">#${i + 1}</span>
            <div class="enriched-details">
              <strong>${this.escapeHtml(a.name)}</strong>
              <div class="enriched-meta">
                ${a.country ? `<span>${a.country}</span>` : ''}
                ${a.begin ? `<span>Since ${a.begin}</span>` : ''}
                ${a.type ? `<span>${a.type}</span>` : ''}
              </div>
              <div class="enriched-tags">
                ${a.spotifyGenres.slice(0, 3).map(g => `<span class="tag-badge spotify-tag">${this.escapeHtml(g)}</span>`).join('')}
                ${a.mbTags.map(t => `<span class="tag-badge mb-tag">${this.escapeHtml(t.name)}</span>`).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.innerHTML = html;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async fetchJSON(url) {
    const res = await window.fetch(url);
    return res.json();
  }

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
}

const industryManager = new IndustryManager();
