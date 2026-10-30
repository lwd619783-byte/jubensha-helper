// 剧本杀小助手 · 构建脚本
// 用法：npm install && npm run build
// 产物直接写到仓库根目录，GitHub Pages 选「main 分支 / 根目录」即可发布：
//   index.html            在线版（配合 sw.js 离线可用，可添加到桌面）
//   sw.js                 Service Worker：缓存应用，断网也能打开
//   manifest.webmanifest  应用清单
//   icon.svg / icon-maskable.svg
//   剧本杀小助手.html      单文件离线版：不依赖网络，下载后直接用浏览器打开
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(root, f), 'utf8');
const write = (f, s) => writeFileSync(join(root, f), s);
const pkg = JSON.parse(read('package.json'));

const NAME = '剧本杀小助手';
const DESC = '剧本杀线索整理笔记：思维导图 + 笔记，支持导出图片与离线存档';
const ACCENT = '#5e6ad2';

/* ---------- 图标 ---------- */
const GLYPH = '<circle cx="29" cy="29" r="13" fill="none" stroke="#fff" stroke-width="5.5"/><path d="M39 39l10 10" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>';
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${ACCENT}"/>${GLYPH}</svg>`;
// maskable：铺满背景，图形缩到安全区内
const ICON_MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${ACCENT}"/><g transform="translate(32 32) scale(0.8) translate(-32 -32)">${GLYPH}</g></svg>`;
const ICON_DATA = 'data:image/svg+xml,' + encodeURIComponent(ICON);

/* ---------- 打包 JS / CSS ---------- */
const bundle = await build({
  entryPoints: [join(root, 'src/main.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  target: 'es2020',
  charset: 'utf8',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
// 内联到 <script> 里：避免出现 </script 与 <!--
const js = bundle.outputFiles[0].text.trim().replace(/<\/script/gi, '\\x3C/script').replace(/<!--/g, '\\x3C!--');
const css = (await transform(read('src/styles.css'), { loader: 'css', minify: true, charset: 'utf8', logLevel: 'warning' })).code.trim().replace(/<\/style/gi, '<\\/style');
const VERSION = pkg.version + '-' + createHash('sha256').update(js).update(css).digest('hex').slice(0, 10);

/* ---------- HTML ---------- */
// 首帧前确定深浅色，避免闪烁
const THEME_INIT = "(function(){try{var t=localStorage.getItem('jbs-theme');if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;if(t==='dark')document.querySelector('meta[name=theme-color]').setAttribute('content','#191816')}catch(e){}})()";
const page = (online) => '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">'
  + '<meta name="theme-color" content="#fdfcf9">'
  + '<script>' + THEME_INIT + '</script>'
  + '<title>' + NAME + '</title>'
  + '<meta name="description" content="' + DESC + '">'
  + '<meta name="mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-title" content="' + NAME + '">'
  + (online
    ? '<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="./icon.svg">'
    : '<link rel="icon" type="image/svg+xml" href="' + ICON_DATA + '">')
  + '<style id="app-style">' + css + '</style></head>'
  + '<body><div id="root"></div><script id="app-script">' + js + '</script></body></html>\n';

/* ---------- 清单 & Service Worker ---------- */
const manifest = {
  id: './',
  name: NAME,
  short_name: NAME,
  description: DESC,
  lang: 'zh-CN',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#fdfcf9',
  theme_color: '#fdfcf9',
  icons: [
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
  ],
};
const SW = `// ${NAME} · Service Worker（由 build.mjs 生成）
const CACHE = 'jbs-${VERSION}';
const ASSETS = ['./', './manifest.webmanifest', './icon.svg', './icon-maskable.svg'];
const SCOPE = self.registration.scope;
const SHELL = new Set([SCOPE, SCOPE + 'index.html']);
const STATIC = new Set(ASSETS.slice(1).map((a) => new URL(a, SCOPE).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('jbs-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 先用缓存秒开，同时在后台更新；断网时直接用缓存
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const href = req.url.split('#')[0].split('?')[0];
  const shell = SHELL.has(href);
  if (!shell && !STATIC.has(href)) return;
  const key = shell ? SCOPE : href;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    const net = fetch(req).then(async (res) => {
      if (res.ok && !res.redirected) await cache.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })());
});
`;

write('index.html', page(true));
write(NAME + '.html', page(false));
write('sw.js', SW);
write('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
write('icon.svg', ICON + '\n');
write('icon-maskable.svg', ICON_MASKABLE + '\n');
write('.nojekyll', '');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`✓ ${NAME} ${VERSION}`);
console.log(`  index.html ${kb(page(true))} · ${NAME}.html ${kb(page(false))}（JS ${kb(js)} · CSS ${kb(css)}）`);
