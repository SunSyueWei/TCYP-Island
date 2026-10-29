// 島民外觀的選項、預設值與資料清理（不依賴 three.js，前端與規則產生器共用）
export const OPTIONS = {
  gender: [['m', '男生'], ['f', '女生']],
  skin: ['#ffe3cc', '#f6cfa8', '#e8b88f', '#cf9568', '#a56c48', '#6e4630'],
  hair: [['short', '短髮'], ['spiky', '刺刺頭'], ['bob', '妹妹頭'], ['long', '長髮'], ['ponytail', '馬尾'], ['buns', '包包頭'], ['none', '光頭']],
  hairColor: ['#2b211c', '#5a3a28', '#8a5a3a', '#c9944f', '#e8c27a', '#b8b8c0', '#d9615e', '#6a7fd1'],
  hat: [['none', '不戴'], ['cap', '棒球帽'], ['beanie', '毛帽'], ['bucket', '漁夫帽'], ['straw', '草帽']],
  top: [['tee', 'T 恤'], ['long', '長袖'], ['hoodie', '帽 T'], ['jacket', '外套']],
  bottom: [['pants', '長褲'], ['shorts', '短褲'], ['skirt', '裙子']],
  acc: [['glasses', '眼鏡'], ['bow', '蝴蝶結'], ['headphones', '耳機'], ['backpack', '背包'], ['scarf', '圍巾']],
  cloth: ['#e97a5b', '#f2b544', '#6ba8d8', '#8fd3c1', '#f49aa0', '#a993d6', '#7fb85a', '#fffaf0', '#3b3f4a', '#5b6fa8', '#c75b4a', '#d8cbb8'],
};

export const DEFAULT_AVATAR = {
  v: 1, name: '', gender: 'm', skin: OPTIONS.skin[1],
  hair: 'short', hairColor: OPTIONS.hairColor[0],
  hat: 'none', hatColor: OPTIONS.cloth[2],
  top: 'tee', topColor: OPTIONS.cloth[0],
  bottom: 'pants', bottomColor: OPTIONS.cloth[9],
  shoes: OPTIONS.cloth[7], acc: [], accColor: OPTIONS.cloth[4],
};

// 讀入時補齊欄位、擋掉不合法的值（之後資料會來自其他使用者）
export function sanitize(a) {
  const o = { ...DEFAULT_AVATAR };
  if (!a || typeof a !== 'object') return o;
  const pick = (k, list) => { if (list.includes(a[k])) o[k] = a[k]; };
  const ids = (k) => OPTIONS[k].map(([id]) => id);
  pick('gender', ids('gender'));
  pick('hair', ids('hair')); pick('hat', ids('hat')); pick('top', ids('top')); pick('bottom', ids('bottom'));
  pick('skin', OPTIONS.skin); pick('hairColor', OPTIONS.hairColor);
  for (const k of ['hatColor', 'topColor', 'bottomColor', 'shoes', 'accColor']) pick(k, OPTIONS.cloth);
  if (Array.isArray(a.acc)) o.acc = a.acc.filter((x) => ids('acc').includes(x)).slice(0, 5);
  if (typeof a.name === 'string') o.name = a.name.replace(/[<>&"'`]/g, '').trim().slice(0, 8);
  return o;
}

export function randomAvatar(rand = Math.random) {
  const one = (list) => list[Math.floor(rand() * list.length)];
  const id = (list) => one(list)[0];
  const g = rand() < 0.5 ? 'm' : 'f';
  const acc = OPTIONS.acc.map(([k]) => k).filter(() => rand() < 0.12);
  return sanitize({
    gender: g, skin: one(OPTIONS.skin.slice(0, 5)),
    hair: g === 'm' ? one(['short', 'short', 'spiky', 'bob']) : one(['bob', 'long', 'ponytail', 'buns', 'long']),
    hairColor: rand() < 0.75 ? one(OPTIONS.hairColor.slice(0, 3)) : one(OPTIONS.hairColor),
    hat: rand() < 0.7 ? 'none' : id(OPTIONS.hat.slice(1)), hatColor: one(OPTIONS.cloth),
    top: id(OPTIONS.top), topColor: one(OPTIONS.cloth),
    bottom: g === 'm' ? one(['pants', 'pants', 'shorts']) : one(['pants', 'shorts', 'skirt', 'skirt']),
    bottomColor: one(OPTIONS.cloth), shoes: one(OPTIONS.cloth), acc, accColor: one(OPTIONS.cloth),
  });
}

// 可重現的亂數（示範島民每次載入長一樣）
export function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
