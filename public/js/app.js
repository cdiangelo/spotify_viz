// ─── Main App Controller ─────────────────────────────────────────────────────

let visualizer = null;

async function initApp() {
  const authenticated = api.init();

  if (!authenticated) {
    showScreen('login');
    return;
  }

  // Verify session is still valid
  const valid = await api.checkSession();
  if (!valid) {
    showScreen('login');
    return;
  }

  showScreen('app');
  await setupUser();
  setupTabs();
  setupVisualizer();
  dataManager.init();
  analyticsManager.init();

  // Start polling current playback
  api.onTrackChange = onTrackChange;
  api.onPlaybackUpdate = onPlaybackUpdate;
  api.startPolling(3000);
}

function showScreen(name) {
  document.getElementById('login-screen').classList.toggle('hidden', name !== 'login');
  document.getElementById('app-screen').classList.toggle('hidden', name !== 'app');
}

// ─── User Setup ──────────────────────────────────────────────────────────────

async function setupUser() {
  try {
    const user = await api.getMe();
    const avatar = user.images?.[0]?.url;
    if (avatar) {
      document.getElementById('user-avatar').src = avatar;
    }
    document.getElementById('user-name').textContent = user.display_name || user.id;
  } catch (err) {
    console.error('Failed to load user:', err);
  }
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      // Start/stop visualizer based on tab
      if (target === 'visualizer') {
        visualizer?.start();
      } else {
        visualizer?.stop();
      }
    });
  });
}

// ─── Visualizer ──────────────────────────────────────────────────────────────

function setupVisualizer() {
  visualizer = new Visualizer('viz-canvas');
  visualizer.start();

  // Sync to Music button
  document.getElementById('sync-music-btn')?.addEventListener('click', () => {
    visualizer.toggleSync();
    // If turning on and we already have a current track, fetch its features now
    if (visualizer.syncActive && api.currentTrack) {
      fetchAndSyncFeatures(api.currentTrack.id);
    }
  });
}

// ─── Playback Updates ────────────────────────────────────────────────────────

function onTrackChange(track) {
  // Update mini player in header
  const mini = document.getElementById('now-playing-mini');
  mini.classList.remove('hidden');

  const art = track.album?.images?.[0]?.url;
  if (art) document.getElementById('mini-art').src = art;
  document.getElementById('mini-track').textContent = track.name;
  document.getElementById('mini-artist').textContent = track.artists?.map(a => a.name).join(', ');

  // Update visualizer overlay
  const overlay = document.getElementById('viz-track-overlay');
  overlay.classList.remove('hidden');

  const vizArt = track.album?.images?.[0]?.url;
  if (vizArt) document.getElementById('viz-album-art').src = vizArt;
  document.getElementById('viz-track-name').textContent = track.name;
  document.getElementById('viz-artist-name').textContent = track.artists?.map(a => a.name).join(', ');
  document.getElementById('viz-album-name').textContent = track.album?.name;

  // Auto-sync visualizer to new track's audio features
  if (visualizer?.syncActive && track.id) {
    fetchAndSyncFeatures(track.id);
  }
}

async function fetchAndSyncFeatures(trackId) {
  try {
    const features = await api.getAudioFeatures([trackId]);
    if (features && features[0]) {
      visualizer.syncToTrack(features[0]);
    }
  } catch (err) {
    console.error('Failed to fetch audio features for sync:', err);
  }
}

function onPlaybackUpdate(data) {
  // Could update progress bar, etc.
}

// ─── Logout ──────────────────────────────────────────────────────────────────

function logout() {
  visualizer?.stop();
  api.logout();
}

// ─── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initApp);
