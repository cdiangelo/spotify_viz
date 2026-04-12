// ─── Audio Visualizer ────────────────────────────────────────────────────────

class Visualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.animFrame = null;
    this.isRunning = false;

    // Audio context (created on user interaction to comply with autoplay policy)
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.freqArray = null;

    // Simulated audio data for when no real audio is connected
    this.simPhase = 0;
    this.useSimulated = true;

    // Sync to music state — ALWAYS ON, auto-updated from current track
    this.trackFeatures = null;
    this.bpm = 120;
    this.beatPhase = 0;
    this.lastBeatTime = 0;
    this.beatInterval = 500; // ms per beat (120 BPM default)

    // Settings
    this.settings = {
      colorScheme: 'spotify',
      geoOverlay: 'none',
      overlaySize: 80,
      overlayOverlap: 0.75,
      overlayOpacity: 0.4,
      bounceIntensity: 0.6,
      waveFreq: 8,
      waveSize: 80,
      colorFlash: true,
      vizMode: 'solitaire'
    };

    // State for standalone viz modes
    this.solitaireCards = [];
    this.dvdLogo = { x: 100, y: 100, vx: 3, vy: 3, colorIdx: 0, hitFlash: 0 };
    this.vhsState = { slideIdx: 0, lastSlide: 0, scanY: 0, jitter: 0, transitionProgress: 1 };
    this.toyItems = [];
    this.foodItems = [];
    this.paperItems = [];
    this.runwayItems = [];

    // Historical landmarks drawn procedurally — each is a drawing function
    this.landmarks = [
      { name: 'Great Pyramid', year: '2560 BCE', draw: (ctx, w, h) => this.drawPyramid(ctx, w, h) },
      { name: 'Parthenon', year: '438 BCE', draw: (ctx, w, h) => this.drawParthenon(ctx, w, h) },
      { name: 'Colosseum', year: '80 CE', draw: (ctx, w, h) => this.drawColosseum(ctx, w, h) },
      { name: 'Eiffel Tower', year: '1889', draw: (ctx, w, h) => this.drawEiffel(ctx, w, h) },
      { name: 'Statue of Liberty', year: '1886', draw: (ctx, w, h) => this.drawLiberty(ctx, w, h) },
      { name: 'Big Ben', year: '1859', draw: (ctx, w, h) => this.drawBigBen(ctx, w, h) },
      { name: 'Sydney Opera House', year: '1973', draw: (ctx, w, h) => this.drawSydneyOpera(ctx, w, h) },
      { name: 'Taj Mahal', year: '1653', draw: (ctx, w, h) => this.drawTajMahal(ctx, w, h) }
    ];

    // Color schemes
    this.colorSchemes = {
      spotify: ['#1DB954', '#1ed760', '#169c46', '#15883e', '#0d5c2a'],
      rainbow: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'],
      fire: ['#ff0000', '#ff4500', '#ff6600', '#ff8c00', '#ffa500', '#ffd700', '#ffff00'],
      ocean: ['#001f3f', '#003366', '#0066cc', '#0099ff', '#33ccff', '#66ffff', '#99ffcc'],
      neon: ['#ff00ff', '#ff00cc', '#cc00ff', '#9900ff', '#6600ff', '#3300ff', '#00ffff'],
      pastel: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D4BAFF', '#FFB3DE'],
      monochrome: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333']
    };

    // Particles for particle mode
    this.particles = [];

    // Flash state
    this.flashIntensity = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindControls();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;
  }

  bindControls() {
    const bind = (id, prop, transform) => {
      const el = document.getElementById(id);
      if (!el) return;
      const handler = () => {
        const val = el.type === 'checkbox' ? el.checked :
                    el.type === 'range' ? parseFloat(el.value) : el.value;
        this.settings[prop] = transform ? transform(val) : val;
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    };

    bind('color-scheme', 'colorScheme');
    bind('geo-overlay', 'geoOverlay');
    bind('overlay-size', 'overlaySize');
    bind('overlay-overlap', 'overlayOverlap', v => v / 100);
    bind('overlay-opacity', 'overlayOpacity', v => v / 100);
    bind('bounce-intensity', 'bounceIntensity', v => v / 100);
    bind('wave-freq', 'waveFreq');
    bind('wave-size', 'waveSize');
    bind('color-flash', 'colorFlash');
    bind('viz-mode', 'vizMode');
  }

  // ─── Audio Connection ──────────────────────────────────────────────────────

  async connectToAudio() {
    try {
      // Try to capture system audio via getUserMedia (requires browser support)
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.freqArray = new Uint8Array(bufferLength);

      // Try to get audio from an audio/video element on the page
      // Or fall back to simulated data synced with playback
      this.useSimulated = true;
      console.log('Using simulated audio visualization synced to playback');
    } catch (err) {
      console.log('Audio context not available, using simulated mode');
      this.useSimulated = true;
    }
  }

  getSimulatedData(length) {
    const data = new Uint8Array(length || 128);
    const now = performance.now();

    // Always drive phase from BPM so pulses land on beats
    const bpmSpeed = (this.bpm / 60) * (Math.PI * 2) / 60; // per frame at ~60fps
    this.simPhase += bpmSpeed;

    // Beat pulse: sharp spike on each beat
    this.beatPhase = ((now % this.beatInterval) / this.beatInterval) * Math.PI * 2;

    // Beat envelope: 1.0 on beat, decays quickly
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 4);

    const featureEnergy = this.trackFeatures?.energy ?? 0.5;

    for (let i = 0; i < data.length; i++) {
      const freq = (i / data.length);
      // Create realistic-looking frequency distribution
      const bassPeak = Math.exp(-freq * 4) * 200;
      const midPeak = Math.exp(-Math.pow(freq - 0.3, 2) * 20) * 150;
      const treblePeak = Math.exp(-Math.pow(freq - 0.7, 2) * 30) * 80;

      const wave1 = Math.sin(this.simPhase * 2 + i * 0.3) * 30;
      const wave2 = Math.sin(this.simPhase * 3.7 + i * 0.15) * 20;
      const wave3 = Math.sin(this.simPhase * 1.3 + i * 0.5) * 15;

      // Random flutter
      const noise = (Math.random() - 0.5) * 25;

      // Beat-synced boost: bass bins get a big kick on each beat
      const beatBoost = beatPulse * (1 - freq) * 120 * featureEnergy;

      const val = bassPeak + midPeak + treblePeak + wave1 + wave2 + wave3 + noise + beatBoost;
      data[i] = Math.max(0, Math.min(255, val));
    }

    return data;
  }

  // ─── Start/Stop ────────────────────────────────────────────────────────────

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectToAudio();
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  // ─── Animation Loop ────────────────────────────────────────────────────────

  animate() {
    if (!this.isRunning) return;

    // Get audio data
    let freqData;
    if (this.useSimulated || !this.analyser) {
      freqData = this.getSimulatedData(128);
    } else {
      this.analyser.getByteFrequencyData(this.freqArray);
      freqData = this.freqArray;
    }

    // Calculate average energy for effects
    const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
    const energy = avg / 255;
    const bassEnergy = Array.from(freqData).slice(0, 8).reduce((a, b) => a + b, 0) / (8 * 255);

    // Clear
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Color flash background
    if (this.settings.colorFlash && bassEnergy > 0.5) {
      this.flashIntensity = Math.min(1, this.flashIntensity + 0.3);
    } else {
      this.flashIntensity *= 0.9;
    }

    if (this.flashIntensity > 0.05) {
      const colors = this.colorSchemes[this.settings.colorScheme];
      const flashColor = colors[Math.floor(Math.random() * colors.length)];
      this.ctx.fillStyle = this.hexToRgba(flashColor, this.flashIntensity * 0.15);
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Draw visualization
    switch (this.settings.vizMode) {
      case 'bars': this.drawBars(freqData, energy); break;
      case 'wave': this.drawWaveform(freqData, energy); break;
      case 'circular': this.drawCircular(freqData, energy); break;
      case 'particles': this.drawParticles(freqData, energy); break;
      case 'solitaire': this.drawSolitaire(freqData, energy, bassEnergy); break;
      case 'dvd': this.drawDVD(freqData, energy, bassEnergy); break;
      case 'vhs': this.drawVHS(freqData, energy, bassEnergy); break;
      case 'toys': this.drawToys(freqData, energy, bassEnergy); break;
      case 'food': this.drawFood(freqData, energy, bassEnergy); break;
      case 'paper': this.drawPaper(freqData, energy, bassEnergy); break;
      case 'runway': this.drawRunway(freqData, energy, bassEnergy); break;
    }

    // Standalone modes don't use the generic geometric overlay
    const standaloneModes = ['solitaire', 'dvd', 'vhs', 'toys', 'food', 'paper', 'runway'];
    if (this.settings.geoOverlay !== 'none' && !standaloneModes.includes(this.settings.vizMode)) {
      this.drawGeoOverlay(energy, bassEnergy);
    }

    this.animFrame = requestAnimationFrame(() => this.animate());
  }

  // ─── Visualization Modes ───────────────────────────────────────────────────

  drawBars(data, energy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const barCount = data.length;
    const barWidth = this.width / barCount;
    const bounce = energy * this.settings.bounceIntensity * 50;

    for (let i = 0; i < barCount; i++) {
      const val = data[i] / 255;
      const barHeight = val * (this.height * 0.7) + bounce * val;
      const x = i * barWidth;
      const y = this.height - barHeight;

      const colorIdx = Math.floor((i / barCount) * colors.length) % colors.length;
      const color = colors[colorIdx];

      // Gradient bar
      const grad = this.ctx.createLinearGradient(x, y, x, this.height);
      grad.addColorStop(0, color);
      grad.addColorStop(1, this.hexToRgba(color, 0.2));

      this.ctx.fillStyle = grad;
      this.ctx.fillRect(x, y, barWidth - 1, barHeight);

      // Glow
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = val * 15;
      this.ctx.fillRect(x, y, barWidth - 1, 2);
      this.ctx.shadowBlur = 0;
    }
  }

  drawWaveform(data, energy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const bounce = energy * this.settings.bounceIntensity * 30;
    const freq = this.settings.waveFreq;
    const size = this.settings.waveSize;

    for (let c = 0; c < Math.min(colors.length, 3); c++) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.hexToRgba(colors[c], 0.7 - c * 0.2);
      this.ctx.lineWidth = 3 - c;

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * this.width;
        const val = data[i] / 255;
        const wave = Math.sin(i / freq + this.simPhase * (c + 1)) * size * val;
        const y = this.height / 2 + wave + bounce * Math.sin(this.simPhase + c);

        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }

      this.ctx.shadowColor = colors[c];
      this.ctx.shadowBlur = 10;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
  }

  drawCircular(data, energy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const cx = this.width / 2;
    const cy = this.height / 2;
    const baseRadius = Math.min(this.width, this.height) * 0.2;
    const bounce = energy * this.settings.bounceIntensity * 50;

    for (let i = 0; i < data.length; i++) {
      const val = data[i] / 255;
      const angle = (i / data.length) * Math.PI * 2;
      const radius = baseRadius + val * this.settings.waveSize + bounce * val;

      const x1 = cx + Math.cos(angle) * baseRadius;
      const y1 = cy + Math.sin(angle) * baseRadius;
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;

      const colorIdx = Math.floor((i / data.length) * colors.length) % colors.length;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = this.hexToRgba(colors[colorIdx], 0.8);
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = colors[colorIdx];
      this.ctx.shadowBlur = val * 10;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    // Center circle
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, baseRadius * 0.3, 0, Math.PI * 2);
    this.ctx.fillStyle = this.hexToRgba(colors[0], 0.3 + energy * 0.3);
    this.ctx.fill();
  }

  drawParticles(data, energy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const bounce = energy * this.settings.bounceIntensity;

    // Spawn particles based on bass
    const bassVal = data[0] / 255;
    if (bassVal > 0.4 && this.particles.length < 300) {
      for (let i = 0; i < Math.floor(bassVal * 5); i++) {
        this.particles.push({
          x: this.width / 2 + (Math.random() - 0.5) * 100,
          y: this.height / 2 + (Math.random() - 0.5) * 100,
          vx: (Math.random() - 0.5) * 6 * (1 + bounce),
          vy: (Math.random() - 0.5) * 6 * (1 + bounce),
          size: Math.random() * 4 + 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1
        });
      }
    }

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;
      p.vx *= 0.99;
      p.vy *= 0.99;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fillStyle = this.hexToRgba(p.color, p.life * 0.8);
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = p.size * 2;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  // ─── Geometric Overlays ────────────────────────────────────────────────────

  drawGeoOverlay(energy, bassEnergy) {
    const { geoOverlay, overlaySize, overlayOpacity, overlayOverlap } = this.settings;
    const bounce = bassEnergy * this.settings.bounceIntensity * 20;
    const colors = this.colorSchemes[this.settings.colorScheme];
    const baseColor = colors[0];

    this.ctx.strokeStyle = this.hexToRgba(baseColor, overlayOpacity);
    this.ctx.lineWidth = 1.5;

    const size = overlaySize + bounce;

    // Overlap controls spacing between shape centers:
    //   overlap=0 → spacing = size (corners just touching, half-width gap between edges)
    //   overlap=1 → spacing = size * 0.5 (edge reaches neighboring center / midpoint)
    // Linear interpolation: spacing = size * (1 - overlap * 0.5)
    const spacing = size * (1 - overlayOverlap * 0.5);
    const pad = spacing * 0.5;

    const cols = Math.ceil(this.width / spacing) + 2;
    const rows = Math.ceil(this.height / spacing) + 2;

    switch (geoOverlay) {
      case 'circles': {
        const radius = size * 0.4;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * spacing + pad;
            const y = r * spacing + pad;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
        break;
      }

      case 'triangles': {
        const h = size * 0.4;
        const w = size * 0.35;
        const rowSpacing = spacing * 0.866; // sin(60°) for tighter triangle packing
        const tRows = Math.ceil(this.height / rowSpacing) + 2;
        for (let r = 0; r < tRows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * spacing + (r % 2) * spacing * 0.5;
            const y = r * rowSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - h);
            this.ctx.lineTo(x - w, y + h * 0.75);
            this.ctx.lineTo(x + w, y + h * 0.75);
            this.ctx.closePath();
            this.ctx.stroke();
          }
        }
        break;
      }

      case 'hexagons': {
        const radius = size * 0.45;
        const hSpacing = spacing;
        const vSpacing = spacing * 0.866;
        const hRows = Math.ceil(this.height / vSpacing) + 2;
        for (let r = 0; r < hRows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * hSpacing + (r % 2) * hSpacing * 0.5;
            const y = r * vSpacing;
            this.drawHexagon(x, y, radius);
          }
        }
        break;
      }

      case 'diamonds': {
        const s = size * 0.4;
        const rowSpacing = spacing * 0.707; // diagonal packing
        const dRows = Math.ceil(this.height / rowSpacing) + 2;
        for (let r = 0; r < dRows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * spacing + (r % 2) * spacing * 0.5;
            const y = r * rowSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - s);
            this.ctx.lineTo(x + s, y);
            this.ctx.lineTo(x, y + s);
            this.ctx.lineTo(x - s, y);
            this.ctx.closePath();
            this.ctx.stroke();
          }
        }
        break;
      }

      case 'stars': {
        const outerR = size * 0.4;
        const innerR = size * 0.2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * spacing + (r % 2) * spacing * 0.5 + pad;
            const y = r * spacing + pad;
            this.drawStar(x, y, 5, outerR, innerR);
          }
        }
        break;
      }

      case 'grid':
        this.ctx.beginPath();
        for (let x = 0; x < this.width; x += spacing) {
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, this.height);
        }
        for (let y = 0; y < this.height; y += spacing) {
          this.ctx.moveTo(0, y);
          this.ctx.lineTo(this.width, y);
        }
        this.ctx.stroke();
        break;
    }
  }

  drawHexagon(cx, cy, r) {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }

  drawStar(cx, cy, points, outerR, innerR) {
    this.ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }

  // ─── Sync to Music (always on) ─────────────────────────────────────────────

  syncToTrack(features) {
    this.trackFeatures = features;
    if (!features) return;
    this.applyTrackFeatures(features);
  }

  // Apply default demo features on startup so visuals pulse before a track loads
  applyDefaultFeatures() {
    this.applyTrackFeatures({
      tempo: 120, energy: 0.6, danceability: 0.6,
      valence: 0.5, acousticness: 0.2, instrumentalness: 0.1,
      speechiness: 0.05, liveness: 0.15
    });
  }

  applyTrackFeatures(f) {
    // BPM → controls the pulse speed of the simulated waveform
    this.bpm = f.tempo || 120;
    this.beatInterval = 60000 / this.bpm;

    // Energy (0-1) → bounce intensity + wave size
    const energy = f.energy || 0.5;
    this.settings.bounceIntensity = 0.2 + energy * 0.8;
    this.settings.waveSize = 30 + energy * 170;

    // Danceability (0-1) → wave frequency (higher dance = tighter waves)
    const dance = f.danceability || 0.5;
    this.settings.waveFreq = 3 + Math.round(dance * 17);

    // Valence/mood (0-1) → color scheme
    const valence = f.valence || 0.5;
    if (valence > 0.75) this.settings.colorScheme = 'rainbow';
    else if (valence > 0.55) this.settings.colorScheme = 'neon';
    else if (valence > 0.35) this.settings.colorScheme = 'spotify';
    else if (valence > 0.15) this.settings.colorScheme = 'ocean';
    else this.settings.colorScheme = 'monochrome';

    // Acousticness → overlay (acoustic = organic shapes, electronic = geometric)
    const acoustic = f.acousticness || 0;
    if (acoustic > 0.6) this.settings.geoOverlay = 'circles';
    else if (acoustic > 0.3) this.settings.geoOverlay = 'hexagons';
    else this.settings.geoOverlay = 'diamonds';

    // Instrumentalness → overlay opacity (instrumental = more visible overlays)
    this.settings.overlayOpacity = 0.15 + (f.instrumentalness || 0) * 0.5;
    this.settings.overlaySize = 50 + energy * 100;

    // High energy + dance → flash on, else off
    this.settings.colorFlash = energy > 0.5 && dance > 0.4;

    // NOTE: vizMode is never changed by sync — the user controls which
    // visualization mode they want and all modes receive the same
    // song-based guidance (bounce, wave, color, overlays, BPM pulse).

    // Update the UI controls to reflect the new values
    this.syncControlsToUI();
  }

  syncControlsToUI() {
    const s = this.settings;
    this.setControl('color-scheme', s.colorScheme);
    this.setControl('geo-overlay', s.geoOverlay);
    this.setControl('overlay-size', s.overlaySize);
    this.setControl('overlay-overlap', s.overlayOverlap * 100);
    this.setControl('overlay-opacity', s.overlayOpacity * 100);
    this.setControl('bounce-intensity', s.bounceIntensity * 100);
    this.setControl('wave-freq', s.waveFreq);
    this.setControl('wave-size', s.waveSize);
    this.setControl('color-flash', s.colorFlash);
  }

  setControl(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = value;
    else el.value = value;
  }

  // ─── New Standalone Viz Modes ──────────────────────────────────────────────

  // Solitaire celebration — cascading cards that pile up and become distorted
  drawSolitaire(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const now = performance.now();
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);

    // Spawn new cards on each beat or with energy bursts
    const spawnRate = 0.15 + energy * 0.5 + beatPulse * 0.8;
    if (Math.random() < spawnRate && this.solitaireCards.length < 400) {
      const cornerChoice = Math.floor(Math.random() * 4);
      let startX, startY;
      switch (cornerChoice) {
        case 0: startX = 0; startY = this.height * 0.3; break;
        case 1: startX = this.width; startY = this.height * 0.3; break;
        case 2: startX = this.width * 0.25; startY = 0; break;
        default: startX = this.width * 0.75; startY = 0; break;
      }

      this.solitaireCards.push({
        x: startX,
        y: startY,
        vx: (this.width / 2 - startX) * 0.008 + (Math.random() - 0.5) * 3,
        vy: -2 - Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.2,
        w: 30 + energy * 25,
        h: 42 + energy * 35,
        color: colors[Math.floor(Math.random() * colors.length)],
        suit: Math.floor(Math.random() * 4),
        life: 1,
        distortion: 0,
        bounces: 0
      });
    }

    // Gravity is tempo-driven: faster BPM = stronger "excitement"
    const gravity = 0.15 + (this.bpm / 120) * 0.15 + energy * 0.3;

    for (let i = this.solitaireCards.length - 1; i >= 0; i--) {
      const card = this.solitaireCards[i];
      card.vy += gravity;
      card.x += card.vx;
      card.y += card.vy;
      card.rot += card.vrot;

      // Distortion grows on bass hits and over time
      card.distortion += bassEnergy * 0.04 + 0.001;

      // Bounce off floor
      if (card.y + card.h > this.height) {
        card.y = this.height - card.h;
        card.vy *= -0.55 - energy * 0.15;
        card.vx *= 0.85;
        card.bounces++;
        // Extra distortion per bounce, and slight fade
        card.distortion += 0.15;
        if (card.bounces > 3) card.life -= 0.1;
      }
      // Bounce off sides
      if (card.x < 0 || card.x + card.w > this.width) {
        card.vx *= -0.7;
        card.x = Math.max(0, Math.min(this.width - card.w, card.x));
      }

      card.life -= 0.002;
      if (card.life <= 0 || card.y > this.height + 100) {
        this.solitaireCards.splice(i, 1);
        continue;
      }

      this.drawDistortedCard(card);
    }
  }

  drawDistortedCard(card) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
    ctx.rotate(card.rot);
    ctx.globalAlpha = Math.max(0, card.life);

    const d = Math.min(card.distortion, 1.5);
    const w = card.w;
    const h = card.h;

    // Distorted card body — offset corners by distortion
    ctx.beginPath();
    ctx.moveTo(-w / 2 + (Math.random() - 0.5) * d * 10, -h / 2 + (Math.random() - 0.5) * d * 10);
    ctx.lineTo(w / 2 + (Math.random() - 0.5) * d * 10, -h / 2 + (Math.random() - 0.5) * d * 10);
    ctx.lineTo(w / 2 + (Math.random() - 0.5) * d * 10, h / 2 + (Math.random() - 0.5) * d * 10);
    ctx.lineTo(-w / 2 + (Math.random() - 0.5) * d * 10, h / 2 + (Math.random() - 0.5) * d * 10);
    ctx.closePath();

    // Chromatic aberration style fill when highly distorted
    if (d > 0.4) {
      ctx.fillStyle = 'rgba(255,50,50,0.4)';
      ctx.fillRect(-w / 2 - d * 3, -h / 2, w, h);
      ctx.fillStyle = 'rgba(50,255,255,0.4)';
      ctx.fillRect(-w / 2 + d * 3, -h / 2, w, h);
    }

    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = card.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Suit symbol (distorted)
    ctx.fillStyle = card.color;
    const suits = ['♠', '♥', '♦', '♣'];
    ctx.font = `bold ${h * 0.4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suits[card.suit], (Math.random() - 0.5) * d * 5, (Math.random() - 0.5) * d * 5);

    ctx.restore();
  }

  // DVD logo bouncing around with color flash on corner hits
  drawDVD(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const logo = this.dvdLogo;

    // Speed tied to BPM
    const speedMult = 1 + (this.bpm / 120 - 1) * 0.8 + energy * 1.2;

    // Logo size (scale with energy)
    const logoW = 160 + energy * 60;
    const logoH = 80 + energy * 30;

    // Update position
    logo.x += logo.vx * speedMult;
    logo.y += logo.vy * speedMult;

    // Bounce off walls, flash color on hit
    let hitWall = false;
    if (logo.x <= 0) { logo.x = 0; logo.vx = Math.abs(logo.vx); hitWall = true; }
    if (logo.x + logoW >= this.width) { logo.x = this.width - logoW; logo.vx = -Math.abs(logo.vx); hitWall = true; }
    if (logo.y <= 0) { logo.y = 0; logo.vy = Math.abs(logo.vy); hitWall = true; }
    if (logo.y + logoH >= this.height) { logo.y = this.height - logoH; logo.vy = -Math.abs(logo.vy); hitWall = true; }

    if (hitWall) {
      logo.colorIdx = (logo.colorIdx + 1) % colors.length;
      logo.hitFlash = 1;
    }

    // Full-screen flash on bass hit or wall hit
    logo.hitFlash *= 0.85;
    if (bassEnergy > 0.6) logo.hitFlash = Math.max(logo.hitFlash, bassEnergy);

    if (logo.hitFlash > 0.05) {
      this.ctx.fillStyle = this.hexToRgba(colors[logo.colorIdx], logo.hitFlash * 0.25);
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Draw trailing echoes (beats create extra trails)
    const trailCount = Math.floor(2 + energy * 4);
    for (let t = trailCount; t > 0; t--) {
      const tx = logo.x - logo.vx * speedMult * t * 2;
      const ty = logo.y - logo.vy * speedMult * t * 2;
      const alpha = (1 - t / trailCount) * 0.2;
      this.ctx.globalAlpha = alpha;
      this.drawDVDLogo(tx, ty, logoW, logoH, colors[(logo.colorIdx + t) % colors.length]);
    }
    this.ctx.globalAlpha = 1;

    // Draw main logo
    this.drawDVDLogo(logo.x, logo.y, logoW, logoH, colors[logo.colorIdx]);
  }

  drawDVDLogo(x, y, w, h, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);

    // Ellipse background
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    // "DVD" text
    ctx.fillStyle = '#000';
    ctx.font = `bold ${h * 0.55}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DVD', 0, -h * 0.05);

    // "VIDEO" small text underneath
    ctx.font = `${h * 0.2}px sans-serif`;
    ctx.fillText('VIDEO', 0, h * 0.28);

    ctx.restore();
  }

  // VHS-style transitioning historical landmarks
  drawVHS(data, energy, bassEnergy) {
    const now = performance.now();
    const state = this.vhsState;

    // Switch slides on a musical interval (every ~8 beats, or on big bass hit)
    const slideInterval = Math.max(3000, 60000 / this.bpm * 8);
    const elapsed = now - state.lastSlide;
    if (elapsed > slideInterval || (bassEnergy > 0.85 && elapsed > 1500)) {
      state.slideIdx = (state.slideIdx + 1) % this.landmarks.length;
      state.lastSlide = now;
      state.transitionProgress = 0;
      state.jitter = 1;
    }

    // Transition progress (0 = just switched, 1 = fully stable)
    state.transitionProgress = Math.min(1, state.transitionProgress + 0.02);
    state.jitter *= 0.96;
    state.scanY = (state.scanY + 2 + energy * 4) % this.height;

    const ctx = this.ctx;
    const landmark = this.landmarks[state.slideIdx];

    // Dark warm background (old tape look)
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw landmark — wobble with jitter/energy
    ctx.save();
    const wobbleX = (Math.random() - 0.5) * state.jitter * 20 + (Math.random() - 0.5) * bassEnergy * 6;
    const wobbleY = (Math.random() - 0.5) * state.jitter * 20 + (Math.random() - 0.5) * bassEnergy * 6;
    ctx.translate(wobbleX, wobbleY);

    // Transition reveal: draw with progressively growing clip
    const trans = state.transitionProgress;
    if (trans < 1) {
      ctx.beginPath();
      ctx.rect(0, this.height * (1 - trans), this.width, this.height * trans);
      ctx.clip();
    }

    // Warm sepia tint
    ctx.fillStyle = 'rgba(60, 40, 20, 0.4)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw the landmark in chromatic aberration style
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(-3, 0);
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
    ctx.lineWidth = 2 + bassEnergy * 2;
    landmark.draw(ctx, this.width, this.height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(3, 0);
    ctx.strokeStyle = 'rgba(50, 200, 255, 0.6)';
    ctx.lineWidth = 2 + bassEnergy * 2;
    landmark.draw(ctx, this.width, this.height);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 230, 180, 0.9)';
    ctx.lineWidth = 2 + energy * 2;
    landmark.draw(ctx, this.width, this.height);

    ctx.restore();

    // Scan lines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < this.height; y += 3) {
      ctx.fillRect(0, y, this.width, 1);
    }

    // Moving tracking line
    const tY = state.scanY;
    const grad = ctx.createLinearGradient(0, tY - 30, 0, tY + 30);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${0.1 + energy * 0.15})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, tY - 30, this.width, 60);

    // Random glitch bars on bass
    if (bassEnergy > 0.6) {
      const glitchCount = Math.floor(bassEnergy * 5);
      for (let i = 0; i < glitchCount; i++) {
        const gy = Math.random() * this.height;
        const gh = 2 + Math.random() * 8;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
        ctx.fillRect(0, gy, this.width, gh);
      }
    }

    // Noise
    const noiseImg = ctx.getImageData(0, 0, Math.min(200, this.width), Math.min(200, this.height));
    // Skip noise pixel manipulation for perf — use a semi-transparent overlay instead
    ctx.fillStyle = 'rgba(255, 220, 180, 0.03)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Title bar (VHS-style overlay text)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, this.height - 60, this.width, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`► PLAY   ${landmark.name.toUpperCase()}`, 20, this.height - 40);
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(landmark.year, 20, this.height - 18);

    // REC indicator blinking
    if (Math.floor(now / 500) % 2 === 0) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(this.width - 40, this.height - 30, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('REC', this.width - 55, this.height - 30);
    }
  }

  // ─── New Themed Wave Modes ─────────────────────────────────────────────────

  // Helper: draw an emoji item with optional bass distortion
  _drawEmojiItem(item, colors, bassEnergy) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rot);
    ctx.globalAlpha = Math.max(0, item.life);
    if (item.distortion > 0.3) {
      ctx.shadowColor = colors[Math.floor(Math.random() * colors.length)];
      ctx.shadowBlur = item.distortion * 18;
    }
    ctx.font = `${item.size * 2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dx = item.distortion > 0.5 ? (Math.random() - 0.5) * item.distortion * 8 : 0;
    const dy = item.distortion > 0.5 ? (Math.random() - 0.5) * item.distortion * 8 : 0;
    ctx.fillText(item.emoji, dx, dy);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Toy Avalanche — normal downward gravity, items pile and bounce, speed from BPM
  drawToys(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const speedMult = 0.5 + (this.bpm / 120) * 0.9 + energy * 1.0;
    const toyEmojis = ['🦆', '⚽', '🎾', '🪀', '🎲', '🎯', '🎳', '🪃', '🎠', '🏀'];

    const spawnRate = 0.12 + energy * 0.45 + beatPulse * 0.7;
    if (Math.random() < spawnRate && this.toyItems.length < 220) {
      const side = Math.floor(Math.random() * 3);
      let x, y, vx, vy;
      if (side === 0) { x = Math.random() * this.width; y = -50; vx = (Math.random() - 0.5) * 4; vy = 1 + Math.random() * 2; }
      else if (side === 1) { x = -50; y = Math.random() * this.height * 0.6; vx = 2 + Math.random() * 3; vy = (Math.random() - 0.5) * 3; }
      else { x = this.width + 50; y = Math.random() * this.height * 0.6; vx = -2 - Math.random() * 3; vy = (Math.random() - 0.5) * 3; }
      this.toyItems.push({
        x, y, vx, vy,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 18 + energy * 22 + Math.random() * 10,
        emoji: toyEmojis[Math.floor(Math.random() * toyEmojis.length)],
        life: 1, bounces: 0, distortion: 0
      });
    }

    // Gravity is BPM-driven — faster song = more excitement / stronger pull
    const gravity = (0.18 + (this.bpm / 120) * 0.14 + energy * 0.25) * speedMult * 0.5;

    for (let i = this.toyItems.length - 1; i >= 0; i--) {
      const item = this.toyItems[i];
      item.vy += gravity;
      item.x += item.vx * speedMult;
      item.y += item.vy;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.04 + 0.001;

      if (item.y + item.size > this.height) {
        item.y = this.height - item.size;
        item.vy *= -(0.5 + energy * 0.25);
        item.vx *= 0.82;
        item.bounces++;
        item.distortion += 0.12;
        if (item.bounces > 4) item.life -= 0.12;
      }
      if (item.x < -item.size) item.x = this.width + item.size;
      if (item.x > this.width + item.size) item.x = -item.size;

      item.life -= 0.003;
      if (item.life <= 0) { this.toyItems.splice(i, 1); continue; }
      this._drawEmojiItem(item, colors, bassEnergy);
    }
  }

  // Food Storm — sideways gravity that shifts with the music, items wrap around screen
  drawFood(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    // Gravity angle drifts with simPhase so the storm direction changes with music
    const gravityAngle = Math.sin(this.simPhase * 0.25) * 0.9;
    const gStrength = 0.12 + energy * 0.22 + (this.bpm / 120) * 0.08;
    const gx = Math.sin(gravityAngle) * gStrength;
    const gy = Math.abs(Math.cos(gravityAngle)) * gStrength * 0.4 + 0.04; // always some downward component
    const speedMult = 0.6 + (this.bpm / 120) * 0.75 + energy * 0.9;
    const foodEmojis = ['🍩', '🍕', '🍎', '🍔', '🌮', '🍟', '🍦', '🍰', '🥨', '🥐', '🍣', '🍓'];

    const spawnRate = 0.13 + energy * 0.38 + beatPulse * 0.5;
    if (Math.random() < spawnRate && this.foodItems.length < 200) {
      const edge = Math.floor(Math.random() * 4);
      let x, y, vx, vy;
      if (edge === 0) { x = Math.random() * this.width; y = -40; vx = (Math.random() - 0.5) * 5; vy = 1.5; }
      else if (edge === 1) { x = this.width + 40; y = Math.random() * this.height; vx = -2.5; vy = (Math.random() - 0.5) * 4; }
      else if (edge === 2) { x = -40; y = Math.random() * this.height; vx = 2.5; vy = (Math.random() - 0.5) * 4; }
      else { x = Math.random() * this.width; y = this.height + 40; vx = (Math.random() - 0.5) * 5; vy = -2.5; }
      this.foodItems.push({
        x, y, vx, vy,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.18,
        size: 18 + energy * 22 + Math.random() * 12,
        emoji: foodEmojis[Math.floor(Math.random() * foodEmojis.length)],
        life: 1, distortion: 0
      });
    }

    for (let i = this.foodItems.length - 1; i >= 0; i--) {
      const item = this.foodItems[i];
      item.vx += gx;
      item.vy += gy;
      item.x += item.vx * speedMult;
      item.y += item.vy * speedMult;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.025;
      // Speed cap — energy raises the cap
      const spd = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
      const cap = 8 + energy * 6;
      if (spd > cap) { item.vx *= cap / spd; item.vy *= cap / spd; }
      // Wrap all edges
      if (item.x < -60) item.x = this.width + 60;
      if (item.x > this.width + 60) item.x = -60;
      if (item.y < -60) item.y = this.height + 60;
      if (item.y > this.height + 60) item.y = -60;
      item.life -= 0.0018;
      if (item.life <= 0) { this.foodItems.splice(i, 1); continue; }
      this._drawEmojiItem(item, colors, bassEnergy);
    }
  }

  // Paper Blizzard — near-zero gravity, turbulent wind from music, items swirl
  drawPaper(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    // Wind shifts direction slowly, energy amplifies turbulence
    const windX = Math.sin(this.simPhase * 0.4) * (0.25 + energy * 0.9);
    const windY = 0.015 + Math.sin(this.simPhase * 0.25) * 0.03; // near-zero downward drift
    const speedMult = 0.35 + (this.bpm / 120) * 0.55 + energy * 0.7;
    const paperEmojis = ['📄', '📃', '📋', '📝', '📖', '📚', '📰', '🗒️', '✉️', '📜'];

    const spawnRate = 0.09 + energy * 0.28 + beatPulse * 0.45;
    if (Math.random() < spawnRate && this.paperItems.length < 160) {
      this.paperItems.push({
        x: Math.random() * this.width,
        y: Math.random() < 0.6 ? -30 : Math.random() * this.height,
        vx: (Math.random() - 0.5) * 3 + windX * 1.5,
        vy: -0.3 + Math.random() * 1.5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.28,
        size: 16 + Math.random() * 18,
        emoji: paperEmojis[Math.floor(Math.random() * paperEmojis.length)],
        life: 1, distortion: 0,
        wobble: Math.random() * Math.PI * 2
      });
    }

    for (let i = this.paperItems.length - 1; i >= 0; i--) {
      const item = this.paperItems[i];
      item.wobble += 0.045 * speedMult;
      // Wind turbulence — each paper wobbles independently, BPM speeds wobble
      item.vx += windX * 0.06 + Math.sin(item.wobble) * 0.09 * (energy + 0.2);
      item.vy += windY + Math.cos(item.wobble * 1.3) * 0.025;
      item.x += item.vx * speedMult;
      item.y += item.vy * speedMult;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.022;
      // Speed cap
      const spd = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
      const cap = 6 + energy * 4;
      if (spd > cap) { item.vx *= cap / spd; item.vy *= cap / spd; }
      // Wrap horizontally, remove if far off top/bottom
      if (item.x < -60) item.x = this.width + 60;
      if (item.x > this.width + 60) item.x = -60;
      item.life -= 0.0014;
      if (item.life <= 0 || item.y > this.height + 70 || item.y < -120) { this.paperItems.splice(i, 1); continue; }
      this._drawEmojiItem(item, colors, bassEnergy);
    }
  }

  // Runway Drift — reverse/floating gravity, fashion items rise and sway like a catwalk
  drawRunway(data, energy, bassEnergy) {
    const colors = this.colorSchemes[this.settings.colorScheme];
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const fashionEmojis = ['👗', '👠', '🧥', '👒', '👜', '💄', '💎', '👑', '🧣', '🕶️', '👡', '🥻'];
    const speedMult = 0.5 + (this.bpm / 120) * 0.8 + energy * 0.85;

    const spawnRate = 0.11 + energy * 0.35 + beatPulse * 0.55;
    if (Math.random() < spawnRate && this.runwayItems.length < 175) {
      this.runwayItems.push({
        x: Math.random() * this.width,
        y: this.height + 45, // spawn from bottom
        vx: (Math.random() - 0.5) * 1.8,
        vy: -(1.2 + Math.random() * 2.0 + energy * 1.8), // upward
        rot: (Math.random() - 0.5) * 0.35,
        size: 20 + energy * 18 + Math.random() * 10,
        emoji: fashionEmojis[Math.floor(Math.random() * fashionEmojis.length)],
        life: 1, distortion: 0,
        swayPhase: Math.random() * Math.PI * 2
      });
    }

    // Antigravity (upward pull), strength tied to energy so a high-energy track lifts faster
    const antigravity = -(0.04 + energy * 0.09);

    for (let i = this.runwayItems.length - 1; i >= 0; i--) {
      const item = this.runwayItems[i];
      // Sway speed tied to BPM — catwalk rhythm
      item.swayPhase += 0.032 * speedMult * (this.bpm / 120);
      item.vy += antigravity;
      item.vx += Math.sin(item.swayPhase) * 0.07;
      item.x += item.vx * speedMult;
      item.y += item.vy * speedMult;
      item.rot = Math.sin(item.swayPhase * 0.5) * 0.28;
      item.distortion += bassEnergy * 0.025;
      // Wrap horizontally
      if (item.x < -60) item.x = this.width + 60;
      if (item.x > this.width + 60) item.x = -60;
      item.life -= 0.002;
      if (item.life <= 0 || item.y < -110) { this.runwayItems.splice(i, 1); continue; }
      this._drawEmojiItem(item, colors, bassEnergy);
    }
  }

  // ─── Landmark Drawings ─────────────────────────────────────────────────────

  drawPyramid(ctx, w, h) {
    const cx = w / 2;
    const base = h * 0.75;
    const apex = h * 0.25;
    const halfW = w * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx, apex);
    ctx.lineTo(cx + halfW, base);
    ctx.lineTo(cx - halfW, base);
    ctx.closePath();
    ctx.stroke();
    // Internal lines
    ctx.beginPath();
    ctx.moveTo(cx, apex);
    ctx.lineTo(cx, base);
    ctx.stroke();
    // Ground
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(w, base);
    ctx.stroke();
  }

  drawParthenon(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.75;
    const topY = h * 0.35;
    const bw = w * 0.5;
    // Roof triangle
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, topY);
    ctx.lineTo(cx, topY - 40);
    ctx.lineTo(cx + bw / 2, topY);
    ctx.closePath();
    ctx.stroke();
    // Columns
    const colCount = 8;
    const colSpace = bw / (colCount - 1);
    for (let i = 0; i < colCount; i++) {
      const x = cx - bw / 2 + i * colSpace;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, baseY);
      ctx.stroke();
    }
    // Base
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2 - 20, baseY);
    ctx.lineTo(cx + bw / 2 + 20, baseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2 - 10, topY);
    ctx.lineTo(cx + bw / 2 + 10, topY);
    ctx.stroke();
  }

  drawColosseum(ctx, w, h) {
    const cx = w / 2;
    const cy = h * 0.55;
    const rx = w * 0.3;
    const ry = h * 0.25;
    // Outer ellipse
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Inner ellipse
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Arches
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawEiffel(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.85;
    const topY = h * 0.1;
    const baseW = w * 0.25;
    // Main structure
    ctx.beginPath();
    ctx.moveTo(cx - baseW, baseY);
    ctx.lineTo(cx - 10, topY);
    ctx.lineTo(cx + 10, topY);
    ctx.lineTo(cx + baseW, baseY);
    ctx.stroke();
    // Cross beams
    const levels = 6;
    for (let i = 1; i <= levels; i++) {
      const t = i / levels;
      const y = baseY - (baseY - topY) * t;
      const x1 = cx - baseW * (1 - t);
      const x2 = cx + baseW * (1 - t);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      if (i < levels - 1) {
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y - (baseY - topY) / levels);
        ctx.moveTo(x2, y);
        ctx.lineTo(x1, y - (baseY - topY) / levels);
        ctx.stroke();
      }
    }
  }

  drawLiberty(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.85;
    // Pedestal
    ctx.beginPath();
    ctx.rect(cx - 60, baseY - 80, 120, 80);
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.moveTo(cx - 30, baseY - 80);
    ctx.lineTo(cx - 40, baseY - 200);
    ctx.lineTo(cx + 40, baseY - 200);
    ctx.lineTo(cx + 30, baseY - 80);
    ctx.stroke();
    // Head
    ctx.beginPath();
    ctx.arc(cx, baseY - 225, 20, 0, Math.PI * 2);
    ctx.stroke();
    // Crown spikes
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * 8;
      ctx.beginPath();
      ctx.moveTo(x, baseY - 240);
      ctx.lineTo(x, baseY - 260);
      ctx.stroke();
    }
    // Torch arm
    ctx.beginPath();
    ctx.moveTo(cx + 40, baseY - 180);
    ctx.lineTo(cx + 90, baseY - 260);
    ctx.stroke();
    // Flame
    ctx.beginPath();
    ctx.arc(cx + 90, baseY - 270, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawBigBen(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.85;
    const topY = h * 0.15;
    // Tower body
    ctx.beginPath();
    ctx.rect(cx - 40, topY + 80, 80, baseY - topY - 80);
    ctx.stroke();
    // Clock face
    ctx.beginPath();
    ctx.arc(cx, topY + 120, 30, 0, Math.PI * 2);
    ctx.stroke();
    // Clock hands
    ctx.beginPath();
    ctx.moveTo(cx, topY + 120);
    ctx.lineTo(cx, topY + 100);
    ctx.moveTo(cx, topY + 120);
    ctx.lineTo(cx + 20, topY + 120);
    ctx.stroke();
    // Spire
    ctx.beginPath();
    ctx.moveTo(cx - 40, topY + 80);
    ctx.lineTo(cx, topY);
    ctx.lineTo(cx + 40, topY + 80);
    ctx.stroke();
  }

  drawSydneyOpera(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.75;
    // Water line
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();
    // Sails (arcs)
    const sailCount = 5;
    for (let i = 0; i < sailCount; i++) {
      const x = cx - 140 + i * 60;
      const size = 60 - Math.abs(i - 2) * 10;
      ctx.beginPath();
      ctx.arc(x, baseY, size, Math.PI, Math.PI * 1.5);
      ctx.stroke();
    }
  }

  drawTajMahal(ctx, w, h) {
    const cx = w / 2;
    const baseY = h * 0.75;
    // Platform
    ctx.beginPath();
    ctx.rect(cx - 150, baseY, 300, 20);
    ctx.stroke();
    // Main building
    ctx.beginPath();
    ctx.rect(cx - 80, baseY - 100, 160, 100);
    ctx.stroke();
    // Main dome
    ctx.beginPath();
    ctx.arc(cx, baseY - 100, 50, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 150);
    ctx.lineTo(cx, baseY - 170);
    ctx.stroke();
    // Side minarets
    [-120, 120].forEach(dx => {
      ctx.beginPath();
      ctx.rect(cx + dx - 8, baseY - 140, 16, 140);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 140, 10, Math.PI, 0);
      ctx.stroke();
    });
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
