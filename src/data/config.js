/** All balance and performance budgets are centralized here. No device-dependent physics. */
export const CONFIG = Object.freeze({
  width: 420, height: 580, left: 15, right: 405, top: 28,
  gridLeft: 28, gridTop: 51, cell: 52, block: 46, columns: 7,
  danger: 487, launchY: 536, ballRadius: 5, ballSpeed: 640,
  fixedStep: 1 / 120, volleyLimit: 11, launchInterval: .066,
  maxBalls: 112, maxSpawnPerVolley: 180, maxEnemies: 58,
  maxParticles: 220, maxEvents: 512, maxEffectOps: 160,
  maxHearts: 8, startingHearts: 6, campaignWaves: 18, stallPenalty: 1, adRewardLimit: 3,
  initialBalls: 12, ballGrowth: 2, maxBaseBalls: 38, rushWave: 13, endlessRampWaves: 12, endlessRampPower: 1.5,
  baseHP: 1.2, hpSlope: 1.2, bossHPFactor: 6, damageRampWaves: 3,
  storageVersion: 1, gameVersion: '1.4.0'
});
export const PALETTE = Object.freeze({
  bg: '#111522', panel: '#1d2335', mint: '#92e3c0', pink: '#ff7898',
  gold: '#ffe2a1', purple: '#c1a0ff', blue: '#8bcff0', cream: '#fff4df', muted: '#9da7bf'
});
export const CATS = Object.freeze([
  { id: 'mint', name: '薄荷', role: '反弹高手', description: '自带「借墙蓄力」：撞墙后下一击更重。', talent: '', color: '#92e3c0', upgrade: 'wall', cost: 0 },
  { id: 'peach', name: '桃桃', role: '爆破专家', description: '自带「开罐爆破」：击破怪物炸到邻居。', talent: '天赋「开门红」：每轮第一次击杀必定爆炸。', color: '#ff7898', upgrade: 'blast', cost: 8 },
  { id: 'taro', name: '芋圆', role: '雷电店长', description: '自带「跳跳雷链」：连续命中传导闪电。', talent: '天赋「静电场」：每轮首次命中额外放出一道闪电链。', color: '#c1a0ff', upgrade: 'spark', cost: 20 }
]);
/** Six campaign levels. Each is one 18-ish-wave run; clearing level N unlocks N+1.
 *  hitBudget 0 = no per-ball hit cap. stallRamp 0 = flat 1-heart penalty.
 *  midFormation: row | clusters | checker | columns | mix (alternates by wave). */
export const LEVELS = Object.freeze([
  { id: 1, name: '开张大吉', waves: 12, bossEvery: 4, hearts: 5, stallRamp: 0, hitBudget: 0, rushWave: 9, enemyDelta: 0, hpSlope: 1.6, bossHP: 6, danger: 487, adLimit: 3, escorts: 2, armorRate: .43, bombGuarantee: 4, repeatDecay: 1, midFormation: 'row', stampMult: 1, tip: '教学关：惩罚不递增，阵型全是横排。' },
  { id: 2, name: '夜市常客', waves: 18, bossEvery: 6, hearts: 6, stallRamp: 1, hitBudget: 14, rushWave: 13, enemyDelta: 0, hpSlope: 1.6, bossHP: 6, danger: 487, adLimit: 3, escorts: 2, armorRate: .43, bombGuarantee: 6, repeatDecay: 1, midFormation: 'clusters', stampMult: 1.2, tip: '标准关：规则的全貌。' },
  { id: 3, name: '周末人潮', waves: 18, bossEvery: 6, hearts: 6, stallRamp: 1, hitBudget: 8, rushWave: 11, enemyDelta: 1, hpSlope: 2.2, bossHP: 6, danger: 487, adLimit: 3, escorts: 2, armorRate: .55, bombGuarantee: 6, repeatDecay: 1, midFormation: 'checker', stampMult: 1.5, tip: '敌人更多；棋盘阵会让横扫漏怪。' },
  { id: 4, name: '雨夜急单', waves: 18, bossEvery: 6, hearts: 5, stallRamp: 1, hitBudget: 7, rushWave: 13, enemyDelta: 0, hpSlope: 2.0, bossHP: 7, danger: 460, adLimit: 3, escorts: 2, armorRate: .43, bombGuarantee: 6, repeatDecay: 1, midFormation: 'columns', stampMult: 1.8, tip: '危险线上移，竖列阵逼你垂直灌弹。' },
  { id: 5, name: '大王连任', waves: 18, bossEvery: 5, hearts: 6, stallRamp: 1, hitBudget: 7, rushWave: 13, enemyDelta: 0, hpSlope: 2.0, bossHP: 7, danger: 460, adLimit: 3, escorts: 3, armorRate: .43, bombGuarantee: 6, repeatDecay: 1, midFormation: 'clusters', stampMult: 2.2, tip: '大王每 5 波一位，可能双王同场。' },
  { id: 6, name: '通宵达旦', waves: 24, bossEvery: 6, hearts: 6, stallRamp: 1.5, hitBudget: 8, rushWave: 9, enemyDelta: 0, hpSlope: 2.2, bossHP: 8, danger: 440, adLimit: 2, escorts: 2, armorRate: .55, bombGuarantee: 6, repeatDecay: .85, midFormation: 'mix', stampMult: 2.5, tip: '毕业考试：全部机制一起上。' }
]);
export const ENEMY_NAMES = Object.freeze({ plain: '麻薯怪', bomb: '爆米花怪', armor: '铁皮罐头', gift: '招财鱼罐', boss: '夜市捣蛋王' });
