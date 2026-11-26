import { CHORDS, GROUPS } from './chords.js';
import { PRESETS, DEFAULT_CUSTOM, SYMBOLS, EDIT_CYCLE } from './patterns.js';
import { GuitarEngine } from './audio.js';

const $ = (s) => document.querySelector(s);
const engine = new GuitarEngine();

// ---------- Estado persistente ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('violao:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('violao:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const state = {
  chord: store.get('chord', 'G'),
  tab: store.get('tab', 'favoritos'),
  favorites: store.get('favorites', ['G', 'D', 'Em', 'C', 'Am', 'A', 'E', 'F']),
  bpm: store.get('bpm', 100),
  latch: store.get('latch', false),
  autoBpm: store.get('autoBpm', true),
  volume: store.get('volume', 0.9),
  custom: { ...DEFAULT_CUSTOM, ...store.get('custom', {}) },
  shown: 'pop', // batida mostrada na faixa de passos
};

const rhythmDef = (key) => (key === 'custom' ? state.custom : PRESETS[key]);

// ---------- Sequenciador ----------
const LOOKAHEAD = 0.12;
let seq = null; // { key, def, step, next, owner }
let timer = null;
let wakeLock = null;

function stepDuration(def) { return 60 / state.bpm / def.sub; }

function schedule() {
  if (!seq) return;
  const horizon = engine.now + LOOKAHEAD;
  while (seq.next < horizon) {
    const { def } = seq;
    const i = seq.step % def.steps.length;
    const dur = stepDuration(def);
    const swing = i % 2 === 1 ? (def.swing || 0) * dur : 0;
    const t = seq.next + swing;
    const sym = def.steps[i];
    engine.playStep(sym, CHORDS[state.chord], t);
    const delay = Math.max(0, (t - engine.now) * 1000);
    const token = seq;
    setTimeout(() => { if (seq === token) highlightStep(i); }, delay);
    seq.step++;
    seq.next += dur;
  }
}

function startRhythm(key, owner) {
  engine.unlock(); // cria/retoma o áudio de forma síncrona (o resume termina sozinho)
  const def = rhythmDef(key);
  if (state.autoBpm && def.bpm) setBpm(def.bpm, false);
  const wasPlaying = !!seq;
  // Troca de batida mantendo o tempo se já estava tocando
  const next = wasPlaying ? seq.next : engine.now + 0.03;
  seq = { key, def, step: 0, next, owner };
  state.shown = key;
  renderSteps();
  updateRhythmButtons();
  schedule();
  if (!timer) timer = setInterval(schedule, 25);
  requestWakeLock();
}

function stopRhythm() {
  if (!seq) return;
  seq = null;
  clearInterval(timer); timer = null;
  engine.stop(0.08);
  highlightStep(-1);
  updateRhythmButtons();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* ignore */ }
}

// ---------- BPM / controles ----------
function setBpm(v, save = true) {
  state.bpm = Math.max(40, Math.min(220, Math.round(v)));
  $('#bpm').textContent = state.bpm;
  if (save) store.set('bpm', state.bpm);
}

function holdRepeat(btn, fn) {
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    t1 = setTimeout(() => { t2 = setInterval(fn, 70); }, 400);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
}

function setupControls() {
  setBpm(state.bpm, false);
  holdRepeat($('#bpmDown'), () => { setBpm(state.bpm - 1); setAutoBpm(false); });
  holdRepeat($('#bpmUp'), () => { setBpm(state.bpm + 1); setAutoBpm(false); });

  const latch = $('#latch');
  const renderLatch = () => latch.setAttribute('aria-pressed', String(state.latch));
  renderLatch();
  latch.addEventListener('click', () => {
    state.latch = !state.latch; store.set('latch', state.latch); renderLatch();
    if (!state.latch) stopRhythm();
    toast(state.latch ? 'Travar ligado: toque na batida para tocar/parar' : 'Segure a batida para tocar');
  });

  renderAutoBpm();
  $('#autoBpm').addEventListener('click', () => {
    setAutoBpm(!state.autoBpm);
    if (state.autoBpm && seq?.def.bpm) setBpm(seq.def.bpm, false);
  });

  const vol = $('#volume');
  vol.value = state.volume;
  engine.setVolume(state.volume);
  vol.addEventListener('input', () => { state.volume = +vol.value; engine.setVolume(state.volume); store.set('volume', state.volume); });
}

function setAutoBpm(v) { state.autoBpm = v; store.set('autoBpm', v); renderAutoBpm(); }
function renderAutoBpm() { $('#autoBpm').setAttribute('aria-pressed', String(state.autoBpm)); }

// ---------- Acordes ----------
function renderTabs() {
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
    b.onclick = () => { state.tab = b.dataset.tab; store.set('tab', state.tab); renderTabs(); renderChordGrid(); };
  });
}

function renderChordGrid() {
  const grid = $('#chordGrid');
  const list = state.tab === 'favoritos' ? state.favorites : GROUPS[state.tab];
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = '<p class="empty">Nenhum acorde aqui ainda.<br>Segure um acorde nas outras abas para adicionar.</p>';
    return;
  }
  list.forEach((name) => {
    const b = document.createElement('button');
    b.className = 'chord';
    b.dataset.chord = name;
    b.innerHTML = `<span>${fmt(name)}</span>${state.favorites.includes(name) ? '<i class="star">★</i>' : ''}`;
    if (name === state.chord) b.classList.add('active');
    let pressTimer;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      engine.unlock();
      selectChord(name);
      pressTimer = setTimeout(() => { pressTimer = null; toggleFavorite(name); }, 600);
    });
    const cancel = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('pointerleave', cancel);
    grid.appendChild(b);
  });
}

function fmt(name) {
  // Deixa o sustenido/bemol e a qualidade menores
  return name.replace(/^([A-G])([#b]?)(.*)$/, (_, r, acc, q) =>
    `${r}${acc ? `<sup>${acc === '#' ? '♯' : '♭'}</sup>` : ''}${q ? `<small>${q}</small>` : ''}`);
}

function selectChord(name) {
  state.chord = name;
  store.set('chord', name);
  engine.prepare(CHORDS[name]);
  document.querySelectorAll('.chord').forEach((b) => b.classList.toggle('active', b.dataset.chord === name));
  $('#chordName').innerHTML = fmt(name);
  drawDiagram(CHORDS[name]);
  vibrate(8);
}

function toggleFavorite(name) {
  const i = state.favorites.indexOf(name);
  if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(name);
  store.set('favorites', state.favorites);
  vibrate([15, 40, 15]);
  toast(i >= 0 ? `${name} removido dos ★ Meus` : `${name} adicionado aos ★ Meus`);
  renderChordGrid();
}

function drawDiagram(chord) {
  const svg = $('#diagram');
  const f = chord.frets;
  const pressed = f.filter((x) => x > 0);
  const max = Math.max(0, ...pressed);
  const base = max > 4 ? Math.min(...pressed) : 1;
  const x0 = 12, dx = 9, y0 = 16, dy = 13, frets = 5;
  let s = '';
  s += base === 1
    ? `<rect x="${x0}" y="${y0 - 3}" width="${dx * 5}" height="3" fill="currentColor"/>`
    : `<text x="${x0 - 3}" y="${y0 + dy * 0.7}" font-size="8" text-anchor="end" fill="currentColor">${base}</text>`;
  for (let i = 0; i <= frets; i++) s += `<line x1="${x0}" x2="${x0 + dx * 5}" y1="${y0 + i * dy}" y2="${y0 + i * dy}" stroke="currentColor" stroke-opacity=".45"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${x0 + i * dx}" x2="${x0 + i * dx}" y1="${y0}" y2="${y0 + frets * dy}" stroke="currentColor" stroke-opacity=".7"/>`;
  // pestana
  const minF = pressed.length ? Math.min(...pressed) : 0;
  const barre = f.map((v, i) => (v === minF ? i : -1)).filter((i) => i >= 0);
  const hasBarre = minF > 0 && barre.length >= 3 && f.slice(barre[0]).every((v) => v === -1 || v >= minF) && barre[0] <= 1;
  if (hasBarre) {
    const y = y0 + (minF - base + 0.5) * dy;
    s += `<rect x="${x0 + barre[0] * dx - 3.5}" y="${y - 3.5}" width="${(barre[barre.length - 1] - barre[0]) * dx + 7}" height="7" rx="3.5" fill="var(--accent)"/>`;
  }
  f.forEach((v, i) => {
    const x = x0 + i * dx;
    if (v < 0) s += `<text x="${x}" y="${y0 - 6}" font-size="8" text-anchor="middle" fill="currentColor" opacity=".7">×</text>`;
    else if (v === 0) s += `<circle cx="${x}" cy="${y0 - 8.5}" r="2.6" fill="none" stroke="currentColor"/>`;
    else if (!(hasBarre && v === minF)) s += `<circle cx="${x}" cy="${y0 + (v - base + 0.5) * dy}" r="3.6" fill="var(--accent)"/>`;
  });
  svg.innerHTML = s;
}

// ---------- Batidas ----------
const RHYTHM_KEYS = ['pop', 'rock', 'sertanejo', 'reggae', 'custom'];

function renderRhythms() {
  const wrap = $('#rhythms');
  wrap.innerHTML = '';
  RHYTHM_KEYS.forEach((key) => {
    const def = rhythmDef(key);
    const b = document.createElement('button');
    b.className = 'rhythm';
    b.dataset.key = key;
    b.innerHTML = `<span class="emoji">${def.emoji}</span><span class="rname">${def.name}</span>`;
    bindRhythmButton(b, key);
    if (key === 'custom') {
      const cell = document.createElement('div');
      cell.className = 'rhythm-cell custom-cell';
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.setAttribute('aria-label', 'Editar batida personalizada');
      edit.textContent = '✎';
      edit.addEventListener('click', openEditor);
      cell.append(b, edit);
      wrap.appendChild(cell);
    } else {
      wrap.appendChild(b);
    }
  });
  updateRhythmButtons();
}

function bindRhythmButton(b, key) {
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    vibrate(12);
    if (state.latch) {
      if (seq && seq.key === key) stopRhythm();
      else startRhythm(key, e.pointerId);
      return;
    }
    startRhythm(key, e.pointerId);
  });
  const release = (e) => {
    if (state.latch) return;
    if (seq && seq.key === key && seq.owner === e.pointerId) stopRhythm();
  };
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
}

function updateRhythmButtons() {
  document.querySelectorAll('.rhythm').forEach((b) => b.classList.toggle('playing', !!seq && seq.key === b.dataset.key));
}

function renderSteps() {
  const def = rhythmDef(state.shown);
  const wrap = $('#steps');
  wrap.innerHTML = '';
  wrap.style.setProperty('--n', def.steps.length);
  [...def.steps].forEach((sym, i) => {
    const d = document.createElement('div');
    const info = SYMBOLS[sym] || SYMBOLS['.'];
    d.className = `step sym-${legendClass(sym)}${info.soft ? ' soft' : ''}${i % def.sub === 0 ? ' beat' : ''}`;
    d.textContent = info.label;
    wrap.appendChild(d);
  });
  const label = document.createElement('div');
  label.className = 'steps-label';
  label.textContent = `${def.emoji} ${def.name}`;
  wrap.prepend(label);
}

function highlightStep(i) {
  const steps = document.querySelectorAll('#steps .step');
  steps.forEach((s, j) => s.classList.toggle('now', j === i));
}

// ---------- Editor da batida personalizada ----------
let draft = null;

function openEditor() {
  stopRhythm();
  draft = { ...state.custom };
  const sel = $('#copyFrom');
  sel.innerHTML = '<option value="">—</option>' + Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  sel.value = '';
  $('#customBpm').value = draft.bpm;
  $('#customSwing').value = draft.swing;
  $('#legend').innerHTML = EDIT_CYCLE.map((k) => `<span class="lg sym-${legendClass(k)}"><b>${SYMBOLS[k].label}</b> ${SYMBOLS[k].name}</span>`).join('');
  renderEditSteps();
  $('#editor').showModal();
}

function legendClass(k) { return k === '.' ? 'rest' : k === k.toLowerCase() ? 'l' + k : k; }

function renderEditSteps() {
  const wrap = $('#editSteps');
  wrap.innerHTML = '';
  wrap.style.setProperty('--n', Math.min(draft.steps.length, 8));
  [...draft.steps].forEach((sym, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `estep sym-${legendClass(sym)}${i % draft.sub === 0 ? ' beat' : ''}`;
    b.innerHTML = `<b>${SYMBOLS[sym].label}</b><small>${i % draft.sub === 0 ? i / draft.sub + 1 : draft.sub === 2 ? 'e' : ['', 'e', '&', 'a'][i % 4]}</small>`;
    b.addEventListener('click', () => {
      const next = EDIT_CYCLE[(EDIT_CYCLE.indexOf(sym) + 1) % EDIT_CYCLE.length];
      draft.steps = draft.steps.slice(0, i) + next + draft.steps.slice(i + 1);
      engine.unlock().then(() => engine.playStep(next, CHORDS[state.chord], engine.now + 0.01));
      renderEditSteps();
    });
    wrap.appendChild(b);
  });
  document.querySelectorAll('.editor-len button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.len === draft.steps.length)));
}

function setupEditor() {
  document.querySelectorAll('.editor-len button').forEach((b) => b.addEventListener('click', () => {
    const len = +b.dataset.len;
    if (len === draft.steps.length) return;
    // Converte mantendo os golpes nos mesmos tempos
    if (len === 16) draft.steps = [...draft.steps].map((c) => c + '.').join('');
    else draft.steps = [...draft.steps].filter((_, i) => i % 2 === 0).join('');
    draft.sub = len / 4;
    renderEditSteps();
  }));
  $('#copyFrom').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    if (!p) return;
    Object.assign(draft, { steps: p.steps, sub: p.sub, swing: p.swing, bpm: p.bpm });
    $('#customBpm').value = draft.bpm;
    $('#customSwing').value = draft.swing;
    renderEditSteps();
  });
  $('#customBpm').addEventListener('change', (e) => { draft.bpm = Math.max(40, Math.min(220, +e.target.value || 100)); });
  $('#customSwing').addEventListener('input', (e) => { draft.swing = +e.target.value; });
  $('#clearCustom').addEventListener('click', () => { draft.steps = '.'.repeat(draft.steps.length); renderEditSteps(); });

  const test = $('#testCustom');
  test.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { test.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    state.custom = { ...draft };
    startRhythm('custom', e.pointerId);
  });
  const end = () => stopRhythm();
  test.addEventListener('pointerup', end);
  test.addEventListener('pointercancel', end);

  $('#editor').addEventListener('close', () => {
    stopRhythm();
    state.custom = { ...draft, name: DEFAULT_CUSTOM.name, emoji: DEFAULT_CUSTOM.emoji };
    store.set('custom', { steps: state.custom.steps, sub: state.custom.sub, swing: state.custom.swing, bpm: state.custom.bpm });
    state.shown = 'custom';
    renderSteps();
    toast('Batida personalizada salva');
  });
}

// ---------- Diversos ----------
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function init() {
  setupControls();
  renderTabs();
  renderChordGrid();
  selectChord(state.chord in CHORDS ? state.chord : 'G');
  renderRhythms();
  renderSteps();
  setupEditor();

  $('#current').addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    await engine.unlock();
    engine.strumOnce(CHORDS[state.chord]);
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRhythm();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
