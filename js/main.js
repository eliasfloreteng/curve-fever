// UI and game flow: the player menu, key binding, rounds, scores and input.
import { PLAYERS, POWERUPS, HINTS, TPS, ROUND_DELAY } from './config.js';
import { Game, Curve, LEFT, RIGHT, STRAIGHT } from './engine.js';
import { Renderer } from './render.js';
import * as audio from './audio.js';
import { iconSvg } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const STAGE_W = 904;
const STAGE_H = 768;
const STORE = 'curvefever.v1';
const RESERVED = new Set(['Space', 'Escape']);

// ------------------------------------------------------------ settings ---

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

const saved = loadSettings();

const seats = PLAYERS.map((def, i) => {
  const s = saved.players?.[i] || {};
  const seat = {
    def,
    left: s.left || null,
    right: s.right || null,
    bot: !!s.bot,
    active: !!s.active,
    temp: false, // computer added by the single-player dialog
  };
  if (seat.active && !seat.bot && !(seat.left && seat.right)) seat.active = false;
  return seat;
});

const settings = {
  mode: saved.mode === 'classic' ? 'classic' : 'arcade',
  music: saved.music !== false,
  sound: saved.sound !== false,
};

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      players: seats.map((s) => ({
        left: s.left, right: s.right, bot: s.bot && !s.temp, active: s.active && !s.temp,
      })),
      ...settings,
    }));
  } catch {
    // Private mode or storage disabled: settings just aren't remembered.
  }
}

audio.setMusic(settings.music);
audio.setSound(settings.sound);

// ----------------------------------------------------------- key names ---

const KEY_NAMES = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
  AltLeft: 'L ALT', AltRight: 'R ALT', MetaLeft: 'L CMD', MetaRight: 'R CMD',
  Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Backspace: 'BACKSPACE', Tab: 'TAB',
  CapsLock: 'CAPS LOCK', Delete: 'DELETE', Insert: 'INSERT', Home: 'HOME', End: 'END',
  PageUp: 'PAGE UP', PageDown: 'PAGE DOWN', ContextMenu: 'MENU',
};

function keyLabel(e) {
  if (KEY_NAMES[e.code]) return KEY_NAMES[e.code];
  if (e.code.startsWith('Numpad')) {
    const rest = e.code.slice(6);
    const ops = { Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: '.' };
    return `NUM ${ops[rest] || rest}`;
  }
  if (/^F\d+$/.test(e.code)) return e.code;
  if (e.key && e.key.length === 1 && e.key !== ' ') return e.key.toUpperCase();
  return e.code.replace(/^(Key|Digit)/, '').toUpperCase();
}

// -------------------------------------------------------------- screens ---

let screen = 'menu';

function show(name) {
  screen = name;
  $('#menu').hidden = name !== 'menu';
  $('#game').hidden = name !== 'game';
  $('#help').hidden = name !== 'help';
  if (name === 'menu') startDemo();
  else stopDemo();
}

function fit() {
  const app = $('#app');
  const scale = Math.min(app.clientWidth / STAGE_W, app.clientHeight / STAGE_H);
  app.style.setProperty('--scale', scale);
  current?.renderer.resize(760 * scale);
  demo?.renderer.resize(300 * scale);
}

// ----------------------------------------------------------------- menu ---

let editing = null; // { seat, keys: ['left', 'right'] }
let menuNote = null;

function buildRows() {
  const rows = $('#player-rows');
  rows.innerHTML = '';
  seats.forEach((seat, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'listitem');
    row.style.setProperty('--c', seat.def.color);
    row.innerHTML = `
      <span class="num" title="Press ${i + 1} to add or remove ${seat.def.name}">${i + 1}</span>
      <span class="name">${seat.def.name}</span>
      <span class="key" data-key="left"></span>
      <span class="key" data-key="right"></span>
      <button class="cpu" type="button" title="Let the computer play ${seat.def.name}">CPU</button>`;
    row.querySelector('.num').addEventListener('click', () => toggleSeat(seat));
    row.querySelector('.name').addEventListener('click', () => toggleSeat(seat));
    for (const el of row.querySelectorAll('.key')) {
      el.addEventListener('click', () => {
        if (seat.active && !seat.bot && !editing) {
          editing = { seat, keys: [el.dataset.key], wasActive: true };
          renderMenu();
        }
      });
    }
    row.querySelector('.cpu').addEventListener('click', () => toggleBot(seat));
    seat.row = row;
    rows.append(row);
  });
}

function toggleSeat(seat) {
  if (editing) return;
  audio.unlock();
  if (seat.active) {
    seat.active = false;
    seat.bot = false;
    audio.play('blip');
  } else {
    editing = { seat, keys: ['left', 'right'], wasActive: false };
  }
  persist();
  renderMenu();
}

function toggleBot(seat) {
  if (editing) return;
  audio.unlock();
  if (seat.active && seat.bot) {
    seat.active = false;
    seat.bot = false;
  } else {
    seat.active = true;
    seat.bot = true;
  }
  audio.play('blip');
  persist();
  renderMenu();
}

function assignKey(e) {
  const { seat, keys } = editing;
  const which = keys[0];
  const other = which === 'left' ? 'right' : 'left';
  const taken = seats.some((s) => s !== seat && s.active && !s.bot
    && (s.left?.code === e.code || s.right?.code === e.code));
  const sameSeat = !keys.includes(other) && seat[other]?.code === e.code;
  if (taken || sameSeat) {
    menuNote = `${keyLabel(e)} is already taken – pick another key`;
    audio.play('bad');
    renderMenu();
    return;
  }
  seat[which] = { code: e.code, label: keyLabel(e) };
  keys.shift();
  menuNote = null;
  if (!keys.length) {
    seat.active = true;
    seat.bot = false;
    editing = null;
    audio.play('good');
    persist();
  }
  renderMenu();
}

function renderMenu() {
  for (const seat of seats) {
    const { row } = seat;
    const isEditing = editing?.seat === seat;
    row.classList.toggle('active', seat.active);
    row.classList.toggle('editing', isEditing);
    row.classList.toggle('bot', seat.active && seat.bot);
    for (const el of row.querySelectorAll('.key')) {
      const which = el.dataset.key;
      const prompting = isEditing && editing.keys[0] === which;
      el.classList.toggle('prompt', prompting);
      if (prompting) el.textContent = `Press desired ${which} key`;
      else if (seat.active && seat.bot) el.textContent = which === 'left' ? 'computer' : '';
      else if (isEditing && editing.keys.includes(which)) el.textContent = '';
      else el.textContent = seat[which]?.label || '';
    }
    row.querySelector('.cpu').classList.toggle('on', seat.active && seat.bot);
  }
  const count = seats.filter((s) => s.active).length;
  const playBtn = $('#play-btn');
  playBtn.classList.toggle('ready', count >= 1 && !editing);
  $('#play-line1').textContent = menuNote
    || (editing ? `Press the keys for ${editing.seat.def.name} (Esc to cancel)`
      : count >= 2 ? `${count} players ready`
        : 'Select the players and assign keys');
  $('#arcade-btn').setAttribute('aria-checked', settings.mode === 'arcade');
  $('#classic-btn').setAttribute('aria-checked', settings.mode === 'classic');
  for (const el of document.querySelectorAll('[data-toggle]')) {
    el.querySelector('b').textContent = settings[el.dataset.toggle] ? 'on' : 'off';
  }
}

function setMode(mode) {
  settings.mode = mode;
  persist();
  renderMenu();
}

function toggleSetting(name) {
  audio.unlock();
  settings[name] = !settings[name];
  if (name === 'music') {
    audio.setMusic(settings.music);
    if (settings.music) audio.startMusic();
  } else {
    audio.setSound(settings.sound);
  }
  persist();
  renderMenu();
}

function tryPlay() {
  if (editing) return;
  const active = seats.filter((s) => s.active);
  if (active.length >= 2) {
    startGame();
  } else if (active.length === 1 && !active[0].bot) {
    $('#attention').hidden = false;
  } else {
    menuNote = 'Add at least one player first';
    renderMenu();
    setTimeout(() => {
      menuNote = null;
      renderMenu();
    }, 2000);
  }
}

function attention(yes) {
  $('#attention').hidden = true;
  if (!yes) return;
  // Like the original: every free seat is taken by the computer.
  for (const s of seats) {
    if (!s.active) {
      s.active = true;
      s.bot = true;
      s.temp = true;
    }
  }
  startGame();
}

function releaseTempBots() {
  for (const s of seats) {
    if (s.temp) {
      s.active = false;
      s.bot = false;
      s.temp = false;
    }
  }
}

let hintIndex = Math.floor(Math.random() * HINTS.length);
function rotateHint() {
  $('#hint').textContent = HINTS[hintIndex % HINTS.length];
  hintIndex++;
}

// ----------------------------------------------------------------- demo ---

let demo = null;

function newDemoGame() {
  const picks = [...PLAYERS].sort(() => Math.random() - 0.5).slice(0, 4);
  const players = picks.map((d) => Object.assign(new Curve(d), { bot: true }));
  const game = new Game({ mode: 'arcade', players });
  game.setupRound();
  game.start();
  return game;
}

function startDemo() {
  if (demo) return;
  const canvas = $('#demo');
  const trails = document.createElement('canvas');
  const top = document.createElement('canvas');
  const game = newDemoGame();
  demo = {
    game,
    renderer: new Renderer(trails, top, game, { labels: false }),
    canvas,
    trails,
    top,
    acc: 0,
    wait: 0,
  };
  fit();
}

function stopDemo() {
  demo = null;
}

function tickDemo(dt, now) {
  const d = demo;
  if (d.game.state === 'play') {
    d.acc += dt;
    while (d.acc >= 1 / TPS) {
      d.game.update();
      d.acc -= 1 / TPS;
    }
  } else {
    d.wait += dt;
    if (d.wait > 1.2) {
      d.wait = 0;
      if (d.game.state === 'gameEnd' || d.game.goal > 6) {
        d.game = newDemoGame();
        d.renderer = new Renderer(d.trails, d.top, d.game, { labels: false });
        d.renderer.resize(300 * parseFloat($('#app').style.getPropertyValue('--scale') || 1));
      } else {
        d.game.setupRound();
        d.game.start();
      }
    }
  }
  d.renderer.draw(now);
  const ratio = d.trails.width;
  if (d.canvas.width !== ratio) {
    d.canvas.width = ratio;
    d.canvas.height = ratio;
  }
  const ctx = d.canvas.getContext('2d');
  ctx.clearRect(0, 0, d.canvas.width, d.canvas.height);
  ctx.drawImage(d.trails, 0, 0, d.canvas.width, d.canvas.height);
  ctx.drawImage(d.top, 0, 0, d.canvas.width, d.canvas.height);
}

// ----------------------------------------------------------------- game ---

let current = null; // { game, renderer, auto, timer, touch }
let acc = 0;

function startGame({ touch = false } = {}) {
  audio.unlock();
  const active = seats.filter((s) => s.active);
  const players = active.map((s) => {
    const c = new Curve(s.def);
    c.bot = s.bot;
    c.keys = s.bot ? null : { left: s.left?.code, right: s.right?.code };
    return c;
  });
  const humans = players.filter((p) => !p.bot).length;
  const game = new Game({ mode: settings.mode, players });
  game.vsComputer = humans === 1 && humans < players.length;
  const renderer = new Renderer($('#trails'), $('#top'), game);
  current = {
    game,
    renderer,
    auto: humans <= 1,
    timer: null,
    touch,
    held: new Map(),
  };

  game.on('death', () => {
    audio.play('crash');
    renderScores();
  });
  game.on('powerup', ({ def }) => {
    audio.play(def.target === 'self' ? 'good' : def.target === 'others' ? 'bad' : 'global');
  });
  game.on('goal', () => {
    const el = $('#goal');
    el.textContent = game.goal;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  });
  game.on('roundEnd', () => {
    updateSpaceMsg();
    if (current.auto) later(() => nextRound());
  });
  game.on('gameEnd', (winner) => {
    audio.play('win');
    const win = $('#win-screen');
    win.style.setProperty('--c', winner.color);
    $('#win-text').textContent = `${winner.name} wins!`;
    win.hidden = false;
    updateSpaceMsg();
  });
  game.on('pause', () => {
    $('#pause-screen').hidden = false;
    updateSpaceMsg();
  });
  game.on('resume', () => {
    $('#pause-screen').hidden = true;
    updateSpaceMsg();
  });

  $('#goal').textContent = game.goal;
  $('#win-screen').hidden = true;
  $('#pause-screen').hidden = true;
  $('#touch-left').hidden = !touch;
  $('#touch-right').hidden = !touch;
  buildScores();
  show('game');
  fit();
  renderer.clearTrails();
  audio.stopMusic();
  audio.startMusic();
  nextRound();
}

function later(fn) {
  clearTimeout(current.timer);
  current.timer = setTimeout(fn, ROUND_DELAY * 1000);
}

function nextRound() {
  const { game } = current;
  if (game.state === 'gameEnd') return;
  game.setupRound();
  for (const p of game.players) {
    if (!p.bot) p.dir = heldDir(p);
  }
  renderScores();
  updateSpaceMsg();
  if (current.auto) later(() => startRound());
}

function startRound() {
  clearTimeout(current.timer);
  current.game.start();
  acc = 0;
  updateSpaceMsg();
}

function leaveGame() {
  if (!current) return;
  clearTimeout(current.timer);
  current = null;
  releaseTempBots();
  renderMenu();
  show('menu');
  audio.stopMusic();
  audio.startMusic();
}

function spaceAction() {
  const { game } = current;
  switch (game.state) {
    case 'setup': startRound(); break;
    case 'play': game.pause(); break;
    case 'pause': game.resume(); acc = 0; break;
    case 'roundEnd': nextRound(); break;
    case 'gameEnd': leaveGame(); break;
    default:
  }
}

function updateSpaceMsg() {
  const el = $('#space-msg');
  const { game, auto, touch } = current;
  const key = touch ? 'Tap' : 'Space';
  const text = {
    setup: auto ? 'Get ready…' : `${key} to start`,
    play: '',
    pause: `${key} to continue`,
    roundEnd: auto ? '' : `${key} to continue`,
    gameEnd: `${key} for the menu`,
  }[game.state];
  el.textContent = text;
  el.classList.toggle('blink', !!text && game.state !== 'play');
}

function buildScores() {
  const list = $('#scores');
  list.innerHTML = '';
  for (const p of current.game.players) {
    const li = document.createElement('li');
    li.style.setProperty('--c', p.color);
    li.innerHTML = `<span class="pname">${p.name}${p.bot ? '<small>CPU</small>' : ''}</span><span class="pscore">0</span>`;
    p.scoreEl = li;
    list.append(li);
  }
  renderScores();
}

function renderScores() {
  const sorted = [...current.game.players].sort((a, b) => b.score - a.score || a.id - b.id);
  sorted.forEach((p, i) => {
    p.scoreEl.style.transform = `translateY(${i * 52}px)`;
    p.scoreEl.querySelector('.pscore').textContent = p.score;
    p.scoreEl.classList.toggle('dead', !p.alive);
  });
}

// What a player's held keys currently ask for.
function heldDir(p) {
  const held = current.held;
  const l = held.get(p.keys.left);
  const r = held.get(p.keys.right);
  if (l && r) return l > r ? LEFT : RIGHT;
  if (l) return LEFT;
  if (r) return RIGHT;
  return STRAIGHT;
}

let pressOrder = 0;
function gameKey(e, down) {
  const { game, held } = current;
  if (down) held.set(e.code, ++pressOrder);
  else held.delete(e.code);
  let used = false;
  for (const p of game.players) {
    if (p.bot || !p.keys) continue;
    if (e.code === p.keys.left || e.code === p.keys.right) {
      p.dir = heldDir(p);
      used = true;
    }
  }
  return used;
}

function touchControls() {
  const zones = [['#touch-left', LEFT], ['#touch-right', RIGHT]];
  for (const [sel, dir] of zones) {
    const el = $(sel);
    const human = () => current?.game.players.find((p) => !p.bot);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!current) return;
      const { state } = current.game;
      if (state !== 'play') {
        spaceAction();
        return;
      }
      const p = human();
      if (p) p.dir = dir;
    });
    const release = () => {
      const p = human();
      if (p && p.dir === dir) p.dir = STRAIGHT;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }
}

function touchPlay() {
  // Fred against three computer players, steered by tapping the field.
  releaseTempBots();
  for (const s of seats) {
    if (!s.active) {
      s.temp = true;
      s.active = seats.indexOf(s) < 4;
      s.bot = true;
    }
  }
  const fred = seats[0];
  const fredState = { active: fred.active, bot: fred.bot };
  fred.active = true;
  fred.bot = false;
  startGame({ touch: true });
  fred.active = fredState.active;
  fred.bot = fredState.bot;
}

// ---------------------------------------------------------------- input ---

function toggleFullscreen() {
  const el = $('#app');
  if (document.fullscreenElement) document.exitFullscreen?.();
  else el.requestFullscreen?.().catch(() => {});
}

function keyUsedByPlayers(code) {
  return seats.some((s) => s.active && !s.bot && (s.left?.code === code || s.right?.code === code));
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.metaKey || e.ctrlKey) return;

  if (screen === 'game' && current) {
    if (e.code === 'Space' || e.code === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Space') spaceAction();
      else leaveGame();
      return;
    }
    if (gameKey(e, true)) {
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
    return;
  }

  if (screen === 'help') {
    if (e.code === 'Escape' || e.code === 'Space') {
      e.preventDefault();
      show('menu');
    }
    return;
  }

  // Menu.
  if (!$('#attention').hidden) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      attention(true);
    } else if (e.code === 'Escape') {
      attention(false);
    }
    return;
  }
  if (editing) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (!editing.wasActive) {
        editing.seat.active = false;
      }
      editing = null;
      menuNote = null;
      renderMenu();
    } else if (!RESERVED.has(e.code)) {
      assignKey(e);
    }
    return;
  }
  if (e.repeat) return;
  const digit = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (digit && !keyUsedByPlayers(e.code)) {
    toggleSeat(seats[Number(digit[2]) - 1]);
  } else if (e.code === 'Space') {
    e.preventDefault();
    tryPlay();
  } else if (e.code === 'KeyF') {
    toggleFullscreen();
  } else if (e.code === 'KeyH' || e.code === 'F1') {
    e.preventDefault();
    show('help');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (screen === 'game' && current && gameKey(e, false)) e.preventDefault();
});

// Pause when the window loses focus, like the original.
window.addEventListener('blur', () => {
  if (current?.game.state === 'play' && !current.auto) current.game.pause();
  if (current) current.held.clear();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && current?.game.state === 'play') current.game.pause();
});

// Buttons shouldn't keep focus, or Space would click them again.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && e.detail > 0) btn.blur();
});

// ----------------------------------------------------------------- loop ---

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (screen === 'game' && current) {
    const { game, renderer } = current;
    if (game.state === 'play') {
      acc += dt;
      while (acc >= 1 / TPS && game.state === 'play') {
        game.update();
        acc -= 1 / TPS;
      }
    } else {
      acc = 0;
    }
    $('#field-wrap').classList.toggle('open', game.openBorders > 0);
    renderer.draw(now);
  } else if (screen === 'menu' && demo) {
    tickDemo(dt, now);
  }
  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------- init ---

function buildLegends() {
  const legend = $('#pu-legend');
  POWERUPS.forEach((def, i) => {
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(def))}`;
    const item = document.createElement('div');
    item.className = 'pu-item';
    item.innerHTML = `<img src="${src}" alt=""><span>${def.label}</span>`;
    legend.append(item);
    const li = document.querySelector(`#pu-list [data-pu="${i}"]`);
    if (li) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      li.prepend(img);
    }
  });
}

function init() {
  buildRows();
  buildLegends();
  renderMenu();
  rotateHint();
  setInterval(rotateHint, 7000);
  touchControls();

  $('#play-btn').addEventListener('click', () => {
    audio.unlock();
    tryPlay();
  });
  $('#arcade-btn').addEventListener('click', () => setMode('arcade'));
  $('#classic-btn').addEventListener('click', () => setMode('classic'));
  for (const el of document.querySelectorAll('[data-toggle]')) {
    el.addEventListener('click', () => toggleSetting(el.dataset.toggle));
  }
  $('#tutorial-btn').addEventListener('click', () => show('help'));
  $('#help-back').addEventListener('click', () => show('menu'));
  $('#attention-yes').addEventListener('click', () => attention(true));
  $('#attention-no').addEventListener('click', () => attention(false));
  $('#menu-btn').addEventListener('click', leaveGame);
  $('#touch-btn').addEventListener('click', touchPlay);
  $('#touch-btn').hidden = !matchMedia('(pointer: coarse)').matches;

  // Music starts with the first interaction (browsers block autoplay).
  const kick = () => {
    audio.unlock();
    audio.startMusic();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);

  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
  show('menu');
  fit();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
