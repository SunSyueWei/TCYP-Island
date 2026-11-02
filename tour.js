// 操作教學：介紹各群島與按鈕，並特別標出新功能
// 第一次來、或有沒看過的新功能時自動跳出；其他時候不打擾。小島目錄的「❓ 教學」可以隨時重看。

// 新功能清單：每次網站有新功能就在最前面加一筆（id 用日期，越新越大）。看過的人不會再自動跳出。
export const FEATURES = [
  {
    id: '2026-11-03',
    items: [
      ['🐑', '小羊群島', '你在代禱牆登記的朋友會變成小羊，每天為他們禱告，小羊就會長大！'],
      ['🕯️', '金香壇之島', '代禱牆搬到小羊群島中央的金香壇之島。'],
      ['🙋', '認領以前的登記', '以前在舊網站登記過？找到那一筆按「這是我登記的」，服事者確認後就是你的。'],
      ['🟩', '綠框＝已進小排', '代禱牆上綠框的朋友，代表已經進了小排。'],
      ['🗺️', '群島切換', '下方的「群島」按鈕可以在各個群島之間移動。'],
    ],
  },
];
const LATEST = FEATURES[0].id;
const SEEN_KEY = 'tcyp-tour-seen';
const read = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* 無痕模式 */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createTour({ isStaff, prepare }) {
  const el = document.createElement('div');
  el.className = 'tour';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '操作教學');
  el.innerHTML = '<div class="tour-spot" aria-hidden="true"></div><div class="tour-card"></div>';
  document.body.appendChild(el);
  const spot = el.querySelector('.tour-spot'), card = el.querySelector('.tour-card');

  let steps = [], i = 0, newSince = '';
  const isNew = (f) => !!f && !!newSince && f > newSince;   // 第一次來的人每個功能都是新的，就不另外標

  function buildSteps(onlyNew) {
    const fresh = newSince ? FEATURES.filter((f) => f.id > newSince).flatMap((f) => f.items) : [];
    const all = [
      { title: '歡迎來到台中青少年小島！', html: `<p>這裏是台中市召會青少年的小島城市。這段教學帶你認識各個群島和按鈕，大約一分鐘，隨時可以跳過。</p>${fresh.length ? whatsNew(fresh) : ''}` },
      { title: '🏝️ 青少年群島', html: '<p>每一座小島都有不同的資訊：活動行事曆、校園排、社區排、特會、之家……<b>點一下小島</b>就會打開介紹。可以拖曳旋轉、用兩指或滾輪縮放。</p>' },
      { target: '#menuBtn', title: '☰ 小島目錄', html: '<p>所有小島的清單在這裏，找不到小島時按這個最快。</p>' },
      { target: '#meBtn', title: '👤 我的島民', html: '<p>捏一個自己的島民，用 Google 帳號登入後，大家都能在島上看到你。</p>' },
      { target: '#fishBtn', title: '🎣 釣魚', html: '<p>每天可以在福音港灣釣 3 次魚，收集不同稀有度的魚。</p>' },
      { target: '#peopleBtn', title: '👥 島民名單', html: '<p>看看還有誰在島上，點名字可以看他的島民。</p>' },
      { target: '#archBtn', title: '🗺️ 群島', html: '<p>這裏可以切換到其他群島。</p>', feature: '2026-11-03' },
      { title: '🐑 小羊群島', feature: '2026-11-03', html: '<p>中央是<b>🕯️ 金香壇之島</b>，代禱牆就在這裏：把你邀約的朋友加進代禱名單，大家一起為他們禱告。</p><p>旁邊的牧場住著<b>你的小羊</b>：你登記的每一位朋友都是一隻小羊。每天點小羊、為他禱告一次，小羊就會長大，還能收集徽章。</p><p>以前在舊網站登記過？打開代禱牆，找到那一筆按<b>🙋 這是我登記的</b>。</p>' },
      { title: '🗝️ 服事者群島', when: isStaff, html: '<p>你是服事者，所以看得到服事者群島：服事者公告、Drive 檔案、召會生活統計。代禱牆裏也有服事者分頁，可以核准認領、看小羊群島的統計。</p>' },
      { title: '準備好了！', html: '<p>想再看一次教學，打開<b>☰ 小島目錄</b>，按右上角的<b>❓ 教學</b>。</p><p>祝你在小島上玩得開心 🌱</p>' },
    ].filter((s) => !s.when || s.when());
    // 有新功能時：先看「新功能」，再看標了「新」的步驟，其他步驟跳過
    if (onlyNew) return [{ title: '✨ 網站有新功能', html: whatsNew(fresh) + '<p class="tour-sub">接下來帶你看看新功能在哪裏。</p>' }, ...all.filter((s) => isNew(s.feature)), all[all.length - 1]];
    return all;
  }
  function whatsNew(items) {
    return `<ul class="tour-new">${items.map(([em, t, d]) => `<li><span>${em}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('')}</ul>`;
  }

  function place() {
    const s = steps[i];
    const t = s.target && document.querySelector(s.target);
    const r = t && t.offsetParent !== null && getComputedStyle(t).visibility !== 'hidden' ? t.getBoundingClientRect() : null;
    el.classList.toggle('no-spot', !r || !r.width);
    if (r && r.width) {
      const pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      // 說明卡放在目標的上方或下方，盡量不擋住
      const below = r.top < innerHeight / 2;
      card.style.top = below ? `${Math.min(innerHeight - card.offsetHeight - 12, r.bottom + 14)}px` : `${Math.max(12, r.top - card.offsetHeight - 14)}px`;
      card.style.left = `${Math.min(innerWidth - card.offsetWidth - 12, Math.max(12, r.left + r.width / 2 - card.offsetWidth / 2))}px`;
    } else {
      card.style.top = `${Math.max(12, (innerHeight - card.offsetHeight) / 2)}px`;
      card.style.left = `${Math.max(12, (innerWidth - card.offsetWidth) / 2)}px`;
    }
  }
  function render() {
    const s = steps[i];
    card.innerHTML = `<div class="tour-head"><b>${s.title}${isNew(s.feature) ? '<span class="tour-badge">新</span>' : ''}</b><small>${i + 1} / ${steps.length}</small></div>
      <div class="tour-body">${s.html}</div>
      <div class="tour-acts"><button data-t="skip" class="tour-skip">跳過教學</button>
        ${i > 0 ? '<button data-t="prev">上一步</button>' : ''}<button data-t="next" class="tour-next">${i === steps.length - 1 ? '開始探索' : '下一步'}</button></div>`;
    place();
    card.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function start(onlyNew = false) {
    newSince = read();
    prepare?.();
    steps = buildSteps(onlyNew);
    i = 0;
    el.hidden = false;
    render();
  }
  function end() { el.hidden = true; markSeen(); }
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-t]')?.dataset.t;
    if (a === 'skip') end();
    if (a === 'prev' && i > 0) { i--; render(); }
    if (a === 'next') { if (i < steps.length - 1) { i++; render(); } else end(); }
  });
  document.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === 'Escape') end();
    if (e.key === 'ArrowRight') card.querySelector('.tour-next')?.click();
    if (e.key === 'ArrowLeft') card.querySelector('[data-t="prev"]')?.click();
  });
  addEventListener('resize', () => { if (!el.hidden) place(); });

  // 自動跳出：第一次來（等開場卡片關掉）或有沒看過的新功能；海嘯警報開著時等它關掉
  function autoStart() {
    const seen = read();
    if (seen >= LATEST) return;
    const ready = () => document.getElementById('intro')?.classList.contains('gone') && !document.querySelector('.tsunami:not([hidden])');
    const tick = () => { if (!el.hidden) return; if (ready()) start(!!seen); else setTimeout(tick, 500); };
    setTimeout(tick, 800);
  }
  return { start, autoStart, isOpen: () => !el.hidden };
}
