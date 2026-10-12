// Canvas rendering for a running game. Trails are painted incrementally onto
// a persistent layer; heads and powerups are redrawn every frame on top.
import { POWERUP_RADIUS } from './config.js';
import { iconImage } from './icons.js';

export class Renderer {
  constructor(trailCanvas, topCanvas, game, { labels = true } = {}) {
    this.labels = labels;
    this.trailCanvas = trailCanvas;
    this.topCanvas = topCanvas;
    this.trail = trailCanvas.getContext('2d');
    this.top = topCanvas.getContext('2d');
    this.game = game;
    this.scale = 1;
    this.carry = new Map(); // last points drawn per player, to overlap seams
    game.on('clear', () => this.clearTrails());
  }

  // Size the backing stores for crisp lines at the current on-screen size.
  resize(cssWidth) {
    const ratio = window.devicePixelRatio || 1;
    const scale = Math.max(0.25, (cssWidth / this.game.w) * ratio);
    if (this.trailCanvas.width === Math.round(this.game.w * scale)) return;
    // Keep what has been drawn so far.
    const old = document.createElement('canvas');
    old.width = this.trailCanvas.width;
    old.height = this.trailCanvas.height;
    old.getContext('2d').drawImage(this.trailCanvas, 0, 0);
    this.scale = scale;
    for (const c of [this.trailCanvas, this.topCanvas]) {
      c.width = Math.round(this.game.w * scale);
      c.height = Math.round(this.game.h * scale);
    }
    this.trail.drawImage(old, 0, 0, this.trailCanvas.width, this.trailCanvas.height);
  }

  clearTrails() {
    this.trail.setTransform(1, 0, 0, 1, 0, 0);
    this.trail.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
    this.carry.clear();
    // Points queued before a clear belong to the erased picture, except the
    // current head position which new lines continue from.
    for (const p of this.game.players) {
      const last = p.trail[p.trail.length - 1];
      p.trail.length = 0;
      if (last) p.trail.push({ ...last, pen: false });
    }
  }

  drawTrails() {
    const ctx = this.trail;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    for (const p of this.game.players) {
      if (!p.trail.length) continue;
      ctx.strokeStyle = p.color;
      let path = this.carry.get(p.id) || [];
      const flush = () => {
        if (path.length < 2) return;
        ctx.lineWidth = path[path.length - 1].w;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      };
      for (const pt of p.trail) {
        if (!pt.pen) {
          flush();
          path = [pt];
        } else if (path.length && path[path.length - 1].w !== pt.w) {
          flush();
          path = [path[path.length - 1], pt];
        } else {
          path.push(pt);
        }
      }
      flush();
      // Redraw the last segment next frame so the joins have no seams.
      this.carry.set(p.id, path.slice(-2).map((pt, i) => (i === 0 ? { ...pt, pen: false } : pt)));
      p.trail.length = 0;
    }
  }

  drawTop(now) {
    const ctx = this.top;
    const { game } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.topCanvas.width, this.topCanvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    for (const pu of game.powerups) {
      const img = iconImage(pu.def);
      // Pop in over the first few frames.
      const grow = Math.min(1, (pu.age + 1) / 15);
      const r = POWERUP_RADIUS * (grow < 1 ? 0.5 + 0.5 * grow + 0.15 * Math.sin(grow * Math.PI) : 1);
      if (img.complete) ctx.drawImage(img, pu.x - r, pu.y - r, 2 * r, 2 * r);
    }

    for (const p of game.players) {
      const size = Math.max(p.width, 2);
      let alpha = 1;
      if (p.tunnel > 0) alpha = 0.5 + 0.5 * Math.cos(now / 160);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.reversed > 0 ? '#0000ff' : '#ffff00';
      const wrap = game.openBorders > 0 || p.tunnel > 0;
      const spots = wrap ? this.wrapSpots(p.x, p.y, size) : [[p.x, p.y]];
      for (const [x, y] of spots) {
        ctx.beginPath();
        if (p.square > 0) ctx.rect(x - size / 2, y - size / 2, size, size);
        else ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Before a round starts, point out which curve is which.
    if (game.state === 'setup' && this.labels) {
      ctx.font = 'bold 13px Verdana, sans-serif';
      ctx.textAlign = 'center';
      for (const p of game.players) {
        const ax = p.x + Math.cos(p.angle) * 26;
        const ay = p.y + Math.sin(p.angle) * 26;
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(p.angle) * 6, ay + Math.sin(p.angle) * 6);
        ctx.lineTo(ax + Math.cos(p.angle + 2.4) * 6, ay + Math.sin(p.angle + 2.4) * 6);
        ctx.lineTo(ax + Math.cos(p.angle - 2.4) * 6, ay + Math.sin(p.angle - 2.4) * 6);
        ctx.fill();
        const ly = p.y - 16 < 14 ? p.y + 26 : p.y - 16;
        ctx.fillText(p.name, Math.min(game.w - 40, Math.max(40, p.x)), ly);
      }
    }
  }

  wrapSpots(x, y, size) {
    const { w, h } = this.game;
    const xs = [x];
    const ys = [y];
    if (x < size) xs.push(x + w);
    if (x > w - size) xs.push(x - w);
    if (y < size) ys.push(y + h);
    if (y > h - size) ys.push(y - h);
    const out = [];
    for (const a of xs) for (const b of ys) out.push([a, b]);
    return out;
  }

  draw(now) {
    this.drawTrails();
    this.drawTop(now);
  }
}
