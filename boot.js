// 啟動：瀏覽器支援 WebGL 就載入 3D 小島，否則（或載入失敗、逾時）改用純文字版
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let fellBack = false;
async function textMode(reason) {
  if (fellBack) return;
  fellBack = true;
  const m = await import('./textmode.js');
  m.start({ reason, canTry3D: hasWebGL() });
}

const params = new URLSearchParams(location.search);
const wantText = params.has('text');

// LINE 的內建瀏覽器（尤其安卓）跑 3D 容易卡住，也不能用 Google 登入、不能加到主畫面：
// 請 LINE 改用手機預設瀏覽器打開。已經帶過參數還在 LINE 裏（舊版 LINE 不支援），就照常載入，不會一直跳。
const inLine = /\bLine\//i.test(navigator.userAgent);
if (inLine && !params.has('openExternalBrowser')) {
  params.set('openExternalBrowser', '1');
  document.getElementById('loading').innerHTML = '正在用手機瀏覽器打開…<br><small>如果沒有跳出，請點右上角「⋮」選「用預設瀏覽器開啟」</small>';
  location.replace(location.pathname + '?' + params + location.hash);
} else {
  import('./pwa.js').catch(() => { /* 加到主畫面是加分功能，失敗不影響網站 */ });
  if (wantText || !hasWebGL()) {
    textMode(wantText ? 'user' : 'nogl');
  } else {
    const timer = setTimeout(() => { if (!window.__tcypReady) textMode('timeout'); }, 12000);
    import('./main.js')
      .then(() => { if (window.__tcypReady) clearTimeout(timer); })
      .catch((err) => { console.error(err); clearTimeout(timer); textMode('error'); });
  }
}
