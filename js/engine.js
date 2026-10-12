// Game simulation: curves, collision grid, powerups and the computer player.
// Rules and numbers follow the original Curve Fever 1 closely.
import {
  FIELD_W, FIELD_H, TPS, ORIGINAL_TPS, CURVE, POWERUPS, POWERUP_RADIUS,
  POINTS_PER_OPPONENT,
} from './config.js';

const RES = 2; // collision cells per pixel
const SECTORS = 16; // the AI looks at a 16x16 density map of the field
const AI_EVERY = TPS / ORIGINAL_TPS; // bots decide at the original 25 Hz

export const LEFT = -1;
export const STRAIGHT = 0;
export const RIGHT = 1;

// ---------------------------------------------------------------- grid ---

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.gw = w * RES;
    this.gh = h * RES;
    this.owner = new Uint8Array(this.gw * this.gh);
    this.tick = new Int32Array(this.gw * this.gh);
    this.density = new Float32Array(SECTORS * SECTORS);
  }

  clear() {
    this.owner.fill(0);
    this.density.fill(0);
  }

  // Visit every cell whose centre lies within r of the segment a-b.
  // fn(index, cx, cy) returns true to stop early. Returns 'out' if a cell
  // fell outside the field while wrap is off, 'hit' if fn stopped, else null.
  sweep(ax, ay, bx, by, r, wrap, fn) {
    const minX = Math.floor((Math.min(ax, bx) - r) * RES);
    const maxX = Math.ceil((Math.max(ax, bx) + r) * RES);
    const minY = Math.floor((Math.min(ay, by) - r) * RES);
    const maxY = Math.ceil((Math.max(ay, by) + r) * RES);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const r2 = r * r;
    for (let gx = minX; gx <= maxX; gx++) {
      const px = (gx + 0.5) / RES;
      for (let gy = minY; gy <= maxY; gy++) {
        const py = (gy + 0.5) / RES;
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * dx - px;
        const ey = ay + t * dy - py;
        if (ex * ex + ey * ey > r2) continue;
        let cx = gx;
        let cy = gy;
        if (cx < 0 || cy < 0 || cx >= this.gw || cy >= this.gh) {
          if (!wrap) return 'out';
          cx = ((cx % this.gw) + this.gw) % this.gw;
          cy = ((cy % this.gh) + this.gh) % this.gh;
        }
        if (fn(cy * this.gw + cx, cx, cy)) return 'hit';
      }
    }
    return null;
  }
}

// -------------------------------------------------------------- player ---

export class Curve {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.color = def.color;
    this.bot = false;
    this.score = 0;
    this.reset();
  }

  reset() {
    this.alive = true;
    this.speed = CURVE.speed;
    this.radius = CURVE.turnRadius;
    this.width = CURVE.width;
    this.holeLength = CURVE.holeLength;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.dir = STRAIGHT; // what the controls ask for
    this.tick = 0;
    this.sinceHole = 0;
    this.holeLeft = 0;
    this.hole = false;
    this.fly = 0;
    this.tunnel = 0;
    this.square = 0;
    this.reversed = 0;
    this.lastSquareDir = STRAIGHT;
    this.lastSquareTurn = null;
    this.trail = []; // points for the renderer: {x, y, pen, w}
  }

  get step() {
    return this.speed / TPS;
  }

  // Direction actually steered, after reversed controls.
  get steer() {
    return this.reversed > 0 && !this.bot ? -this.dir : this.dir;
  }
}

// --------------------------------------------------------------- game ----

export class Game {
  constructor({ mode = 'arcade', players, rng = Math.random, w = FIELD_W, h = FIELD_H }) {
    this.mode = mode;
    this.w = w;
    this.h = h;
    this.rng = rng;
    this.players = players;
    this.grid = new Grid(w, h);
    this.listeners = {};
    this.goal = Math.max(1, (players.length - 1) * POINTS_PER_OPPONENT);
    this.raisedGoal = false;
    this.gameOver = false;
    this.winner = null;
    this.state = 'setup'; // setup | play | pause | roundEnd | gameEnd
    this.vsComputer = false;
    this.powerups = [];
    this.effects = [];
    this.openBorders = 0;
    for (const p of players) p.score = 0;
  }

  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners[type] || []) fn(data);
  }

  get alive() {
    return this.players.filter((p) => p.alive);
  }

  // -- rounds --

  setupRound() {
    this.grid.clear();
    this.powerups = [];
    this.effects = [];
    this.openBorders = 0;
    this.spawnBoost = 1;
    this.boosts = 0;
    this.state = 'setup';
    this.emit('clear');
    for (const p of this.players) {
      p.reset();
      const r = p.radius;
      p.x = 2 * r + this.rng() * (this.w - 4 * r);
      p.y = 2 * r + this.rng() * (this.h - 4 * r);
      p.angle = this.rng() * 2 * Math.PI;
      p.trail.push({ x: p.x, y: p.y, pen: false, w: p.width });
    }
    // Draw a short lead-in so everyone can see where they are heading.
    for (const p of this.players) {
      const steps = Math.floor(CURVE.leadIn / p.step);
      for (let i = 0; i < steps; i++) this.movePlayer(p);
    }
  }

  start() {
    if (this.state === 'setup') this.state = 'play';
  }

  pause() {
    if (this.state === 'play') {
      this.state = 'pause';
      this.emit('pause');
    }
  }

  resume() {
    if (this.state === 'pause') {
      this.state = 'play';
      this.emit('resume');
    }
  }

  // -- simulation --

  update() {
    if (this.state !== 'play') return;
    for (const p of this.players) {
      if (!p.alive || this.state !== 'play') continue;
      if (p.bot && p.tick % AI_EVERY === 0) p.dir = this.think(p);
      this.movePlayer(p);
    }
    if (this.mode === 'arcade' && this.state === 'play') {
      this.spawnPowerups();
      this.tickEffects();
    }
  }

  movePlayer(p) {
    const step = p.step;
    const steer = p.steer;
    if (p.square <= 0) {
      p.angle += (steer * step) / p.radius;
    } else if (steer !== STRAIGHT) {
      const cooldown = Math.ceil(p.width / step);
      const last = p.lastSquareTurn;
      if ((p.lastSquareDir !== steer || p.bot)
        && (!last || last.dir !== steer || p.tick - last.tick > cooldown)) {
        p.angle += (steer * Math.PI) / 2;
        p.lastSquareTurn = { dir: steer, tick: p.tick };
        p.lastSquareDir = steer;
      }
    } else {
      p.lastSquareDir = STRAIGHT;
    }

    const ox = p.x;
    const oy = p.y;
    let nx = ox + Math.cos(p.angle) * step;
    let ny = oy + Math.sin(p.angle) * step;

    // Holes: after holeMinGap px, a hole starts with a constant chance per px.
    if (!p.hole) {
      p.sinceHole += step;
      if (p.sinceHole > CURVE.holeMinGap
        && this.rng() < step / (CURVE.holeMaxGap - CURVE.holeMinGap)) {
        p.hole = true;
        p.holeLeft = p.holeLength;
        p.sinceHole = 0;
      }
    }
    const inHole = p.hole;
    if (p.hole && p.fly <= 0) {
      p.holeLeft -= step;
      if (p.holeLeft <= 0) p.hole = false;
    }

    const wrap = this.openBorders > 0 || p.tunnel > 0;

    // Collision against the area swept during this step.
    if (!inHole) {
      if (this.state === 'play' && this.collides(p, ox, oy, nx, ny, wrap)) {
        this.kill(p, nx, ny);
        return;
      }
      this.stamp(p, ox, oy, nx, ny, wrap);
    }

    // Wrap around through open borders.
    let wx = nx;
    let wy = ny;
    if (wrap) {
      if (wx < 0) wx += this.w; else if (wx >= this.w) wx -= this.w;
      if (wy < 0) wy += this.h; else if (wy >= this.h) wy -= this.h;
    }
    if (wx !== nx || wy !== ny) {
      p.trail.push({ x: nx, y: ny, pen: !inHole, w: p.width });
      p.trail.push({ x: wx - (nx - ox), y: wy - (ny - oy), pen: false, w: p.width });
      nx = wx;
      ny = wy;
    }
    p.trail.push({ x: nx, y: ny, pen: !inHole, w: p.width });
    p.x = nx;
    p.y = ny;
    p.tick++;

    if (this.mode === 'arcade' && this.state === 'play') this.pickup(p);
  }

  selfWindow(p) {
    return Math.ceil(p.width / p.step) + 1;
  }

  collides(p, ax, ay, bx, by, wrap) {
    const r = Math.max(0.75, (p.width - 0.5) / 2);
    const minTick = p.tick - this.selfWindow(p);
    const { owner, tick } = this.grid;
    const res = this.grid.sweep(ax, ay, bx, by, r, wrap, (i) => {
      const o = owner[i];
      return o !== 0 && !(o === p.id && tick[i] >= minTick);
    });
    return res !== null;
  }

  stamp(p, ax, ay, bx, by, wrap) {
    const r = Math.max(0.75, (p.width - 0.5) / 2);
    const { owner, tick, density, gw, gh } = this.grid;
    this.grid.sweep(ax, ay, bx, by, r, wrap, (i, cx, cy) => {
      if (owner[i] === 0) {
        density[Math.floor((cy / gh) * SECTORS) * SECTORS + Math.floor((cx / gw) * SECTORS)]++;
      }
      owner[i] = p.id;
      tick[i] = p.tick;
      return false;
    });
  }

  kill(p, x, y) {
    p.alive = false;
    p.trail.push({ x, y, pen: true, w: p.width });
    p.x = x;
    p.y = y;
    const survivors = this.alive;
    for (const s of survivors) s.score++;
    // When the human dies against the computer, speed the bots up so the
    // round finishes quickly.
    if (this.vsComputer && !p.bot && !survivors.some((s) => !s.bot)) {
      for (const s of survivors) s.speed *= 2.5;
    }
    this.checkGoal();
    this.emit('death', p);
    if (survivors.length <= 1) this.endRound();
  }

  checkGoal() {
    const top = Math.max(...this.players.map((p) => p.score));
    if (top < this.goal) return;
    const contenders = this.players.filter((p) => p.score + 1 >= top).length;
    if (contenders >= 2) {
      // You have to win by 2 points.
      this.goal = top + 1;
      this.raisedGoal = true;
      this.gameOver = false;
      this.emit('goal', this.goal);
    } else {
      this.gameOver = true;
    }
  }

  endRound() {
    if (this.gameOver) {
      this.state = 'gameEnd';
      this.winner = [...this.players].sort((a, b) => b.score - a.score)[0];
      this.emit('gameEnd', this.winner);
    } else {
      this.state = 'roundEnd';
      this.emit('roundEnd');
    }
  }

  // -- powerups --

  spawnPowerups() {
    for (const def of POWERUPS) {
      if (this.rng() < 1 / (def.chance / this.spawnBoost) / TPS) {
        const r = POWERUP_RADIUS;
        this.powerups.push({
          def,
          x: this.rng() * (this.w - 2 * r) + r,
          y: this.rng() * (this.h - 2 * r) + r,
          age: 0,
        });
      }
    }
    for (const pu of this.powerups) pu.age++;
  }

  pickup(p) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (Math.hypot(p.x - pu.x, p.y - pu.y) < POWERUP_RADIUS + p.width / 2) {
        this.powerups.splice(i, 1);
        this.apply(pu.def, p);
      }
    }
  }

  apply(def, taker) {
    if (def.type === 'random') {
      this.apply(POWERUPS[Math.floor(this.rng() * POWERUPS.length)], taker);
      return;
    }
    const others = this.alive.filter((q) => q !== taker);
    const targets = def.target === 'self' ? [taker] : def.target === 'others' ? others : [];
    const effect = { def, targets, left: Math.round(def.duration * TPS) };
    this.applyEffect(effect, +1);
    this.emit('powerup', { def, taker });
    if (effect.left > 0) this.effects.push(effect);
  }

  // sign = +1 to apply, -1 to undo.
  applyEffect({ def, targets }, sign) {
    const on = sign > 0;
    switch (def.type) {
      case 'fast':
        for (const q of targets) {
          q.speed *= on ? 2 : 0.5;
          q.radius *= on ? 1.5 : 1 / 1.5;
        }
        break;
      case 'slow':
        for (const q of targets) {
          q.speed *= on ? 0.5 : 2;
          // Slowing yourself also tightens your turns; slowing others doesn't.
          if (def.target === 'self') q.radius *= on ? 1 / 1.5 : 1.5;
        }
        break;
      case 'thin':
        for (const q of targets) q.width *= on ? 0.5 : 2;
        break;
      case 'thick':
        for (const q of targets) {
          q.width *= on ? 2 : 0.5;
          q.holeLength *= on ? 2 : 0.5;
        }
        break;
      case 'fly':
        for (const q of targets) {
          q.fly += sign;
          if (on) {
            q.hole = true;
            q.sinceHole = 0;
          } else if (q.fly <= 0) {
            q.hole = false;
            q.holeLeft = 0;
          }
        }
        break;
      case 'tunnel':
        for (const q of targets) q.tunnel += sign;
        break;
      case 'square':
        for (const q of targets) q.square += sign;
        break;
      case 'reverse':
        for (const q of targets) q.reversed += sign;
        break;
      case 'borders':
        this.openBorders += sign;
        break;
      case 'more':
        this.boosts += sign;
        this.spawnBoost = this.boosts > 0 ? 4 : 1;
        break;
      case 'clear':
        if (on) {
          this.grid.clear();
          this.emit('clear');
        }
        break;
      default:
    }
  }

  tickEffects() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (--e.left <= 0) {
        this.applyEffect(e, -1);
        this.effects.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------- AI -----

  // Port of the original computer player: look ahead along a left turn, a
  // right turn and straight on for 40% of a full circle and pick the one that
  // survives longest. On a tie, head for the emptiest part of the field.
  think(p) {
    const dirs = [LEFT, RIGHT, STRAIGHT];
    const scores = dirs.map((d) => this.probe(p, d));
    const best = Math.max(...scores);
    const ties = dirs.filter((d, i) => scores[i] === best);
    if (ties.length === 1) return ties[0];
    return this.towardsSpace(p, ties);
  }

  probe(p, dir) {
    const step = p.step * AI_EVERY;
    const max = Math.ceil((p.radius * 2 * Math.PI * 0.4) / step);
    if (p.fly > 0) return max; // can't crash while flying
    const wrap = this.openBorders > 0 || p.tunnel > 0;
    const r = Math.max(0.75, (p.width - 0.5) / 2);
    const minTick = p.tick - this.selfWindow(p);
    const { owner, tick } = this.grid;
    const blocked = (i) => owner[i] !== 0 && !(owner[i] === p.id && tick[i] >= minTick);
    let { x, y, angle } = p;
    let i = 0;
    for (; i < max; i++) {
      if (p.square <= 0) angle += (dir * step) / p.radius;
      else if (i === 0) angle += (dir * Math.PI) / 2;
      const nx = x + Math.cos(angle) * step;
      const ny = y + Math.sin(angle) * step;
      // Only test the leading half of the step; the rest is our own neck.
      const fx = x + Math.cos(angle) * step * 0.5;
      const fy = y + Math.sin(angle) * step * 0.5;
      if (this.grid.sweep(fx, fy, nx, ny, r, wrap, blocked) !== null) break;
      x = nx;
      y = ny;
    }
    return i;
  }

  towardsSpace(p, options) {
    const sw = this.w / SECTORS;
    const sh = this.h / SECTORS;
    const sx = Math.floor(p.x / sw);
    const sy = Math.floor(p.y / sh);
    const wrap = this.openBorders > 0 || p.tunnel > 0;
    const around = [[1, 0], [0, 1], [-1, 0], [0, -1], [-2, 0], [-1, 1], [0, 2], [1, 1],
      [2, 0], [1, -1], [0, -2], [-1, -1]];
    let best = Infinity;
    let picks = [];
    for (const [dx, dy] of around) {
      let tx = sx + dx;
      let ty = sy + dy;
      if (tx < 0 || ty < 0 || tx >= SECTORS || ty >= SECTORS) {
        if (!wrap) continue;
        tx = (tx + SECTORS) % SECTORS;
        ty = (ty + SECTORS) % SECTORS;
      }
      const d = this.grid.density[ty * SECTORS + tx];
      if (d < best) {
        best = d;
        picks = [[sx + dx, sy + dy]];
      } else if (d === best) {
        picks.push([sx + dx, sy + dy]);
      }
    }
    if (!picks.length) return options[0];
    // Stick with the previous target while it is still one of the emptiest.
    const keep = p.aiTarget && picks.find(([x, y]) => x === p.aiTarget[0] && y === p.aiTarget[1]);
    const [tx, ty] = keep || picks[Math.floor(this.rng() * picks.length)];
    p.aiTarget = [tx, ty];
    const cx = (tx + 0.5) * sw;
    const cy = (ty + 0.5) * sh;
    let diff = Math.atan2(cy - p.y, cx - p.x) - p.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    // Go straight when already heading into the target sector.
    const cone = Math.atan2(sw / 2, Math.hypot(cx - p.x, cy - p.y));
    if (options.includes(STRAIGHT) && Math.abs(diff) < cone) return STRAIGHT;
    const want = diff < 0 ? LEFT : RIGHT;
    if (options.includes(want)) return want;
    return options.includes(STRAIGHT) ? STRAIGHT : options[0];
  }
}
