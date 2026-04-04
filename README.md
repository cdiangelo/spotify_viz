# Spotify Viz & Analytics

A browser-based Spotify visualization and analytics tool with three core features:

1. **Live Visualizer** — Real-time audio visualization synced to your Spotify playback with customizable color schemes, geometric overlays, bounce effects, and multiple visualization modes (bars, waveform, circular, particles).

2. **Personal Data Analysis** — Connect via Spotify API to pull your listening history, top tracks, and top artists, or upload your exported Spotify data JSONs for deep analysis with charts and filtering.

3. **Analytics & Playlist Generator** — Analyze listening trends across audio features (energy, danceability, mood, tempo), view behavior heatmaps, and generate custom playlists based on your preferences that save directly to Spotify.

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set the redirect URI to `http://localhost:3000/callback`
4. Note your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Spotify credentials:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### 3. Install & Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Features

### Visualizer Tab
- 4 visualization modes: Bars, Waveform, Circular, Particles
- 7 color schemes: Spotify Green, Rainbow, Fire, Ocean, Neon, Pastel, Monochrome
- 6 geometric overlays: Circles, Triangles, Hexagons, Diamonds, Stars, Grid
- Adjustable overlay size, opacity, bounce intensity, wave frequency/size
- Color flash effects synced to bass
- Live track info overlay

### My Data Tab
- Pull recent tracks, top tracks, top artists from Spotify API
- Upload Spotify data export JSON files (from Privacy settings)
- Timeline, top artists, top tracks, and hourly listening charts
- Filter by date range and minimum play count
- Scrollable track history table

### Analytics Tab
- Audio feature trend analysis with moving averages
- Radar chart of your average listening profile
- Genre/artist distribution charts
- Listening behavior heatmap (time of day, day of week)
- AI-driven playlist generation with tunable energy, mood, and danceability
- Save generated playlists directly to your Spotify account
- Profile snapshot save/load

## Tech Stack

- **Backend**: Node.js, Express, Multer (file uploads)
- **Auth**: Spotify OAuth 2.0 with PKCE
- **Frontend**: Vanilla JS, Canvas API (visualizer), Chart.js (analytics)
- **API**: Spotify Web API (playback, history, audio features, recommendations, playlists)
