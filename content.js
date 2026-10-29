// 各小島的面板內容
import { SITE, EVENTS, CAMPUS, COMMUNITY, GLORY } from './data.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];

// ---------- 台北時間 ----------
export function taipeiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  const date = `${g('year')}-${g('month')}-${g('day')}`;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { date, day, hour: +g('hour'), minute: +g('minute'), second: +g('second') };
}

const toUTC = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const wdOf = (s) => WD[new Date(toUTC(s)).getUTCDay()];

export function eventStatus(ev, today) {
  const end = ev.end || ev.start;
  if (end < today) return 'past';
  if (ev.start <= today) return 'now';
  return 'future';
}

export function nextEvent(today) {
  return EVENTS.find((e) => eventStatus(e, today) !== 'past') || null;
}

export function daysUntil(date, today) {
  return Math.round((toUTC(date) - toUTC(today)) / 86400000);
}

export const isTentative = (ev) => ev.status === 'tentative';

// 只計算每週固定的排；每月、隔週的排無法從星期判斷是否就是今天
export function todaysGroups(day) {
  return {
    campus: CAMPUS.filter((c) => c.day === day && !c.freq),
    community: COMMUNITY.filter((c) => c.day === day && !c.freq),
  };
}

const findEvent = (title) => EVENTS.find((e) => e.title.includes(title));

// 得榮少年申請期間：回傳目前是否受理，以及本期結束日或下一期開始日
export function gloryWindow(today) {
  const y = +today.slice(0, 4), mmdd = today.slice(5);
  const fmt = (d) => `${+d.slice(0, 2)}/${+d.slice(3)}`;
  for (const [a, b] of GLORY.windows) if (mmdd >= a && mmdd <= b) return { open: true, end: fmt(b) };
  const next = GLORY.windows.find(([a]) => a > mmdd) || GLORY.windows[0];
  return { open: false, start: `${next === GLORY.windows[0] && next[0] < mmdd ? y + 1 : y}/${fmt(next[0])}` };
}

// ---------- 小元件 ----------
const sec = (title, inner) => `<section class="p-sec">${title ? `<h3>${title}</h3>` : ''}${inner}</section>`;
const hero = (id, sub) => {
  const isl = ISLANDS.find((x) => x.id === id);
  return `<div class="p-hero" style="--c:${isl.tint}"><div class="em">${isl.emoji}</div><h2>${isl.name}</h2><p>${sub}</p></div>`;
};
const goto = (ids) =>
  `<div class="goto">${ids.map((id) => {
    const i = ISLANDS.find((x) => x.id === id);
    return `<button data-goto="${id}">${i.emoji} ${i.name}</button>`;
  }).join('')}</div>`;

function contactHTML() {
  return SITE.contact
    ? `私訊 <a href="${SITE.contact.url}" target="_blank" rel="noopener">${SITE.contact.label}</a>`
    : '主日聚會時向青少年服事者詢問';
}

function statusChip(ev, today) {
  const st = eventStatus(ev, today);
  if (st === 'past') return '<span class="chip gray">已結束</span>';
  if (st === 'now') return '<span class="chip hot">進行中</span>';
  if (isTentative(ev)) return '<span class="chip warn">暫定</span>';
  return '<span class="chip">已確認</span>';
}

const range = (ev) => (ev.end ? `${md(ev.start)}（${wdOf(ev.start)}）–${md(ev.end)}（${wdOf(ev.end)}）` : `${md(ev.start)}（${wdOf(ev.start)}）`);

// 完整活動卡：未結束的活動會列出參加需要的資訊
function eventCard(ev, today) {
  const st = eventStatus(ev, today);
  const head = `<b>${ev.title}</b>${statusChip(ev, today)}`;
  if (st === 'past') {
    return `<li class="ev-card past">${head}<small>${ev.start.slice(0, 4)}/${range(ev)}・${ev.place}</small></li>`;
  }
  const tbd = '<span class="tbd">待公布</span>';
  const rows = [
    ['適合對象', ev.audience || tbd],
    ['日期時間', `${ev.start.slice(0, 4)}/${range(ev)}${ev.time ? '<br>' + ev.time : ''}`],
    ...(ev.meet ? [['集合', ev.meet]] : []),
    ['地點', ev.place],
    ['報名方式', ev.signup || tbd],
    ...(ev.deadline || !ev.signup ? [['報名截止', ev.deadline ? md(ev.deadline) : tbd]] : []),
    ['費用', ev.fee || tbd],
    ['詢問', contactHTML()],
  ];
  const bullets = (title, items) => (items?.length ? `<div class="ev-sub"><b>${title}</b><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : '');
  return `<li class="ev-card">${head}
    ${ev.note ? `<small class="ev-note">※ ${ev.note}</small>` : ''}
    <dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${bullets('行程重點', ev.plan)}${bullets('行前準備', ev.prep)}${bullets('攜帶物品', ev.bring)}</li>`;
}

function eventItem(ev, today, isNext) {
  const st = eventStatus(ev, today);
  return `<li class="ev ${st === 'past' ? 'past' : ''} ${isNext ? 'next' : ''}">
    <div class="d"><b>${md(ev.start)}</b><i>週${wdOf(ev.start)}</i></div>
    <div><b>${ev.title}</b>${statusChip(ev, today)}
      <small>${ev.end ? `${md(ev.start)}–${md(ev.end)}` : md(ev.start)}${ev.time ? '・' + ev.time : ''}・${ev.place}</small></div>
  </li>`;
}

function groupList(items, filterDay, showDay) {
  const list = filterDay == null ? items : items.filter((c) => c.day === filterDay);
  if (!list.length) return '<p class="hint">這一天沒有固定的排聚集，歡迎參加主日聚會，或看看其他天！</p>';
  const areas = [...new Set(list.map((c) => c.area))];
  return areas.map((a) => `<div class="group-title">${a} 照顧區</div><ul class="list">${
    list.filter((c) => c.area === a).map((c) => `<li><div class="row"><b>${c.name}${c.freq ? `<span class="chip warn">${c.freq}</span>` : ''}</b>
      <span class="t">${showDay ? '週' + WD[c.day] + ' ' : ''}${c.time || '<span class="tbd">時間請洽詢</span>'}</span></div>
      <small>📍 ${c.place || '地點請洽服事者'}${c.freq ? '・定期聚集，請先確認日期' : ''}</small></li>`).join('')
  }</ul>`).join('');
}

function dayTabs(name, active) {
  return `<div class="tabs" data-tabs="${name}">${[['all', '全部'], ...[1, 2, 3, 4, 5, 6, 0].map((d) => [d, '週' + WD[d]])]
    .map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(active) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

const groupHint = `<p class="hint">第一次參加前，請先${contactHTML()} 確認時間和地點（考試週、假日可能調整）。聚集在校內或家中的排，地點不在網站公開。</p>`;

// ---------- 小島定義 ----------
// angle：在環上的角度（度），center 為中央島
export const ISLANDS = [
  {
    id: 'plaza', name: '復興大樓廣場', short: '關於我們', emoji: '🏢', tint: '#ffe7b8', center: true,
    render: (now) => {
      const n = nextEvent(now.date);
      return hero('plaza', `${SITE.org}・歡迎來到青少年小島城市`)
        + sec('快速入口', `<div class="entries">
          <button data-goto="calendar"><span>📅</span><b>近期活動</b><small>${n ? n.title : '看行事曆'}</small></button>
          <button data-goto="campus"><span>🗓️</span><b>每週聚集</b><small>校園排・社區排</small></button>
          <button data-goto="plaza" data-anchor="first"><span>👋</span><b>第一次參加</b><small>怎麼開始？</small></button></div>`)
        + sec('我們是誰', `<p>我們是台中市召會的國中、高中青少年，在各區、各校園一同讀聖經、唱詩、禱告、彼此相調。從國一到高三，每一位青少年都有哥哥姊姊和服事者陪伴長大。</p>
          <div class="verse">${SITE.tagline}</div>`)
        + `<div id="first"></div>` + sec('👋 第一次參加', `<ul class="list">
          <li><span class="num">1</span><b>找一個離你近的排</b><small>看看「校園排」或「社區排」，找同校或住家附近的聚集。</small></li>
          <li><span class="num">2</span><b>先聯絡，再出發</b><small>${contactHTML()}，確認時間和地點；也可以請認識的同學帶你一起去。</small></li>
          <li><span class="num">3</span><b>家長也歡迎一起來</b><small>家長可以陪同參加，也可以先向服事者了解活動內容。</small></li>
          <li><span class="num">4</span><b>參加大型活動</b><small>特會、期初特會等活動會發報名通啟，列出對象、費用與截止日。</small></li></ul>`)
        + sec('台中青少年小檔案', `<div class="stats">
          <div class="stat"><b>${CAMPUS.length}</b><span>校園排</span></div>
          <div class="stat"><b>${COMMUNITY.length}</b><span>社區青少年排</span></div>
          <div class="stat"><b>2</b><span>寒暑假特會/年<br>（國中組・高中組）</span></div></div>`)
        + sec('追蹤我們', `<div class="goto">${SITE.links.map((l) => `<a class="link-btn" href="${l.url}" target="_blank" rel="noopener">${l.icon} ${l.label}</a>`).join('')}</div>`)
        + sec('探索其他小島', goto(['calendar', 'campus', 'community', 'camp', 'pillar', 'harbor', 'home', 'glory', 'garden']));
    },
  },
  {
    id: 'calendar', name: '行事曆鐘樓', short: '行事曆', emoji: '🕰️', tint: '#ffd9cc', angle: 80,
    badge: (now) => {
      const n = nextEvent(now.date);
      if (!n) return '';
      return isTentative(n) ? '暫定' : `${Math.max(0, daysUntil(n.start, now.date))}天`;
    },
    render: (now) => {
      const n = nextEvent(now.date);
      let top = '';
      if (n) {
        const d = daysUntil(n.start, now.date);
        const cd = d > 0 && !isTentative(n)
          ? `<div class="countdown"><div><b>${d}</b><span>天後</span></div></div>` : '';
        top = sec('下一場活動', `${cd}<ul class="list">${eventCard(n, now.date)}</ul>`);
      }
      return hero('calendar', '青少年活動行事曆')
        + top
        + sec('全年行事曆', `<ul class="list">${EVENTS.map((e) => eventItem(e, now.date, e === n)).join('')}</ul>`)
        + sec('', '<p class="hint">「暫定」表示日期還在規劃中；確切時間、費用與報名方式，以正式報名通啟為準。</p>');
    },
  },
  {
    id: 'campus', name: '校園排學園', short: '校園排', emoji: '🏫', tint: '#d9ecff', angle: 40,
    badge: (now) => { const c = todaysGroups(now.day).campus.length; return c ? `今天${c}` : ''; },
    render: (now, state) => {
      const f = state.campusDay ?? now.day;
      return hero('campus', `全台中 ${CAMPUS.length} 個校園排，放學後與同學一起聚集`)
        + sec('什麼是校園排？', '<p>同校或鄰近學校的同學，放學後聚在一起讀聖經、禱告、唱詩、分享生活。我們也為身邊的同學與朋友禱告，並尊重他們的意願，邀請一起參加。</p>')
        + sec(f === 'all' ? '每週校園排' : (f === now.day ? `今天（週${WD[now.day]}）的校園排` : `週${WD[f]}的校園排`),
          dayTabs('campusDay', f) + groupList(CAMPUS, f === 'all' ? null : +f, f === 'all'))
        + sec('', groupHint);
    },
  },
  {
    id: 'community', name: '社區排小鎮', short: '社區排', emoji: '🏘️', tint: '#e3f2d4', angle: 0,
    badge: (now) => { const c = todaysGroups(now.day).community.length; return c ? `今天${c}` : ''; },
    render: (now, state) => {
      const f = state.commDay ?? now.day;
      return hero('community', `${COMMUNITY.length} 個社區青少年排，在住家附近聚集`)
        + sec('社區青少年排', '<p>不同學校、住在同一個社區的青少年，定期一起讀《聖經之旅》、生命讀經，還有愛筵和運動相調！</p>')
        + sec(f === 'all' ? '社區排聚集時間' : (f === now.day ? `今天（週${WD[now.day]}）的社區排` : `週${WD[f]}的社區排`), dayTabs('commDay', f) + groupList(COMMUNITY, f === 'all' ? null : +f, f === 'all'))
        + sec('', groupHint);
    },
  },
  {
    id: 'camp', name: '特會營地', short: '寒暑假特會', emoji: '⛺', tint: '#ffe9c7', angle: 320,
    render: (now) => {
      const w = findEvent('寒假特會');
      const s = findEvent('暑假特會');
      return hero('camp', '每年寒假、暑假，國中組・高中組的大型特會')
        + sec('❄️ 2027 青少年寒假特會', `<ul class="list">${eventCard(w, now.date)}</ul>
          <p style="margin-top:10px"><small>預計與竹苗地區的青少年一同參加，詳情以正式通啟為準。</small></p>`)
        + sec('特會裏有什麼？', '<div class="rings"><span>🎶 詩歌相調</span><span>📖 信息與小組</span><span>🍖 烤肉</span><span>🏃 大地遊戲</span><span>🍞 主日擘餅</span><span>🏆 展覽與頒獎</span></div>')
        + sec('活動回顧', `<ul class="list">${[s, findEvent('高三畢業生'), findEvent('一週成全')].map((e) => eventCard(e, now.date)).join('')}</ul>`);
    },
  },
  {
    id: 'pillar', name: '殿中柱子', short: '中幹成全', emoji: '🏛️', tint: '#fff2b3', angle: 280,
    render: (now) => {
      const ev = findEvent('中幹成全');
      const past = eventStatus(ev, now.date) === 'past';
      return hero('pillar', '青少年中幹成全・每年春季、秋季各一次')
        + sec('什麼是中幹成全？', '<p>「中幹」是在校園排、社區排裏願意多擔一點、照顧同伴的青少年。中幹成全幫助大家一起禱告、讀經，學習關心身邊的同伴。</p>')
        + sec(past ? '活動回顧：2026 秋季中幹成全' : '2026 秋季中幹成全', `<ul class="list">${eventCard(ev, now.date)}</ul>
          <p style="margin-top:10px"><b>主題：作得勝的，在三一神裏成為柱子，並作發光之體顯在世界裏</b></p>
          <div class="verse">得勝的，我要叫他在我神殿中作柱子，他也絕不再從那裏出去。<cite>啟示錄 3:12 上</cite></div>
          <div class="verse">使你們無可指摘、純潔無雜，在彎曲悖謬的世代中，作神無瑕疵的兒女；你們在其中好像發光之體顯在世界裏，將生命的話表明出來。<cite>腓立比書 2:15～16 上</cite></div>`);
    },
  },
  {
    id: 'harbor', name: '福音港灣', short: '福音', emoji: '⛵', tint: '#d4f0ef', angle: 240,
    render: (now) => {
      const ev = findEvent('福音聚會');
      const past = eventStatus(ev, now.date) === 'past';
      return hero('harbor', '和同學朋友分享好消息')
        + sec('青少年福音聚會', `<p>每學期一次、全台中國高中生的福音聚會，歡迎邀請同學和朋友一起來！</p>
          ${past ? '<div class="group-title">活動回顧</div>' : ''}<ul class="list">${eventCard(ev, now.date)}</ul>
          ${past ? '<p class="hint" style="margin-top:10px">下一次福音聚會的日期公布後，會更新在行事曆。</p>' : ''}`)
        + sec('我可以怎麼做？', `<ul class="list">
          <li><span class="num">1</span>為身邊的同學與朋友<b>禱告</b></li>
          <li><span class="num">2</span>尊重朋友的意願，<b>邀請</b>他們參加校園排或福音聚會</li>
          <li><span class="num">3</span>朋友想更認識主，可以和服事者一起<b>聊聊</b></li></ul>`)
        + sec('看看哪裏有聚集', goto(['campus', 'community']));
    },
  },
  {
    id: 'home', name: '弟兄姊妹之家', short: 'BH&SH', emoji: '🏠', tint: '#ffe0e4', angle: 200,
    render: () => hero('home', '高中生一起生活的家')
      + sec('之家是什麼？', '<p>高中弟兄之家、姊妹之家是讓高中生一起住、一起生活的地方，弟兄與姊妹分開居住。</p>')
      + sec('之家的一天', `<ul class="list">
        <li><b>🌅 早晨</b><small>規律起床，和同伴一起晨興讀經、禱告</small></li>
        <li><b>📚 課業</b><small>放學後一起讀書，彼此鼓勵把課業顧好</small></li>
        <li><b>🙏 晚上</b><small>一起唱詩、禱告，規律作息</small></li></ul>`)
      + sec('誰可以參加？', '<p>高中弟兄、姊妹，經家長同意即可詢問。之家會不定期舉辦開放參觀與短期試住，讓學生和家長先認識生活內容。</p>')
      + sec('家長想了解', `<p>入住方式、費用、住宿規範與接送安排，歡迎家長${contactHTML()}詢問。</p>`),
  },
  {
    id: 'glory', name: '得榮少年', short: '得榮少年', emoji: '🌻', tint: '#fff0c2', angle: 160,
    badge: (now) => (gloryWindow(now.date).open ? '申請中' : ''),
    render: (now) => {
      const w = gloryWindow(now.date);
      return hero('glory', '得榮基金會「得榮少年教育專案」')
        + sec('什麼是得榮少年？', `<p>「得榮少年教育專案」由台北市私立得榮社會福利基金會推動，幫助因家庭經濟困難或遭逢變故、影響求學的少年人。基金會提供獎助學金，也由社區裏的關懷者陪伴少年人和家人，關心他們的生活、學習與身心靈成長。</p>`)
        + sec('申請時間', `<ul class="list"><li><b>${w.open ? '🟢 現在是申請期間' : '下一次申請'}</b>
            <small>${w.open ? `受理到 ${w.end}` : `${w.start} 開始受理`}（初次申請每年兩次：5/1–5/31、11/15–12/15）</small></li></ul>
          <p class="hint" style="margin-top:10px">申請資格、時間與獎助內容，以得榮基金會最新公告為準。</p>`)
        + sec('得榮少年會參加什麼？', `<ul class="list">
          <li><b>🏠 每月家訪</b><small>關懷者每月到家裏看望，關心少年人和家人</small></li>
          <li><b>📖 生命教育課程</b><small>申請前的生命教育課程</small></li>
          <li><b>🌱 生命成長園</b><small>每年一次的兩天一夜活動</small></li>
          <li><b>🤝 關懷服務活動</b><small>一起參與服務社會的公益活動</small></li>
          <li><b>🎓 證書頒發聚會</b><small>每學期一次，邀請家人一同出席</small></li></ul>`)
        + sec('近期活動', `<ul class="list">${eventCard(findEvent('得榮少年證書'), now.date)}</ul>`)
        + sec('想了解或申請', `<p>申請需由所在地區的關懷者協助。歡迎${contactHTML()}，我們會請住家附近的關懷者與你聯絡。</p>
          <div class="goto"><a class="link-btn" href="${GLORY.url}" target="_blank" rel="noopener">🌐 得榮基金會官網</a></div>`);
    },
  },
  {
    id: 'garden', name: '成長花園', short: '小六升國一', emoji: '🌱', tint: '#e6f4d0', angle: 120,
    render: (now) => hero('garden', '小五六・小六升國一')
      + sec('🌉 從兒童到青少年', `<p>小學五、六年級就可以先認識青少年的哥哥姊姊，小六下學期也歡迎先來青少年排看看！</p>
        <ul class="list">${[findEvent('迎新聚會'), findEvent('生命成長園'), findEvent('期初特會')].map((e) => eventCard(e, now.date)).join('')}</ul>`)
      + sec('家長可以怎麼陪伴？', `<ul class="list">
        <li><b>先認識</b><small>帶孩子參加期初特會的小五六喜樂相調，認識青少年的哥哥姊姊</small></li>
        <li><b>找一個排</b><small>小六下學期可以陪孩子先參加附近的青少年排</small></li>
        <li><b>有問題就問</b><small>${contactHTML()}</small></li></ul>`),
  },
];
