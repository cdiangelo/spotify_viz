# Spotify Viz & Analytics

Live visualizer, personal data analysis, and playlist generation — all in your browser.

## Quick Start (2 steps)

### Step 1: Get Spotify credentials (takes 2 min)

1. Go to https://developer.spotify.com/dashboard
2. Click **Create App**
3. Fill in any name/description
4. Set **Redirect URI** to:
   - Local: `http://localhost:3000/callback`
   - Render: `https://YOUR-APP-NAME.onrender.com/callback`
5. Check **Web API** under "Which API/SDKs are you planning to use?"
6. Save, then copy your **Client ID** and **Client Secret** from the app settings

### Step 2: Run it

**Option A — Run locally:**
```bash
cp .env.example .env
# Edit .env and paste your Client ID + Secret
npm install
npm start
# Open http://localhost:3000
```

**Option B — Deploy to Render (free tier):**
1. Push this repo to your GitHub
2. Go to https://render.com → **New** → **Web Service**
3. Connect your repo
4. Render auto-detects the `render.yaml` — just add your env vars:
   - `SPOTIFY_CLIENT_ID` → your client ID
   - `SPOTIFY_CLIENT_SECRET` → your client secret
   - `SPOTIFY_REDIRECT_URI` → `https://YOUR-APP-NAME.onrender.com/callback`
5. Deploy — done

Then go back to your Spotify app settings and make sure the Redirect URI matches your Render URL.

## What it does

| Tab | Description |
|-----|-------------|
| **Visualizer** | Live audio viz synced to your playback — bars, waveform, circular, particles. Color schemes, geometric overlays, bounce, flash. |
| **My Data** | Pull listening history from Spotify API or upload your data export JSONs. Charts, filters, track table. |
| **Analytics** | Trend analysis on energy/mood/danceability, behavior heatmaps, and a playlist generator that saves to your Spotify. |
