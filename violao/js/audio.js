// Motor de som: sintetiza cordas de violão (Karplus-Strong) com Web Audio.
import { chordNotes } from './chords.js';

const BUFFER_SECONDS = 3.2;

export class GuitarEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.voices = new Array(6).fill(null); // voz ativa por corda
    this.live = new Set();
    this.volume = 0.9;
  }

  /** Precisa ser chamado a partir de um gesto do usuário (toque). */
  async unlock() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.02);
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));

    // Corpo do violão: realce de graves e um pouco de "brilho"
    const body = ctx.createBiquadFilter();
    body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.1; body.gain.value = 4;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking'; presence.frequency.value = 2800; presence.Q.value = 0.9; presence.gain.value = 2;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = -6;
    body.connect(presence).connect(air);

    const reverb = ctx.createConvolver();
    reverb.buffer = this._impulse(1.3, 3.2);
    const wet = ctx.createGain(); wet.gain.value = 0.18;
    const dry = ctx.createGain(); dry.gain.value = 1;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    air.connect(dry).connect(comp);
    air.connect(reverb).connect(wet).connect(comp);
    comp.connect(this.master).connect(ctx.destination);

    // Barramentos de timbre (palhetada fraca/normal/forte)
    const bus = (freq) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = 0.5;
      f.connect(body);
      return f;
    };
    this.bus = { soft: bus(2400), normal: bus(4800), bright: bus(9000) };

    // Ruído percussivo do abafado
    const nlen = Math.floor(ctx.sampleRate * 0.07);
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nlen, 3);
    this.noiseBus = ctx.createBiquadFilter();
    this.noiseBus.type = 'bandpass'; this.noiseBus.frequency.value = 1700; this.noiseBus.Q.value = 0.8;
    this.noiseBus.connect(body);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Buffer Karplus-Strong de uma nota (cacheado). */
  _buffer(midi) {
    let buf = this.buffers.get(midi);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const len = Math.floor(sr * BUFFER_SECONDS);
    buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);

    // Excitação: ruído suavizado + posição da palheta (filtro pente)
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      lp += 0.55 * (Math.random() * 2 - 1 - lp);
      ring[i] = lp; mean += lp;
    }
    mean /= N;
    const pick = Math.max(1, Math.round(N * 0.13));
    const tmp = Float32Array.from(ring, (v) => v - mean);
    for (let i = 0; i < N; i++) ring[i] = tmp[i] - 0.8 * tmp[(i - pick + N) % N];

    // Ganho de perda calculado para um tempo de decaimento (T60) realista
    const t60 = 4.2 - 2.2 * Math.min(1, (midi - 40) / 36); // grave soa mais
    const perSec = Math.pow(10, -3 / t60);
    const filterLoss = Math.pow(Math.cos(Math.PI * freq / sr), freq);
    const rho = Math.min(0.99999, Math.pow(perSec / filterLoss, 1 / freq));

    let idx = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx];
      const b = ring[idx + 1 === N ? 0 : idx + 1];
      out[i] = a;
      ring[idx] = rho * 0.5 * (a + b);
      idx = idx + 1 === N ? 0 : idx + 1;
      const abs = a < 0 ? -a : a;
      if (abs > peak) peak = abs;
    }
    // Normaliza e faz fade-out no fim do buffer
    const norm = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.3);
    for (let i = 0; i < len; i++) {
      out[i] *= norm;
      if (i > len - fade) out[i] *= (len - i) / fade;
    }
    this.buffers.set(midi, buf);
    return buf;
  }

  /** Pré-gera os buffers de um acorde (evita engasgo no 1º toque). */
  prepare(chord) {
    if (!this.ctx) return;
    chordNotes(chord).forEach((n) => n != null && this._buffer(n));
  }

  _dampVoice(v, t, tc = 0.012) {
    const g = v.g.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, tc);
    try { v.src.stop(t + tc * 10); } catch { /* ignore */ }
  }

  _note(string, midi, t, { vel = 0.8, bus = 'normal', release = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._buffer(midi);
    src.detune.value = (Math.random() - 0.5) * 4; // humanização leve
    const g = ctx.createGain();
    const amp = 0.32 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.003);
    src.start(t);
    if (release != null) {
      g.gain.setTargetAtTime(0, t + 0.01, release);
      src.stop(t + 0.01 + release * 10);
    }
    src.connect(g).connect(this.bus[bus]);

    const old = this.voices[string];
    if (old) this._dampVoice(old, t);

    const v = { src, g, start: t };
    this.voices[string] = v;
    this.live.add(v);
    src.onended = () => {
      this.live.delete(v);
      g.disconnect();
      if (this.voices[string] === v) this.voices[string] = null;
    };
  }

  _strum(chord, t, { dir = 'down', strings = null, vel = 0.8, spread = 0.011, bus = 'normal', release = null }) {
    const notes = chordNotes(chord);
    let order = [0, 1, 2, 3, 4, 5].filter((s) => notes[s] != null && (!strings || strings.includes(s)));
    if (dir === 'up') order = order.reverse();
    order.forEach((s, i) => {
      const jitter = (Math.random() - 0.5) * 0.003;
      const v = vel * (0.85 + Math.random() * 0.2) * (dir === 'up' ? 1 - i * 0.04 : 0.9 + i * 0.03);
      this._note(s, notes[s], t + i * spread + Math.max(0, jitter), { vel: v, bus, release });
    });
  }

  _chuck(chord, t) {
    // Abafa tudo + estalo percussivo + cordas mortas
    this.voices.forEach((v) => v && this._dampVoice(v, t, 0.006));
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.ctx.createGain();
    g.gain.value = 0.55;
    src.connect(g).connect(this.noiseBus);
    src.onended = () => g.disconnect();
    src.start(t);
    this._strum(chord, t, { vel: 0.5, spread: 0.005, bus: 'soft', release: 0.012 });
  }

  _bass(chord, t, alt) {
    const notes = chordNotes(chord);
    const played = [0, 1, 2, 3, 4, 5].filter((s) => notes[s] != null);
    const s = alt ? played[1] ?? played[0] : played[0];
    if (s == null) return;
    this._note(s, notes[s], t, { vel: 1.0, bus: 'normal' });
  }

  /** Toca um passo da batida. */
  playStep(sym, chord, t) {
    if (!this.ctx || !chord) return;
    switch (sym) {
      case 'D': return this._strum(chord, t, { vel: 1.0, spread: 0.013, bus: 'bright' });
      case 'd': return this._strum(chord, t, { vel: 0.6, spread: 0.010, bus: 'normal' });
      case 'U': return this._strum(chord, t, { dir: 'up', strings: [2, 3, 4, 5], vel: 0.8, spread: 0.009, bus: 'bright' });
      case 'u': return this._strum(chord, t, { dir: 'up', strings: [2, 3, 4, 5], vel: 0.45, spread: 0.008, bus: 'normal' });
      case 'X': return this._chuck(chord, t);
      case 'S':
        this.voices.forEach((v) => v && this._dampVoice(v, t, 0.008));
        return this._strum(chord, t, { strings: [2, 3, 4, 5], vel: 0.9, spread: 0.005, bus: 'bright', release: 0.05 });
      case 'B': return this._bass(chord, t, false);
      case 'b': return this._bass(chord, t, true);
      default: return undefined;
    }
  }

  /** Uma palhetada única (prévia ao tocar no acorde). */
  strumOnce(chord) {
    if (!this.ctx) return;
    this._strum(chord, this.now + 0.01, { vel: 0.85, spread: 0.018, bus: 'normal' });
  }

  /** Para tudo: abafa as cordas e cancela o que já estava agendado. */
  stop(tc = 0.06) {
    if (!this.ctx) return;
    const t = this.now;
    this.live.forEach((v) => {
      if (v.start > t) { try { v.src.stop(); } catch { /* ignore */ } }
      else this._dampVoice(v, t, tc);
    });
  }
}
