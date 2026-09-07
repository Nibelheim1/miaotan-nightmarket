import { CONFIG, CATS, LEVELS } from '../data/config.js';
import { UPGRADE_BY_ID } from '../data/upgrades.js';
import { clamp } from '../core/random.js';

const STORAGE_KEY = 'miaotan-nightmarket-v1';
const INITIAL = { version: 1, runs: 0, wins: 0, stamps: 0, kills: 0, bestCombo: 0, bestWave: 0, bestScore: 0,
  cat: 'mint', tutorialDone: false, unlocked: ['mint'], unlockedLevels: [1], selectedLevel: 1, records: [], discovered: [], achievements: [],
  settings: { sound: true, music: true, volume: .42, reducedMotion: false }, checkpoint: null };
export function defaultProfile() { return JSON.parse(JSON.stringify(INITIAL)); }
function nonneg(n, max = 1e12) { return typeof n === 'number' && Number.isFinite(n) ? clamp(Math.floor(n), 0, max) : 0; }
export function validateProfile(raw) {
  const p = defaultProfile(); if (!raw || raw.version !== 1 || typeof raw !== 'object') return p;
  for (const k of ['runs', 'wins', 'stamps', 'kills', 'bestCombo', 'bestWave', 'bestScore']) p[k] = nonneg(raw[k]);
  p.unlocked = Array.isArray(raw.unlocked) ? [...new Set(['mint', ...raw.unlocked.filter(id => CATS.some(c => c.id === id))])] : ['mint'];
  p.unlockedLevels = Array.isArray(raw.unlockedLevels) ? [...new Set([1, ...raw.unlockedLevels.filter(l => Number.isInteger(l) && l >= 1 && l <= LEVELS.length)])] : [1];
  p.selectedLevel = p.unlockedLevels.includes(raw.selectedLevel) ? raw.selectedLevel : 1;
  p.cat = p.unlocked.includes(raw.cat) ? raw.cat : 'mint'; p.tutorialDone = raw.tutorialDone === true;
  p.discovered = Array.isArray(raw.discovered) ? [...new Set(raw.discovered.filter(id => UPGRADE_BY_ID[id]))] : [];
  p.achievements = Array.isArray(raw.achievements) ? raw.achievements.filter(id => ['boss', 'combo', 'win', 'collector'].includes(id)) : [];
  p.records = Array.isArray(raw.records) ? raw.records.slice(0, 30).filter(r => r && typeof r === 'object' && ['normal', 'daily', 'endless'].includes(r.mode)).map(r => ({ score: nonneg(r.score), wave: nonneg(r.wave, 10000), combo: nonneg(r.combo, 1e6), victory: !!r.victory, mode: r.mode, level: Number.isInteger(r.level) && r.level >= 0 && r.level <= LEVELS.length ? r.level : 0, seed: nonneg(r.seed, 4294967295), date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '', seconds: nonneg(r.seconds, 1e8) })) : [];
  if (raw.settings && typeof raw.settings === 'object') {
    p.settings.sound = raw.settings.sound !== false; p.settings.music = raw.settings.music !== false; p.settings.reducedMotion = raw.settings.reducedMotion === true;
    p.settings.volume = typeof raw.settings.volume === 'number' && Number.isFinite(raw.settings.volume) ? clamp(raw.settings.volume, 0, 1) : .42;
  }
  p.checkpoint = raw.checkpoint && typeof raw.checkpoint === 'object' ? raw.checkpoint : null;
  return p;
}
export class StorageService {
  constructor(backend) {
    this.available = true; this.memory = null;
    try { this.backend = backend === undefined ? globalThis.localStorage : backend; if (!this.backend) this.available = false; }
    catch { this.backend = null; this.available = false; }
  }
  load() {
    let text = null;
    try { text = this.backend?.getItem(STORAGE_KEY); } catch { this.available = false; }
    if (text && text.length < 200000) { try { return validateProfile(JSON.parse(text)); } catch { /* Corrupt data is not a storage permission failure. */ } }
    return this.memory ? validateProfile(this.memory) : defaultProfile();
  }
  save(profile) { this.memory = JSON.parse(JSON.stringify(profile)); try { if (!this.backend) { this.available = false; return false; } this.backend.setItem(STORAGE_KEY, JSON.stringify(profile)); this.available = true; return true; } catch { this.available = false; return false; } }
  reset() { this.memory = null; try { this.backend?.removeItem(STORAGE_KEY); } catch { this.available = false; } }
}
export class AnalyticsService {
  constructor() { this.events = []; this.session = `local-${Date.now().toString(36)}`; }
  track(name, data = {}) { this.events.push({ name, data, timestamp: new Date().toISOString(), session: this.session }); if (this.events.length > 256) this.events.shift(); }
  export() { return JSON.stringify({ game: 'miaotan-nightmarket', version: CONFIG.gameVersion, network: 'none', events: this.events }, null, 2); }
}
export class LeaderboardService {
  constructor(profile) { this.profile = profile; }
  list(mode, daily = '') { return this.profile.records.filter(r => r.mode === mode && (mode !== 'daily' || r.date === daily)).sort((a, b) => b.score - a.score).slice(0, 10); }
}
export class PlatformService {
  constructor() { this.name = 'local-web'; this.capabilities = Object.freeze({ remoteLogin: false, ads: false, payment: false, cloudSave: false, globalLeaderboard: false }); }
  async initialize() { return this.capabilities; }
  // An actual TapTap bridge must be inserted here; no invented SDK calls or fake users.
  async submitScore() { return { submitted: false, reason: 'LOCAL_ONLY' }; }
  // Placeholder for a real rewarded-ad SDK bridge. The game economy (boss_double /
  // extra_upgrade placements, 3-per-run cap) is fully wired; this stub always
  // "completes" so flows are testable before ad access exists. capabilities.ads
  // stays false until a real SDK is integrated — never claim ads are live.
  async showRewardedAd(placement = 'extra_upgrade') {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { completed: true, placement, placeholder: true };
  }
}
export function recordRun(profile, game, seconds, date) {
  profile.runs++; if (game.victory) profile.wins++;
  profile.kills += game.kills; profile.bestCombo = Math.max(profile.bestCombo, game.maxCombo);
  profile.bestWave = Math.max(profile.bestWave, game.wave); profile.bestScore = Math.max(profile.bestScore, game.score);
  const level = game.mode === 'normal' ? (game.level || 2) : 0;
  const earned = game.kills > 0 ? Math.round(Math.min(16, 1 + Math.floor(game.kills / 9) + game.bosses * 2 + (game.victory ? 4 : 0)) * (level ? LEVELS[level - 1].stampMult : 1)) : 0;
  profile.stamps += earned;
  const unlocked = [];
  for (const cat of CATS) if (profile.stamps >= cat.cost && !profile.unlocked.includes(cat.id)) { profile.unlocked.push(cat.id); unlocked.push(cat.name); }
  // Clearing a campaign level opens the next one.
  let unlockedLevel = 0;
  if (game.victory && game.mode === 'normal' && level >= 1 && level < LEVELS.length && !profile.unlockedLevels.includes(level + 1)) {
    profile.unlockedLevels.push(level + 1); unlockedLevel = level + 1;
  }
  profile.discovered = [...new Set([...profile.discovered, ...Object.keys(game.build)])];
  for (const [id, condition] of [['boss', game.bosses > 0], ['combo', game.maxCombo >= 50], ['win', game.victory], ['collector', profile.discovered.length >= 10]]) if (condition && !profile.achievements.includes(id)) profile.achievements.push(id);
  profile.records.push({ score: game.score, wave: game.wave, combo: game.maxCombo, victory: game.victory, mode: game.mode, seed: game.seed, level, date: game.mode === 'daily' ? game.daily : date, seconds: Math.round(seconds) });
  profile.records = profile.records.sort((a, b) => b.score - a.score).slice(0, 30); profile.checkpoint = null;
  return { earned, unlocked, unlockedLevel };
}
export function resultTitle(game) {
  if (game.victory && game.hearts === 1) return '一血守摊传说';
  if (game.maxCombo >= 150) return '整条街都在弹';
  if (game.build.blast && game.build.laser) return '全街烟花总导演';
  if (game.build.split && game.build.pierce) return '猫爪暴雨制造者';
  if (game.build.spark && game.build.ice) return '雷打冰糖发明家';
  if (game.victory) return '夜市守护喵';
  if (game.bosses > 0) return '捣蛋王克星';
  return '深夜开摊新星';
}
export class ShareService {
  constructor() { this.lastUrl = null; }
  async card(game, seconds) {
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 960;
    const c = canvas.getContext('2d'); if (!c) throw Error('无法生成战绩卡');
    c.fillStyle = '#151c2c'; c.fillRect(0, 0, 720, 960);
    c.fillStyle = '#92e3c0'; c.fillRect(44, 54, 8, 120);
    c.fillStyle = '#fff4df'; c.font = '900 66px system-ui, sans-serif'; c.fillText('喵弹夜市', 77, 114);
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#a6b1c9'; c.fillText('MIDNIGHT BOUNCE CLUB', 80, 159);
    c.fillStyle = '#ff7898'; c.font = 'bold 32px system-ui, sans-serif'; c.fillText(resultTitle(game), 56, 258);
    c.fillStyle = '#ffe2a1'; c.font = '900 102px system-ui, sans-serif'; c.fillText(game.score.toLocaleString('en-US'), 51, 377);
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#a6b1c9'; c.fillText('今晚营业额 · 只和这条街的猫比', 59, 419);
    const stats = [`撑到第 ${game.wave} 波`, `${game.maxCombo} 连击`, `${game.bosses} 位大王`];
    c.fillStyle = '#fff4df'; c.font = 'bold 28px system-ui, sans-serif'; stats.forEach((t, i) => c.fillText(t, 56 + i * 224, 495));
    c.strokeStyle = '#364258'; c.beginPath(); c.moveTo(56, 541); c.lineTo(665, 541); c.stroke();
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#92e3c0'; c.fillText('今晚的秘制配方', 56, 589);
    Object.entries(game.build).slice(0, 8).forEach(([id, lv], i) => {
      c.fillStyle = '#293249'; c.fillRect(56 + (i % 2) * 310, 619 + Math.floor(i / 2) * 50, 293, 38);
      c.fillStyle = '#fff4df'; c.font = '21px system-ui, sans-serif'; c.fillText(`${UPGRADE_BY_ID[id]?.name || id} ${'I'.repeat(lv)}`, 70 + (i % 2) * 310, 646 + Math.floor(i / 2) * 50);
    });
    c.fillStyle = '#a6b1c9'; c.font = '19px system-ui, sans-serif';
    c.fillText(`${game.mode === 'daily' ? '每日同题 ' + game.daily : game.mode === 'endless' ? '无尽夜班' : '夜市保卫战'} · 摆了 ${Math.round(seconds)} 秒`, 56, 865);
    c.fillText(`种子 ${game.seed} · 同款摊子，欢迎踢馆`, 56, 899);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('浏览器不支持图片导出');
    if (this.lastUrl) URL.revokeObjectURL(this.lastUrl); this.lastUrl = URL.createObjectURL(blob);
    return { blob, url: this.lastUrl };
  }
  async nativeShare(blob) {
    const file = new File([blob], 'miaotan-score.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: '喵弹夜市', files: [file] }); return true; }
    return false;
  }
}
