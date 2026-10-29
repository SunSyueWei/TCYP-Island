// 福音港灣釣魚：每天 3 次，抽卡式稀有度，QTE 收線
// 進度存在這台裝置的瀏覽器（純娛樂，沒有獎品）
import { taipeiNow } from './content.js';

const DAILY = 3;
const PITY = 30; // 連續 30 條沒釣到超稀有以上，下一條保底超稀有
const KEY = 'tcyp-fishing-v1';

export const RARITY = {
  N: { label: '普通', stars: 1, rate: 0.6, color: '#8fae7a', hits: 2, zone: 0.34, speed: 0.9 },
  R: { label: '稀有', stars: 2, rate: 0.28, color: '#5b9bd5', hits: 3, zone: 0.26, speed: 1.2 },
  SR: { label: '超稀有', stars: 3, rate: 0.1, color: '#a26bd8', hits: 3, zone: 0.2, speed: 1.5 },
  SSR: { label: '傳說', stars: 4, rate: 0.02, color: '#e9a630', hits: 4, zone: 0.16, speed: 1.8 },
};

export const FISH = [
  { id: 'tilapia', r: 'N', name: '吳郭魚', em: '🐟', size: [15, 35], desc: '台灣溪流池塘最常見的朋友，生命力超強。' },
  { id: 'milkfish', r: 'N', name: '虱目魚', em: '🐟', hue: 160, size: [30, 60], desc: '台南人的早餐好夥伴，刺多但很香。' },
  { id: 'scad', r: 'N', name: '竹筴魚', em: '🐟', hue: 200, size: [15, 30], desc: '成群結隊游來游去，好像在相調。' },
  { id: 'shrimp', r: 'N', name: '小河蝦', em: '🦐', size: [3, 8], desc: '小小一隻，也很努力地活著。' },
  { id: 'hermit', r: 'N', name: '寄居蟹', em: '🦀', size: [3, 10], desc: '帶著家到處跑，隨時可以家聚會。' },
  { id: 'clown', r: 'R', name: '小丑魚', em: '🐠', size: [8, 12], desc: '住在海葵裏，是珊瑚礁的開心果。' },
  { id: 'puffer', r: 'R', name: '河豚', em: '🐡', size: [10, 30], desc: '一緊張就鼓起來，深呼吸，沒事的。' },
  { id: 'mahi', r: 'R', name: '鬼頭刀', em: '🐠', hue: 60, size: [60, 120], desc: '東部海域的閃亮游泳健將。' },
  { id: 'octopus', r: 'R', name: '章魚', em: '🐙', size: [30, 90], desc: '八隻手可以同時抓好多東西。' },
  { id: 'tuna', r: 'SR', name: '黑鮪魚', em: '🐟', hue: 230, size: [150, 250], desc: '屏東東港的海上明星，力氣超大！' },
  { id: 'sunfish', r: 'SR', name: '翻車魚', em: '🐡', hue: 180, size: [100, 200], desc: '喜歡躺在海面曬太陽，非常放鬆。' },
  { id: 'salmon', r: 'SR', name: '櫻花鉤吻鮭', em: '🐟', hue: 320, size: [20, 40], desc: '台灣特有的國寶魚，住在大甲溪上游。' },
  { id: 'squid', r: 'SR', name: '大魷魚', em: '🦑', size: [80, 160], desc: '夜晚會被漁船的燈光吸引過來。' },
  { id: 'whale', r: 'SSR', name: '大翅鯨', em: '🐋', size: [1200, 1500], desc: '偶爾會游過台灣東部外海，唱著很長的歌。' },
  { id: 'galilee', r: 'SSR', name: '加利利的大魚', em: '🐟', gold: true, size: [50, 90], desc: '「網滿了大魚，共一百五十三條；魚雖這樣多，網卻沒有破。」（約翰福音 21:11）' },
];

// ---------- 存檔 ----------
function load() {
  try { return { day: '', used: 0, sincePity: 0, dex: {}, total: 0, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { day: '', used: 0, sincePity: 0, dex: {}, total: 0 }; }
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 無痕模式 */ } }
function today(s) {
  const d = taipeiNow().date;
  if (s.day !== d) { s.day = d; s.used = 0; }
  return s;
}
export function remainingToday() { return DAILY - today(load()).used; }

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
function rollRarity(s) {
  if (s.sincePity >= PITY - 1) return rand() < 0.15 ? 'SSR' : 'SR';
  let x = rand();
  for (const [k, v] of Object.entries(RARITY).reverse()) { if (x < v.rate) return k; x -= v.rate; }
  return 'N';
}
function rollFish(r) {
  const pool = FISH.filter((f) => f.r === r);
  const f = pool[Math.floor(rand() * pool.length)];
  const size = Math.round(f.size[0] + rand() * (f.size[1] - f.size[0]));
  return { ...f, cm: size };
}
const fishEm = (f, hidden = false) => `<span class="fx-em${f.gold ? ' gold' : ''}" style="${f.hue ? `--hue:${f.hue}deg;` : ''}${hidden ? 'filter:brightness(0);opacity:.25;' : ''}">${f.em}</span>`;
const stars = (r) => '★'.repeat(RARITY[r].stars);

function untilMidnight() {
  const n = taipeiNow();
  const left = (24 - n.hour) * 60 - n.minute;
  return `${Math.floor(left / 60)} 小時 ${left % 60} 分`;
}

// ---------- 介面 ----------
export function createFishing() {
  const el = document.createElement('div');
  el.className = 'fishing';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '福音港灣釣魚');
  el.innerHTML = `
    <div class="fx-card">
      <button class="fx-close" aria-label="關閉">✕</button>
      <div class="fx-head">
        <h2>🎣 福音港灣釣魚</h2>
        <div class="fx-tabs" role="tablist"><button data-tab="fish" aria-selected="true">釣魚</button><button data-tab="dex" aria-selected="false">圖鑑</button></div>
      </div>
      <div class="fx-body"></div>
    </div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.fx-body');

  let tab = 'fish';
  let phase = 'idle'; // idle | waiting | bite | reel | result
  let timer = 0, raf = 0, biteAt = 0;
  let catchFish = null, reel = null;

  function header(s) {
    const left = DAILY - s.used;
    return `<div class="fx-status"><span class="fx-left">今天還能釣 ${'<b>🐟</b>'.repeat(left)}${'<i>🐟</i>'.repeat(DAILY - left)}</span>
      <span class="fx-pity">保底：再 ${Math.max(1, PITY - s.sincePity)} 條必出超稀有</span></div>`;
  }

  function renderFish() {
    const s = today(load());
    if (phase === 'result') return renderResult(s);
    const left = DAILY - s.used;
    const msg = {
      idle: left > 0 ? '按「拋竿」把釣線拋出去，等浮標動了再按！' : `今天的 3 次機會用完了，${untilMidnight()}後再來吧！`,
      waiting: '靜靜等待……浮標一動就按！',
      bite: '<b class="fx-alert">！上鉤了！快按！</b>',
      reel: '指針進到綠色區域時按「收線」！',
    }[phase];
    body.innerHTML = `${header(s)}
      <div class="fx-water ${phase}">
        <div class="fx-dock"></div><div class="fx-line"></div><div class="fx-bobber"></div>
        <div class="fx-ripple"></div>
      </div>
      <p class="fx-msg" role="status">${msg}</p>
      ${phase === 'reel' ? `<div class="fx-qte"><div class="fx-zone"></div><div class="fx-ptr"></div></div>
        <div class="fx-reel-info"><span class="fx-hits"></span><span class="fx-lives"></span></div>` : ''}
      <button class="btn-primary fx-act" ${phase === 'idle' && left <= 0 ? 'disabled' : ''}>${phase === 'idle' ? '拋竿 🎣' : phase === 'reel' ? '收線！' : '拉！'}</button>
      <p class="fx-hint">也可以按鍵盤空白鍵。釣到的魚只存在這台裝置，純屬好玩。</p>`;
    if (phase === 'reel') updateReel();
  }

  function renderResult(s) {
    const f = catchFish;
    if (!f) { // 魚跑了
      body.innerHTML = `${header(s)}<div class="fx-result miss"><div class="fx-big">💨</div><h3>魚跑掉了……</h3><p>${reel?.r ? `感覺是一條<b style="color:${RARITY[reel.r].color}">${RARITY[reel.r].label}</b>的魚！` : '下次專心一點！'}</p></div>
        <button class="btn-primary fx-act">${DAILY - s.used > 0 ? '再釣一次' : '好吧'}</button>`;
      return;
    }
    const rr = RARITY[f.r];
    body.innerHTML = `${header(s)}
      <div class="fx-result r-${f.r}" style="--rc:${rr.color}">
        <div class="fx-flip"><div class="fx-back">?</div><div class="fx-front">
          ${f.isNew ? '<span class="fx-new">NEW!</span>' : ''}
          <div class="fx-rar">${stars(f.r)} ${rr.label}</div>
          <div class="fx-big">${fishEm(f)}</div>
          <h3>${f.name}</h3><p class="fx-size">${f.cm >= 100 ? (f.cm / 100).toFixed(1) + ' 公尺' : f.cm + ' 公分'}${f.best ? '・新紀錄！' : ''}</p>
          <p class="fx-desc">${f.desc}</p>
        </div></div>
      </div>
      <button class="btn-primary fx-act">${DAILY - s.used > 0 ? '再釣一次' : '收竿，明天見'}</button>`;
  }

  function renderDex() {
    const s = load();
    const got = FISH.filter((f) => s.dex[f.id]).length;
    body.innerHTML = `<p class="fx-dex-sum">已收集 <b>${got}</b> / ${FISH.length} 種・總共釣到 ${s.total} 條</p>
      ${Object.keys(RARITY).map((r) => `<div class="fx-dex-row"><h4 style="color:${RARITY[r].color}">${stars(r)} ${RARITY[r].label}<small>（${Math.round(RARITY[r].rate * 100)}%）</small></h4>
        <div class="fx-dex">${FISH.filter((f) => f.r === r).map((f) => {
          const d = s.dex[f.id];
          return `<div class="fx-dex-card${d ? '' : ' locked'}" style="--rc:${RARITY[r].color}">${fishEm(f, !d)}<b>${d ? f.name : '？？？'}</b><small>${d ? `×${d.n}・最大 ${d.best >= 100 ? (d.best / 100).toFixed(1) + 'm' : d.best + 'cm'}` : '還沒釣到'}</small></div>`;
        }).join('')}</div></div>`).join('')}`;
  }

  function render() {
    const hadFocus = el.contains(document.activeElement) && document.activeElement.classList.contains('fx-act');
    el.querySelectorAll('.fx-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'dex') renderDex(); else renderFish();
    if (hadFocus) body.querySelector('.fx-act')?.focus({ preventScroll: true });
  }

  // ---------- 流程 ----------
  function cast() {
    const s = today(load());
    if (s.used >= DAILY) return;
    s.used += 1; // 拋竿就算一次（像抽卡一樣）
    save(s);
    phase = 'waiting';
    catchFish = null; reel = null;
    render();
    timer = setTimeout(() => {
      phase = 'bite';
      biteAt = performance.now();
      render();
      navigator.vibrate?.(120);
      timer = setTimeout(() => { if (phase === 'bite') escape(); }, 1100);
    }, 1500 + rand() * 3000);
  }

  function startReel() {
    clearTimeout(timer);
    const s = load();
    const r = rollRarity(s);
    const cfg = RARITY[r];
    reel = { r, cfg, hits: 0, misses: 0, pos: 0, dir: 1, zoneAt: 0.2 + rand() * (0.8 - cfg.zone - 0.2), last: performance.now() };
    phase = 'reel';
    render();
    cancelAnimationFrame(raf);
    const loop = (t) => {
      if (phase !== 'reel') return;
      const dt = Math.min(0.05, (t - reel.last) / 1000);
      reel.last = t;
      reel.pos += reel.dir * cfg.speed * dt;
      if (reel.pos > 1) { reel.pos = 2 - reel.pos; reel.dir = -1; }
      if (reel.pos < 0) { reel.pos = -reel.pos; reel.dir = 1; }
      body.querySelector('.fx-ptr')?.style.setProperty('left', `${reel.pos * 100}%`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function updateReel() {
    const z = body.querySelector('.fx-zone');
    if (!z) return;
    z.style.left = `${reel.zoneAt * 100}%`;
    z.style.width = `${reel.cfg.zone * 100}%`;
    body.querySelector('.fx-hits').innerHTML = `收線 ${'●'.repeat(reel.hits)}${'○'.repeat(reel.cfg.hits - reel.hits)}`;
    body.querySelector('.fx-lives').innerHTML = `釣線 ${'❤️'.repeat(2 - reel.misses)}${'🤍'.repeat(reel.misses)}`;
    body.querySelector('.fx-qte').classList.toggle('strong', reel.cfg.stars >= 3);
  }

  function reelTap() {
    const inZone = reel.pos >= reel.zoneAt && reel.pos <= reel.zoneAt + reel.cfg.zone;
    const qte = body.querySelector('.fx-qte');
    qte.classList.remove('hit', 'miss'); void qte.offsetWidth;
    if (inZone) {
      reel.hits += 1;
      qte.classList.add('hit');
      if (reel.hits >= reel.cfg.hits) return landed();
      reel.zoneAt = 0.05 + rand() * (0.9 - reel.cfg.zone);
    } else {
      reel.misses += 1;
      qte.classList.add('miss');
      navigator.vibrate?.(60);
      if (reel.misses >= 2) return escape();
    }
    updateReel();
  }

  function landed() {
    cancelAnimationFrame(raf);
    const s = load();
    const f = rollFish(reel.r);
    const prev = s.dex[f.id];
    f.isNew = !prev;
    f.best = !!prev && f.cm > prev.best;
    s.dex[f.id] = { n: (prev?.n || 0) + 1, best: Math.max(prev?.best || 0, f.cm) };
    s.total += 1;
    s.sincePity = RARITY[f.r].stars >= 3 ? 0 : s.sincePity + 1;
    save(s);
    catchFish = f;
    phase = 'result';
    render();
  }

  function escape() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    catchFish = null;
    phase = 'result';
    render();
  }

  function act() {
    if (phase === 'idle') cast();
    else if (phase === 'waiting') { body.querySelector('.fx-msg').textContent = '還沒上鉤喔，再等等！'; }
    else if (phase === 'bite') startReel();
    else if (phase === 'reel') reelTap();
    else if (phase === 'result') { phase = 'idle'; render(); }
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('fx-close')) return close();
    if (b.dataset.tab) { if (phase === 'idle' || phase === 'result') { tab = b.dataset.tab; render(); } return; }
    if (b.classList.contains('fx-act')) act();
  });
  // 掛在 window：畫面更新會換掉按鈕，焦點不一定還在視窗裏
  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === ' ' && tab === 'fish' && !e.repeat && !e.target.closest?.('.fx-tabs, .fx-close')) {
      e.preventDefault();
      if (!body.querySelector('.fx-act')?.disabled) act();
    }
  }, true);

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    el.hidden = false;
    if (phase !== 'result') phase = 'idle';
    tab = 'fish';
    render();
    el.querySelector('.fx-act')?.focus();
  }
  function close() {
    // 釣到一半關掉：這次機會已經用掉，魚算跑掉
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    if (phase !== 'idle' && phase !== 'result') phase = 'idle';
    el.hidden = true;
    lastFocus?.focus?.();
  }
  return { open, close };
}
