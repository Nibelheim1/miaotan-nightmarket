/** Levels alter rules/cadence; no endless percentage-stat filler. */
export const UPGRADES = Object.freeze([
  { id: 'spark', name: '跳跳雷链', icon: 'bolt', color: 'purple', tag: '传导', max: 3,
    descriptions: ['每颗弹珠每命中 3 次，闪电跳向附近 2 个敌人。', '闪电跳向 3 个敌人；传导范围变大。', '每命中 2 次就释放闪电，跳向 4 个敌人。'] },
  { id: 'blast', name: '开罐爆破', icon: 'boom', color: 'pink', tag: '连锁', max: 3,
    descriptions: ['每个被击破的敌人都会爆炸，波及邻居。', '爆炸范围扩大，伤害提高。', '大范围爆破：一罐带走一片。'] },
  { id: 'split', name: '猫爪分裂', icon: 'split', color: 'mint', tag: '增殖', max: 3,
    descriptions: ['每颗主弹首次命中，分出 2 颗小弹珠。', '分裂为 3 颗小弹珠。', '分裂为 4 颗小弹珠。子弹不会再次分裂。'] },
  { id: 'pierce', name: '糯米穿心', icon: 'arrow', color: 'blue', tag: '穿透', max: 3,
    descriptions: ['每颗主弹的前 1 次命中直接穿透；有分裂时，小弹也穿透一次。', '前 2 次命中穿透；有分裂时，小弹也能穿透一次。', '前 3 次命中穿透，更容易钻进背面。'] },
  { id: 'wall', name: '借墙蓄力', icon: 'bounce', color: 'mint', tag: '角度', max: 3,
    descriptions: ['撞侧墙后，下一次命中造成双倍伤害。', '可连续蓄力 2 次；每次蓄力增加一份伤害。', '可连续蓄力 3 次。贴墙折射更有威力。'] },
  { id: 'return', name: '回头客', icon: 'return', color: 'gold', tag: '续航', max: 2,
    descriptions: ['每颗主弹落到底部时，额外弹回去 1 次。', '每颗主弹可从底部弹回去 2 次。'] },
  { id: 'ice', name: '冰糖脆壳', icon: 'snow', color: 'blue', tag: '破冰', max: 3,
    descriptions: ['第一击裹上冰糖，下一次弹珠或雷电击中时碎裂，伤害翻倍。', '冰糖碎裂造成 3 倍伤害。', '冰糖碎裂造成 4 倍伤害。'] },
  { id: 'laser', name: '清巷热线', icon: 'laser', color: 'pink', tag: '清行', max: 3,
    descriptions: ['本轮每累计 12 次弹珠命中，横扫当前一整行。', '每 9 次命中横扫一行。', '每 6 次命中横扫一行。'] },
  { id: 'firefly', name: '飞鱼烟花', icon: 'fish', color: 'gold', tag: '追击', max: 3,
    descriptions: ['每击破 3 个敌人，向两侧放出小弹珠。', '每击破 2 个敌人，就放出追击弹珠。', '每次击破都放出追击弹珠。'] },
  { id: 'guard', name: '喵爪护盾', icon: 'shield', color: 'mint', tag: '防守', max: 3,
    descriptions: ['单轮达到 35 次连击，获得 1 层护盾。本轮限一次。', '达到 25 次连击就获得护盾。', '达到 18 次连击就获得护盾；可储存 3 层。'] },
  { id: 'hunter', name: '弱点铃铛', icon: 'target', color: 'gold', tag: '集火', max: 3,
    descriptions: ['每轮标记最下方的敌人；击破标记后，余下弹珠本轮伤害 +1。', '击破后本轮伤害 +2。', '击破后本轮伤害 +3。先解决威胁，再清场。'] },
  { id: 'drill', name: '罐头开锁器', icon: 'key', color: 'purple', tag: '破甲', max: 2,
    descriptions: ['击中铁皮罐头立即卸甲，向附近敌人发射一次闪电。', '对捣蛋王首次命中也触发卸甲闪电；普通卸甲会命中更多邻居。'] }
]);
export const UPGRADE_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(UPGRADES.map(u => [u.id, u]))));
export const SYNERGIES = Object.freeze([
  { id: 'storm', name: '雷打冰糖', needs: ['spark', 'ice'], icon: 'snow', text: '雷电也能敲碎冰糖脆壳。' },
  { id: 'rain', name: '猫爪暴雨', needs: ['split', 'pierce'], icon: 'split', text: '分裂的小弹珠继承一次穿透。' },
  { id: 'street', name: '全街开花', needs: ['blast', 'laser'], icon: 'boom', text: '横扫击破也触发爆破，连锁清行。' },
  { id: 'night', name: '不打烊机器', needs: ['wall', 'return'], icon: 'return', text: '回弹再次借墙蓄力，一颗弹珠反复做生意。' }
]);
export function activeSynergies(build) { return SYNERGIES.filter(s => s.needs.every(id => build[id] > 0)); }
