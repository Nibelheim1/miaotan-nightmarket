/** All balance and performance budgets are centralized here. No device-dependent physics. */
export const CONFIG = Object.freeze({
  width: 420, height: 580, left: 15, right: 405, top: 28,
  gridLeft: 28, gridTop: 51, cell: 52, block: 46, columns: 7,
  danger: 487, launchY: 536, ballRadius: 5, ballSpeed: 640,
  fixedStep: 1 / 120, volleyLimit: 11, launchInterval: .066,
  maxBalls: 112, maxSpawnPerVolley: 180, maxEnemies: 58,
  maxParticles: 220, maxEvents: 512, maxEffectOps: 160,
  maxHearts: 5, startingHearts: 4, campaignWaves: 18,
  initialBalls: 8, maxBaseBalls: 38, rushWave: 13, endlessRampWaves: 12, endlessRampPower: 1.5,
  baseHP: 2.0, hpSlope: 4.0, bossHPFactor: 20,
  storageVersion: 1, gameVersion: '1.0.0'
});
export const PALETTE = Object.freeze({
  bg: '#111522', panel: '#1d2335', mint: '#92e3c0', pink: '#ff7898',
  gold: '#ffe2a1', purple: '#c1a0ff', blue: '#8bcff0', cream: '#fff4df', muted: '#9da7bf'
});
export const CATS = Object.freeze([
  { id: 'mint', name: '薄荷', role: '反弹高手', description: '自带「借墙蓄力」：撞墙后下一击更重。', color: '#92e3c0', upgrade: 'wall', cost: 0 },
  { id: 'peach', name: '桃桃', role: '爆破专家', description: '自带「开罐爆破」：击破怪物炸到邻居。', color: '#ff7898', upgrade: 'blast', cost: 8 },
  { id: 'taro', name: '芋圆', role: '雷电店长', description: '自带「跳跳雷链」：连续命中传导闪电。', color: '#c1a0ff', upgrade: 'spark', cost: 20 }
]);
export const ENEMY_NAMES = Object.freeze({ plain: '麻薯怪', bomb: '爆米花怪', armor: '铁皮罐头', gift: '招财鱼罐', boss: '夜市捣蛋王' });
