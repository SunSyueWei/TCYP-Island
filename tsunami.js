// 重大行動的「海嘯警報」：進入提醒期間後，每天第一次打開網站會有全螢幕海浪；之後上方一直顯示提醒條
import { upcomingMajor, isTentative } from './content.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const wd = (s) => WD[new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay()];
const range = (ev) => (ev.end ? `${md(ev.start)}（${wd(ev.start)}）– ${md(ev.end)}（${wd(ev.end)}）` : `${md(ev.start)}（${wd(ev.start)}）`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LEVEL = {
  warn: { tag: '海嘯警報', en: 'TSUNAMI WARNING' },
  urgent: { tag: '緊急警報', en: 'EMERGENCY ALERT' },
  now: { tag: '行動進行中', en: 'IN PROGRESS' },
};

function countdown(a) {
  if (a.level === 'now') return '<b>今天</b><span>進行中</span>';
  if (isTentative(a.ev)) return '<b>暫定</b><span>日期以通啟為準</span>';
  return `<b>${a.d}</b><span>天後</span>`;
}

export function createTsunami({ today, onDetails }) {
  const preview = new URLSearchParams(location.search).has('tsunami');
  const a = upcomingMajor(today, { preview });
  if (!a) return { active: false };
  const lv = LEVEL[a.level];
  const seenKey = `tcyp-tsunami:${a.ev.start}:${today}`;

  // 上方提醒條（一直顯示，點一下再看一次警報）
  const row = document.createElement('div');
  row.className = 'tsunami-row';
  row.innerHTML = `<button class="tsunami-bar lv-${a.level}" aria-label="${lv.tag}：${esc(a.ev.title)}，點一下看詳情"><span class="ts-siren" aria-hidden="true"></span>🌊 <b>${lv.tag}</b><span class="ts-bar-title">${esc(a.ev.title)}</span><span class="ts-bar-cd">${a.level === 'now' ? '進行中' : isTentative(a.ev) ? '暫定' : `倒數 ${a.d} 天`}</span></button>`;
  document.querySelector('.topbar').appendChild(row);

  // 全螢幕警報
  const el = document.createElement('div');
  el.className = `tsunami lv-${a.level}`;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'tsTitle');
  el.hidden = true;
  const tape = `<span>⚠ ${lv.tag}　${lv.en}　</span>`.repeat(8);
  el.innerHTML = `
    <div class="ts-flash" aria-hidden="true"></div>
    <div class="ts-tape top" aria-hidden="true"><div>${tape}${tape}</div></div>
    <svg class="ts-waves" viewBox="0 0 1440 600" preserveAspectRatio="none" aria-hidden="true">
      <path class="w3" d="M0,250 C180,180 360,320 540,250 C720,180 900,320 1080,250 C1260,180 1440,320 1620,250 C1800,180 1980,320 2160,250 C2340,180 2520,320 2700,250 L2880,250 L2880,600 L0,600 Z"/>
      <path class="w2" d="M0,300 C240,200 480,400 720,300 C960,200 1200,400 1440,300 C1680,200 1920,400 2160,300 C2400,200 2640,400 2880,300 L2880,600 L0,600 Z"/>
      <path class="w1" d="M0,360 C160,300 320,420 480,360 C640,300 800,420 960,360 C1120,300 1280,420 1440,360 C1600,300 1760,420 1920,360 C2080,300 2240,420 2400,360 C2560,300 2720,420 2880,360 L2880,600 L0,600 Z"/>
    </svg>
    <div class="ts-card">
      <div class="ts-badge"><span class="ts-siren" aria-hidden="true"></span>${lv.tag}<small>${lv.en}</small></div>
      <h2 id="tsTitle">${esc(a.ev.title)}</h2>
      <div class="ts-cd">${countdown(a)}</div>
      <ul class="ts-info">
        <li>📅 ${range(a.ev)}${a.ev.time ? `・${esc(a.ev.time)}` : ''}</li>
        ${a.ev.place ? `<li>📍 ${esc(a.ev.place)}</li>` : ''}
        ${a.ev.audience ? `<li>🙋 ${esc(a.ev.audience)}</li>` : ''}
      </ul>
      <p class="ts-call">${a.level === 'now' ? '一起在主面前同心守望！' : '重大行動即將到來，請預留時間、邀約同伴一起參加！'}</p>
      <div class="ts-acts"><button class="ts-go">查看活動詳情</button><button class="ts-ok">知道了</button></div>
    </div>`;
  document.body.appendChild(el);

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth; // 重新播放動畫
    el.classList.add('in');
    try { navigator.vibrate?.([300, 120, 300]); } catch { /* ignore */ }
    el.querySelector('.ts-ok').focus({ preventScroll: true });
  }
  function close() {
    el.hidden = true;
    try { localStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
    lastFocus?.focus?.({ preventScroll: true });
  }
  el.querySelector('.ts-ok').addEventListener('click', close);
  el.querySelector('.ts-go').addEventListener('click', () => { close(); onDetails?.(); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // 焦點留在警報裏
      const bs = [...el.querySelectorAll('button')];
      const i = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
  });
  row.querySelector('button').addEventListener('click', open);

  let seen = false;
  try { seen = localStorage.getItem(seenKey) === '1'; } catch { /* ignore */ }
  if (!seen || preview) setTimeout(open, 600);

  return { active: true, event: a.ev, level: a.level, open };
}
