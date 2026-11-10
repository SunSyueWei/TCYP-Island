// 加到主畫面（PWA）：註冊 service worker，並讓「📲 加到主畫面」按鈕能用
// - 安卓 Chrome、電腦版 Chrome/Edge：跳出瀏覽器的安裝視窗
// - iPhone/iPad 和其他瀏覽器：沒有安裝視窗，改顯示操作說明
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker 註冊失敗', err));
}

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const buttons = [...document.querySelectorAll('.pwa-install')];
let deferred = null;

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
addEventListener('appinstalled', () => { deferred = null; buttons.forEach((b) => { b.hidden = true; }); });

function howTo() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return '點瀏覽器的<b>分享</b>按鈕（方框加向上箭頭 <span aria-hidden="true">⬆️</span>），往下找到<b>「加入主畫面」</b>。<br><small>iPhone 請用 Safari 打開；在 LINE、IG 裏要先改用瀏覽器開啟。</small>';
  }
  if (/Android/.test(ua)) {
    return '點瀏覽器右上角的 <b>⋮</b>，選<b>「加到主畫面」</b>或<b>「安裝應用程式」</b>。';
  }
  return '點網址列右邊的<b>安裝</b>圖示，或在瀏覽器選單中選<b>「安裝」</b>／<b>「應用程式」</b>。';
}

function showTip() {
  const tip = document.createElement('div');
  tip.className = 'pwa-tip';
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-modal', 'true');
  tip.setAttribute('aria-label', '加到主畫面');
  tip.innerHTML = `<div class="pwa-card"><b>📲 加到主畫面</b><p>${howTo()}</p><p class="pwa-small">加好之後，從手機桌面的 TCYP 圖示打開，就像一個 App。</p><button class="btn-primary">知道了</button></div>`;
  const close = () => { tip.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  tip.addEventListener('click', (e) => { if (e.target === tip || e.target.tagName === 'BUTTON') close(); });
  addEventListener('keydown', onKey, true);
  document.body.appendChild(tip);
  tip.querySelector('button').focus();
}

if (!standalone) {
  buttons.forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!deferred) return showTip();
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
    });
  });
}
