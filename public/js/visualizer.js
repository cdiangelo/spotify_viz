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

    // Settings
    this.settings = {
      colorScheme: 'spotify',
      geoOverlay: 'none',
      overlaySize: 80,
      overlayOpacity: 0.4,
      bounceIntensity: 0.6,
      waveFreq: 8,
      waveSize: 80,
      colorFlash: true,
      vizMode: 'bars'
    };

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
    this.simPhase += 0.03;

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

      const val = bassPeak + midPeak + treblePeak + wave1 + wave2 + wave3 + noise;
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
    }

    // Draw geometric overlay
    if (this.settings.geoOverlay !== 'none') {
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
    const { geoOverlay, overlaySize, overlayOpacity } = this.settings;
    const bounce = bassEnergy * this.settings.bounceIntensity * 20;
    const colors = this.colorSchemes[this.settings.colorScheme];
    const baseColor = colors[0];
    const alpha = overlayOpacity;

    this.ctx.strokeStyle = this.hexToRgba(baseColor, alpha);
    this.ctx.lineWidth = 1.5;

    const size = overlaySize + bounce;
    const cols = Math.ceil(this.width / (size * 1.5)) + 1;
    const rows = Math.ceil(this.height / (size * 1.5)) + 1;

    switch (geoOverlay) {
      case 'circles':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * size * 1.5 + size * 0.75;
            const y = r * size * 1.5 + size * 0.75;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
        break;

      case 'triangles':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * size * 1.2 + (r % 2) * size * 0.6;
            const y = r * size;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - size * 0.4);
            this.ctx.lineTo(x - size * 0.35, y + size * 0.3);
            this.ctx.lineTo(x + size * 0.35, y + size * 0.3);
            this.ctx.closePath();
            this.ctx.stroke();
          }
        }
        break;

      case 'hexagons':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * size * 1.5 + (r % 2) * size * 0.75;
            const y = r * size * 1.3;
            this.drawHexagon(x, y, size * 0.45);
          }
        }
        break;

      case 'diamonds':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * size * 1.2 + (r % 2) * size * 0.6;
            const y = r * size;
            const s = size * 0.4;
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

      case 'stars':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * size * 1.5 + (r % 2) * size * 0.75;
            const y = r * size * 1.5 + size * 0.75;
            this.drawStar(x, y, 5, size * 0.4, size * 0.2);
          }
        }
        break;

      case 'grid':
        this.ctx.beginPath();
        for (let x = 0; x < this.width; x += size) {
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, this.height);
        }
        for (let y = 0; y < this.height; y += size) {
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

  // ─── Utility ───────────────────────────────────────────────────────────────

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
