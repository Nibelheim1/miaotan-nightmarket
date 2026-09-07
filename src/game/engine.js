import { CONFIG, CATS, LEVELS } from '../data/config.js';
import { UPGRADES, UPGRADE_BY_ID, activeSynergies } from '../data/upgrades.js';
import { Random, clamp, finite } from '../core/random.js';

/** Pure deterministic simulation. No DOM, sound, clock, network or persistence access. */
export class Engine {
  constructor({ seed = 1, mode = 'normal', cat = 'mint', daily = '', level = 2 } = {}) {
    this.seed = seed >>> 0; this.rng = new Random(this.seed);
    this.mode = ['normal', 'daily', 'endless'].includes(mode) ? mode : 'normal';
    // Only the campaign uses the level table; daily and endless stay on L2 rules.
    this.level = this.mode === 'normal' ? clamp(Math.floor(level) || 2, 1, LEVELS.length) : 2;
    this.L = LEVELS[this.level - 1];
    this.cat = CATS.some(c => c.id === cat) ? cat : 'mint';
    if (this.mode === 'daily' || this.level === 1) this.cat = 'mint'; // tutorial level is always Mint
    this.daily = String(daily).slice(0, 10); this.wave = 1; this.shots = 0;
    this.maxHearts = CONFIG.maxHearts;
    this.hearts = this.L.hearts; this.shields = 0; this.score = 0;
    this.kills = 0; this.bosses = 0; this.maxCombo = 0; this.combo = 0;
    this.playerX = CONFIG.width / 2; this.nextX = null; this.ballBonus = 0;
    this.build = {}; this.build[CATS.find(c => c.id === this.cat).upgrade] = 1;
    this.enemies = []; this.balls = []; this.events = []; this.offers = [];
    this.phase = 'aim'; this.time = 0; this.shotTime = 0; this.elapsed = 0;
    this.nextId = 1; this.ballId = 1; this.pending = 0; this.spawned = 0;
    this.rerolls = 1; this.rewardCount = 0; this.victory = false; this.endReason = '';
    this.adRewards = this.L.adLimit; this.extraPick = false; this.pendingReward = false; this.rewardViaAd = false;
    this.stallStreak = 0; this.firstHitDone = false; this.firstKillDone = false;
    this.ops = 0; this.queue = []; this.fireflyCount = 0; this.hunterBuff = 0;
    this.markedId = null; this.guardUsed = false; this.launchClock = 0;
    this.direction = { x: 0, y: -1 }; this.initialBoard(); this.markTarget();
  }
  get ballCount() { return Math.min(CONFIG.maxBaseBalls, CONFIG.initialBalls + (this.wave - 1) * CONFIG.ballGrowth + this.ballBonus); }
  get damage() { return 1 + Math.floor((this.wave - 1) / CONFIG.damageRampWaves) + this.hunterBuff; }
  emit(type, data = {}) { if (this.events.length < CONFIG.maxEvents) this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  addEnemy(col, row, hp, type = 'plain', width = CONFIG.block) {
    if (this.enemies.length >= CONFIG.maxEnemies) return;
    const enemy = { id: this.nextId++, x: CONFIG.gridLeft + col * CONFIG.cell,
      y: CONFIG.gridTop + row * CONFIG.cell, w: width, h: CONFIG.block,
      hp, maxHp: hp, type, ice: false, armor: type === 'armor', tapped: false, hit: -100 };
    this.enemies.push(enemy); return enemy;
  }
  initialBoard() {
    // A readable, designed opening — not fake pre-rendered gameplay. The curated
    // first shot detonates the centre bomb and clears the whole cross formation.
    this.addEnemy(2, 2, 2); this.addEnemy(3, 1, 2, 'gift');
    this.addEnemy(3, 2, 3, 'bomb'); this.addEnemy(4, 2, 2);
    this.addEnemy(3, 3, 2);
  }
  markTarget() {
    const live = this.enemies.filter(e => e.hp > 0).sort((a, b) => (b.y - a.y) || (a.hp - b.hp));
    this.markedId = this.build.hunter ? live[0]?.id ?? null : null;
  }
  isBossWave() { return this.wave % this.L.bossEvery === 0 || this.wave === this.L.waves; }
  makeFormation(form, n) {
    const cols = CONFIG.columns;
    const row0run = k => { const s = Math.floor(this.rng.next() * (cols - k + 1)); return Array.from({ length: k }, (_, i) => [s + i, 0]); };
    if (form === 'checker') {
      if (2 * n - 1 > cols) return row0run(n);
      const s = Math.floor(this.rng.next() * (cols - (2 * n - 1) + 1));
      return Array.from({ length: n }, (_, i) => [s + i * 2, 0]);
    }
    if (form === 'columns') {
      const k = Math.ceil(n / 2);
      const picks = this.rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, k).sort((a, b) => a - b);
      const spots = [];
      for (const c of picks) { spots.push([c, 0]); if (spots.length < n) spots.push([c, 1]); }
      return spots.slice(0, n);
    }
    if (form === 'staggered') {
      const nf = Math.ceil(n / 2), nb = n - nf;
      const a = Math.floor(this.rng.next() * (cols - nf + 1));
      const b = nb ? Math.floor(this.rng.next() * (cols - nb + 1)) : 0;
      return [...Array.from({ length: nf }, (_, i) => [a + i, 0]), ...Array.from({ length: nb }, (_, i) => [b + i, 1])];
    }
    if (form === 'clusters') {
      const sizes = this.rng.shuffle(n % 2 ? [Math.floor(n / 2), Math.ceil(n / 2)] : [n / 2, n / 2]);
      for (let attempt = 0; attempt < 12; attempt++) {
        const s1 = Math.floor(this.rng.next() * (cols - sizes[0] + 1));
        const s2 = Math.floor(this.rng.next() * (cols - sizes[1] + 1));
        const gap = s2 > s1 ? s2 - (s1 + sizes[0]) : s1 - (s2 + sizes[1]);
        if (gap >= 1) {
          const [a, b] = s2 > s1 ? [s1, s2] : [s2, s1];
          const [na, nb] = s2 > s1 ? sizes : [sizes[1], sizes[0]];
          return [...Array.from({ length: na }, (_, i) => [a + i, 0]), ...Array.from({ length: nb }, (_, i) => [b + i, 0])];
        }
      }
      return row0run(n);
    }
    return row0run(n);
  }
  spawnRow() {
    const pressure = this.mode === 'endless' ? (1 + Math.max(0, this.wave - CONFIG.campaignWaves) / CONFIG.endlessRampWaves) ** CONFIG.endlessRampPower : 1;
    const hpBase = Math.round((CONFIG.baseHP + this.wave * this.L.hpSlope) * pressure);
    // Formation difficulty is level-driven: contiguous rows teach the sweep,
    // clusters split it, checkerboards leak it, columns demand vertical fire.
    const n = (this.wave < 6 ? 2 : this.wave < this.L.rushWave ? 3 : 4) + this.L.enemyDelta;
    let spots; // [column, row]
    if (this.isBossWave()) {
      this.addEnemy(2, 0, Math.round(this.wave * this.L.bossHP * pressure), 'boss', CONFIG.block + CONFIG.cell);
      if (this.L.escorts >= 3) spots = [[4, 0], [5, 0], [6, 0]];
      else { const s = this.rng.shuffle([0, 4, 5])[0]; spots = [[s, 0], [s + 1, 0]]; }
      this.emit('boss', { wave: this.wave });
    } else {
      let form = 'row';
      if (this.wave >= 7 && this.wave < this.L.rushWave) {
        form = this.L.midFormation === 'mix' ? (this.wave % 2 ? 'checker' : 'columns') : this.L.midFormation;
      } else if (this.wave >= this.L.rushWave) form = 'staggered';
      spots = this.makeFormation(form, n);
    }
    const fresh = [];
    for (const [col, row] of spots) {
      const p = this.rng.next();
      let type = p < .17 ? 'bomb' : p < .29 ? 'gift' : p < this.L.armorRate && this.wave >= 4 ? 'armor' : 'plain';
      let hp = Math.max(2, Math.round(hpBase * (.75 + this.rng.next() * .45)));
      if (type === 'bomb') hp = Math.max(2, Math.ceil(hp * .65));
      fresh.push(this.addEnemy(col, row, hp, type));
    }
    // Bad-luck protection: early waves keep one bomb as a chain pivot; later
    // waves never go more than 3 rows without one. Only fresh spawns qualify —
    // carried-over enemies keep their identity and wounds.
    const topRow = fresh.filter(e => e && e.type !== 'boss');
    if ((this.wave <= this.L.bombGuarantee || this.wave % 3 === 0) && topRow.length && !topRow.some(e => e.type === 'bomb')) {
      const row = topRow.find(e => e.type === 'plain');
      if (row) { row.type = 'bomb'; row.hp = row.maxHp = Math.ceil(row.hp * .7); }
    }
  }
  aimAt(x, y) {
    if (!finite(x) || !finite(y)) return null;
    const dx = x - this.playerX, dy = Math.min(-38, y - CONFIG.launchY);
    let angle = Math.atan2(dx, -dy); angle = clamp(angle, -1.30, 1.30);
    return { x: Math.sin(angle), y: -Math.cos(angle) };
  }
  shoot(x, y) {
    if (this.phase !== 'aim') return false;
    const direction = this.aimAt(x, y); if (!direction) return false;
    this.direction = direction; this.phase = 'flight'; this.shots++;
    this.pending = this.ballCount; this.spawned = 0; this.balls = [];
    this.shotTime = 0; this.launchClock = 0; this.combo = 0;
    this.firstHitDone = false; this.firstKillDone = false;
    this.nextX = null; this.guardUsed = false; this.hunterBuff = 0; this.fireflyCount = 0;
    this.emit('shot', { count: this.pending }); return true;
  }
  createBall(x, y, vx, vy, child = false) {
    if (this.balls.length >= CONFIG.maxBalls || this.spawned >= CONFIG.maxSpawnPerVolley) return null;
    const speed = Math.hypot(vx, vy) || CONFIG.ballSpeed;
    const ball = { id: this.ballId++, x, y, px: x, py: y,
      vx: vx / speed * CONFIG.ballSpeed, vy: vy / speed * CONFIG.ballSpeed,
      r: child ? 3.4 : CONFIG.ballRadius, child, hits: 0,
      split: child, pierces: child ? (this.build.pierce && this.build.split ? 1 : 0) : (this.build.pierce || 0),
      returns: child ? 0 : this.build.return || 0, charge: 0, lastId: 0, lastTime: -1, alive: true };
    this.spawned++; this.balls.push(ball); return ball;
  }
  step(dt = CONFIG.fixedStep) {
    if (this.phase !== 'flight' || !finite(dt) || dt <= 0) return;
    // A caller may supply 1/60 s, but collision travel remains bounded to 5.34 px.
    const n = Math.ceil(Math.min(dt, .1) / CONFIG.fixedStep);
    for (let k = 0; k < n && this.phase === 'flight'; k++) this.tick(Math.min(dt, .1) / n);
  }
  tick(dt) {
    this.time += dt; this.elapsed += dt; this.shotTime += dt; this.launchClock -= dt; this.ops = 0;
    while (this.pending > 0 && this.launchClock <= 0) {
      this.createBall(this.playerX, CONFIG.launchY, this.direction.x * CONFIG.ballSpeed, this.direction.y * CONFIG.ballSpeed);
      this.pending--; this.launchClock += CONFIG.launchInterval;
    }
    const count = this.balls.length;
    for (let i = 0; i < count; i++) {
      const b = this.balls[i]; if (!b.alive) continue;
      b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < CONFIG.left + b.r) { b.x = CONFIG.left + b.r; b.vx = Math.abs(b.vx); this.wallHit(b); }
      if (b.x > CONFIG.right - b.r) { b.x = CONFIG.right - b.r; b.vx = -Math.abs(b.vx); this.wallHit(b); }
      if (b.y < CONFIG.top + b.r) { b.y = CONFIG.top + b.r; b.vy = Math.abs(b.vy); }
      if (b.y >= CONFIG.launchY && b.vy > 0) {
        if (b.returns > 0) { b.returns--; b.y = CONFIG.launchY - 1; b.vy = -Math.abs(b.vy); this.emit('return', { x: b.x, y: b.y }); }
        else { b.alive = false; if (this.nextX === null) this.nextX = clamp(b.x, 32, 388); continue; }
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.id === b.lastId && this.time - b.lastTime < .05)) continue;
        const cx = clamp(b.x, e.x, e.x + e.w), cy = clamp(b.y, e.y, e.y + e.h);
        let nx = b.x - cx, ny = b.y - cy;
        const d2 = nx * nx + ny * ny;
        if (d2 > b.r * b.r) continue;
        if (b.pierces > 0) { b.pierces--; b.lastId = e.id; b.lastTime = this.time + .085; this.ballHit(b, e); break; }
        if (d2 > .00001) { const d = Math.sqrt(d2); nx /= d; ny /= d; b.x = cx + nx * (b.r + .08); b.y = cy + ny * (b.r + .08); }
        else {
          // A centre inside a rectangle is ejected through its nearest face.
          const faces = [Math.abs(b.x - e.x), Math.abs(b.x - e.x - e.w), Math.abs(b.y - e.y), Math.abs(b.y - e.y - e.h)];
          const face = faces.indexOf(Math.min(...faces)); nx = face === 0 ? -1 : face === 1 ? 1 : 0; ny = face === 2 ? -1 : face === 3 ? 1 : 0;
          if (nx) b.x = (nx < 0 ? e.x - b.r : e.x + e.w + b.r); else b.y = (ny < 0 ? e.y - b.r : e.y + e.h + b.r);
        }
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
        b.lastId = e.id; b.lastTime = this.time; this.ballHit(b, e); break;
      }
      // Eliminate near-horizontal soft-locks while preserving aim decisions.
      if (Math.abs(b.vy) < 65) { b.vy = (b.vy < 0 ? -1 : 1) * 65; b.vx = Math.sign(b.vx || 1) * Math.sqrt(CONFIG.ballSpeed ** 2 - 65 ** 2); }
    }
    this.balls = this.balls.filter(b => b.alive);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (this.enemies.length === 0) { this.balls = []; this.pending = 0; }
    if (this.shotTime >= CONFIG.volleyLimit) {
      this.emit('recall'); this.balls = []; this.pending = 0;
    }
    if (this.balls.length === 0 && this.pending === 0) this.finishShot();
  }
  wallHit(b) { if (this.build.wall) { b.charge = Math.min(this.build.wall, b.charge + 1); this.emit('wall', { x: b.x, y: b.y }); } }
  ballHit(b, e) {
    b.hits++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    let amount = this.damage * (b.child ? .65 : 1) * (1 + b.charge); b.charge = 0;
    // L6: repeated hits by the same ball on the same target decay — weaving in
    // place stays useful but stops being free.
    if (this.L.repeatDecay < 1) {
      b.seen = b.seen || Object.create(null);
      const n = b.seen[e.id] = (b.seen[e.id] || 0) + 1;
      if (n > 1) amount *= Math.max(.4, this.L.repeatDecay ** (n - 1));
    }
    if (e.armor) {
      if (this.build.drill) { e.armor = false; this.chain(e, 2 + this.build.drill, this.damage); }
      else { amount = Math.max(.5, amount * .55); if (b.hits > 1) e.armor = false; }
    }
    if (e.type === 'boss' && this.build.drill >= 2 && !e.tapped) { this.chain(e, 4, this.damage * 2); e.tapped = true; }
    if (this.build.ice) {
      if (e.ice) { amount *= 1 + this.build.ice; e.ice = false; this.emit('ice', { x: e.x + e.w / 2, y: e.y + e.h / 2 }); }
      else e.ice = true;
    }
    this.deal(e, amount, 'ball');
    // Taro's innate talent: the first hit of every volley fires a free chain.
    if (this.cat === 'taro' && !this.firstHitDone) {
      this.firstHitDone = true; this.emit('talent', { cat: 'taro', x: e.x + e.w / 2, y: e.y + e.h / 2 });
      this.chain(e, 2, this.damage);
    }
    if (this.build.split && !b.split) {
      b.split = true;
      const n = 1 + this.build.split;
      for (let i = 0; i < n; i++) {
        const a = -.7 + 1.4 * (i + .5) / n, ca = Math.cos(a), sa = Math.sin(a);
        const child = this.createBall(b.x, b.y, b.vx * ca - b.vy * sa, b.vx * sa + b.vy * ca, true);
        if (child) { child.lastId = e.id; child.lastTime = this.time + .08; }
      }
      this.emit('split', { x: b.x, y: b.y });
    }
    if (this.build.spark && b.hits % (this.build.spark === 3 ? 2 : 3) === 0) this.chain(e, 1 + this.build.spark, this.damage);
    if (this.build.laser && this.combo % [0, 12, 9, 6][this.build.laser] === 0) {
      this.emit('laser', { y: e.y + e.h / 2 });
      for (const target of this.enemies) if (target.hp > 0 && Math.abs(target.y - e.y) < 25) this.deal(target, this.damage * 1.6, 'laser');
    }
    if (this.build.guard && !this.guardUsed && this.combo >= [0, 35, 25, 18][this.build.guard]) {
      this.guardUsed = true; this.shields = Math.min(this.build.guard === 3 ? 3 : 2, this.shields + 1); this.emit('shield');
    }
    if (this.combo === 10 || this.combo === 25 || this.combo % 50 === 0) this.emit('combo', { count: this.combo });
    this.flushDamage();
    // Per-ball hit budget (levels 2+): a ball that has spent its budget sinks
    // out — endless horizontal weaving is capped by design.
    if (this.L.hitBudget && b.hits >= this.L.hitBudget) { b.alive = false; this.emit('spent', { x: b.x, y: b.y }); }
  }
  chain(origin, count, amount) {
    const ox = origin.x + origin.w / 2, oy = origin.y + origin.h / 2;
    const nearest = this.enemies.filter(e => e.hp > 0 && e.id !== origin.id)
      .map(e => ({ e, d: Math.hypot(e.x + e.w / 2 - ox, e.y + e.h / 2 - oy) }))
      .filter(o => o.d < 118 + 24 * (this.build.spark || 1)).sort((a, b) => a.d - b.d).slice(0, count);
    for (const { e } of nearest) {
      let damage = amount;
      if (e.ice) { damage *= 1 + (this.build.ice || 1); e.ice = false; }
      this.emit('chain', { x1: ox, y1: oy, x2: e.x + e.w / 2, y2: e.y + e.h / 2 });
      this.deal(e, damage, 'chain');
    }
  }
  deal(e, amount, source) { if (e.hp > 0 && this.queue.length < CONFIG.maxEffectOps) this.queue.push({ e, amount, source }); }
  flushDamage() {
    while (this.queue.length && this.ops++ < CONFIG.maxEffectOps) {
      const { e, amount, source } = this.queue.shift(); if (e.hp <= 0) continue;
      e.hp -= Math.max(.1, amount); e.hit = this.time;
      this.score += Math.max(1, Math.round(Math.min(e.maxHp, amount) * 4));
      this.emit('hit', { id: e.id, x: e.x + e.w / 2, y: e.y + e.h / 2, damage: amount, source });
      if (e.hp <= 0) this.destroyEnemy(e);
    }
    this.queue.length = 0;
  }
  destroyEnemy(e) {
    this.kills++; this.fireflyCount++; this.score += e.type === 'boss' ? 600 : 35 + this.wave * 4;
    const x = e.x + e.w / 2, y = e.y + e.h / 2;
    this.emit('kill', { x, y, kind: e.type });
    if (e.id === this.markedId) { this.hunterBuff = this.build.hunter || 0; this.emit('hunter'); }
    if (e.type === 'gift') { this.ballBonus = Math.min(8, this.ballBonus + 1); this.emit('gift', { x, y }); }
    if (e.type === 'boss') { this.bosses++; this.hearts = Math.min(this.maxHearts, this.hearts + 1); this.score += 100 * this.wave; this.pendingReward = true; this.emit('bossKill', { x, y }); }
    // Peach's innate talent: the first kill of every volley always explodes.
    const peachBurst = this.cat === 'peach' && !this.firstKillDone && e.type !== 'bomb';
    if (peachBurst) { this.firstKillDone = true; this.emit('talent', { cat: 'peach', x, y }); }
    if (e.type === 'bomb' || this.build.blast || peachBurst) {
      const blastLv = this.build.blast || 1;
      const radius = e.type === 'bomb' ? 98 : 64 + 10 * blastLv;
      const damage = e.type === 'bomb' ? this.damage * 3 + this.wave : this.damage * (1 + blastLv);
      this.emit('boom', { x, y, radius });
      for (const other of this.enemies) if (other.hp > 0 && Math.hypot(other.x + other.w / 2 - x, other.y + other.h / 2 - y) <= radius) this.deal(other, damage, 'boom');
    }
    if (this.build.firefly && this.fireflyCount % (4 - this.build.firefly) === 0) {
      for (const vx of [-CONFIG.ballSpeed, CONFIG.ballSpeed]) this.createBall(x, y, vx, -110, true);
    }
  }
  finishShot() {
    this.enemies = this.enemies.filter(e => e.hp > 0);
    this.playerX = this.nextX ?? this.playerX;
    this.score += this.combo >= 10 ? this.combo * 3 : 0;
    this.emit('volleyEnd', { combo: this.combo });
    // A wave passes only when every enemy is destroyed; leaks never clear a wave.
    if (this.enemies.length) {
      this.advanceEnemies();
      if (this.phase === 'end') return;
    }
    if (!this.enemies.length && this.mode !== 'endless' && this.wave >= this.L.waves) { this.end(true, '夜市守住了'); return; }
    if (this.pendingReward) {
      // Boss down: the run's only free upgrade. No carry-over penalty on this volley.
      this.pendingReward = false; this.rewardViaAd = false; this.extraPick = false; this.stallStreak = 0;
      this.phase = 'reward'; this.rewardCount++; this.offers = this.rollOffers(); this.emit('reward', { via: 'boss' });
      return;
    }
    if (!this.enemies.length) { this.stallStreak = 0; this.nextWave(); return; }
    // Wave not cleared: consecutive failures escalate (1, 2, 3… hearts, shields
    // cannot block), and the leftovers join the next wave. On the final wave
    // there is no next wave — the mess stays until it is cleaned up.
    this.stallStreak++;
    const penalty = this.L.stallRamp ? Math.max(1, Math.round(this.stallStreak * this.L.stallRamp)) : 1;
    this.hearts -= penalty;
    this.emit('stalled', { remaining: this.enemies.length, penalty });
    if (this.hearts <= 0) { this.hearts = 0; this.end(false, '打烊了，捣蛋鬼还没清完'); return; }
    if (this.mode === 'endless' || this.wave < this.L.waves) { this.emit('carryover', { count: this.enemies.length }); this.nextWave(); return; }
    this.phase = 'aim'; this.hunterBuff = 0; this.markTarget(); this.emit('wave', { wave: this.wave });
  }
  advanceEnemies() {
    const step = CONFIG.cell * (this.wave >= this.L.rushWave ? 2 : 1);
    const escaped = [];
    for (const e of this.enemies) {
      e.y += step;
      if (e.y + e.h >= this.L.danger) {
        if (e.type === 'boss') { this.hearts = 0; this.emit('damage', { boss: true }); }
        else escaped.push(e);
      }
    }
    if (this.hearts <= 0) { this.hearts = 0; this.end(false, '捣蛋王直接把摊子掀了'); return; }
    for (const e of escaped) {
      this.emit('leak', { x: e.x + e.w / 2, y: this.L.danger });
      if (this.shields > 0) { this.shields--; this.emit('block'); }
      else { this.hearts--; this.emit('damage', { boss: false }); }
      // Escapees re-enter at the top of their column: they must still be destroyed.
      const col = clamp(Math.round((e.x - CONFIG.gridLeft) / CONFIG.cell), 0, CONFIG.columns - 1);
      let row = 0;
      while (this.enemies.some(o => o !== e && o.hp > 0 && Math.round((o.x - CONFIG.gridLeft) / CONFIG.cell) === col && Math.round((o.y - CONFIG.gridTop) / CONFIG.cell) === row)) row++;
      e.y = CONFIG.gridTop + row * CONFIG.cell;
    }
    if (this.hearts <= 0) { this.hearts = 0; this.end(false, '捣蛋鬼把夜市挤爆了'); }
  }
  rollOffers() {
    const available = UPGRADES.filter(u => (this.build[u.id] || 0) < u.max);
    if (!available.length) return ['repair', 'balls', 'shield'];
    const shuffled = this.rng.shuffle(available);
    // One new behavior among choices whenever the pool still has an unowned behavior.
    const fresh = shuffled.find(u => !this.build[u.id]);
    const chosen = shuffled.slice(0, 3);
    if (fresh && !chosen.some(u => !this.build[u.id])) chosen[2] = fresh;
    const ids = chosen.map(u => u.id);
    for (const id of ['repair', 'balls', 'shield']) if (ids.length < 3) ids.push(id);
    return ids;
  }
  reroll() { if (this.phase !== 'reward' || this.rerolls <= 0) return false; this.rerolls--; this.offers = this.rollOffers(); return true; }
  // Rewarded-ad placements (ad SDK is a placeholder in PlatformService):
  // 'boss_double' — inside a boss reward panel, pick a second upgrade;
  // 'extra_upgrade' — from the field, open a fresh three-choice panel.
  adDouble() {
    if (this.phase !== 'reward' || this.adRewards <= 0 || this.extraPick) return false;
    this.adRewards--; this.extraPick = true; this.emit('adReward', { placement: 'boss_double', remaining: this.adRewards }); return true;
  }
  grantAdReward() {
    if (this.phase !== 'aim' || this.adRewards <= 0) return false;
    this.adRewards--; this.extraPick = false; this.rewardViaAd = true;
    this.phase = 'reward'; this.rewardCount++; this.offers = this.rollOffers();
    this.emit('adReward', { placement: 'extra_upgrade', remaining: this.adRewards }); this.emit('reward', { via: 'ad' }); return true;
  }
  afterReward() {
    this.offers = []; this.extraPick = false; this.rewardViaAd = false;
    // After a boss reward the run moves on too: leftovers carry into the next
    // wave — except on the final wave, where they must be cleaned up first.
    if (this.enemies.length && this.mode !== 'endless' && this.wave >= this.L.waves) {
      this.phase = 'aim'; this.hunterBuff = 0; this.markTarget(); this.emit('wave', { wave: this.wave });
    } else this.nextWave();
  }
  chooseUpgrade(id) {
    if (this.phase !== 'reward' || !this.offers.includes(id)) return false;
    const previous = activeSynergies(this.build).map(s => s.id);
    if (id === 'repair') this.hearts = Math.min(this.maxHearts, this.hearts + 1);
    else if (id === 'balls') this.ballBonus = Math.min(8, this.ballBonus + 1);
    else if (id === 'shield') this.shields = Math.min(this.build.guard === 3 ? 3 : 2, this.shields + 1);
    else if (UPGRADE_BY_ID[id]) this.build[id] = Math.min(UPGRADE_BY_ID[id].max, (this.build[id] || 0) + 1);
    else return false;
    this.emit('upgrade', { id, level: this.build[id] || 1 });
    for (const s of activeSynergies(this.build)) if (!previous.includes(s.id)) this.emit('synergy', { name: s.name });
    if (this.extraPick) { this.extraPick = false; this.rewardViaAd = true; this.offers = this.rollOffers(); this.emit('reward', { via: 'ad' }); return true; }
    this.afterReward(); return true;
  }
  skipUpgrade() { if (this.phase !== 'reward') return false; this.hearts = Math.min(this.maxHearts, this.hearts + 1); this.emit('upgrade', { id: 'repair', level: 1 }); this.afterReward(); return true; }
  nextWave() {
    this.wave++;
    if (this.wave === this.L.rushWave) this.emit('rush');
    this.spawnRow();
    this.phase = 'aim'; this.hunterBuff = 0; this.markTarget(); this.emit('wave', { wave: this.wave });
  }
  end(victory, reason) { this.phase = 'end'; this.victory = victory; this.endReason = reason; this.balls = []; this.pending = 0; this.emit('end', { victory, reason }); }
  snapshot() {
    if (!['aim', 'reward'].includes(this.phase)) return null;
    return JSON.parse(JSON.stringify({ version: 1, seed: this.seed, rng: this.rng.state,
      mode: this.mode, cat: this.cat, daily: this.daily, level: this.level, wave: this.wave, shots: this.shots,
      hearts: this.hearts, shields: this.shields, score: this.score, kills: this.kills, bosses: this.bosses,
      maxCombo: this.maxCombo, playerX: this.playerX, ballBonus: this.ballBonus, build: this.build,
      enemies: this.enemies, phase: this.phase, offers: this.offers, nextId: this.nextId,
      rerolls: this.rerolls, elapsed: this.elapsed, rewardCount: this.rewardCount,
      adRewards: this.adRewards, extraPick: this.extraPick, rewardViaAd: this.rewardViaAd, stallStreak: this.stallStreak }));
  }
  static restore(s) {
    if (!s || s.version !== 1 || !['aim', 'reward'].includes(s.phase) || !Array.isArray(s.enemies) || s.enemies.length > CONFIG.maxEnemies) throw Error('Invalid checkpoint');
    const ranges = { seed: [0, 4294967295], rng: [0, 4294967295], wave: [1, 10000], shots: [0, 20000], hearts: [1, CONFIG.maxHearts], shields: [0, 3], score: [0, 1e12], kills: [0, 1e8], bosses: [0, 1e5], maxCombo: [0, 1e6], playerX: [15, 405], ballBonus: [0, 8], nextId: [1, 1e8], rerolls: [0, 1], elapsed: [0, 1e9], rewardCount: [0, 10000], adRewards: [0, CONFIG.adRewardLimit], stallStreak: [0, 10000] };
    for (const [key, [low, high]] of Object.entries(ranges)) if (!finite(s[key]) || s[key] < low || s[key] > high || (!['elapsed', 'playerX'].includes(key) && !Number.isInteger(s[key]))) throw Error(`Invalid checkpoint field: ${key}`);
    if (typeof s.extraPick !== 'boolean' || typeof s.rewardViaAd !== 'boolean' || (s.extraPick && s.phase !== 'reward')) throw Error('Invalid ad state');
    if (!['normal', 'daily', 'endless'].includes(s.mode) || !CATS.some(c => c.id === s.cat)) throw Error('Invalid mode');
    if (!s.build || typeof s.build !== 'object' || Array.isArray(s.build)) throw Error('Invalid build');
    for (const [id, level] of Object.entries(s.build)) if (!UPGRADE_BY_ID[id] || !Number.isInteger(level) || level < 1 || level > UPGRADE_BY_ID[id].max) throw Error('Invalid upgrade');
    if (!Array.isArray(s.offers) || s.offers.length > 3 || s.offers.some(id => !UPGRADE_BY_ID[id] && !['repair', 'balls', 'shield'].includes(id)) || (s.phase === 'reward' && s.offers.length === 0)) throw Error('Invalid offers');
    const ids = new Set();
    for (const e of s.enemies) {
      if (!e || !Number.isInteger(e.id) || e.id < 1 || e.id >= s.nextId || ids.has(e.id)) throw Error('Invalid enemy ID'); ids.add(e.id);
      for (const key of ['x', 'y', 'w', 'h', 'hp', 'maxHp']) if (!finite(e[key])) throw Error('Invalid enemy');
      if (e.x < 15 || e.x + e.w > 405 || e.y < 28 || e.y + e.h >= CONFIG.danger || e.w < 10 || e.w > 100 || e.h !== CONFIG.block || e.hp <= 0 || e.hp > e.maxHp || e.maxHp > 1e8) throw Error('Out of bounds enemy');
      if (!['plain', 'bomb', 'armor', 'gift', 'boss'].includes(e.type)) throw Error('Invalid enemy type');
    }
    const level = s.level === undefined ? 2 : s.level; // pre-1.4 checkpoints default to L2 rules
    if (!Number.isInteger(level) || level < 1 || level > LEVELS.length) throw Error('Invalid level');
    const g = new Engine({ seed: s.seed, mode: s.mode, cat: s.cat, daily: s.daily, level });
    for (const key of Object.keys(ranges)) if (key !== 'rng') g[key] = s[key];
    g.rng.state = s.rng >>> 0; g.phase = s.phase; g.build = { ...s.build }; g.offers = [...s.offers];
    g.extraPick = s.extraPick; g.rewardViaAd = s.rewardViaAd;
    g.enemies = s.enemies.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, hp: e.hp, maxHp: e.maxHp,
      type: e.type, ice: !!e.ice, armor: !!e.armor, tapped: !!e.tapped, hit: -100 }));
    g.markTarget(); g.events = []; return g;
  }
}
