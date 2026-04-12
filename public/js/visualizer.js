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
      waveSize: 80,
      colorFlash: true,
      patternSize: 1.0,   // 0.25-2.0 multiplier on item size
      speedMult: 1.0,     // 0.25-4.0 multiplier on top of music sync
      videoSpeed: 1,
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
    this._ytFrame = null;

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
    bind('wave-size', 'waveSize');
    bind('color-flash', 'colorFlash');
    bind('pattern-size', 'patternSize', v => v / 100);
    bind('speed-mult', 'speedMult', v => v / 100);
    bind('viz-mode', 'vizMode');

    // Speed label update
    const speedEl = document.getElementById('speed-mult');
    if (speedEl) {
      const label = document.getElementById('speed-label');
      const updateLabel = () => {
        const v = parseFloat(speedEl.value) / 100;
        label.textContent = (v < 1 ? v.toFixed(2) : v % 1 === 0 ? v + '' : v.toFixed(1)) + 'x';
      };
      speedEl.addEventListener('input', updateLabel);
    }

    // Video speed
    const vidSpeedEl = document.getElementById('video-speed');
    if (vidSpeedEl) {
      vidSpeedEl.addEventListener('change', () => {
        this.settings.videoSpeed = parseFloat(vidSpeedEl.value);
        this._setVideoSpeed(this.settings.videoSpeed);
      });
    }

    // Video position seek
    const vidPosEl = document.getElementById('video-position');
    if (vidPosEl) {
      vidPosEl.addEventListener('input', () => {
        this._seekVideo(parseFloat(vidPosEl.value));
      });
    }
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
    this._ensureYouTubeFrame();
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

    // Clear — VHS mode: transparent canvas reveals YouTube iframe beneath
    if (this.settings.vizMode === 'vhs') {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } else {
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

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

    // Energy → wave size (turbulence amplitude for standalone modes)
    const energy = f.energy || 0.5;
    this.settings.waveSize = 30 + energy * 170;

    // Valence/mood → color scheme
    const valence = f.valence || 0.5;
    if (valence > 0.7) this.settings.colorScheme = 'fire';
    else if (valence > 0.5) this.settings.colorScheme = 'neon';
    else if (valence > 0.3) this.settings.colorScheme = 'spotify';
    else if (valence > 0.15) this.settings.colorScheme = 'ocean';
    else this.settings.colorScheme = 'monochrome';

    // High energy + dance → flash on
    const dance = f.danceability || 0.5;
    this.settings.colorFlash = energy > 0.5 && dance > 0.4;

    // NOTE: vizMode, patternSize, speedMult never changed by sync —
    // user controls those. BPM pulse drives all mode speeds inherently.

    this.syncControlsToUI();
  }

  syncControlsToUI() {
    const s = this.settings;
    this.setControl('color-scheme', s.colorScheme);
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
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;
    const waveAmp = this.settings.waveSize / 100;

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
        w: (30 + energy * 25) * pSize,
        h: (42 + energy * 35) * pSize,
        color: colors[Math.floor(Math.random() * colors.length)],
        suit: Math.floor(Math.random() * 4),
        life: 1,
        distortion: 0,
        bounces: 0
      });
    }

    // Gravity is tempo-driven: faster BPM = stronger "excitement"
    const gravity = (0.15 + (this.bpm / 120) * 0.15 + energy * 0.3) * uSpeed;

    for (let i = this.solitaireCards.length - 1; i >= 0; i--) {
      const card = this.solitaireCards[i];
      card.vy += gravity;
      card.vx += Math.sin(now * 0.003 + card.y * 0.01) * waveAmp * 0.15;
      card.x += card.vx * uSpeed;
      card.y += card.vy * uSpeed;
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
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;

    // Speed tied to BPM, scaled by user speed multiplier
    const speedMult = (1 + (this.bpm / 120 - 1) * 0.8 + energy * 1.2) * uSpeed;

    // Logo size (scale with energy + patternSize)
    const logoW = (160 + energy * 60) * pSize;
    const logoH = (80 + energy * 30) * pSize;

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

  // VHS-style overlay over live YouTube video background
  drawVHS(data, energy, bassEnergy) {
    const now = performance.now();
    const state = this.vhsState;
    const uSpeed = this.settings.speedMult;

    // "Channel switch" on a musical interval or big bass hit — updates title text
    const slideInterval = Math.max(3000, (60000 / this.bpm * 8) / uSpeed);
    const elapsed = now - state.lastSlide;
    if (elapsed > slideInterval || (bassEnergy > 0.85 && elapsed > 1500)) {
      state.slideIdx = (state.slideIdx + 1) % this.landmarks.length;
      state.lastSlide = now;
      state.transitionProgress = 0;
      state.jitter = 1;
    }

    state.transitionProgress = Math.min(1, state.transitionProgress + 0.02);
    state.jitter *= 0.96;
    // scanY speed is audio-driven: faster BPM + energy = faster scan, user speed scales
    state.scanY = (state.scanY + (1.5 + (this.bpm / 120) * 1.5 + energy * 3.5) * uSpeed) % this.height;

    const ctx = this.ctx;

    // Warm sepia tint over video (thickens during jitter / channel switch)
    ctx.fillStyle = `rgba(50, 25, 8, ${0.12 + state.jitter * 0.18})`;
    ctx.fillRect(0, 0, this.width, this.height);

    // Scan lines — density tied to energy
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 0; y < this.height; y += 3) {
      ctx.fillRect(0, y, this.width, 1);
    }

    // Moving tracking band — speed = audio reactive (set above)
    const tY = state.scanY;
    const grad = ctx.createLinearGradient(0, tY - 30, 0, tY + 30);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${0.07 + energy * 0.12})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, tY - 30, this.width, 60);

    // Jitter bars on channel switch
    if (state.jitter > 0.15) {
      const jCount = Math.floor(state.jitter * 10);
      for (let i = 0; i < jCount; i++) {
        const jy = Math.random() * this.height;
        const jh = 1 + Math.random() * 6;
        const jShift = (Math.random() - 0.5) * state.jitter * 40;
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.22})`;
        ctx.fillRect(jShift, jy, this.width, jh);
      }
    }

    // Glitch bars on bass hit
    if (bassEnergy > 0.55) {
      const glitchCount = Math.floor(bassEnergy * 6);
      for (let i = 0; i < glitchCount; i++) {
        const gy = Math.random() * this.height;
        const gh = 2 + Math.random() * 10;
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.28})`;
        ctx.fillRect(0, gy, this.width, gh);
      }
    }

    // Subtle warm noise grain
    ctx.fillStyle = 'rgba(255, 210, 160, 0.025)';
    ctx.fillRect(0, 0, this.width, this.height);

    // VHS title bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(0, this.height - 60, this.width, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`► PLAY   CH ${String(state.slideIdx + 1).padStart(2, '0')}`, 20, this.height - 40);
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('LIVE', 20, this.height - 18);

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

  // Toy Avalanche — dense mass of plastic bouncy balls, BPM-driven gravity
  drawToys(data, energy, bassEnergy) {
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;
    const waveAmp = this.settings.waveSize / 100;
    const now = performance.now();
    const speedMult = (1.5 + (this.bpm / 120) * 1.6 + energy * 2.2) * uSpeed;
    const ballColors = [
      { m: '#ff2020', l: '#ff9090', d: '#7a0000' },
      { m: '#ff8800', l: '#ffd090', d: '#7a4000' },
      { m: '#ffe000', l: '#fff5aa', d: '#7a6c00' },
      { m: '#20ff50', l: '#90ffb0', d: '#006b20' },
      { m: '#2055ff', l: '#90bbff', d: '#002288' },
      { m: '#cc20ff', l: '#ee90ff', d: '#550088' },
      { m: '#ff2090', l: '#ff90cc', d: '#7a0044' },
      { m: '#00ddff', l: '#88f5ff', d: '#006f7a' },
    ];

    const burstCount = Math.floor(beatPulse * 8);
    const bgSpawn = Math.random() < (0.75 + energy * 0.8) ? 1 : 0;
    for (let s = 0; s < burstCount + bgSpawn && this.toyItems.length < 680; s++) {
      const side = Math.floor(Math.random() * 3);
      let x, y, vx, vy;
      if (side === 0) { x = Math.random() * this.width; y = -40; vx = (Math.random()-0.5)*10; vy = 3+Math.random()*7; }
      else if (side === 1) { x = -40; y = Math.random()*this.height*0.7; vx = 5+Math.random()*9; vy = (Math.random()-0.5)*9; }
      else { x = this.width+40; y = Math.random()*this.height*0.7; vx = -(5+Math.random()*9); vy = (Math.random()-0.5)*9; }
      const c = ballColors[Math.floor(Math.random() * ballColors.length)];
      this.toyItems.push({ x, y, vx, vy, r: (10+energy*20+Math.random()*16) * pSize, color: c, life: 1, bounces: 0, distortion: 0 });
    }

    const gravity = (0.35 + (this.bpm / 120) * 0.35 + energy * 0.55) * uSpeed;

    for (let i = this.toyItems.length - 1; i >= 0; i--) {
      const item = this.toyItems[i];
      item.vy += gravity;
      // Wave turbulence — waveSize makes items oscillate in wave patterns
      item.vx += Math.sin(now * 0.003 + item.y * 0.012) * waveAmp * 0.2;
      item.x += item.vx * speedMult * 0.35;
      item.y += item.vy * speedMult * 0.35;
      item.distortion += bassEnergy * 0.05;

      if (item.y + item.r > this.height) {
        item.y = this.height - item.r;
        item.vy *= -(0.52 + energy * 0.22 + bassEnergy * 0.18);
        item.vx *= 0.86;
        item.bounces++;
        item.distortion += 0.18;
        if (item.bounces > 5) item.life -= 0.18;
      }
      if (item.x < -item.r) item.x = this.width + item.r;
      if (item.x > this.width + item.r) item.x = -item.r;

      item.life -= 0.001;
      if (item.life <= 0) { this.toyItems.splice(i, 1); continue; }
      this._drawPlasticBall(item.x, item.y, item.r, item.color, item.distortion, bassEnergy, item.life);
    }
  }

  _drawPlasticBall(x, y, r, color, distortion, bassEnergy, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);

    // Chromatic aberration on bass
    if (distortion > 0.35 && bassEnergy > 0.4) {
      ctx.save(); ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.arc(x - distortion*5, y, r, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,30,30,0.65)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + distortion*5, y, r, 0, Math.PI*2); ctx.fillStyle = 'rgba(30,255,255,0.65)'; ctx.fill();
      ctx.restore();
    }
    // Drop shadow
    ctx.beginPath();
    ctx.ellipse(x+r*0.12, y+r*0.82, r*0.7, r*0.2, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    // Sphere radial gradient
    const grad = ctx.createRadialGradient(x-r*0.38, y-r*0.38, r*0.03, x+r*0.1, y+r*0.1, r*1.05);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.18, color.l);
    grad.addColorStop(0.5, color.m); grad.addColorStop(0.82, color.d); grad.addColorStop(1, '#000');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill();
    // Primary specular
    ctx.beginPath(); ctx.arc(x-r*0.32, y-r*0.32, r*0.23, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fill();
    // Tiny glint
    ctx.beginPath(); ctx.arc(x-r*0.14, y-r*0.14, r*0.08, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    // Glow ring on bass
    if (bassEnergy > 0.5 && distortion > 0.2) {
      ctx.beginPath(); ctx.arc(x, y, r*1.3, 0, Math.PI*2);
      ctx.strokeStyle = color.m; ctx.lineWidth = 2; ctx.globalAlpha *= 0.45; ctx.stroke();
    }
    ctx.restore();
  }

  // Food Storm — overflowing donuts with music-driven rotating sideways gravity
  drawFood(data, energy, bassEnergy) {
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;
    const waveAmp = this.settings.waveSize / 100;
    const now = performance.now();
    const gravityAngle = Math.sin(this.simPhase * 0.2) * 0.9;
    const gStrength = (0.28 + energy * 0.45 + (this.bpm / 120) * 0.18) * uSpeed;
    const gx = Math.sin(gravityAngle) * gStrength;
    const gy = Math.abs(Math.cos(gravityAngle)) * gStrength * 0.5 + 0.1;
    const speedMult = (1.1 + (this.bpm / 120) * 1.3 + energy * 1.8) * uSpeed;
    const glazeColors = [
      { glaze: '#ff82b8', body: '#c4843c' },
      { glaze: '#6b3a1f', body: '#c4843c' },
      { glaze: '#f5f5f5', body: '#c4843c' },
      { glaze: '#ff4422', body: '#c4843c' },
      { glaze: '#44aaff', body: '#c4843c' },
      { glaze: '#88ff44', body: '#c4843c' },
      { glaze: '#ffdd00', body: '#c4843c' },
      { glaze: '#cc44ff', body: '#c4843c' },
    ];

    const burstCount = Math.floor(beatPulse * 7);
    const bgSpawn = Math.random() < (0.7 + energy * 0.85) ? 1 : 0;
    for (let s = 0; s < burstCount + bgSpawn && this.foodItems.length < 600; s++) {
      const edge = Math.floor(Math.random() * 4);
      let x, y, vx, vy;
      if (edge === 0) { x = Math.random()*this.width; y = -45; vx = (Math.random()-0.5)*12; vy = 3+Math.random()*6; }
      else if (edge === 1) { x = this.width+45; y = Math.random()*this.height; vx = -(5+Math.random()*9); vy = (Math.random()-0.5)*9; }
      else if (edge === 2) { x = -45; y = Math.random()*this.height; vx = 5+Math.random()*9; vy = (Math.random()-0.5)*9; }
      else { x = Math.random()*this.width; y = this.height+45; vx = (Math.random()-0.5)*12; vy = -(3+Math.random()*6); }
      const c = glazeColors[Math.floor(Math.random() * glazeColors.length)];
      this.foodItems.push({ x, y, vx, vy, rot: Math.random()*Math.PI*2, vrot: (Math.random()-0.5)*0.25, r: (14+energy*22+Math.random()*16) * pSize, colors: c, life: 1, distortion: 0 });
    }

    for (let i = this.foodItems.length - 1; i >= 0; i--) {
      const item = this.foodItems[i];
      item.vx += gx; item.vy += gy;
      item.vx += Math.sin(now * 0.002 + item.y * 0.01) * waveAmp * 0.18;
      item.x += item.vx * speedMult * 0.35;
      item.y += item.vy * speedMult * 0.35;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.035;
      const spd = Math.sqrt(item.vx*item.vx + item.vy*item.vy);
      const cap = 16 + energy * 12;
      if (spd > cap) { item.vx *= cap/spd; item.vy *= cap/spd; }
      if (item.x < -90) item.x = this.width+90; if (item.x > this.width+90) item.x = -90;
      if (item.y < -90) item.y = this.height+90; if (item.y > this.height+90) item.y = -90;
      item.life -= 0.001;
      if (item.life <= 0) { this.foodItems.splice(i, 1); continue; }
      this._drawDonut(item.x, item.y, item.r, item.rot, item.colors, item.distortion, bassEnergy, item.life);
    }
  }

  _drawDonut(x, y, r, rot, colors, distortion, bassEnergy, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y); ctx.rotate(rot);

    if (distortion > 0.3 && bassEnergy > 0.4) {
      ctx.save(); ctx.globalAlpha *= 0.42;
      for (const [ox, col] of [[-distortion*6, 'rgba(255,40,40,0.7)'], [distortion*6, 'rgba(40,255,255,0.7)']]) {
        ctx.beginPath(); ctx.arc(ox, 0, r, 0, Math.PI*2, false); ctx.arc(ox, 0, r*0.42, Math.PI*2, 0, true);
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.restore();
    }
    // Shadow
    ctx.beginPath(); ctx.ellipse(r*0.1, r*0.76, r*0.72, r*0.18, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    // Body ring
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2, false); ctx.arc(0, 0, r*0.42, Math.PI*2, 0, true);
    const bodyGrad = ctx.createRadialGradient(-r*0.2, -r*0.2, r*0.08, 0, 0, r);
    bodyGrad.addColorStop(0, '#e8a865'); bodyGrad.addColorStop(0.5, colors.body); bodyGrad.addColorStop(1, '#5a2e0a');
    ctx.fillStyle = bodyGrad; ctx.fill();
    // Glaze arc on top
    ctx.beginPath(); ctx.arc(0, 0, r*0.92, -Math.PI*0.72, Math.PI*0.38, false); ctx.arc(0, 0, r*0.46, Math.PI*0.38, -Math.PI*0.72, true); ctx.closePath();
    const glazeGrad = ctx.createRadialGradient(-r*0.25, -r*0.25, r*0.06, 0, 0, r*0.9);
    glazeGrad.addColorStop(0, '#ffffff'); glazeGrad.addColorStop(0.3, colors.glaze); glazeGrad.addColorStop(1, colors.glaze);
    ctx.fillStyle = glazeGrad; ctx.fill();
    // Glaze specular
    ctx.beginPath(); ctx.arc(-r*0.3, -r*0.28, r*0.18, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.fill();
    // Hole
    ctx.beginPath(); ctx.arc(0, 0, r*0.4, 0, Math.PI*2); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
  }

  // Paper Blizzard — dense tumbling sheets of paper and books in music-driven wind
  drawPaper(data, energy, bassEnergy) {
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;
    const waveAmp = this.settings.waveSize / 100;
    const windAngle = this.simPhase * 0.28;
    const windStrength = (0.22 + energy * 0.75 + (this.bpm / 120) * 0.18) * uSpeed;
    const windX = Math.cos(windAngle) * windStrength;
    const windY = (0.06 + Math.abs(Math.sin(windAngle)) * 0.08) * uSpeed;
    const speedMult = (1.0 + (this.bpm / 120) * 1.2 + energy * 1.6) * uSpeed;
    const paperColors = ['#ffffff', '#f8f8ec', '#eeeeff', '#fff8e0'];
    const bookColors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085'];

    const burstCount = Math.floor(beatPulse * 7);
    const bgSpawn = Math.random() < (0.7 + energy * 0.85) ? 1 : 0;
    for (let s = 0; s < burstCount + bgSpawn && this.paperItems.length < 580; s++) {
      const isBook = Math.random() < 0.3;
      const fromSide = Math.random() < 0.4;
      this.paperItems.push({
        x: fromSide ? (Math.random() < 0.5 ? -50 : this.width+50) : Math.random()*this.width,
        y: fromSide ? Math.random()*this.height : -50,
        vx: windX*(2+Math.random()*5) + (Math.random()-0.5)*10,
        vy: 2 + Math.random()*6,
        rot: Math.random()*Math.PI*2, vrot: (Math.random()-0.5)*0.32,
        w: (isBook ? 12+Math.random()*14 : 30+Math.random()*32) * pSize,
        h: (isBook ? 30+Math.random()*32 : 22+Math.random()*26) * pSize,
        color: isBook ? bookColors[Math.floor(Math.random()*bookColors.length)] : paperColors[Math.floor(Math.random()*paperColors.length)],
        isBook, wobble: Math.random()*Math.PI*2, life: 1, distortion: 0
      });
    }

    for (let i = this.paperItems.length - 1; i >= 0; i--) {
      const item = this.paperItems[i];
      item.wobble += 0.055 * speedMult;
      item.vx += windX*0.09 + Math.sin(item.wobble)*0.14*energy;
      item.vx += Math.cos(item.wobble * 0.7) * waveAmp * 0.12;
      item.vy += windY*0.5;
      item.x += item.vx * speedMult * 0.38;
      item.y += item.vy * speedMult * 0.38;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.032;
      const spd = Math.sqrt(item.vx*item.vx + item.vy*item.vy);
      const cap = 14 + energy * 9;
      if (spd > cap) { item.vx *= cap/spd; item.vy *= cap/spd; }
      if (item.x < -90) item.x = this.width+90; if (item.x > this.width+90) item.x = -90;
      item.life -= 0.001;
      if (item.life <= 0 || item.y > this.height + 90) { this.paperItems.splice(i, 1); continue; }
      this._drawPaperItem(item, bassEnergy);
    }
  }

  _drawPaperItem(item, bassEnergy) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, item.life);
    ctx.translate(item.x, item.y); ctx.rotate(item.rot);
    const { w, h, color, isBook, distortion } = item;

    if (distortion > 0.35 && bassEnergy > 0.45) {
      ctx.save(); ctx.globalAlpha *= 0.38;
      ctx.fillStyle = 'rgba(255,40,40,0.5)'; ctx.fillRect(-w/2-distortion*4, -h/2, w, h);
      ctx.fillStyle = 'rgba(40,255,255,0.5)'; ctx.fillRect(-w/2+distortion*4, -h/2, w, h);
      ctx.restore();
    }

    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 7; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;

    if (isBook) {
      ctx.fillStyle = color; ctx.fillRect(-w/2, -h/2, w, h);
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-w/2, -h/2, w*0.28, h);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(-w/2+w*0.28, -h/2, 1.5, h);
      const sheen = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen; ctx.fillRect(-w/2, -h/2, w, h);
    } else {
      ctx.fillStyle = color; ctx.fillRect(-w/2, -h/2, w, h);
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(w/2-3, -h/2+3, 3, h-3); ctx.fillRect(-w/2+3, h/2-3, w-3, 3);
      ctx.strokeStyle = 'rgba(170,170,170,0.75)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(w/2-10, -h/2); ctx.lineTo(w/2, -h/2+10); ctx.stroke();
      ctx.strokeStyle = 'rgba(130,130,130,0.4)'; ctx.lineWidth = 1;
      for (let l = 0; l < 4; l++) { const ly = -h/2 + h*0.22 + l*(h*0.18); ctx.beginPath(); ctx.moveTo(-w/2+4, ly); ctx.lineTo(w/2-(l===3?w*0.35:4), ly); ctx.stroke(); }
      const sheen = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
      sheen.addColorStop(0, 'rgba(255,255,255,0.38)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen; ctx.fillRect(-w/2, -h/2, w, h);
    }
    ctx.restore();
  }

  // Runway Drift — overflowing glossy faceted jewels rising with reverse gravity
  drawRunway(data, energy, bassEnergy) {
    const beatPulse = Math.pow(Math.max(0, Math.cos(this.beatPhase)), 3);
    const pSize = this.settings.patternSize;
    const uSpeed = this.settings.speedMult;
    const waveAmp = this.settings.waveSize / 100;
    const now = performance.now();
    const speedMult = (1.2 + (this.bpm / 120) * 1.5 + energy * 2.0) * uSpeed;
    const gemColors = [
      { m: '#ff1a1a', l: '#ff8888', d: '#660000' },
      { m: '#1a88ff', l: '#88ccff', d: '#003388' },
      { m: '#11cc44', l: '#88ffaa', d: '#006622' },
      { m: '#dd22ff', l: '#ee99ff', d: '#550088' },
      { m: '#ffaa00', l: '#ffe088', d: '#7a5000' },
      { m: '#ffffff', l: '#ffffff', d: '#aaaaaa' },
      { m: '#ff6622', l: '#ffbb88', d: '#882200' },
      { m: '#00eeff', l: '#88f8ff', d: '#006688' },
    ];

    const burstCount = Math.floor(beatPulse * 8);
    const bgSpawn = Math.random() < (0.72 + energy * 0.88) ? 1 : 0;
    for (let s = 0; s < burstCount + bgSpawn && this.runwayItems.length < 650; s++) {
      const c = gemColors[Math.floor(Math.random() * gemColors.length)];
      this.runwayItems.push({
        x: Math.random() * this.width, y: this.height + 50,
        vx: (Math.random()-0.5)*8,
        vy: -(4 + Math.random()*6 + energy*5),
        rot: Math.random()*Math.PI, vrot: (Math.random()-0.5)*0.07,
        size: (12+energy*24+Math.random()*16) * pSize, color: c,
        swayPhase: Math.random()*Math.PI*2, life: 1, distortion: 0
      });
    }

    // Antigravity — energy directly amplifies upward pull
    const antigravity = -(0.1 + energy * 0.22 + (this.bpm / 120) * 0.06) * uSpeed;

    for (let i = this.runwayItems.length - 1; i >= 0; i--) {
      const item = this.runwayItems[i];
      item.swayPhase += 0.038 * speedMult * (this.bpm / 120);
      item.vy += antigravity;
      // Sway + wave turbulence
      item.vx += Math.sin(item.swayPhase) * 0.12 + Math.sin(now * 0.002 + item.y * 0.008) * waveAmp * 0.1;
      item.x += item.vx * speedMult * 0.36;
      item.y += item.vy * speedMult * 0.36;
      item.rot += item.vrot * speedMult;
      item.distortion += bassEnergy * 0.035;
      if (item.x < -80) item.x = this.width+80; if (item.x > this.width+80) item.x = -80;
      item.life -= 0.001;
      if (item.life <= 0 || item.y < -130) { this.runwayItems.splice(i, 1); continue; }
      this._drawGem(item.x, item.y, item.size, item.rot, item.color, item.distortion, bassEnergy, item.life);
    }
  }

  _drawGem(x, y, size, rot, color, distortion, bassEnergy, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y); ctx.rotate(rot);

    // Glow halo — bass makes it flare
    const glowR = size * (1.5 + distortion * 0.5 + bassEnergy * 0.6);
    const glow = ctx.createRadialGradient(0, 0, size*0.25, 0, 0, glowR);
    glow.addColorStop(0, color.m + 'aa'); glow.addColorStop(1, color.m + '00');
    ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI*2); ctx.fillStyle = glow; ctx.fill();

    if (distortion > 0.28 && bassEnergy > 0.38) {
      ctx.save(); ctx.globalAlpha *= 0.42;
      this._drawGemShape(ctx, -distortion*6, 0, size, 'rgba(255,40,40,0.72)');
      this._drawGemShape(ctx, distortion*6, 0, size, 'rgba(40,255,255,0.72)');
      ctx.restore();
    }

    // Main faceted diamond
    const facetGrad = ctx.createLinearGradient(0, -size, 0, size);
    facetGrad.addColorStop(0, '#ffffff'); facetGrad.addColorStop(0.2, color.l);
    facetGrad.addColorStop(0.55, color.m); facetGrad.addColorStop(0.85, color.d); facetGrad.addColorStop(1, '#000000');
    this._drawGemShape(ctx, 0, 0, size, facetGrad);

    // Facet lines
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size*0.62, 0); ctx.moveTo(0, -size); ctx.lineTo(-size*0.62, 0);
    ctx.moveTo(-size*0.62, 0); ctx.lineTo(0, size); ctx.moveTo(size*0.62, 0); ctx.lineTo(0, size);
    ctx.moveTo(-size*0.62, 0); ctx.lineTo(size*0.62, 0);
    ctx.stroke();

    // Specular spot
    ctx.beginPath(); ctx.arc(-size*0.2, -size*0.35, size*0.15, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.restore();
  }

  _drawGemShape(ctx, ox, oy, size, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(ox, oy - size); ctx.lineTo(ox + size*0.62, oy);
    ctx.lineTo(ox, oy + size); ctx.lineTo(ox - size*0.62, oy);
    ctx.closePath(); ctx.fillStyle = fillStyle; ctx.fill();
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

  // ─── YouTube iframe (persistent, plays behind canvas) ──────────────────────

  _ensureYouTubeFrame() {
    if (this._ytFrame) return;
    const container = this.canvas.parentElement;
    const iframe = document.createElement('iframe');
    iframe.id = 'vhs-yt-frame';
    iframe.src = 'https://www.youtube.com/embed/CRznPhtWA6A?autoplay=1&mute=1&loop=1&playlist=CRznPhtWA6A&controls=0&modestbranding=1&rel=0&showinfo=0&enablejsapi=1';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;z-index:0;pointer-events:none;';
    container.appendChild(iframe);
    this.canvas.style.position = 'relative';
    this.canvas.style.zIndex = '1';
    this._ytFrame = iframe;
  }

  _setVideoSpeed(rate) {
    if (!this._ytFrame) return;
    this._ytFrame.contentWindow.postMessage(JSON.stringify({
      event: 'command', func: 'setPlaybackRate', args: [rate]
    }), '*');
  }

  _seekVideo(percent) {
    if (!this._ytFrame) return;
    // Map 0-100 slider to seconds (7200s max ≈ 2h; YouTube clamps to actual length)
    const seconds = (percent / 100) * 7200;
    this._ytFrame.contentWindow.postMessage(JSON.stringify({
      event: 'command', func: 'seekTo', args: [seconds, true]
    }), '*');
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
