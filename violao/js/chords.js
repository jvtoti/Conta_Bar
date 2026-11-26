// Afinação padrão (MIDI), da 6ª corda (Mi grave) para a 1ª (Mi agudo)
export const TUNING = [40, 45, 50, 55, 59, 64];

// Formato: 6 caracteres, da 6ª para a 1ª corda. "x" = corda não tocada.
const RAW = {
  maiores: [
    ['C', 'x32010'], ['C#', 'x46664'], ['D', 'xx0232'], ['Eb', 'x68886'],
    ['E', '022100'], ['F', '133211'], ['F#', '244322'], ['G', '320003'],
    ['Ab', '466544'], ['A', 'x02220'], ['Bb', 'x13331'], ['B', 'x24442'],
  ],
  menores: [
    ['Cm', 'x35543'], ['C#m', 'x46654'], ['Dm', 'xx0231'], ['Ebm', 'x68876'],
    ['Em', '022000'], ['Fm', '133111'], ['F#m', '244222'], ['Gm', '355333'],
    ['G#m', '466444'], ['Am', 'x02210'], ['Bbm', 'x13321'], ['Bm', 'x24432'],
  ],
  setimas: [
    ['C7', 'x32310'], ['D7', 'xx0212'], ['E7', '020100'], ['F7', '131211'],
    ['G7', '320001'], ['A7', 'x02020'], ['B7', 'x21202'], ['Am7', 'x02010'],
    ['Em7', '022030'], ['Dm7', 'xx0211'], ['Bm7', 'x24232'], ['F#m7', '242222'],
  ],
};

const parse = (s) => [...s].map((c) => (c === 'x' ? -1 : parseInt(c, 10)));

export const GROUPS = Object.fromEntries(
  Object.entries(RAW).map(([k, list]) => [k, list.map(([name]) => name)])
);

export const CHORDS = Object.fromEntries(
  Object.values(RAW).flat().map(([name, shape]) => [name, { name, shape, frets: parse(shape) }])
);

/** Notas MIDI de cada corda (null = corda não tocada) */
export function chordNotes(chord) {
  return chord.frets.map((f, i) => (f < 0 ? null : TUNING[i] + f));
}
