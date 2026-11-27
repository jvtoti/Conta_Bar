// Símbolos de cada passo da batida:
//  D = baixo pra baixo (forte)   d = pra baixo (fraco)
//  U = pra cima (forte)          u = pra cima (fraco)
//  X = abafado (chuck)           S = "skank" curto (reggae)
//  B = baixo (nota grave)        b = baixo alternado
//  . = pausa
// sub = passos por tempo (2 = colcheias, 4 = semicolcheias)

export const SYMBOLS = {
  '.': { label: '·', name: 'Pausa' },
  D: { label: '↓', name: 'Baixo forte' },
  d: { label: '↓', name: 'Baixo fraco', soft: true },
  U: { label: '↑', name: 'Cima forte' },
  u: { label: '↑', name: 'Cima fraco', soft: true },
  X: { label: '✕', name: 'Abafado' },
  S: { label: '▾', name: 'Curto (reggae)' },
  B: { label: '●', name: 'Nota grave' },
  b: { label: '○', name: 'Grave alternado' },
};

// Ordem do ciclo ao tocar num passo no editor
export const EDIT_CYCLE = ['.', 'D', 'd', 'U', 'u', 'X', 'S', 'B', 'b'];

export const PRESETS = {
  pop: { name: 'Pop', emoji: '🎤', sub: 2, steps: 'D.DU.UDU', swing: 0, bpm: 95 },
  rock: { name: 'Rock', emoji: '🤘', sub: 2, steps: 'DdXdDdXU', swing: 0, bpm: 120 },
  sertanejo: { name: 'Sertanejo', emoji: '🤠', sub: 2, steps: 'B.DUb.DU', swing: 0, bpm: 100 },
  reggae: { name: 'Reggae', emoji: '🌴', sub: 4, steps: '....S.u.....S.u.', swing: 0.12, bpm: 80 },
};

// Modelos extras para usar como ponto de partida na batida personalizada
export const TEMPLATES = {
  euquero: { name: 'Eu quero tocar (↓ ↓↑ ↑↓)', sub: 2, steps: 'D.DU.UD.', swing: 0, bpm: 90 },
  seisgolpes: { name: '6 golpes seguidos (↓↓↑↑↓↓)', sub: 2, steps: 'DDUUDD', swing: 0, bpm: 80 },
  seiscomespaco: { name: '6 golpes com respiro (↓ ↓↑ ↑↓↓)', sub: 2, steps: 'D.DU.UDD', swing: 0, bpm: 90 },
  balada: { name: 'Balada (↓ ↓ ↓↑)', sub: 2, steps: 'D.D.D.DU', swing: 0, bpm: 75 },
  valsa: { name: 'Valsa 3/4 (● ↓ ↓)', sub: 2, steps: 'B.D.D.', swing: 0, bpm: 110 },
  simples: { name: 'Só pra baixo (↓ ↓ ↓ ↓)', sub: 2, steps: 'D.D.D.D.', swing: 0, bpm: 90 },
};

export const MAX_STEPS = 16;

export const DEFAULT_CUSTOM = { name: 'Personalizada', emoji: '✨', sub: 2, steps: 'D.DU.UD.', swing: 0, bpm: 90 };
