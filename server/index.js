require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// File upload config for JSON data imports
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

// In-memory session store (use Redis in production)
const sessions = new Map();
const profileStore = new Map();

// ─── Spotify Auth (Authorization Code + PKCE) ───────────────────────────────

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-library-read',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'streaming'
].join(' ');

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

async function generateCodeChallenge(codeVerifier) {
  const digest = crypto.createHash('sha256').update(codeVerifier).digest();
  return digest.toString('base64url');
}

// Login route — initiates Spotify OAuth with PKCE
app.get('/login', async (req, res) => {
  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier for callback
  sessions.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  const session = sessions.get(state);
  if (!session) {
    return res.redirect('/?error=state_mismatch');
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: session.codeVerifier
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.redirect(`/?error=${encodeURIComponent(tokens.error)}`);
    }

    // Create a session token for the frontend
    const sessionId = generateRandomString(32);
    sessions.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      createdAt: Date.now()
    });

    // Clean up state entry
    sessions.delete(state);

    res.redirect(`/?session=${sessionId}`);
  } catch (err) {
    console.error('Token exchange error:', err);
    res.redirect('/?error=token_exchange_failed');
  }
});

// Token refresh
app.post('/api/refresh', async (req, res) => {
  const sessionId = req.headers.authorization?.replace('Bearer ', '');
  const session = sessions.get(sessionId);

  if (!session?.refreshToken) {
    return res.status(401).json({ error: 'No session' });
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    });

    const tokens = await tokenRes.json();
    session.accessToken = tokens.access_token;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;

    res.json({ expiresIn: tokens.expires_in });
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// ─── Spotify API Proxy ──────────────────────────────────────────────────────

async function getAccessToken(req) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '');
  const session = sessions.get(sessionId);
  if (!session?.accessToken) return null;

  // Auto-refresh if expired
  if (Date.now() >= session.expiresAt - 60000) {
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        })
      });
      const tokens = await tokenRes.json();
      session.accessToken = tokens.access_token;
      session.expiresAt = Date.now() + tokens.expires_in * 1000;
      if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
    } catch (e) {
      console.error('Auto-refresh failed:', e);
    }
  }

  return session.accessToken;
}

// Proxy any Spotify API call
app.get('/api/spotify/*', async (req, res) => {
  const token = await getAccessToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const spotifyPath = req.params[0];
  const queryString = new URLSearchParams(req.query).toString();
  const url = `https://api.spotify.com/v1/${spotifyPath}${queryString ? '?' + queryString : ''}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Spotify API request failed' });
  }
});

// POST proxy for creating playlists, adding tracks, etc.
app.post('/api/spotify/*', async (req, res) => {
  const token = await getAccessToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const spotifyPath = req.params[0];
  const url = `https://api.spotify.com/v1/${spotifyPath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Spotify API request failed' });
  }
});

// ─── Data Upload Endpoint ───────────────────────────────────────────────────

app.post('/api/upload-history', upload.array('files', 20), (req, res) => {
  const fs = require('fs');
  const allData = [];

  try {
    for (const file of req.files) {
      const raw = fs.readFileSync(file.path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        allData.push(...parsed);
      } else {
        allData.push(parsed);
      }
      fs.unlinkSync(file.path); // Clean up
    }
    res.json({ success: true, count: allData.length, data: allData });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse JSON files', details: err.message });
  }
});

// ─── Profile Management ─────────────────────────────────────────────────────

app.get('/api/profile/:userId', (req, res) => {
  const profile = profileStore.get(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

app.post('/api/profile/:userId', (req, res) => {
  const existing = profileStore.get(req.params.userId) || {};
  const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
  profileStore.set(req.params.userId, updated);
  res.json(updated);
});

// ─── Session check ──────────────────────────────────────────────────────────

app.get('/api/session', async (req, res) => {
  const token = await getAccessToken(req);
  if (!token) return res.json({ authenticated: false });
  res.json({ authenticated: true });
});

// ─── MusicBrainz API Proxy ──────────────────────────────────────────────────

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = {
  'User-Agent': 'SpotifyViz/1.0 (spotify-viz-app)',
  'Accept': 'application/json'
};

// Artist lookup by name
app.get('/api/musicbrainz/artist', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query param required' });

  try {
    const url = `${MB_BASE}/artist/?query=artist:${encodeURIComponent(query)}&limit=5&fmt=json`;
    const response = await fetch(url, { headers: MB_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'MusicBrainz request failed' });
  }
});

// Artist details by MBID (includes releases, tags/genres)
app.get('/api/musicbrainz/artist/:mbid', async (req, res) => {
  try {
    const url = `${MB_BASE}/artist/${req.params.mbid}?inc=releases+tags+ratings&fmt=json`;
    const response = await fetch(url, { headers: MB_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'MusicBrainz request failed' });
  }
});

// Release group (albums) for an artist
app.get('/api/musicbrainz/releases/:mbid', async (req, res) => {
  try {
    const url = `${MB_BASE}/release-group?artist=${req.params.mbid}&type=album&limit=50&fmt=json`;
    const response = await fetch(url, { headers: MB_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'MusicBrainz request failed' });
  }
});

// ─── Last.fm API Proxy ──────────────────────────────────────────────────────

const LASTFM_KEY = process.env.LASTFM_API_KEY || '';
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

app.get('/api/lastfm/:method', async (req, res) => {
  if (!LASTFM_KEY) {
    return res.status(501).json({ error: 'Last.fm API key not configured', hint: 'Add LASTFM_API_KEY to .env' });
  }

  const method = req.params.method;
  const params = new URLSearchParams({
    ...req.query,
    method,
    api_key: LASTFM_KEY,
    format: 'json'
  });

  try {
    const response = await fetch(`${LASTFM_BASE}?${params.toString()}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Last.fm request failed' });
  }
});

// ─── Genius API Proxy ───────────────────────────────────────────────────────

const GENIUS_TOKEN = process.env.GENIUS_API_TOKEN || '';

app.get('/api/genius/search', async (req, res) => {
  if (!GENIUS_TOKEN) {
    return res.status(501).json({ error: 'Genius API token not configured', hint: 'Add GENIUS_API_TOKEN to .env' });
  }

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q param required' });

  try {
    const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${GENIUS_TOKEN}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Genius request failed' });
  }
});

// ─── Fallback to SPA ────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎵 Spotify Viz running at http://localhost:${PORT}`);
});
