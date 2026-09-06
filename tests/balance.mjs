import fs from 'node:fs';
import { Engine } from '../src/game/engine.js';
import { Random } from '../src/core/random.js';
import { CONFIG } from '../src/data/config.js';

export function chooseAim(g, policy = 'priority', rng = new Random(g.seed)) {
  if (g.shots === 0 && policy !== 'random') return { x: 208, y: 190 };
  if (policy === 'random') { const a = (rng.next() - .5) * 2.5; return { x: g.playerX + Math.sin(a) * 500, y: CONFIG.launchY - Math.cos(a) * 500 }; }
  if (policy === 'center') return { x: 210, y: 80 };
  const priority = g.enemies.filter(e => e.hp > 0).map(e => ({ e, weight: e.y * 1.2 + (e.type === 'boss' ? 58 : e.type === 'bomb' ? 85 : 0) - e.hp * .3 })).sort((a, b) => b.weight - a.weight);
  const e = priority[0]?.e;
  if (!e) return { x: 210, y: 50 };
  const x = e.x + e.w / 2, y = e.y + e.h / 2;
  if (policy === 'bank' && rng.next() < .7 && e.y < 360) return { x: x > g.playerX ? 2 * (CONFIG.left + 5) - x : 2 * (CONFIG.right - 5) - x, y };
  return { x, y };
}
export function chooseUpgrade(g, policy = 'balanced', rng = new Random(g.seed + g.wave)) {
  const preferences = policy === 'explosion' ? ['blast', 'laser', 'firefly', 'split', 'spark', 'ice', 'return', 'wall', 'guard', 'drill', 'pierce', 'hunter']
    : policy === 'ricochet' ? ['wall', 'return', 'ice', 'pierce', 'split', 'guard', 'spark', 'drill', 'hunter', 'laser', 'firefly', 'blast']
    : policy === 'random' ? rng.shuffle(g.offers)
    : ['split', 'blast', 'spark', 'ice', 'laser', 'return', 'guard', 'wall', 'pierce', 'firefly', 'drill', 'hunter'];
  return [...g.offers].sort((a, b) => preferences.indexOf(a) - preferences.indexOf(b))[0];
}
export function simulate(seed, aimPolicy = 'priority', upgradePolicy = 'balanced', mode = 'normal') {
  const g = new Engine({ seed, mode }); const rng = new Random(seed + 9876);
  let iterations = 0, maxBalls = 0, maxEnemies = 0, firstReward = null, maxShot = 0;
  while (g.phase !== 'end' && iterations++ < 1000000 && g.shots < (mode === 'endless' ? 120 : 40)) {
    if (g.phase === 'aim') { const aim = chooseAim(g, aimPolicy, rng); g.shoot(aim.x, aim.y); }
    else if (g.phase === 'reward') { if (firstReward === null) firstReward = g.elapsed; g.chooseUpgrade(chooseUpgrade(g, upgradePolicy, rng)); }
    else g.step(1 / 60);
    maxBalls = Math.max(maxBalls, g.balls.length); maxEnemies = Math.max(maxEnemies, g.enemies.length); maxShot = Math.max(maxShot, g.shotTime);
    g.drainEvents();
    if (![g.score, g.wave, g.hearts, g.elapsed, ...g.balls.flatMap(b => [b.x, b.y, b.vx, b.vy])].every(Number.isFinite)) throw Error('Non-finite state at seed ' + seed);
  }
  return { seed, aimPolicy, upgradePolicy, mode, victory: g.victory, ended: g.phase === 'end', wave: g.wave, shots: g.shots, score: g.score, combo: g.maxCombo,
    flightSeconds: +g.elapsed.toFixed(2), firstReward: firstReward === null ? null : +firstReward.toFixed(2), maxBalls, maxEnemies, maxShot: +maxShot.toFixed(3), build: g.build };
}
function summarize(rows) {
  const mean = key => +(rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(2);
  const sorted = rows.map(r => r.flightSeconds).sort((a, b) => a - b);
  return { runs: rows.length, ended: rows.filter(r => r.ended).length, wins: rows.filter(r => r.victory).length,
    winRate: +(rows.filter(r => r.victory).length / rows.length).toFixed(3), meanWave: mean('wave'), meanShots: mean('shots'),
    meanFlightSeconds: mean('flightSeconds'), p50FlightSeconds: sorted[Math.floor(sorted.length * .5)], p95FlightSeconds: sorted[Math.floor(sorted.length * .95)],
    maxBalls: Math.max(...rows.map(r => r.maxBalls)), maxEnemies: Math.max(...rows.map(r => r.maxEnemies)), maxCombo: Math.max(...rows.map(r => r.combo)) };
}
if (process.argv[1]?.endsWith('balance.mjs')) {
  const perPolicy = Number(process.env.SIM_RUNS || 75);
  const policies = [['random', 'random'], ['center', 'balanced'], ['priority', 'balanced'], ['bank', 'balanced'], ['priority', 'explosion'], ['priority', 'ricochet']];
  const results = [], groups = {};
  const started = Date.now();
  for (const [aim, upgrades] of policies) {
    const rows = [];
    for (let i = 0; i < perPolicy; i++) rows.push(simulate(i + 1, aim, upgrades));
    results.push(...rows); groups[aim + '/' + upgrades] = summarize(rows); console.log(aim + '/' + upgrades, JSON.stringify(groups[aim + '/' + upgrades]));
  }
  const report = { generatedAt: new Date().toISOString(), config: CONFIG, perPolicy, simulatedRuns: results.length,
    disclaimer: 'Deterministic scripted agents, not human retention or new-player win-rate measurements. flightSeconds excludes aiming, reading, pauses and UI. No market probability is inferred.',
    groups, total: summarize(results), executionSeconds: (Date.now() - started) / 1000, results };
  fs.mkdirSync('evidence', { recursive: true }); fs.writeFileSync('evidence/balance-results.json', JSON.stringify(report, null, 2));
}
