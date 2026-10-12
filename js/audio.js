// Sound effects and background music, synthesised with the Web Audio API so
// the game ships without any audio files.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;

const settings = { sound: true, music: true };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  return ctx;
}

// Browsers only allow audio after a user gesture.
export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function setSound(on) {
  settings.sound = on;
}

export function setMusic(on) {
  settings.music = on;
  if (!on) stopMusic();
}

function noiseBuffer() {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
let noise = null;

function tone(type, freq, start, dur, vol, bus, endFreq) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(bus);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function burst(start, dur, vol, bus, freq = 1200, q = 0.7) {
  noise ||= noiseBuffer();
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(start, Math.random() * 0.5);
  s.stop(start + dur + 0.05);
}

const sfx = {
  crash() {
    const t = ctx.currentTime;
    burst(t, 0.35, 0.9, sfxBus, 900, 0.6);
    tone('square', 220, t, 0.25, 0.25, sfxBus, 55);
  },
  good() {
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, t + i * 0.045, 0.14, 0.35, sfxBus));
  },
  bad() {
    const t = ctx.currentTime;
    [784, 622, 494, 392].forEach((f, i) => tone('sawtooth', f, t + i * 0.05, 0.14, 0.18, sfxBus));
  },
  global() {
    const t = ctx.currentTime;
    tone('sine', 300, t, 0.4, 0.4, sfxBus, 1200);
    tone('triangle', 450, t + 0.05, 0.35, 0.25, sfxBus, 1800);
  },
  win() {
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone('square', f, t + i * 0.11, i === notes.length - 1 ? 0.7 : 0.16, 0.18, sfxBus));
    notes.forEach((f, i) => tone('triangle', f / 2, t + i * 0.11, 0.2, 0.25, sfxBus));
  },
  blip() {
    tone('square', 880, ctx.currentTime, 0.06, 0.12, sfxBus);
  },
};

export function play(name) {
  if (!settings.sound || !ensure() || ctx.state !== 'running') return;
  sfx[name]?.();
}

// ------------------------------------------------------------ music -------

// Three upbeat electronic loops, one picked at random each game, like the
// three tracks the original streamed.
const SONGS = [
  { bpm: 128, root: 45, chords: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]], arp: [0, 1, 2, 1, 2, 0, 1, 2] },
  { bpm: 140, root: 43, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], arp: [0, 2, 1, 2, 0, 2, 1, 2] },
  { bpm: 118, root: 47, chords: [[0, 3, 7], [3, 7, 10], [-2, 2, 5], [-4, 0, 3]], arp: [2, 1, 0, 1, 2, 1, 0, 2] },
];

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let musicTimer = null;
let song = null;
let nextTime = 0;
let stepIndex = 0;

function scheduleStep(t) {
  const bar = Math.floor(stepIndex / 16) % song.chords.length;
  const s = stepIndex % 16;
  const chord = song.chords[bar];
  const beat = 60 / song.bpm;
  const six = beat / 4;
  // Kick on the beat, hats off the beat, snare on 2 and 4.
  if (s % 4 === 0) tone('sine', 150, t, 0.18, 0.9, musicBus, 40);
  if (s % 4 === 2) burst(t, 0.05, 0.25, musicBus, 8000, 1);
  if (s === 4 || s === 12) burst(t, 0.15, 0.45, musicBus, 1800, 0.8);
  // Bass on eighths.
  if (s % 2 === 0) tone('sawtooth', midi(song.root - 12 + chord[0]), t, six * 1.6, 0.35, musicBus);
  // Arpeggio.
  const n = chord[song.arp[s % 8]];
  tone('square', midi(song.root + 12 + n + (s >= 8 ? 12 : 0)), t, six * 0.9, 0.12, musicBus);
  // Pad at the start of each bar.
  if (s === 0) {
    for (const c of chord) tone('triangle', midi(song.root + 12 + c), t, beat * 3.8, 0.08, musicBus);
  }
}

export function startMusic() {
  if (!settings.music || !ensure() || musicTimer) return;
  song = SONGS[Math.floor(Math.random() * SONGS.length)];
  stepIndex = 0;
  nextTime = ctx.currentTime + 0.1;
  const six = 60 / song.bpm / 4;
  musicTimer = setInterval(() => {
    if (ctx.state !== 'running') return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.2) {
      scheduleStep(nextTime);
      nextTime += six;
      stepIndex++;
    }
  }, 50);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
