// 純文字版：3D 無法執行時，或使用者選擇文字版時顯示
import { ISLANDS, taipeiNow } from './content.js';
import { SITE } from './data.js';

export function start({ reason, canTry3D }) {
  document.documentElement.classList.add('text-mode');
  for (const id of ['intro', 'loading', 'panel', 'menuBar', 'menu', 'pins', 'scene']) document.getElementById(id)?.remove();
  document.getElementById('live')?.remove();
  document.getElementById('nightBtn')?.remove();

  const state = {};
  let fishingUI = null;
  const root = document.createElement('main');
  root.id = 'textSite';
  const note = reason === 'user' ? ''
    : `<p class="hint">這台裝置無法顯示 3D 小島，已為你切換成文字版，所有資訊都一樣。</p>`;
  root.innerHTML = `
    <div class="t-head">
      <h1>台中青少年 <span>TCYP</span></h1>
      <p>${SITE.tagline}</p>
      ${note}
      <p class="t-links">${SITE.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.icon} ${l.label}</a>`).join('')}
        ${canTry3D ? '<a href="./">🏝️ 切換到 3D 小島版</a>' : ''}<a href="privacy.html">🔒 隱私說明</a><a href="#" data-open="fishing">🎣 釣魚</a></p>
      <nav class="t-nav" aria-label="目錄">${ISLANDS.map((i) => `<a href="#t-${i.id}">${i.emoji} ${i.short}</a>`).join('')}</nav>
    </div>
    ${ISLANDS.map((i) => `<article class="t-card" id="t-${i.id}" data-id="${i.id}"></article>`).join('')}`;
  document.body.appendChild(root);

  const render = (id) => {
    const isl = ISLANDS.find((i) => i.id === id);
    const el = root.querySelector(`#t-${id}`);
    el.innerHTML = isl.render(taipeiNow(), state);
  };
  ISLANDS.forEach((i) => render(i.id));

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-open="fishing"]')) {
      e.preventDefault();
      import('./fishing.js').then((m) => { fishingUI ||= m.createFishing(); fishingUI.open(); });
      return;
    }
    const g = e.target.closest('[data-goto]');
    if (g) {
      e.preventDefault();
      const target = g.dataset.anchor ? root.querySelector('#' + g.dataset.anchor) : root.querySelector('#t-' + g.dataset.goto);
      target?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const tab = e.target.closest('[data-tabs] button');
    if (tab) {
      state[tab.parentElement.dataset.tabs] = tab.dataset.v === 'all' ? 'all' : +tab.dataset.v;
      render(tab.closest('.t-card').dataset.id);
    }
  });

  const hash = location.hash.slice(1).replace(/^t-/, '');
  if (ISLANDS.some((i) => i.id === hash)) root.querySelector('#t-' + hash)?.scrollIntoView();
}
