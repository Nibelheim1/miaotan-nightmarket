import { CONFIG, PALETTE, CATS } from '../data/config.js';
import { clamp } from '../core/random.js';

function round(ctx, x, y, w, h, r = 10) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function line(ctx, points) { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw Error('此浏览器无法创建 Canvas 2D。请使用较新版本浏览器。');
    this.effects = []; this.particles = []; this.texts = []; this.clock = 0; this.shake = 0;
    this.reducedMotion = false; this.dpr = 1; this.frameTimes = [];
  }
  resize(width, height, dpr = 1) {
    const ratio = Math.min(width / CONFIG.width, height / CONFIG.height);
    const w = Math.max(1, Math.floor(CONFIG.width * ratio)), h = Math.max(1, Math.floor(CONFIG.height * ratio));
    this.dpr = Math.min(dpr, 2); this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
  }
  clearEffects() { this.effects = []; this.particles = []; this.texts = []; this.shake = 0; }
  burst(x, y, color, n = 12) {
    for (let i = 0; i < n && this.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2, speed = 40 + Math.random() * 150;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 35, life: .45 + Math.random() * .3, total: .8, size: 2 + Math.random() * 4, color });
    }
  }
  consume(events) {
    for (const e of events) {
      if (e.type === 'kill') this.burst(e.x, e.y, e.kind === 'bomb' ? PALETTE.gold : PALETTE.mint, e.kind === 'boss' ? 35 : 10);
      if (e.type === 'boom') { this.effects.push({ ...e, life: .4, total: .4 }); this.shake = Math.max(this.shake, 3); this.burst(e.x, e.y, PALETTE.gold, 14); }
      if (e.type === 'chain') this.effects.push({ ...e, life: .2, total: .2 });
      if (e.type === 'laser') { this.effects.push({ ...e, life: .26, total: .26 }); this.shake = 2; }
      if (e.type === 'ice') this.burst(e.x, e.y, PALETTE.blue, 9);
      if (e.type === 'split') this.burst(e.x, e.y, PALETTE.purple, 4);
      if (e.type === 'gift') this.texts.push({ x: e.x, y: e.y, text: '+1 弹珠', color: PALETTE.gold, life: 1.1, total: 1.1 });
      if (e.type === 'bossKill') { this.shake = 8; this.texts.push({ x: 210, y: 210, text: '大王跑路啦！+1 ♥', color: PALETTE.gold, life: 1.8, total: 1.8 }); }
      if (e.type === 'damage') this.shake = 9;
      if (e.type === 'leak') { this.shake = Math.max(this.shake, 5); this.texts.push({ x: e.x, y: e.y - 24, text: '溜了溜了，还会回来！', color: PALETTE.pink, life: 1.3, total: 1.3 }); }
      if (e.type === 'stalled') this.texts.push({ x: 210, y: 300, text: `还没清完！打烊倒计时 -1 ♥`, color: PALETTE.pink, life: 1.5, total: 1.5 });
      if (e.type === 'talent') { this.burst(e.x, e.y, e.cat === 'peach' ? PALETTE.pink : PALETTE.purple, 8); this.texts.push({ x: e.x, y: e.y - 18, text: e.cat === 'peach' ? '开门红！' : '静电场！', color: e.cat === 'peach' ? PALETTE.pink : PALETTE.purple, life: .9, total: .9 }); }
      if (e.type === 'spent') this.burst(e.x, e.y, '#6b7590', 3);
      if (e.type === 'hit' && e.damage >= 5 && this.texts.length < 20) this.texts.push({ x: e.x, y: e.y, text: `${Math.ceil(e.damage)}`, color: PALETTE.cream, life: .48, total: .48 });
    }
    if (this.effects.length > 64) this.effects.splice(0, this.effects.length - 64);
    if (this.texts.length > 24) this.texts.splice(0, this.texts.length - 24);
  }
  draw(dt, game, aim, aiming = false, paused = false) {
    this.clock += dt;
    const c = this.ctx, W = CONFIG.width, H = CONFIG.height;
    c.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
    c.fillStyle = PALETTE.bg; c.fillRect(0, 0, W, H);
    c.save();
    if (!this.reducedMotion && this.shake > .2) c.translate(Math.sin(this.clock * 63) * this.shake, Math.cos(this.clock * 87) * this.shake * .6);
    this.shake *= Math.exp(-dt * 10);
    this.background(c, game);
    for (const enemy of game.enemies) if (enemy.hp > 0) this.enemy(c, enemy, game);
    if (game.phase === 'aim' && aim && !paused) this.trajectory(c, game, aim, aiming);
    for (const ball of game.balls) {
      const color = ball.charge ? PALETTE.gold : ball.child ? PALETTE.purple : PALETTE.cream;
      c.strokeStyle = color; c.globalAlpha = .18; c.lineWidth = ball.r * 1.7;
      line(c, [[ball.x - ball.vx * .028, ball.y - ball.vy * .028], [ball.x, ball.y]]);
      c.globalAlpha = 1; c.fillStyle = color; c.beginPath(); c.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); c.fill();
      if (ball.charge) { c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.arc(ball.x, ball.y, ball.r + 3, 0, Math.PI * 2); c.stroke(); }
    }
    this.shooter(c, game, aim);
    this.drawEffects(c, dt);
    c.restore(); c.globalAlpha = 1;
  }
  background(c, game) {
    const gradient = c.createLinearGradient(0, 22, 0, 488); gradient.addColorStop(0, '#182238'); gradient.addColorStop(1, '#131c2a');
    c.fillStyle = gradient; round(c, 9, 20, 402, 477, 15); c.fill();
    c.strokeStyle = '#344154'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#334258';
    for (let x = 28; x < 401; x += 26) for (let y = 46; y < 478; y += 26) { c.globalAlpha = .43; c.beginPath(); c.arc(x, y, 1, 0, 7); c.fill(); } c.globalAlpha = 1;
    // Small shop lamps and handcrafted bunting establish an original night-market setting.
    c.strokeStyle = '#556076'; c.lineWidth = 1; line(c, [[24, 6], [210, 17], [397, 6]]);
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * 45, y = 8 + (1 - Math.abs(i - 4) / 4) * 9;
      c.fillStyle = [PALETTE.mint, PALETTE.pink, PALETTE.gold][i % 3];
      c.beginPath(); c.arc(x, y + 2, 4.5, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = game.enemies.some(e => e.y + e.h > 396) ? PALETTE.pink : '#bd6981';
    c.globalAlpha = .75; c.setLineDash([7, 7]); c.lineWidth = 1.5; line(c, [[22, game.L.danger], [398, game.L.danger]]); c.setLineDash([]); c.globalAlpha = 1;
    c.fillStyle = '#192333'; round(c, 16, 503, 388, 67, 14); c.fill();
    c.font = '10px system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#8795ae'; c.fillText('夜市防线', 27, 483);
    c.textAlign = 'right'; c.fillText('捣蛋王越线将直接结束', 392, 483);
    for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#344759' : '#26364c'; c.fillRect(16 + i * 27.7, 562, 26.6, 8); }
    c.font = 'bold 10px system-ui, sans-serif'; c.fillStyle = PALETTE.muted; c.textAlign = 'left'; if (game.playerX > 155) { c.fillText('MIDNIGHT', 30, 529); c.fillText('BOUNCE CLUB', 30, 543); }
    c.textAlign = 'right'; c.fillStyle = PALETTE.gold; if (game.playerX < 335) c.fillText(`第 ${String(game.wave).padStart(2, '0')} 班`, 389, 536);
  }
  enemy(c, e, game) {
    const color = e.type === 'boss' ? PALETTE.pink : e.type === 'bomb' ? PALETTE.gold : e.type === 'armor' ? '#a5bad3' : e.type === 'gift' ? PALETTE.mint : [PALETTE.purple, PALETTE.blue, '#e6acd9'][e.id % 3];
    const x = e.x, y = e.y, w = e.w, h = e.h, cx = x + w / 2;
    c.fillStyle = '#060a13'; round(c, x, y + 4, w, h, e.type === 'boss' ? 13 : 10); c.fill();
    if (e.type === 'boss') {
      c.fillStyle = color; c.beginPath(); c.moveTo(x + 8, y + 7); c.lineTo(x + 2, y - 9); c.lineTo(x + 24, y + 2); c.fill();
      c.beginPath(); c.moveTo(x + w - 8, y + 7); c.lineTo(x + w - 2, y - 9); c.lineTo(x + w - 24, y + 2); c.fill();
    }
    c.fillStyle = color; round(c, x, y, w, h, e.type === 'armor' ? 6 : 11); c.fill();
    c.fillStyle = '#ffffff'; c.globalAlpha = .18; round(c, x + 3, y + 3, w - 6, 9, 5); c.fill(); c.globalAlpha = 1;
    if (e.ice) { c.strokeStyle = '#c9f4ff'; c.lineWidth = 3; round(c, x - 1, y - 1, w + 2, h + 2, 10); c.stroke(); }
    if (game.time - e.hit < .065 && game.time > 0) { c.globalAlpha = .55 * (1 - (game.time - e.hit) / .065); c.fillStyle = '#fff'; round(c, x, y, w, h, 10); c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = '#202334'; c.lineWidth = 2; c.lineCap = 'round';
    if (e.type === 'bomb') {
      c.fillStyle = '#27283a'; c.beginPath(); c.arc(cx, y + 11, 5, 0, 7); c.fill(); line(c, [[cx + 3, y + 7], [cx + 6, y + 3]]);
      c.fillStyle = '#ff6b78'; c.beginPath(); c.arc(cx + 7, y + 2, 2.6, 0, 7); c.fill();
    } else if (e.type === 'gift') {
      c.fillStyle = '#234638'; c.beginPath(); c.ellipse(cx - 2, y + 10, 7, 4, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(cx + 3, y + 10); c.lineTo(cx + 10, y + 5); c.lineTo(cx + 10, y + 15); c.fill();
    } else {
      const eyeX = e.type === 'boss' ? 16 : 8;
      c.fillStyle = '#252539'; c.beginPath(); c.ellipse(cx - eyeX, y + 11, 2, 3, 0, 0, 7); c.ellipse(cx + eyeX, y + 11, 2, 3, 0, 0, 7); c.fill();
      if (e.type === 'boss') { line(c, [[cx - 24, y + 4], [cx - 12, y + 7]]); line(c, [[cx + 24, y + 4], [cx + 12, y + 7]]); }
    }
    c.font = `800 ${e.hp > 999 ? 15 : e.type === 'boss' ? 22 : 19}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillStyle = '#252539'; c.fillText(Math.ceil(e.hp).toString(), cx, y + 34);
    c.globalAlpha = .3; c.fillStyle = '#21253b'; round(c, x + 7, y + h - 6, w - 14, 2, 1); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#32374e'; round(c, x + 7, y + h - 6, Math.max(2, (w - 14) * Math.max(0, e.hp / e.maxHp)), 2, 1); c.fill();
    if (e.armor) { c.strokeStyle = '#637791'; c.lineWidth = 2; c.strokeRect(x + 3, y + 3, w - 6, h - 6); }
    if (e.id === game.markedId) { c.strokeStyle = PALETTE.gold; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.strokeRect(x - 4, y - 4, w + 8, h + 8); c.setLineDash([]); }
  }
  trajectory(c, game, aim, active) {
    const dir = game.aimAt(aim.x, aim.y); if (!dir) return;
    let x = game.playerX, y = CONFIG.launchY - 6, vx = dir.x, vy = dir.y, stop = false;
    c.fillStyle = active ? PALETTE.gold : PALETTE.mint;
    for (let i = 0; i < 100 && !stop; i++) {
      x += vx * 10; y += vy * 10;
      if (x < 20) { x = 40 - x; vx *= -1; } if (x > 400) { x = 800 - x; vx *= -1; }
      if (y < CONFIG.top + 5) { y = 2 * (CONFIG.top + 5) - y; vy *= -1; }
      if (y > CONFIG.launchY) break;
      const hit = game.enemies.find(e => e.hp > 0 && x >= e.x - 5 && x <= e.x + e.w + 5 && y >= e.y - 5 && y <= e.y + e.h + 5);
      c.globalAlpha = active ? .85 : .3;
      if (i % 2 === 0) { c.beginPath(); c.arc(x, y, active ? 2.2 : 1.7, 0, 7); c.fill(); }
      if (hit) { stop = true; c.globalAlpha = .7; c.strokeStyle = PALETTE.gold; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 9 + Math.sin(this.clock * 6) * 1.5, 0, 7); c.stroke(); }
    }
    c.globalAlpha = 1;
    if (game.shots === 0) {
      c.fillStyle = PALETTE.cream; c.font = '700 15px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('按住瞄准 · 松手发射', 210, 387);
      c.font = '12px system-ui, sans-serif'; c.fillStyle = PALETTE.muted; c.fillText('先试试带小炸弹的那一只', 210, 407);
    }
  }
  shooter(c, game, aim) {
    const x = game.playerX, y = CONFIG.launchY, color = CATS.find(cat => cat.id === game.cat)?.color || PALETTE.mint;
    const d = aim ? game.aimAt(aim.x, aim.y) : { x: 0, y: -1 };
    if (game.phase === 'aim') {
      c.save(); c.translate(x, y); c.rotate(Math.atan2(d.x, -d.y)); c.fillStyle = PALETTE.gold;
      round(c, -7, -28, 14, 27, 5); c.fill(); c.fillStyle = '#59606e'; round(c, -5, -29, 10, 5, 2); c.fill(); c.restore();
    }
    c.fillStyle = color; c.strokeStyle = '#15202d'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 20, y + 7); c.lineTo(x - 19, y - 12); c.lineTo(x - 6, y - 6); c.quadraticCurveTo(x, y - 9, x + 6, y - 6); c.lineTo(x + 19, y - 12); c.lineTo(x + 20, y + 7); c.bezierCurveTo(x + 21, y + 27, x - 21, y + 27, x - 20, y + 7); c.fill(); c.stroke();
    c.fillStyle = '#fff1dc'; c.beginPath(); c.ellipse(x, y + 11, 12, 9, 0, 0, 7); c.fill();
    c.fillStyle = '#223041'; c.beginPath(); c.arc(x - 8, y + 4, 2, 0, 7); c.arc(x + 8, y + 4, 2, 0, 7); c.fill();
    c.strokeStyle = '#223041'; c.lineWidth = 1.5; line(c, [[x - 3, y + 10], [x, y + 12], [x + 3, y + 10]]);
  }
  drawEffects(c, dt) {
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 230 * dt;
      c.globalAlpha = Math.max(0, p.life / p.total); c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size, p.size * .65);
    }
    this.particles = this.particles.filter(p => p.life > 0); c.globalAlpha = 1;
    for (const e of this.effects) {
      e.life -= dt; const alpha = Math.max(0, e.life / e.total); c.globalAlpha = alpha;
      if (e.type === 'boom') { c.strokeStyle = PALETTE.gold; c.lineWidth = 4 * alpha; c.beginPath(); c.arc(e.x, e.y, e.radius * (1 - alpha * .7), 0, 7); c.stroke(); }
      if (e.type === 'chain') {
        c.strokeStyle = PALETTE.purple; c.lineWidth = 3; line(c, [[e.x1, e.y1], [(e.x1 + e.x2) / 2 + 8, (e.y1 + e.y2) / 2 - 9], [(e.x1 + e.x2) / 2 - 7, (e.y1 + e.y2) / 2 + 6], [e.x2, e.y2]]);
      }
      if (e.type === 'laser') { c.strokeStyle = PALETTE.pink; c.lineWidth = 9 * alpha; line(c, [[15, e.y], [405, e.y]]); c.strokeStyle = PALETTE.cream; c.lineWidth = 2; c.stroke(); }
    }
    this.effects = this.effects.filter(e => e.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= dt * 28; c.globalAlpha = Math.max(0, Math.min(1, t.life * 3)); c.fillStyle = t.color; c.font = '800 17px system-ui, sans-serif'; c.textAlign = 'center'; c.strokeStyle = '#162030'; c.lineWidth = 3; c.strokeText(t.text, t.x, t.y); c.fillText(t.text, t.x, t.y); }
    this.texts = this.texts.filter(t => t.life > 0); c.globalAlpha = 1;
  }
}
