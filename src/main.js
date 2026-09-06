import { CONFIG, CATS, ENEMY_NAMES } from './data/config.js';
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
    return `<button class="cat-option ${profile.cat === c.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-cat="${c.id}" aria-pressed="${profile.cat === c.id}"><span style="color:${c.color}">${icon('paw', 14)} ${c.name}</span><small>${locked ? `累计 ${c.cost} 印章解锁` : c.role}</small></button>`;
  }).join('');
  $('cat-info').textContent = `${cat.description} · 印章 ${profile.stamps}`;
  $('continue').hidden = !profile.checkpoint;
  $('daily').innerHTML = `${icon('moon', 17)} 今日同题`;
  $('endless').innerHTML = `${icon('star', 17)} ${profile.achievements.includes('boss') ? '无尽夜班' : '无尽 · 击退大王解锁'}`;
  $('daily-note').textContent = `${today()} · 每日固定种子 / 薄荷店长 / 本机比成绩`;
  $('collection').innerHTML = `${icon('book', 19)}<span>改装手册 ${profile.discovered.length}/12</span>`;
  $('records').innerHTML = `${icon('trophy', 19)}<span>本机战绩</span>`;
  $('settings').innerHTML = `${icon('settings', 19)}<span>设置与说明</span>`;
  updateSoundButtons();
}
function randomSeed() {
  if (/^\d{1,10}$/.test(query.get('seed') || '')) return Number(query.get('seed')) >>> 0;
  try { const n = new Uint32Array(1); crypto.getRandomValues(n); return n[0]; } catch { return Date.now() >>> 0; }
}
function begin(mode = 'normal', resume = false, seedOverride = null) {
  void audio.unlock(); audio.pause(false);
  if (resume) {
    try { game = Engine.restore(profile.checkpoint.engine); activeSeconds = Math.max(0, Math.min(1e8, Number(profile.checkpoint.activeSeconds) || 0)); runId = `resume-${Date.now().toString(36)}`; }
    catch { profile.checkpoint = null; save(); renderHome(); toast('上局存档格式异常，已安全清理。请重新开摊。'); return; }
  } else {
    const seed = mode === 'daily' ? hashSeed(`miaotan-v1-${today()}`) : (seedOverride === null ? randomSeed() : seedOverride >>> 0);
    game = new Engine({ seed, mode, cat: mode === 'daily' ? 'mint' : profile.cat, daily: mode === 'daily' ? today() : '' });
    activeSeconds = 0; runId = `run-${seed}-${Date.now().toString(36)}`;
    if (!profile.tutorialDone) analytics.track('tutorial_start', { runId });
  }
  analytics.track('run_start', { runId, seed: game.seed, mode: game.mode, cat: game.cat, resume });
  home = false; paused = false; aux = null; recorded = false; lastPhase = ''; lastOverlay = '';
  accumulator = 0; speed = 1; pointer = null; shareCard = null;
  aim = { x: game.shots ? game.playerX : 208, y: game.shots ? 150 : 190 };
  $('home').hidden = true; $('game').hidden = false; renderer.clearEffects();
  $('pause').innerHTML = icon('pause', 19); $('speed').textContent = '演出 ×1'; $('speed').classList.remove('active');
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
    if (e.type === 'boss') { toast(`第 ${e.wave} 波 · 捣蛋王来捣乱！别让它越线。`, 3.1); }
    if (e.type === 'rush') toast('夜宵潮来了！从本波起，每轮敌人前进 2 格。', 5);
    if (e.type === 'bossKill') toast('捣蛋王退散！恢复 1 心。');
    if (e.type === 'shield') toast('连击撑起了喵爪护盾！');
    if (e.type === 'hunter') toast('标记已击破，本轮剩余弹珠更强！');
    if (e.type === 'synergy') { toast(`配方成型：${e.name}`, 3); audio.effect('synergy'); }
    if (e.type === 'recall') toast('本轮弹珠已回收，下一轮继续。', 1.4);
    if (e.type === 'upgrade') { analytics.track('upgrade_select', { runId, id: e.id, level: e.level, wave: game.wave }); audio.effect('upgrade'); }
  }
  if (boomSound) audio.effect('boom'); else if (killSound) audio.effect('kill');
}
function updateStats() {
  if (home || !game) return;
  $('mode-label').textContent = `${debug ? '调试 · ' : ''}${game.mode === 'daily' ? '今日同题 ' + game.daily.slice(5) : game.mode === 'endless' ? '无尽夜班' : '夜市保卫战'}`;
  $('wave-label').innerHTML = `${String(game.wave).padStart(2, '0')} <small>${game.mode === 'endless' ? '/ ∞' : game.wave > 18 ? '清场中' : '/ 18'}</small>`;
  $('score-label').textContent = Math.round(game.score).toLocaleString('en-US');
  $('hearts').innerHTML = Array.from({ length: CONFIG.maxHearts }, (_, i) => icon('heart', 15).replace('<svg ', `<svg class="${i < game.hearts ? '' : 'empty'}" `)).join('');
  $('hearts').setAttribute('aria-label', `剩余 ${game.hearts} 颗心`);
  $('shield-label').innerHTML = game.shields ? `${icon('shield', 12)} ${game.shields}` : '';
  $('combo-label').textContent = game.phase === 'flight' ? `${game.combo} 连击${game.combo >= 25 ? '！' : ''}` : `最高 ${game.maxCombo} 连击`;
  $('wave-track').innerHTML = Array.from({ length: 18 }, (_, i) => `<span class="wave-pip ${(i + 1) % 6 === 0 ? 'boss' : ''} ${i + 1 < game.wave ? 'done' : i + 1 === game.wave ? 'current' : ''}"></span>`).join('');
  $('ball-label').textContent = `${game.ballCount} 颗弹珠 · ${game.damage} 基础伤害`;
  $('action-hint').textContent = game.phase === 'flight' ? '弹珠出击中 · 可切换演出速度' : game.wave >= CONFIG.rushWave ? '夜宵潮 · 每轮前进 2 格，优先救险' : '借墙反弹，打到背面更赚';
}
function updateLoadout() {
  if (!game) return;
  $('loadout').innerHTML = Object.entries(game.build).map(([id, level]) => `<button class="loadout-chip ${UPGRADE_BY_ID[id].color}" data-loadout="${id}" aria-label="${UPGRADE_BY_ID[id].name} ${level}级">${icon(UPGRADE_BY_ID[id].icon, 16)}<small>${level}</small></button>`).join('') + `<span class="loadout-note">${activeSynergies(game.build).map(s => s.name).join(' / ') || '点击图标查看改装'}</span>`;
}
function heading(title, label = '') { return `<div class="modal-head"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="关闭菜单">${icon('close', 19)}</button></div>${label ? `<p class="sub">${label}</p>` : ''}`; }
function rewardHtml() {
  return `<p class="modal-overline">CHOOSE YOUR SECRET RECIPE</p><h2>加点料，继续开摊。</h2><p class="sub">本局改装三选一。搭出连锁，不只堆数字。</p><div class="reward-list">${game.offers.map((id, i) => {
    const u = UPGRADE_BY_ID[id];
    if (!u) return `<button class="upgrade-card" data-upgrade="${id}">${icon('heart')}<div><h3>${id === 'repair' ? '补给一颗心' : id === 'shield' ? '补充一层护盾' : '多一颗弹珠'}</h3><p>改装池即将集齐，补充本局资源。</p></div></button>`;
    const lv = game.build[id] || 0;
    const synergy = SYNERGIES.find(s => s.needs.includes(id) && !activeSynergies(game.build).some(a => a.id === s.id) && s.needs.filter(n => n !== id).every(n => game.build[n]));
    return `<button class="upgrade-card" data-upgrade="${id}" aria-label="选择${u.name}"><span class="upgrade-icon ${u.color}">${icon(u.icon, 28)}</span><span class="upgrade-body"><h3>${u.name}<em>${lv ? `升至 ${lv + 1} 级` : '新机制'} · ${u.tag}</em></h3><p>${u.descriptions[lv]}</p>${synergy ? `<span class="synergy-hint">配方即将成型：${synergy.name}</span>` : ''}</span></button>`;
  }).join('')}</div><div class="reward-actions"><button data-action="reroll" ${game.rerolls ? '' : 'disabled'}>${icon('rewind', 14)} 换一批 · 剩 ${game.rerolls} 次</button><button data-action="repair">不改装，恢复 1 心</button></div>`;
}
function resultHtml() {
  return `<p class="modal-overline">${game.victory ? 'THE NIGHT IS OURS' : 'ONE MORE BOUNCE?'}</p><h2>${resultTitle(game)}</h2><p class="sub">${game.victory ? '夜市守住了，今天准时收摊。' : '这次先收摊。下一局，换一种配方。'}</p><div class="score-result">${game.score.toLocaleString('en-US')}</div><div class="score-caption">本局营业积分 · 仅保存在本机</div><div class="result-stats"><div><b>${game.wave}</b><small>到达波次</small></div><div><b>${game.maxCombo}</b><small>最高连击</small></div><div><b>${Math.round(activeSeconds)}s</b><small>有效游玩时间</small></div></div><div class="result-build">${Object.entries(game.build).map(([id, lv]) => `<span>${UPGRADE_BY_ID[id].name} ${'I'.repeat(lv)}</span>`).join('')}</div><div class="earned">夜市印章 +${earnings.earned} · 累计 ${profile.stamps}${earnings.unlocked.length ? `<br>新店长已解锁：${earnings.unlocked.join('、')}` : '<br>累计 8 / 20 印章解锁新店长，无需消耗。'}</div><button class="button primary full" data-action="restart">${icon('rewind', 18)} 再弹一局</button><button class="button secondary full" data-action="share">${icon('share', 17)} 生成本局战绩卡</button><div class="modal-footer"><button class="text-button" data-action="home">回夜市</button><button class="text-button" data-action="same-seed">同种子再挑战</button></div>`;
}
function settingsHtml() {
  const s = profile.settings;
  return `${heading('摊位设置')}<div class="settings-row"><span>总声音</span><button class="switch ${s.sound ? 'on' : ''}" role="switch" aria-checked="${s.sound}" aria-label="总声音" data-setting="sound"></button></div><div class="settings-row"><span>夜市背景音乐</span><button class="switch ${s.music ? 'on' : ''}" role="switch" aria-checked="${s.music}" aria-label="背景音乐" data-setting="music"></button></div><div class="settings-row"><label for="volume">音量</label><input id="volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></div><div class="settings-row"><span>减少屏幕震动</span><button class="switch ${s.reducedMotion ? 'on' : ''}" role="switch" aria-checked="${s.reducedMotion}" aria-label="减少屏幕震动" data-setting="reducedMotion"></button></div><button class="button secondary full" data-action="help">${icon('info', 16)} 玩法与怪物说明</button><p class="legal-note">不登录，不加载广告，不连接任何统计服务。存档和本机榜存于当前浏览器；清理浏览器数据会清除进度。每日同题使用 UTC+8 日期，不是全球联网排行榜。<br>中途刷新会回到本轮发射前；没有云存档。</p><button class="button secondary full" data-action="export-events">导出本次会话事件 JSON</button><button class="text-button" data-action="reset-prompt">清空本机游戏进度</button>`;
}
function collectionHtml() {
  const achievements = [['boss', '捣蛋王克星 · 击退一位大王'], ['combo', '全街连击 · 单轮 50 次命中'], ['win', '今晚不加班 · 保卫战通关'], ['collector', '夜市百事通 · 发现 10 种改装']];
  return `${heading('秘密配方手册', `已发现 ${profile.discovered.length} / 12 种改装。所有改装从第一局起都可抽到。`)}<div class="collection-grid">${UPGRADES.map(u => `<div class="collection-item ${profile.discovered.includes(u.id) ? '' : 'unseen'}"><span class="${u.color}">${icon(u.icon, 25)}</span><b>${u.name}</b><p>${u.descriptions[0]}</p></div>`).join('')}</div><p class="modal-overline" style="margin-top:20px">夜市纪念章</p>${achievements.map(([id, text]) => `<div class="achievement">${icon(profile.achievements.includes(id) ? 'check' : 'star', 15)} ${text}</div>`).join('')}<p class="legal-note">玩法提示：雷链＋冰糖、分裂＋穿心、爆破＋热线、借墙＋回头客，会产生不同的连锁方式。</p>`;
}
function recordsHtml() {
  const list = new LeaderboardService(profile).list(recordMode, today());
  return `${heading('本机战绩', '没有虚构全球排名。仅显示当前浏览器保存的成绩。')}<div class="home-secondary" style="grid-template-columns:repeat(3,1fr)">${[['normal', '保卫战'], ['daily', '今日同题'], ['endless', '无尽']].map(([id, name]) => `<button class="button ${recordMode === id ? 'primary' : 'secondary'}" data-record-mode="${id}">${name}</button>`).join('')}</div>${list.length ? list.map((r, i) => `<div class="record-row"><span class="rank">${i + 1}</span><div>${r.victory ? '守住夜市' : '第 ' + r.wave + ' 波'} · ${r.combo} 连击<small>${r.date} · ${r.seconds} 秒 · 种子 ${r.seed}</small></div><b>${r.score.toLocaleString('en-US')}</b></div>`).join('') : '<div class="empty-state">这里还没有战绩。<br>结束一局后，留下你的第一枚脚印。</div>'}`;
}
function helpHtml() {
  return `${heading('夜市营业指南')}<div class="help-section"><b>怎么打？</b><br>在场内按住并移动手指瞄准，松手发射；也可以直接点一个方向。电脑使用鼠标，或左右方向键＋空格。瞄准线只预览首个接触点，不预测升级后的所有连锁。</div><div class="help-section"><b>怎么赢？</b><br>保卫战共有 18 波来敌；第 6、12、18 波出现大王。发射结束后，敌人前进一格；第 13 波起进入夜宵潮，每轮前进两格。普通敌人越线消耗护盾或 1 心，大王越线直接结束。最后一波之后清空场地即获胜。没有倒计时逼你操作。</div><div class="help-section"><b>看懂场上的朋友</b><span class="enemy-legend gold">● 爆米花怪：击破炸到邻居。</span><span class="enemy-legend mint">● 招财鱼罐：击破，本局多 1 颗弹珠。</span><span class="enemy-legend blue">● 铁皮罐头：带甲时减伤；同一弹珠连续命中或开锁器可卸甲。</span><span class="enemy-legend pink">● 捣蛋王：血多、体型大；击退回复 1 心。</span></div><div class="help-section"><b>为什么要再来一局？</b><br>改装每局重置，印章和新店长永久保留。先体验借墙蓄力，再试爆破或雷电开局。每日同题人人固定同一个种子和店长；本版仅比较本机成绩。完成一局并击退大王后，解锁无尽模式；无尽第 18 波后敌人强度会加速增长。</div><div class="help-section"><b>重要的小细节</b><br>最后落回的弹珠不用等：演出最长 11 秒会自动回收，也可手动切换演出速度。切后台会暂停，回到页面点击继续。刷新回到本轮发射前。存档不可用时会明确提醒。</div><button class="button primary full" data-action="back-settings">明白，回到设置</button>`;
}
function renderOverlay() {
  let kind = aux || (!home && paused ? 'pause' : !home && game?.phase === 'reward' ? 'reward' : !home && game?.phase === 'end' ? 'result' : '');
  const key = `${kind}|${game?.offers?.join(',') || ''}|${recordMode}|${kind === 'settings' ? JSON.stringify(profile.settings) : ''}`;
  if (lastOverlay === key) return; lastOverlay = key;
  $('modal-layer').hidden = !kind; $('home').inert = !!kind; $('game').inert = !!kind;
  if (!kind) { if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true }); returnFocus = null; return; }
  if (!returnFocus) returnFocus = document.activeElement;
  let html = '';
  if (kind === 'reward') html = rewardHtml();
  if (kind === 'result') html = resultHtml();
  if (kind === 'pause') html = `<p class="modal-overline">THE NIGHT CAN WAIT</p><h2>先歇一下。</h2><p class="sub">弹珠停在原地，夜市也会等你。</p><div class="pause-list"><button class="button primary" data-action="resume">${icon('play', 17)} 继续营业</button><button class="button secondary" data-action="settings">${icon('settings', 17)} 声音与设置</button><button class="button secondary" data-action="home">保存本轮，返回夜市</button><button class="text-button" data-action="abandon">结束本局并结算</button></div><p class="pause-tip">即时暂停可原地继续；刷新或返回主页后<br>会回到本轮发射之前，不会自动代打。</p>`;
  if (kind === 'settings') html = settingsHtml();
  if (kind === 'collection') html = collectionHtml();
  if (kind === 'records') html = recordsHtml();
  if (kind === 'help') html = helpHtml();
  if (kind === 'reset') html = `${heading('清空本机进度？')}<p class="sub">这会删除当前浏览器内的店长解锁、战绩和未结束对局。不可恢复。</p><button class="button secondary full" data-action="back-settings">保留进度</button><button class="button full pink" data-action="reset-confirm">确认清空</button>`;
  if (kind === 'share') html = `${heading('把名场面带走')}<img class="share-image" src="${shareCard?.url || ''}" alt="本局积分、连击和改装配方战绩卡"><a class="button primary full" href="${shareCard?.url || '#'}" download="miaotan-score.png">保存战绩卡 PNG</a><button class="button secondary full" data-action="native-share">系统分享</button><p class="legal-note">浏览器不支持保存时，可长按图片保存。战绩卡不包含姓名或账号信息。</p>`;
  $('modal').innerHTML = html; $('modal').setAttribute('aria-label', { reward: '选择本局改装', result: '本局结算', pause: '游戏暂停', settings: '游戏设置', records: '本机战绩', share: '战绩卡', collection: '改装手册', help: '游戏说明', reset: '清空存档确认' }[kind] || '游戏菜单');
  $('modal').scrollTop = 0; $('modal').focus({ preventScroll: true });
}
function exportText(text, name) {
  const blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function action(name) {
  if (name === 'resume') resumeGame();
  if (name === 'home') goHome();
  if (name === 'close') closePanel();
  if (name === 'settings') showPanel('settings');
  if (name === 'help') { aux = 'help'; lastOverlay = ''; renderOverlay(); }
  if (name === 'back-settings') { aux = 'settings'; lastOverlay = ''; renderOverlay(); }
  if (name === 'reset-prompt') { aux = 'reset'; lastOverlay = ''; renderOverlay(); }
  if (name === 'reset-confirm') { storage.reset(); profile = storage.load(); game = null; applySettings(); goHome(); toast('已清空本机进度。'); }
  if (name === 'reroll' && game?.reroll()) { checkpoint(); lastOverlay = ''; renderOverlay(); audio.effect('click'); }
  if (name === 'repair' && game?.skipUpgrade()) { handleEvents(game.drainEvents()); syncPhase(); }
  if (name === 'restart' || name === 'same-seed') {
    if (!game) return;
    const mode = game.mode, seed = game.seed; analytics.track('restart', { mode, sameSeed: name === 'same-seed', runId });
    begin(mode, false, name === 'same-seed' ? seed : null);
  }
  if (name === 'abandon' && game) { aux = null; paused = false; audio.pause(false); game.end(false, '主动收摊'); handleEvents(game.drainEvents()); syncPhase(); }
  if (name === 'export-events') exportText(analytics.export(), 'miaotan-local-events.json');
  if (name === 'share' && game) {
    try { shareCard = await share.card(game, activeSeconds); showPanel('share'); analytics.track('share_card_create', { runId }); }
    catch (e) { toast(e.message || '战绩卡暂时无法生成'); }
  }
  if (name === 'native-share' && shareCard) {
    try { if (!await share.nativeShare(shareCard.blob)) toast('当前浏览器不支持系统分享，请使用保存图片。'); }
    catch (e) { if (e.name !== 'AbortError') toast('分享未完成，请保存图片后分享。'); }
  }
}
$('start').addEventListener('click', () => begin('normal'));
$('continue').addEventListener('click', () => begin('normal', true));
$('daily').addEventListener('click', () => begin('daily'));
$('endless').addEventListener('click', () => profile.achievements.includes('boss') ? begin('endless') : toast('在保卫战中击退一位捣蛋王，即可解锁无尽夜班。'));
$('cat-picker').addEventListener('click', e => {
  const id = e.target.closest('[data-cat]')?.dataset.cat; if (!id) return;
  if (!profile.unlocked.includes(id)) { const cat = CATS.find(c => c.id === id); toast(`${cat.name}：${cat.description} 累计 ${cat.cost} 印章可解锁。`, 3); return; }
  profile.cat = id; save(); renderHome(); audio.effect('click');
});
for (const panel of ['settings', 'records', 'collection']) $(panel).addEventListener('click', () => showPanel(panel));
for (const id of ['sound', 'home-sound']) $(id).addEventListener('click', () => { profile.settings.sound = !profile.settings.sound; applySettings(); if (profile.settings.sound) void audio.unlock(); save(); });
$('pause').addEventListener('click', pauseGame);
$('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('speed').textContent = `演出 ×${speed}`; $('speed').classList.toggle('active', speed !== 1); });
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
} catch (error) { const p = document.createElement('p'); p.className = 'fatal'; p.textContent = `游戏启动失败：${error.message}。请重新打开 dist/index.html 或使用较新浏览器。`; document.body.appendChild(p); }
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
