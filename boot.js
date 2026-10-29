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

const wantText = new URLSearchParams(location.search).has('text');

if (wantText || !hasWebGL()) {
  textMode(wantText ? 'user' : 'nogl');
} else {
  const timer = setTimeout(() => { if (!window.__tcypReady) textMode('timeout'); }, 12000);
  import('./main.js')
    .then(() => { if (window.__tcypReady) clearTimeout(timer); })
    .catch((err) => { console.error(err); clearTimeout(timer); textMode('error'); });
}
