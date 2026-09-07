import { CONFIG, CATS, ENEMY_NAMES, LEVELS } from './data/config.js';
import { UPGRADES, UPGRADE_BY_ID, SYNERGIES, activeSynergies } from './data/upgrades.js';
import { hashSeed, dailyKey, clamp } from './core/random.js';
import { Engine } from './game/engine.js';
import { Renderer } from './game/render.js';
import { AudioEngine } from './audio/audio.js';
import { icon, catArt } from './ui/icons.js';
import { StorageService, AnalyticsService, LeaderboardService, PlatformService, ShareService, recordRun, resultTitle } from './platform/services.js';

const $ = id => document.getElementById(id);
const storage = new StorageService(), analytics = new AnalyticsService(), platform = new PlatformService(), share = new ShareService();
let profile = storage.load();
const audio = new AudioEngine(), renderer = new Renderer($('board'));
let game = null, home = true, paused = false, aux = null, panelReturn = 'home';
let aim = { x: 208, y: 190 }, pointer = null, speed = 1, lastPhase = '', lastOverlay = '';
let activeSeconds = 0, runId = '', recorded = false, earnings = { earned: 0, unlocked: [] };
let accumulator = 0, lastFrame = 0, statClock = 0, toastUntil = 0, shareCard = null, recordMode = 'normal';
let frameSamples = [], returnFocus = null;
const query = new URLSearchParams(location.search), debug = query.has('debug');
const today = () => dailyKey();
analytics.track('game_open', { version: CONFIG.gameVersion, platform: platform.name });
void platform.initialize();

function save() { storage.save(profile); $('storage-warning').hidden = storage.available; document.querySelector('.phone').classList.toggle('storage-blocked', !storage.available); }
function applySettings() {
  audio.enabled = profile.settings.sound; audio.music = profile.settings.music;
  audio.setVolume(profile.settings.volume); audio.setEnabled(profile.settings.sound);
  renderer.reducedMotion = profile.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  updateSoundButtons();
}
function updateSoundButtons() {
  for (const id of ['sound', 'home-sound']) { $(id).innerHTML = icon(profile.settings.sound ? 'sound' : 'mute', 19); $(id).setAttribute('aria-label', profile.settings.sound ? '关闭声音' : '开启声音'); }
}
function toast(text, seconds = 2.4) { $('toast').textContent = text; $('toast').classList.add('visible'); toastUntil = performance.now() + seconds * 1000; }
function syncSize() {
  document.documentElement.style.setProperty('--vh', `${Math.round(window.visualViewport?.height || window.innerHeight)}px`);
  if (!home) { const r = $('board-holder').getBoundingClientRect(); renderer.resize(r.width, r.height, window.devicePixelRatio || 1); }
}
function renderHome() {
  const cat = CATS.find(c => c.id === profile.cat) || CATS[0];
  $('brand-paw').innerHTML = icon('paw', 19); $('hero-art').innerHTML = catArt(cat.color);
  $('cat-picker').innerHTML = CATS.map(c => {
    const locked = !profile.unlocked.includes(c.id);
    return `<button class="cat-option ${profile.cat === c.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-cat="${c.id}" aria-pressed="${profile.cat === c.id}"><span style="color:${c.color}">${icon('paw', 14)} ${c.name}</span><small>${locked ? `攒 ${c.cost} 枚印章请回家` : c.role}</small></button>`;
  }).join('');
  $('cat-info').textContent = `${cat.description}${cat.talent ? ' · ' + cat.talent : ''} · 兜里印章 ${profile.stamps} 枚`;
  const bestByLevel = {};
  for (const r of profile.records) if (r.mode === 'normal' && r.level) bestByLevel[r.level] = Math.max(bestByLevel[r.level] || 0, r.wave);
  $('level-picker').innerHTML = LEVELS.map(l => {
    const locked = !profile.unlockedLevels.includes(l.id);
    const cleared = profile.unlockedLevels.includes(l.id + 1) || (l.id === LEVELS.length && profile.records.some(r => r.mode === 'normal' && r.level === l.id && r.victory));
    return `<button class="level-chip ${profile.selectedLevel === l.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-level="${l.id}" aria-pressed="${profile.selectedLevel === l.id}"><b>${locked ? '🔒' : cleared ? '✓' : `第${l.id}关`}</b><span>${l.name}</span><small>${locked ? '通关上一关解锁' : cleared ? `已守住了 · ${l.waves}波` : `${l.waves}波 · ${l.tip}`}</small></button>`;
  }).join('');
  $('start').innerHTML = `立即开摊 <span>第${profile.selectedLevel}关 · ${LEVELS[profile.selectedLevel - 1].name} →</span>`;
  $('continue').hidden = !profile.checkpoint;
  $('daily').innerHTML = `${icon('moon', 17)} 今日同题`;
  $('endless').innerHTML = `${icon('star', 17)} ${profile.achievements.includes('boss') ? '无尽夜班' : '无尽夜班 · 先赢一位大王'}`;
  $('daily-note').textContent = `${today()} · 全网同一锅汤底 · 薄荷掌勺 · 只和这台设备比`;
  $('collection').innerHTML = `${icon('book', 19)}<span>配方手册 ${profile.discovered.length}/12</span>`;
  $('records').innerHTML = `${icon('trophy', 19)}<span>夜市账本</span>`;
  $('settings').innerHTML = `${icon('settings', 19)}<span>设置与玩法</span>`;
  updateSoundButtons();
}
function randomSeed() {
  if (/^\d{1,10}$/.test(query.get('seed') || '')) return Number(query.get('seed')) >>> 0;
  try { const n = new Uint32Array(1); crypto.getRandomValues(n); return n[0]; } catch { return Date.now() >>> 0; }
}
function begin(mode = 'normal', resume = false, seedOverride = null, level = null) {
  void audio.unlock(); audio.pause(false);
  if (resume) {
    try { game = Engine.restore(profile.checkpoint.engine); activeSeconds = Math.max(0, Math.min(1e8, Number(profile.checkpoint.activeSeconds) || 0)); runId = `resume-${Date.now().toString(36)}`; }
    catch { profile.checkpoint = null; save(); renderHome(); toast('上局的账本被猫踩乱了，已帮你收拾好。重新开摊吧。'); return; }
  } else {
    const seed = mode === 'daily' ? hashSeed(`miaotan-v1-${today()}`) : (seedOverride === null ? randomSeed() : seedOverride >>> 0);
    game = new Engine({ seed, mode, cat: mode === 'daily' ? 'mint' : profile.cat, daily: mode === 'daily' ? today() : '', level: mode === 'normal' ? (level ?? profile.selectedLevel) : 2 });
    activeSeconds = 0; runId = `run-${seed}-${Date.now().toString(36)}`;
    if (!profile.tutorialDone) analytics.track('tutorial_start', { runId });
  }
  analytics.track('run_start', { runId, seed: game.seed, mode: game.mode, cat: game.cat, resume });
  home = false; paused = false; aux = null; recorded = false; lastPhase = ''; lastOverlay = '';
  accumulator = 0; speed = 1; pointer = null; shareCard = null;
  aim = { x: game.shots ? game.playerX : 208, y: game.shots ? 150 : 190 };
  $('home').hidden = true; $('game').hidden = false; renderer.clearEffects();
  $('pause').innerHTML = icon('pause', 19); $('speed').textContent = '加速 ×1'; $('speed').classList.remove('active');
  syncSize(); syncPhase(); updateStats(); updateLoadout();
  $('board').focus({ preventScroll: true });
}
function checkpoint() {
  if (!game) return;
  const state = game.snapshot();
  if (state) profile.checkpoint = { engine: state, activeSeconds: Math.round(activeSeconds), runId };
  save();
}
function fire(x, y) {
  if (home || paused || aux || game.phase !== 'aim') return false;
  checkpoint();
  const success = game.shoot(x, y);
  if (success) {
    if (game.shots === 1) {
      analytics.track('first_action', { runId, seconds: Math.round(activeSeconds * 10) / 10 });
      if (!profile.tutorialDone) { profile.tutorialDone = true; analytics.track('tutorial_complete', { runId }); save(); }
    }
    audio.effect('shot'); syncPhase(); updateStats();
  }
  return success;
}
function pauseGame() {
  if (home || !game || game.phase === 'end') return;
  paused = true; pointer = null; audio.pause(true); checkpoint(); lastOverlay = ''; renderOverlay();
}
function resumeGame() { paused = false; aux = null; accumulator = 0; audio.pause(false); void audio.unlock(); lastOverlay = ''; renderOverlay(); $('board').focus({ preventScroll: true }); }
function goHome() {
  if (game && game.phase !== 'end') checkpoint();
  home = true; paused = false; aux = null; pointer = null; accumulator = 0; lastOverlay = '';
  audio.pause(false); $('game').hidden = true; $('home').hidden = false; renderHome(); renderOverlay();
}
function showPanel(name) {
  panelReturn = home ? 'home' : paused ? 'pause' : game?.phase === 'end' ? 'result' : 'game';
  if (!home && game?.phase !== 'end') { paused = true; audio.pause(true); checkpoint(); }
  aux = name; lastOverlay = ''; renderOverlay();
}
function closePanel() {
  aux = null;
  if (panelReturn === 'game') { paused = false; audio.pause(false); }
  lastOverlay = ''; renderOverlay();
}
function syncPhase() {
  if (!game || lastPhase === game.phase) return;
  lastPhase = game.phase;
  if (game.phase === 'aim' || game.phase === 'reward') checkpoint();
  if (game.phase === 'end' && !recorded) {
    recorded = true;
    earnings = recordRun(profile, game, activeSeconds, today()); save();
    analytics.track('run_end', { runId, victory: game.victory, wave: game.wave, score: game.score, maxCombo: game.maxCombo, seconds: Math.round(activeSeconds), build: { ...game.build } });
    for (const cat of earnings.unlocked) analytics.track('progression_unlock', { cat, runId });
    audio.effect(game.victory ? 'win' : 'lose');
  }
  lastOverlay = ''; renderOverlay(); updateStats(); updateLoadout();
}
function handleEvents(events) {
  renderer.consume(events);
  let killSound = false, boomSound = false;
  for (const e of events) {
    if (e.type === 'hit') audio.effect('hit', game.combo);
    if (e.type === 'kill') killSound = true;
    if (e.type === 'boom') boomSound = true;
    if (e.type === 'damage') audio.effect('damage');
    if (e.type === 'boss') { toast(`第 ${e.wave} 波 · 大王来踢馆了！别让它踩过线！`, 3.1); }
    if (e.type === 'rush') toast('夜宵潮来了！从这波起，捣蛋鬼每轮冲 2 格！', 5);
    if (e.type === 'stalled') { toast(e.penalty > 1 ? `连续没清完！打烊倒计时 -${e.penalty} ♥，摊子要撑不住了` : `还剩 ${e.remaining} 只没清完！打烊倒计时 -1 ♥`, 3); audio.effect('damage'); }
    if (e.type === 'carryover') toast(`${e.count} 只漏网的会混进下一波，一起压上来！`, 3.2);
    if (e.type === 'bossKill') toast('大王跑路啦！回 1 颗心，接着营业！');
    if (e.type === 'shield') toast('连击太猛，喵爪护盾到账！');
    if (e.type === 'hunter') toast('铃铛碎了！剩下的弹珠全都更来劲！');
    if (e.type === 'synergy') { toast(`配方出锅：${e.name}！`, 3); audio.effect('synergy'); }
    if (e.type === 'recall') toast('弹珠回家吃饭了，下一杆继续。', 1.4);
    if (e.type === 'upgrade') { analytics.track('upgrade_select', { runId, id: e.id, level: e.level, wave: game.wave }); audio.effect('upgrade'); }
  }
  if (boomSound) audio.effect('boom'); else if (killSound) audio.effect('kill');
}
function updateStats() {
  if (home || !game) return;
  $('mode-label').textContent = `${debug ? '调试 · ' : ''}${game.mode === 'daily' ? '今日同题 ' + game.daily.slice(5) : game.mode === 'endless' ? '无尽夜班' : `第${game.level}关 · ${game.L.name}`}`;
  $('wave-label').innerHTML = `${String(game.wave).padStart(2, '0')} <small>${game.mode === 'endless' ? '/ ∞' : '/ ' + game.L.waves}</small>`;
  $('score-label').textContent = Math.round(game.score).toLocaleString('en-US');
  $('hearts').innerHTML = Array.from({ length: CONFIG.maxHearts }, (_, i) => icon('heart', 15).replace('<svg ', `<svg class="${i < game.hearts ? '' : 'empty'}" `)).join('');
  $('hearts').setAttribute('aria-label', `剩余 ${game.hearts} 颗心`);
  $('shield-label').innerHTML = game.shields ? `${icon('shield', 12)} ${game.shields}` : '';
  $('combo-label').textContent = game.phase === 'flight' ? `${game.combo} 连击${game.combo >= 25 ? '！' : ''}` : `最高 ${game.maxCombo} 连击`;
  $('wave-track').innerHTML = Array.from({ length: game.L.waves }, (_, i) => `<span class="wave-pip ${((i + 1) % game.L.bossEvery === 0 || i + 1 === game.L.waves) ? 'boss' : ''} ${i + 1 < game.wave ? 'done' : i + 1 === game.wave ? 'current' : ''}"></span>`).join('');
  $('ball-label').textContent = `${game.ballCount} 颗弹珠 · ${game.damage} 基础伤害`;
  const adBtn = $('ad-gift');
  adBtn.innerHTML = `${icon('star', 14)} 广告加料 ×${game.adRewards}`;
  adBtn.disabled = game.phase !== 'aim' || game.adRewards <= 0 || paused || !!aux;
  $('action-hint').textContent = game.phase === 'flight' ? '弹珠出动！嫌慢可以加速' : game.wave >= game.L.rushWave ? `夜宵潮！每轮冲 2 格 · 还剩 ${game.enemies.length} 只` : game.mode !== 'endless' && game.wave >= game.L.waves ? `最后一波 · 还剩 ${game.enemies.length} 只 · 必须清完` : `还剩 ${game.enemies.length} 只捣蛋鬼 · 清不完会跟到下一波`;
}
function updateLoadout() {
  if (!game) return;
  $('loadout').innerHTML = Object.entries(game.build).map(([id, level]) => `<button class="loadout-chip ${UPGRADE_BY_ID[id].color}" data-loadout="${id}" aria-label="${UPGRADE_BY_ID[id].name} ${level}级">${icon(UPGRADE_BY_ID[id].icon, 16)}<small>${level}</small></button>`).join('') + `<span class="loadout-note">${activeSynergies(game.build).map(s => s.name).join(' / ') || '点击图标查看改装'}</span>`;
}
function heading(title, label = '') { return `<div class="modal-head"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="关闭菜单">${icon('close', 19)}</button></div>${label ? `<p class="sub">${label}</p>` : ''}`; }
function rewardHtml() {
  const head = game.rewardViaAd
    ? `<p class="modal-overline">AD BREAK · 占位</p><h2>广告加餐，再挑一样！</h2><p class="sub">占位广告已"看完"，接入真实 SDK 前不会弹真广告。</p>`
    : `<p class="modal-overline">BOSS DOWN · 今晚加料</p><h2>大王跑路，趁机加料！</h2><p class="sub">赢来的三选一：别只堆数字，搭一锅连锁。</p>`;
  return `${head}<div class="reward-list">${game.offers.map((id, i) => {
    const u = UPGRADE_BY_ID[id];
    if (!u) return `<button class="upgrade-card" data-upgrade="${id}">${icon('heart')}<div><h3>${id === 'repair' ? '回 1 颗心' : id === 'shield' ? '加 1 层护盾' : '多 1 颗弹珠'}</h3><p>料快配齐了，先补点本钱。</p></div></button>`;
    const lv = game.build[id] || 0;
    const synergy = SYNERGIES.find(s => s.needs.includes(id) && !activeSynergies(game.build).some(a => a.id === s.id) && s.needs.filter(n => n !== id).every(n => game.build[n]));
    return `<button class="upgrade-card" data-upgrade="${id}" aria-label="选择${u.name}"><span class="upgrade-icon ${u.color}">${icon(u.icon, 28)}</span><span class="upgrade-body"><h3>${u.name}<em>${lv ? `升到 ${lv + 1} 级` : '新花样'} · ${u.tag}</em></h3><p>${u.descriptions[lv]}</p>${synergy ? `<span class="synergy-hint">再选它就出锅：${synergy.name}</span>` : ''}</span></button>`;
  }).join('')}</div>${game.extraPick ? '<p class="sub">广告生效：这碗吃完，还能再挑一碗！</p>' : ''}<div class="reward-actions"><button data-action="reroll" ${game.rerolls ? '' : 'disabled'}>${icon('rewind', 14)} 换一锅 · 剩 ${game.rerolls} 次</button><button data-action="ad-double" ${game.adRewards > 0 && !game.extraPick ? '' : 'disabled'}>${icon('play', 14)} 看广告多吃一碗 · 剩 ${game.adRewards} 次</button><button data-action="repair">不加料，回 1 颗心</button></div>`;
}
function resultHtml() {
  return `<p class="modal-overline">${game.victory ? 'THE NIGHT IS OURS' : 'ONE MORE BOUNCE?'}</p><h2>${resultTitle(game)}</h2><p class="sub">${game.victory ? '捣蛋鬼一只不剩，今晚准时收摊！' : `${game.endReason || '捣蛋鬼占了上风'}。擦擦爪子，换锅配方再来。`}</p><div class="score-result">${game.score.toLocaleString('en-US')}</div><div class="score-caption">今晚营业额 · 只记在这台设备上</div><div class="result-stats"><div><b>${game.wave}</b><small>撑到第几波</small></div><div><b>${game.maxCombo}</b><small>最猛连击</small></div><div><b>${Math.round(activeSeconds)}s</b><small>摆摊时长</small></div></div><div class="result-build">${Object.entries(game.build).map(([id, lv]) => `<span>${UPGRADE_BY_ID[id].name} ${'I'.repeat(lv)}</span>`).join('')}</div><div class="earned">印章 +${earnings.earned} · 兜里一共 ${profile.stamps} 枚${earnings.unlockedLevel ? `<br>新关卡开张：第${earnings.unlockedLevel}关 · ${LEVELS[earnings.unlockedLevel - 1].name}！` : ''}${earnings.unlocked.length ? `<br>新店长上岗：${earnings.unlocked.join('、')}！` : !earnings.unlockedLevel ? '<br>攒到 8 / 20 枚印章，就能请新店长上岗。' : ''}</div><button class="button primary full" data-action="restart">${icon('rewind', 18)} 再摆一摊</button><button class="button secondary full" data-action="share">${icon('share', 17)} 把今晚晒出去</button><div class="modal-footer"><button class="text-button" data-action="home">回夜市</button><button class="text-button" data-action="same-seed">同一锅再来</button></div>`;
}
function settingsHtml() {
  const s = profile.settings;
  return `${heading('摊位设置')}<div class="settings-row"><span>声音开关</span><button class="switch ${s.sound ? 'on' : ''}" role="switch" aria-checked="${s.sound}" aria-label="声音开关" data-setting="sound"></button></div><div class="settings-row"><span>夜市背景小曲</span><button class="switch ${s.music ? 'on' : ''}" role="switch" aria-checked="${s.music}" aria-label="背景音乐" data-setting="music"></button></div><div class="settings-row"><label for="volume">音量</label><input id="volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></div><div class="settings-row"><span>少晃一点（减少震动）</span><button class="switch ${s.reducedMotion ? 'on' : ''}" role="switch" aria-checked="${s.reducedMotion}" aria-label="减少屏幕震动" data-setting="reducedMotion"></button></div><button class="button secondary full" data-action="help">${icon('info', 16)} 怎么玩 · 怪物图鉴</button><p class="legal-note">不登录、不传数据、不连统计服务；广告位现在是占位的，接入真 SDK 前不会弹任何真广告。你的印章和账本只存在这台设备的浏览器里，清了浏览器数据就没了。每日同题按 UTC+8 翻篇，不是全球排行榜。<br>中途刷新会回到这一杆出手前；没有云存档。</p><button class="button secondary full" data-action="export-events">导出本次事件记录（JSON）</button><button class="text-button" data-action="reset-prompt">清空这台设备上的进度</button>`;
}
function collectionHtml() {
  const achievements = [['boss', '捣蛋王克星 · 击退一位大王'], ['combo', '全街连击 · 单轮 50 次命中'], ['win', '今晚不加班 · 保卫战通关'], ['collector', '夜市百事通 · 发现 10 种改装']];
  return `${heading('秘密配方手册', `已尝出 ${profile.discovered.length} / 12 种配方。所有料从第一摊起就可能抽到。`)}<div class="collection-grid">${UPGRADES.map(u => `<div class="collection-item ${profile.discovered.includes(u.id) ? '' : 'unseen'}"><span class="${u.color}">${icon(u.icon, 25)}</span><b>${u.name}</b><p>${u.descriptions[0]}</p></div>`).join('')}</div><p class="modal-overline" style="margin-top:20px">夜市纪念章</p>${achievements.map(([id, text]) => `<div class="achievement">${icon(profile.achievements.includes(id) ? 'check' : 'star', 15)} ${text}</div>`).join('')}<p class="legal-note">摊主私房话：雷链配冰糖、分裂配穿心、爆破配热线、借墙配回头客——搭对了，才是一锅好菜。</p>`;
}
function recordsHtml() {
  const list = new LeaderboardService(profile).list(recordMode, today());
  return `${heading('夜市账本', '不编全球排名，只看这台设备上的真成绩。')}<div class="home-secondary" style="grid-template-columns:repeat(3,1fr)">${[['normal', '保卫战'], ['daily', '今日同题'], ['endless', '无尽']].map(([id, name]) => `<button class="button ${recordMode === id ? 'primary' : 'secondary'}" data-record-mode="${id}">${name}</button>`).join('')}</div>${list.length ? list.map((r, i) => `<div class="record-row"><span class="rank">${i + 1}</span><div>${r.victory ? '守住了夜市' : '撑到第 ' + r.wave + ' 波'} · ${r.combo} 连击<small>${r.level ? `第${r.level}关 · ` : ''}${r.date} · ${r.seconds} 秒 · 种子 ${r.seed}</small></div><b>${r.score.toLocaleString('en-US')}</b></div>`).join('') : '<div class="empty-state">账本还空着。<br>收一摊，就写下第一笔。</div>'}`;
}
function helpHtml() {
  return `${heading('摊主修炼手册')}<div class="help-section"><b>怎么出手？</b><br>按住屏幕拖动瞄准，松手就开弹；点一下也行。电脑用鼠标，或左右方向键＋空格。瞄准线只预告第一下会碰到谁，后面的连锁，交给你的想象力。</div><div class="help-section"><b>怎么才算赢？</b><br>保卫战一共 18 波，第 6、12、18 波有大王坐镇。<b>每一波清干净，才能轻装翻篇。</b>一杆没收干净，打烊倒计时扣心——连续失手越扣越多（1、2、3……护盾可不管这个），而且没清完的捣蛋鬼会混进下一波一起压上来。第 18 波是最后一波：没有下家了，必须清完才算守住。弹射完捣蛋鬼照常往前挤；第 13 波起夜宵潮，每轮冲 2 格。普通怪踩过线扣 1 心（护盾能挡），然后溜回街尾重新排队——放走不算数，它还会回来。大王踩线？直接收摊。</div><div class="help-section"><b>看懂场上的朋友</b><span class="enemy-legend gold">● 爆米花怪：打掉它，邻居一起炸。</span><span class="enemy-legend mint">● 招财鱼罐：打掉它，今晚多 1 颗弹珠。</span><span class="enemy-legend blue">● 铁皮罐头：带甲时皮厚；同一颗弹珠连打两下，或用开锁器撬。</span><span class="enemy-legend pink">● 捣蛋王：血厚、块头大；打跑它回 1 颗心。</span></div><div class="help-section"><b>加料从哪来？</b><br>打跑大王（第 6、12、18 波）就能三选一加一料，当时看广告还能再多吃一碗；瞄准的时候，右下角也能主动看广告换料。一晚上最多 3 次广告加料。现在的广告是占位的，不会弹真广告。料快抽齐时，空位会用心、弹珠或护盾补上。</div><div class="help-section"><b>关卡怎么解锁？</b><br>保卫战共 6 关，通关一关，下一关开张。越往后：弹珠命中次数有预算、阵型越刁钻、危险线越近、大王来得越勤。每日同题固定用第 2 关规则，人人同一锅。</div><div class="help-section"><b>为什么还要再来一摊？</b><br>加料每晚清零，印章和店长永远跟着你。玩腻了借墙蓄力，就换爆破或雷电开局。每日同题所有人同一锅汤底、同一位薄荷掌勺；本版只和这台设备的成绩比。赢过一位大王后，无尽夜班开张——过了 18 波，捣蛋鬼会越来越横。</div><div class="help-section"><b>贴心小细节</b><br>最后一颗弹珠不用干等：飞满 11 秒自己回家，也可以手动加速。切去别的 App 会自动暂停，回来点继续就行。刷新页面会回到这一杆之前。存不了档的时候，游戏会明说。</div><button class="button primary full" data-action="back-settings">懂了，回去摆摊</button>`;
}
function renderOverlay() {
  let kind = aux || (!home && paused ? 'pause' : !home && game?.phase === 'reward' ? 'reward' : !home && game?.phase === 'end' ? 'result' : '');
  const key = `${kind}|${game?.offers?.join(',') || ''}|${game?.adRewards}|${game?.extraPick ? 1 : 0}|${game?.rewardViaAd ? 1 : 0}|${recordMode}|${kind === 'settings' ? JSON.stringify(profile.settings) : ''}`;
  if (lastOverlay === key) return; lastOverlay = key;
  $('modal-layer').hidden = !kind; $('home').inert = !!kind; $('game').inert = !!kind;
  if (!kind) { if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true }); returnFocus = null; return; }
  if (!returnFocus) returnFocus = document.activeElement;
  let html = '';
  if (kind === 'reward') html = rewardHtml();
  if (kind === 'result') html = resultHtml();
  if (kind === 'pause') html = `<p class="modal-overline">THE NIGHT CAN WAIT</p><h2>歇口气。</h2><p class="sub">弹珠原地待命，夜市替你看着。</p><div class="pause-list"><button class="button primary" data-action="resume">${icon('play', 17)} 接着营业</button><button class="button secondary" data-action="settings">${icon('settings', 17)} 声音和设置</button><button class="button secondary" data-action="home">存好这摊，回夜市</button><button class="text-button" data-action="abandon">提前收摊（照常结算）</button></div><p class="pause-tip">暂停随时回来接着打；<br>刷新或回主页，会回到这一杆出手前。</p>`;
  if (kind === 'settings') html = settingsHtml();
  if (kind === 'collection') html = collectionHtml();
  if (kind === 'records') html = recordsHtml();
  if (kind === 'help') html = helpHtml();
  if (kind === 'reset') html = `${heading('把摊子清空？')}<p class="sub">店长、印章、账本和没打完的这摊，全都会删掉，找不回来。</p><button class="button secondary full" data-action="back-settings">再想想</button><button class="button full pink" data-action="reset-confirm">清空，不后悔</button>`;
  if (kind === 'share') html = `${heading('把名场面带走')}<img class="share-image" src="${shareCard?.url || ''}" alt="本局积分、连击和改装配方战绩卡"><a class="button primary full" href="${shareCard?.url || '#'}" download="miaotan-score.png">存下战绩卡</a><button class="button secondary full" data-action="native-share">直接分享</button><p class="legal-note">存不了就长按图片试试。战绩卡上没有任何账号信息。</p>`;
  $('modal').innerHTML = html; $('modal').setAttribute('aria-label', { reward: '选择本局改装', result: '本局结算', pause: '游戏暂停', settings: '游戏设置', records: '本机战绩', share: '战绩卡', collection: '改装手册', help: '游戏说明', reset: '清空存档确认' }[kind] || '游戏菜单');
  $('modal').scrollTop = 0; $('modal').focus({ preventScroll: true });
}
function exportText(text, name) {
  const blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function runAd(placement) {
  if (!game || game.phase === 'end') return;
  if (game.adRewards <= 0) { toast('今晚的广告加料用完啦（3 次封顶）。'); return; }
  if (placement === 'extra_upgrade' && (game.phase !== 'aim' || paused || aux)) { toast('站稳了再加料——瞄准的时候才能看广告。'); return; }
  toast('占位广告模拟播放中……', 1.2); audio.effect('click');
  let result = null;
  try { result = await platform.showRewardedAd(placement); } catch { /* Placeholder never throws; real SDK may. */ }
  if (!game || game.phase === 'end') return;
  if (!result?.completed) { toast('广告没看完，这次不算数哦。'); return; }
  const ok = placement === 'boss_double' ? game.adDouble() : game.grantAdReward();
  if (!ok) { toast('这会儿加不了料，等瞄准的时候再试。'); return; }
  analytics.track('ad_reward', { runId, placement, remaining: game.adRewards, placeholder: result.placeholder === true });
  handleEvents(game.drainEvents()); syncPhase(); updateStats(); updateLoadout();
  lastOverlay = ''; renderOverlay();
}
async function action(name) {
  if (name === 'resume') resumeGame();
  if (name === 'home') goHome();
  if (name === 'close') closePanel();
  if (name === 'settings') showPanel('settings');
  if (name === 'help') { aux = 'help'; lastOverlay = ''; renderOverlay(); }
  if (name === 'back-settings') { aux = 'settings'; lastOverlay = ''; renderOverlay(); }
  if (name === 'reset-prompt') { aux = 'reset'; lastOverlay = ''; renderOverlay(); }
  if (name === 'reset-confirm') { storage.reset(); profile = storage.load(); game = null; applySettings(); goHome(); toast('摊子清空啦，一切从头开始。'); }
  if (name === 'reroll' && game?.reroll()) { checkpoint(); lastOverlay = ''; renderOverlay(); audio.effect('click'); }
  if (name === 'ad-double') void runAd('boss_double');
  if (name === 'repair' && game?.skipUpgrade()) { handleEvents(game.drainEvents()); syncPhase(); }
  if (name === 'restart' || name === 'same-seed') {
    if (!game) return;
    const mode = game.mode, seed = game.seed, level = game.level; analytics.track('restart', { mode, sameSeed: name === 'same-seed', level, runId });
    begin(mode, false, name === 'same-seed' ? seed : null, level);
  }
  if (name === 'abandon' && game) { aux = null; paused = false; audio.pause(false); game.end(false, '老板提前收了摊'); handleEvents(game.drainEvents()); syncPhase(); }
  if (name === 'export-events') exportText(analytics.export(), 'miaotan-local-events.json');
  if (name === 'share' && game) {
    try { shareCard = await share.card(game, activeSeconds); showPanel('share'); analytics.track('share_card_create', { runId }); }
    catch (e) { toast(e.message || '战绩卡没画好，再试一次？'); }
  }
  if (name === 'native-share' && shareCard) {
    try { if (!await share.nativeShare(shareCard.blob)) toast('这个浏览器不会直接分享，存图后发出去吧。'); }
    catch (e) { if (e.name !== 'AbortError') toast('没分享出去，存图再发也一样香。'); }
  }
}
$('start').addEventListener('click', () => begin('normal'));
$('level-picker').addEventListener('click', e => {
  const btn = e.target.closest('[data-level]'); if (!btn) return;
  const lv = Number(btn.dataset.level);
  if (!profile.unlockedLevels.includes(lv)) { toast('先通关上一关，这条街才对你开张。'); return; }
  profile.selectedLevel = lv; save(); renderHome(); audio.effect('click');
});
$('continue').addEventListener('click', () => begin('normal', true));
$('daily').addEventListener('click', () => begin('daily'));
$('endless').addEventListener('click', () => profile.achievements.includes('boss') ? begin('endless') : toast('先赢一位捣蛋王，无尽夜班才开张。'));
$('cat-picker').addEventListener('click', e => {
  const id = e.target.closest('[data-cat]')?.dataset.cat; if (!id) return;
  if (!profile.unlocked.includes(id)) { const cat = CATS.find(c => c.id === id); toast(`${cat.name} 还在睡懒觉：攒够 ${cat.cost} 枚印章就来帮你。`, 3); return; }
  profile.cat = id; save(); renderHome(); audio.effect('click');
});
for (const panel of ['settings', 'records', 'collection']) $(panel).addEventListener('click', () => showPanel(panel));
for (const id of ['sound', 'home-sound']) $(id).addEventListener('click', () => { profile.settings.sound = !profile.settings.sound; applySettings(); if (profile.settings.sound) void audio.unlock(); save(); });
$('pause').addEventListener('click', pauseGame);
$('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('speed').textContent = `加速 ×${speed}`; $('speed').classList.toggle('active', speed !== 1); });
$('ad-gift').addEventListener('click', () => void runAd('extra_upgrade'));
$('loadout').addEventListener('click', e => { const id = e.target.closest('[data-loadout]')?.dataset.loadout; if (id) toast(`${UPGRADE_BY_ID[id].name} ${game.build[id]}级：${UPGRADE_BY_ID[id].descriptions[game.build[id] - 1]}`, 3.2); });
$('modal').addEventListener('click', e => {
  const up = e.target.closest('[data-upgrade]');
  if (up && game?.chooseUpgrade(up.dataset.upgrade)) { handleEvents(game.drainEvents()); syncPhase(); return; }
  const setting = e.target.closest('[data-setting]');
  if (setting) { const id = setting.dataset.setting; profile.settings[id] = !profile.settings[id]; applySettings(); if (profile.settings.sound) void audio.unlock(); save(); lastOverlay = ''; renderOverlay(); return; }
  const recordTab = e.target.closest('[data-record-mode]');
  if (recordTab) { recordMode = recordTab.dataset.recordMode; lastOverlay = ''; renderOverlay(); return; }
  const button = e.target.closest('[data-action]'); if (button && !button.disabled) { void audio.unlock(); void action(button.dataset.action); }
});
$('modal').addEventListener('input', e => { if (e.target.id === 'volume') { profile.settings.volume = Number(e.target.value) / 100; audio.setVolume(profile.settings.volume); save(); } });
function pointerPoint(e) { const r = $('board').getBoundingClientRect(); return { x: (e.clientX - r.left) * CONFIG.width / r.width, y: (e.clientY - r.top) * CONFIG.height / r.height }; }
$('board').addEventListener('pointerdown', e => {
  if (home || paused || aux || game.phase !== 'aim' || pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); pointer = e.pointerId; aim = pointerPoint(e); void audio.unlock();
  try { $('board').setPointerCapture(e.pointerId); } catch { /* Pointer capture is optional. */ }
});
$('board').addEventListener('pointermove', e => {
  if (!home && !paused && !aux && game.phase === 'aim' && (pointer === e.pointerId || e.pointerType === 'mouse' && pointer === null)) { aim = pointerPoint(e); if (pointer !== null) e.preventDefault(); }
});
$('board').addEventListener('pointerup', e => {
  if (pointer !== e.pointerId) return; e.preventDefault(); aim = pointerPoint(e); pointer = null;
  try { $('board').releasePointerCapture(e.pointerId); } catch { /* Some WebViews release automatically. */ }
  fire(aim.x, aim.y);
});
$('board').addEventListener('pointercancel', () => { pointer = null; });
$('board').addEventListener('lostpointercapture', () => { pointer = null; });
$('board').addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (!$('modal-layer').hidden && e.key === 'Tab') {
    const all = [...$('modal').querySelectorAll('button:not(:disabled),a[href],input,[tabindex="0"]')];
    if (!all.length) return;
    const first = all[0], last = all.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('modal'))) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === $('modal'))) { first.focus(); e.preventDefault(); }
    return;
  }
  if (e.key === 'Escape') { if (aux) closePanel(); else if (paused) resumeGame(); else pauseGame(); e.preventDefault(); return; }
  if (home || paused || aux || game?.phase !== 'aim' || ['INPUT', 'BUTTON', 'A'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const d = game.aimAt(aim.x, aim.y), a = clamp(Math.atan2(d.x, -d.y) + (e.key === 'ArrowLeft' ? -.055 : .055), -1.28, 1.28);
    aim = { x: game.playerX + Math.sin(a) * 400, y: CONFIG.launchY - Math.cos(a) * 400 }; e.preventDefault();
  }
  if (e.code === 'Space' || e.key === 'Enter') { fire(aim.x, aim.y); e.preventDefault(); }
});
window.addEventListener('resize', syncSize); window.visualViewport?.addEventListener('resize', syncSize);
if ('ResizeObserver' in window) new ResizeObserver(() => { if (!home) syncSize(); }).observe($('board-holder'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => { if (!aux) pauseGame(); });
window.addEventListener('pagehide', () => { if (!home && game?.phase !== 'end') checkpoint(); });
window.addEventListener('pageshow', e => { if (e.persisted) pauseGame(); syncSize(); });

function frame(now) {
  const rawDt = lastFrame ? (now - lastFrame) / 1000 : 0; const dt = Math.min(.075, rawDt); lastFrame = now;
  if (rawDt > 0 && rawDt < 1 && !home && !paused) { frameSamples.push(rawDt * 1000); if (frameSamples.length > 1200) frameSamples.shift(); }
  if (!home && game) {
    if (!paused && !aux && game.phase !== 'end') {
      activeSeconds += dt;
      if (game.phase === 'flight') {
        accumulator += dt * speed; let steps = 0;
        while (accumulator >= CONFIG.fixedStep && steps++ < 30 && game.phase === 'flight') { game.step(); accumulator -= CONFIG.fixedStep; }
        if (steps >= 30 || game.phase !== 'flight') accumulator = 0;
      } else accumulator = 0;
    }
    handleEvents(game.drainEvents()); syncPhase();
    renderer.draw(paused ? 0 : dt, game, aim, pointer !== null, paused || !!aux);
    statClock += dt; if (statClock > .12) { statClock = 0; updateStats(); }
  }
  if (!document.hidden) audio.update();
  if (toastUntil && now > toastUntil) { $('toast').classList.remove('visible'); toastUntil = 0; }
  requestAnimationFrame(frame);
}
try {
  if (profile.checkpoint) { try { Engine.restore(profile.checkpoint.engine); } catch { profile.checkpoint = null; save(); } }
  applySettings(); renderHome(); syncSize(); $('storage-warning').hidden = storage.available; document.querySelector('.phone').classList.toggle('storage-blocked', !storage.available);
  requestAnimationFrame(frame);
} catch (error) { const p = document.createElement('p'); p.className = 'fatal'; p.textContent = `摊子没支起来：${error.message}。换个新点的浏览器，或重新打开 dist/index.html 试试。`; document.body.appendChild(p); }
if (debug) {
  // Explicit opt-in diagnostics. Not a leaderboard trust boundary (all scores are local).
  window.__nightmarket = {
    get engine() { return game; }, get profile() { return profile; }, get paused() { return paused; },
    get activeSeconds() { return activeSeconds; }, get renderer() { return renderer; },
    get telemetry() { return JSON.parse(analytics.export()); },
    get frameTimes() { return [...frameSamples]; }, begin, fire, pauseGame, resumeGame,
    step(seconds) { if (!game || paused) return; for (let i = 0; i < Math.ceil(seconds / CONFIG.fixedStep) && game.phase === 'flight'; i++) { game.step(); if (i % 8 === 0) handleEvents(game.drainEvents()); } handleEvents(game.drainEvents()); syncPhase(); updateStats(); },
    sync() { handleEvents(game?.drainEvents() || []); syncPhase(); updateStats(); updateLoadout(); },
    checkpoint, goHome
  };
}
