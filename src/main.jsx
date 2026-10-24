import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App, detectLayout } from './app.jsx';
import * as st from './store.js';
import { getS, setS, useS } from './store.js';
import * as db from './db.js';
import { setArchiveImages, gcImages } from './images.js';
import { bookTitle } from './util.js';

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
function initTheme() {
  let t = ls.get('jbs-theme');
  if (t !== 'dark' && t !== 'light') { try { t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { t = 'light'; } }
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#191919' : '#ffffff');
  return t;
}
function loadSettings() {
  try { return { ...getS().settings, ...JSON.parse(ls.get('jbs-settings') || '{}') }; } catch { return getS().settings; }
}
function TitleSync() {
  const t = useS((s) => {
    const g = s.currentId && s.view !== 'library' ? s.games[s.currentId] : null;
    return (g ? bookTitle(g.title) + ' · ' : '') + (s.readOnly ? '剧本杀小助手存档' : '剧本杀小助手');
  });
  useEffect(() => { document.title = t; }, [t]);
  return null;
}

async function boot() {
  const theme = initTheme();
  const settings = loadSettings();
  const lay = detectLayout();
  const archEl = document.getElementById('jbs-archive');
  if (archEl) {
    let data = null;
    try { data = JSON.parse(archEl.textContent); } catch {}
    const games = {};
    for (const g of data?.games || []) if (g && Array.isArray(g.cards)) { const m = st.migrate(g); games[m.id] = m; }
    setArchiveImages(data?.images || {});
    const first = Object.values(games)[0];
    setS({ ready: true, readOnly: true, archive: { exportedAt: data?.exportedAt || null }, games, theme, settings, ...lay, ...(first ? { currentId: first.id, view: 'board' } : { view: 'library' }) });
    return;
  }
  let list = [];
  try { list = await db.all('games'); } catch {}
  const games = {};
  for (const g of list || []) if (g && Array.isArray(g.cards)) { const m = st.migrate(g); games[m.id] = m; }
  setS({ games, theme, settings, ...lay });
  if (!ls.get('jbs-inited')) {
    if (!Object.keys(games).length) st.addGame(st.newGame({ title: '离家出走', genre: '刑侦本', status: 'planned' }));
    ls.set('jbs-inited', '1');
  }
  setS({ ready: true });
  const last = ls.get('jbs-last');
  if (last && getS().games[last]) st.openGame(last);

  // 后台任务
  db.isMemory().then((m) => { if (m) st.toast('当前浏览器无法保存数据（可能是无痕模式），关闭前记得导出备份', null, 9000); }).catch(() => {});
  setTimeout(() => {
    if (!/firefox/i.test(navigator.userAgent)) navigator.storage?.persisted?.().then((p) => { if (!p) navigator.storage.persist?.(); }).catch(() => {});
  }, 3000);
  setTimeout(() => { gcImages(Object.values(getS().games)).catch(() => {}); }, 4000);
  if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
    const hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadCtl) st.toast('小助手已更新到新版本', { label: '刷新', fn: async () => { await st.flush(); location.reload(); } }, 10000);
    });
    const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (document.readyState === 'complete') reg(); else addEventListener('load', reg, { once: true });
  }
}

addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') st.flush(); });
addEventListener('pagehide', () => { st.flush(); });

const root = createRoot(document.getElementById('root'));
root.render(<><App /><TitleSync /></>);
boot().catch((e) => {
  console.error(e);
  setS({ ready: true });
  st.toast('启动时出错：' + (e?.message || e), null, 9000);
});
