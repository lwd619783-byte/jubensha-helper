import { TYPES, TYPE_KEYS, MARKS, FONT, rgba, bookTitle, nowStr, todayStr, escHtml, uid } from './util.js';
import { sizes } from './layout.js';
import { ICONS } from './icons.jsx';
import { treeGeom, relGeom, metaChips, namesOf, cardPh } from './board.jsx';
import * as st from './store.js';
import { loadImg, loadEl, imgDataURL, imageIdsOf, putDataURL } from './images.js';
import * as db from './db.js';

/* ---------- 调色板（与 styles.css 保持一致） ---------- */
export const PAL = {
  light: { bg: '#ffffff', card: '#ffffff', line: 'rgba(55,53,47,0.16)', text: '#37352f', t2: '#73726e', t3: '#a5a4a0', chip: 'rgba(55,53,47,0.06)', shadow: 'rgba(15,15,15,0.08)', tree: 'rgba(55,53,47,0.26)', rel: '#5e6ad2', dash: '#9b9a97', red: '#e5484d', redBg: '#fdecec', accent: '#5e6ad2', topicT: '#ffffff', subBg: 'rgba(94,106,210,0.08)', subLine: 'rgba(94,106,210,0.32)' },
  dark: { bg: '#191919', card: '#252525', line: 'rgba(255,255,255,0.11)', text: 'rgba(255,255,255,0.9)', t2: 'rgba(255,255,255,0.58)', t3: 'rgba(255,255,255,0.36)', chip: 'rgba(255,255,255,0.075)', shadow: 'rgba(0,0,0,0.35)', tree: 'rgba(255,255,255,0.24)', rel: '#8790ea', dash: '#8a8985', red: '#f0646a', redBg: '#3a2224', accent: '#6f7ae0', topicT: '#ffffff', subBg: 'rgba(124,134,230,0.14)', subLine: 'rgba(124,134,230,0.4)' },
};
const CHIP = { ev: '#7c4ddb', me: '#2f6fed', susp: '#e5484d', 'cred-high': '#0f9f6e', 'cred-mid': '#d97706', 'cred-fake': '#e5484d', ok: '#0f9f6e', todo: '#e5484d', conf: '#0e93b8' };

/* ---------- 文本测量与折行 ---------- */
const fnt = (w, s) => `${w} ${s}px ${FONT}`;
let MC = null;
const mcache = new Map();
function mw(font, s) {
  const k = font + '\u0000' + s;
  let v = mcache.get(k);
  if (v == null) {
    MC ||= document.createElement('canvas').getContext('2d');
    MC.font = font;
    v = MC.measureText(s).width;
    if (mcache.size > 20000) mcache.clear();
    mcache.set(k, v);
  }
  return v;
}
const CJK = '\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef\u3040-\u30ff\uac00-\ud7af';
const TOK = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, 'g');
const NO_START = /^[，。、；：？！）》」』】〕…—,.;:?!)\]}%’”]/;
function breakLong(font, t, maxW, out) {
  let part = '';
  for (const ch of t) {
    if (part && mw(font, part + ch) > maxW) { out.push(part); part = ch; } else part += ch;
  }
  return part;
}
export function wrapText(text, font, maxW, maxLines = Infinity) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const t of para.match(TOK) || []) {
      const ws = /^\s+$/.test(t);
      if (!line && ws && out.length && para !== '') { continue; }
      const cand = line + t;
      if (mw(font, cand.replace(/\s+$/, '')) <= maxW) { line = cand; continue; }
      if (line && NO_START.test(t)) { line = cand; continue; }
      if (!line) { line = breakLong(font, t, maxW, out); continue; }
      out.push(line.replace(/\s+$/, ''));
      line = ws ? '' : (mw(font, t) > maxW ? breakLong(font, t, maxW, out) : t);
    }
    out.push(line.replace(/\s+$/, ''));
  }
  if (out.length > maxLines) {
    const keep = out.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && mw(font, last + '…') > maxW) last = [...last].slice(0, -1).join('');
    keep[maxLines - 1] = last + '…';
    return keep;
  }
  return out;
}
function ellipsize(font, s, maxW) {
  if (mw(font, s) <= maxW) return s;
  let t = s;
  while (t && mw(font, t + '…') > maxW) t = [...t].slice(0, -1).join('');
  return t + '…';
}
const natW = (font, text) => Math.max(0, ...String(text ?? '').split('\n').map((p) => mw(font, p)));

/* ---------- 卡片排版（镜像 .card 的 CSS） ---------- */
const F = {
  type: fnt(600, 11), rnd: fnt(600, 10), title: fnt(600, 14), ph: fnt(500, 14), body: fnt(400, 12.5), chip: fnt(500, 11.5),
  root: fnt(700, 17), sub: fnt(600, 15), label: fnt(500, 11.5), frame: fnt(600, 12.5), fold: fnt(700, 10),
};
function layoutCard(c, place, pn) {
  const t = TYPES[c.type] || TYPES.note;
  if (c.type === 'topic') {
    const root = !c.parentId;
    const font = root ? F.root : F.sub, lh = root ? 24 : 22, px = root ? 18 : 14, py = root ? 14 : 10;
    const maxW = root ? 320 : 280, minW = root ? 120 : 96;
    const title = c.title || cardPh(c);
    const w = Math.min(maxW, Math.max(minW, Math.ceil(natW(font, title)) + px * 2 + 2));
    const lines = wrapText(title, font, w - px * 2 - 2);
    return { kind: root ? 'root' : 'sub', w, h: py * 2 + lines.length * lh + 2, lines, font, lh, px, py, t };
  }
  const imgs = c.imageIds || [];
  const wide = !!(c.body || imgs.length);
  const chips = metaChips(c, place, pn);
  const title = c.title || cardPh(c), tfont = c.title ? F.title : F.ph;
  const m = c.mark && MARKS[c.mark];
  const typeW = 12 + 4 + mw(F.type, t.label) + (c.round > 0 ? 4 + 2 + mw(F.rnd, 'R' + c.round) + 8 : 0) + (m ? 4 + mw(F.rnd, m.label) + 10 : 0);
  const chipWs = chips.map((x) => mw(F.chip, x.t) + 14);
  const chipsW = chipWs.reduce((a, b) => a + b, 0) + Math.max(0, chips.length - 1) * 4;
  const w = wide ? 240 : Math.min(240, Math.max(120, Math.ceil(Math.max(natW(tfont, title), typeW, chipsW)) + 26));
  const cw = w - 26;
  const lines = wrapText(title, tfont, cw);
  const body = c.body ? wrapText(c.body, F.body, cw, 3) : [];
  const rows = [];
  let row = [], rw = 0;
  chips.forEach((x, i) => {
    const wv = Math.min(cw, chipWs[i]);
    if (row.length && rw + 4 + wv > cw) { rows.push(row); row = []; rw = 0; }
    row.push({ ...x, w: wv });
    rw += (row.length > 1 ? 4 : 0) + wv;
  });
  if (row.length) rows.push(row);
  let h = 10 + 16 + 4 + lines.length * 20;
  if (body.length) h += 4 + body.length * 18;
  if (imgs.length) h += 8 + 120;
  if (rows.length) h += 8 + rows.length * 20 + (rows.length - 1) * 4;
  h += 10 + 2;
  return { kind: 'card', w, h, t, m, lines, tfont, body, rows, imgs, round: c.round, done: c.type === 'question' && c.done, ph: !c.title };
}

/* ---------- 画图工具 ---------- */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
}
const P2 = new Map();
function icon(ctx, name, x, y, size, color, sw = 2) {
  const d = ICONS[name];
  if (!d) return;
  let p = P2.get(name);
  if (!p) { p = new Path2D(d); P2.set(name, p); }
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
}
function txt(ctx, s, x, y, font, color, align = 'left') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y + 0.5);
}
function arrowHead(ctx, x, y, ang, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(-8, -3.8); ctx.lineTo(0, 0); ctx.lineTo(-8, 3.8); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}
const imgCache = new Map();
async function imgEl(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  const el = await loadEl(await loadImg(id));
  imgCache.set(id, el);
  return el;
}

/* ---------- 可见卡片 / 几何 ---------- */
function boardModel(g) {
  const km = st.kidsMap(g.cards);
  const hidden = new Set();
  for (const c of g.cards) if (c.collapsed) for (const id of st.descendants(g, c.id, km)) hidden.add(id);
  const vis = g.cards.filter((c) => c.onBoard && !hidden.has(c.id));
  const names = new Map();
  for (const c of g.cards) if (c.type === 'person' || c.type === 'place') names.set(c.id, c.title || '未命名');
  const kids = new Map();
  for (const [pid, arr] of km) kids.set(pid, arr.filter((c) => c.onBoard).length);
  const L = new Map();
  for (const c of vis) {
    const place = c.type === 'event' && c.placeId ? names.get(c.placeId) || '' : '';
    const pn = c.type !== 'person' && c.personIds?.length ? namesOf(c.personIds, names) : '';
    const lay = layoutCard(c, place, pn);
    const s = sizes.get(c.id);
    L.set(c.id, { c, lay, x: c.x, y: c.y, w: s?.w || lay.w, h: s?.h || lay.h });
  }
  return { vis, L, kids };
}

function drawCard(ctx, P, r, sc, kidsN) {
  const { c, lay, x, y, w, h } = r;
  ctx.save();
  if (lay.kind === 'root') {
    ctx.shadowColor = P.shadow; ctx.shadowBlur = 8 * sc; ctx.shadowOffsetY = 2 * sc;
    rr(ctx, x, y, w, h, 12); ctx.fillStyle = P.accent; ctx.fill();
    ctx.restore();
    lay.lines.forEach((l, i) => txt(ctx, l, x + lay.px + 1, y + lay.py + 1 + i * lay.lh + lay.lh / 2, lay.font, P.topicT));
  } else if (lay.kind === 'sub') {
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10); ctx.fillStyle = P.card; ctx.fill();
    ctx.fillStyle = P.subBg; ctx.fill();
    ctx.strokeStyle = P.subLine; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    lay.lines.forEach((l, i) => txt(ctx, l, x + lay.px + 1, y + lay.py + 1 + i * lay.lh + lay.lh / 2, lay.font, P.text));
  } else {
    ctx.shadowColor = P.shadow; ctx.shadowBlur = 6 * sc; ctx.shadowOffsetY = 1 * sc;
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = P.card; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (lay.m) { rr(ctx, x - 1, y - 1, w + 2, h + 2, 11); ctx.strokeStyle = lay.m.color; ctx.lineWidth = 2; ctx.stroke(); }
    else { rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 9.5); ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
    const L0 = x + 13, cw = w - 26;
    let cy = y + 11;
    // 类型行
    icon(ctx, lay.t.icon, L0, cy + 2, 12, lay.t.color, 2.2);
    txt(ctx, lay.t.label, L0 + 16, cy + 8, F.type, lay.t.color);
    let tx = L0 + 16 + mw(F.type, lay.t.label) + 6;
    if (lay.round > 0) {
      const s = 'R' + lay.round, rw = mw(F.rnd, s) + 8;
      rr(ctx, tx, cy + 1, rw, 14, 4); ctx.fillStyle = P.chip; ctx.fill();
      txt(ctx, s, tx + 4, cy + 8, F.rnd, P.t3);
    }
    if (lay.m) {
      const mwid = mw(F.rnd, lay.m.label) + 10;
      rr(ctx, x + w - 13 - mwid, cy + 0.5, mwid, 15, 4); ctx.fillStyle = lay.m.color; ctx.fill();
      txt(ctx, lay.m.label, x + w - 13 - mwid + 5, cy + 8, F.rnd, '#fff');
    }
    cy += 20;
    // 标题
    const tc = lay.ph ? P.t3 : lay.done ? P.t3 : P.text;
    lay.lines.forEach((l, i) => {
      const ly = cy + i * 20 + 10;
      txt(ctx, l, L0, ly, lay.tfont, tc);
      if (lay.done && l) { ctx.fillStyle = P.t3; ctx.fillRect(L0, ly, mw(lay.tfont, l), 1.2); }
    });
    cy += lay.lines.length * 20;
    if (lay.body.length) {
      cy += 4;
      lay.body.forEach((l, i) => txt(ctx, l, L0, cy + i * 18 + 9, F.body, P.t2));
      cy += lay.body.length * 18;
    }
    if (lay.imgs.length) {
      cy += 8;
      const el = r.img;
      ctx.save();
      rr(ctx, L0, cy, cw, 120, 6); ctx.clip();
      ctx.fillStyle = P.chip; ctx.fillRect(L0, cy, cw, 120);
      if (el) {
        const iw = el.naturalWidth || el.width, ih = el.naturalHeight || el.height;
        const k = Math.max(cw / iw, 120 / ih), dw = iw * k, dh = ih * k;
        ctx.drawImage(el, L0 + (cw - dw) / 2, cy + (120 - dh) / 2, dw, dh);
      } else icon(ctx, 'image', L0 + cw / 2 - 11, cy + 49, 22, P.t3, 1.8);
      ctx.restore();
      if (lay.imgs.length > 1) {
        const s = String(lay.imgs.length), bw = mw(F.rnd, s) + 26;
        rr(ctx, L0 + 6, cy + 120 - 24, bw, 18, 9); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
        icon(ctx, 'image', L0 + 11, cy + 120 - 20.5, 11, '#fff', 2.2);
        txt(ctx, s, L0 + 26, cy + 120 - 15, F.rnd, '#fff');
      }
      cy += 120;
    }
    if (lay.rows.length) {
      cy += 8;
      for (const row of lay.rows) {
        let cx0 = L0;
        for (const ch of row) {
          const col = CHIP[ch.k];
          rr(ctx, cx0, cy, ch.w, 20, 5);
          ctx.fillStyle = col ? rgba(col, P === PAL.dark ? 0.2 : 0.1) : P.chip; ctx.fill();
          txt(ctx, ellipsize(F.chip, ch.t, ch.w - 14), cx0 + 7, cy + 10, F.chip, col || (ch.k === 'tag' ? P.t3 : P.t2));
          cx0 += ch.w + 4;
        }
        cy += 24;
      }
    }
  }
  if (c.collapsed && kidsN > 0) {
    const fx = x + w + 13, fy = y + h / 2;
    ctx.beginPath(); ctx.arc(fx, fy, 9, 0, Math.PI * 2);
    ctx.fillStyle = P.card; ctx.fill(); ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.stroke();
    txt(ctx, String(kidsN), fx, fy, F.fold, P.accent, 'center');
  }
}

/* ---------- 导出 PNG ---------- */
export const RATIOS = { orig: '原比例', land: '√2 横版', port: '√2 竖版' };
export async function renderBoard(g, o = {}) {
  const opt = { theme: 'light', ratio: 'orig', scale: 2, header: true, legend: true, maxArea: 140e6, ...o };
  const P = PAL[opt.theme] || PAL.light;
  await document.fonts?.ready?.catch?.(() => {});
  const { vis, L, kids } = boardModel(g);
  // 预加载图片
  await Promise.all([...L.values()].filter((r) => r.lay.imgs?.length).map(async (r) => { r.img = await imgEl(r.lay.imgs[0]); }));
  // 连线几何
  const tree = [], rel = [];
  for (const r of L.values()) { const p = r.c.parentId && L.get(r.c.parentId); if (p) tree.push(treeGeom(p, r)); }
  for (const e of g.edges) { const a = L.get(e.from), b = L.get(e.to); if (a && b) rel.push({ e, ...relGeom(a, b) }); }
  // 边界
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const grow = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const r of L.values()) grow(r.x, r.y, r.x + r.w + (r.c.collapsed && kids.get(r.c.id) ? 26 : 0), r.y + r.h);
  for (const f of g.frames || []) grow(f.x, f.y, f.x + f.w, f.y + f.h);
  for (const r of rel) if (r.c) grow(r.mx - 2, r.my, r.mx + 2, r.my);
  const labels = rel.filter((r) => r.e.label || r.e.style === 'conflict').map((r) => {
    const s = r.e.label ? ellipsize(F.label, r.e.label, 166) : '';
    const w = (s ? mw(F.label, s) : 0) + 14 + (r.e.style === 'conflict' ? 11 + (s ? 3 : 0) : 0) + 2;
    grow(r.mx - w / 2, r.my - 10, r.mx + w / 2, r.my + 10);
    return { ...r, s, w };
  });
  const empty = !isFinite(x1);
  if (empty) { x1 = 0; y1 = 0; x2 = 360; y2 = 160; }
  const pad = 56, bw = x2 - x1, bh = y2 - y1;
  // 页眉 / 页脚尺寸
  const titleF = fnt(700, 22), metaF = fnt(400, 13), brandF = fnt(600, 12.5), footF = fnt(400, 11.5);
  const title = bookTitle(g.title);
  const meta = [g.caseNo, g.genre, g.date || '日期未定', g.store, g.myRole && '我：' + g.myRole].filter(Boolean).join('  ·  ');
  const headH = opt.header ? 104 : 0;
  const stamp = '剧本杀小助手 · 导出于 ' + nowStr();
  const types = TYPE_KEYS.filter((t) => vis.some((c) => c.type === t));
  const styles = ['solid', 'dashed', 'conflict'].filter((s) => g.edges.some((e) => e.style === s && L.has(e.from) && L.has(e.to)));
  const legendItems = opt.legend ? [...types.map((t) => ({ t: TYPES[t].label, color: TYPES[t].color, dot: true })), ...styles.map((s) => ({ t: { solid: '确认', dashed: '怀疑', conflict: '矛盾' }[s], line: s }))] : [];
  const itemW = (it) => (it.dot ? 12 : 26) + mw(footF, it.t) + 16;
  const legendW = legendItems.reduce((a, it) => a + itemW(it), 0);
  const headW = opt.header ? Math.max(mw(titleF, title) + 52, mw(metaF, meta)) + mw(brandF, '剧本杀小助手') + 60 : 0;
  let W = Math.max(bw + pad * 2, headW + pad * 2, 560);
  const stampW = mw(footF, stamp);
  const twoRows = legendW && legendW + stampW + 40 > W - pad * 2;
  const footH = twoRows ? 84 : 56;
  let H = headH + bh + pad * 2 + footH - (opt.header ? 24 : 0);
  if (opt.ratio === 'land') { if (W / H < Math.SQRT2) W = H * Math.SQRT2; else H = W / Math.SQRT2; }
  if (opt.ratio === 'port') { if (H / W < Math.SQRT2) H = W * Math.SQRT2; else W = H / Math.SQRT2; }
  W = Math.ceil(W); H = Math.ceil(H);
  let s = Math.min(opt.scale, 16384 / W, 16384 / H, Math.sqrt(opt.maxArea / (W * H)));
  s = Math.max(0.1, Math.floor(s * 100) / 100);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建画布（图片太大）');
  ctx.scale(s, s);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  // 页眉
  if (opt.header) {
    rr(ctx, pad, 30, 38, 38, 10); ctx.fillStyle = g.cover || P.accent; ctx.fill();
    icon(ctx, 'book', pad + 9, 39, 20, '#fff', 2);
    txt(ctx, title, pad + 52, 41, titleF, P.text);
    txt(ctx, meta, pad + 52, 64, metaF, P.t2);
    const bwid = mw(brandF, '剧本杀小助手');
    rr(ctx, W - pad - bwid - 26, 32, 20, 20, 6); ctx.fillStyle = P.accent; ctx.fill();
    icon(ctx, 'search', W - pad - bwid - 22, 36, 12, '#fff', 2.6);
    txt(ctx, '剧本杀小助手', W - pad, 42, brandF, P.t2, 'right');
    ctx.fillStyle = P.line; ctx.fillRect(pad, headH - 14, W - pad * 2, 1);
  }
  const areaTop = headH - (opt.header ? 24 : 0) + pad, areaH = H - areaTop - footH - pad + 12;
  const ox = Math.round((W - bw) / 2 - x1), oy = Math.round(areaTop + Math.max(0, (areaH - bh) / 2) - y1);
  ctx.save();
  ctx.translate(ox, oy);
  if (empty) txt(ctx, '（画布为空）', 180, 80, fnt(500, 14), P.t3, 'center');
  // 分区
  for (const f of g.frames || []) {
    rr(ctx, f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1, 12);
    ctx.fillStyle = rgba(f.color, opt.theme === 'dark' ? 0.08 : 0.045); ctx.fill();
    ctx.strokeStyle = rgba(f.color, 0.32); ctx.lineWidth = 1; ctx.stroke();
    txt(ctx, ellipsize(F.frame, f.title || '分区', f.w - 28), f.x + 14, f.y + 18, F.frame, f.color);
  }
  // 树线
  ctx.strokeStyle = P.tree; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const d of tree) { ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.bezierCurveTo(d[2], d[3], d[4], d[5], d[6], d[7]); ctx.stroke(); }
  // 关系线
  for (const r of rel) {
    const col = r.e.style === 'conflict' ? P.red : r.e.style === 'dashed' ? P.dash : P.rel;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = r.e.style === 'conflict' ? 1.8 : 1.5;
    if (r.e.style === 'dashed') ctx.setLineDash([5, 4]);
    // 终点 / 起点处的切线方向（弧线取控制点方向）
    const ang = r.c ? Math.atan2(r.y2 - r.c[3], r.x2 - r.c[2]) : Math.atan2(r.y2 - r.y1, r.x2 - r.x1);
    const angS = r.c ? Math.atan2(r.y1 - r.c[1], r.x1 - r.c[0]) : ang + Math.PI;
    const sx = r.e.arrow === 'both' ? r.x1 - Math.cos(angS) * 6 : r.x1, sy = r.e.arrow === 'both' ? r.y1 - Math.sin(angS) * 6 : r.y1;
    const ex = r.e.arrow !== 'none' ? r.x2 - Math.cos(ang) * 6 : r.x2, ey = r.e.arrow !== 'none' ? r.y2 - Math.sin(ang) * 6 : r.y2;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    if (r.c) ctx.bezierCurveTo(r.c[0], r.c[1], r.c[2], r.c[3], ex, ey); else ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
    if (r.e.arrow !== 'none') arrowHead(ctx, r.x2, r.y2, ang, col);
    if (r.e.arrow === 'both') arrowHead(ctx, r.x1, r.y1, angS, col);
  }
  // 卡片
  for (const c of vis) drawCard(ctx, P, L.get(c.id), s, kids.get(c.id) || 0);
  // 连线说明
  for (const r of labels) {
    const cf = r.e.style === 'conflict', col = cf ? P.red : r.e.style === 'solid' ? P.rel : P.t2;
    const lx = r.mx - r.w / 2, ly = r.my - 10;
    rr(ctx, lx + 0.5, ly + 0.5, r.w - 1, 19, 10);
    ctx.fillStyle = cf ? P.redBg : P.card; ctx.fill();
    ctx.strokeStyle = cf ? rgba('#e5484d', 0.4) : r.e.style === 'solid' ? rgba('#5e6ad2', 0.35) : P.line; ctx.lineWidth = 1; ctx.stroke();
    let tx = lx + 8;
    if (cf) { icon(ctx, 'alert', tx, r.my - 5.5, 11, col, 2.4); tx += 14; }
    if (r.s) txt(ctx, r.s, tx, r.my, F.label, col);
  }
  ctx.restore();
  // 页脚
  const fy = H - (twoRows ? 58 : 30);
  let lx = pad;
  for (const it of legendItems) {
    if (it.dot) { ctx.beginPath(); ctx.arc(lx + 4, fy, 4, 0, Math.PI * 2); ctx.fillStyle = it.color; ctx.fill(); lx += 12; }
    else {
      ctx.save();
      ctx.strokeStyle = it.line === 'conflict' ? P.red : it.line === 'dashed' ? P.dash : P.rel; ctx.lineWidth = it.line === 'conflict' ? 1.8 : 1.5;
      if (it.line === 'dashed') ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(lx, fy); ctx.lineTo(lx + 20, fy); ctx.stroke();
      ctx.restore();
      lx += 26;
    }
    txt(ctx, it.t, lx, fy, footF, P.t2);
    lx += mw(footF, it.t) + 16;
  }
  txt(ctx, stamp, W - pad, H - 30, footF, P.t3, 'right');
  return { canvas: cv, scale: s, W, H, empty };
}
export const canvasBlob = (cv, type = 'image/png', q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('图片生成失败，可尝试降低清晰度'))), type, q));

/* ---------- 文件 ---------- */
export const safeName = (s) => String(s || '未命名').replace(/[\\/:*?"<>|\r\n]+/g, '_').replace(/^\.+/, '').slice(0, 80) || '未命名';
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export function canShareFiles(sample) {
  try { return !!navigator.canShare && navigator.canShare({ files: [sample || new File(['x'], 'x.png', { type: 'image/png' })] }); } catch { return false; }
}
export async function shareFile(blob, name) {
  const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (!canShareFiles(f)) { download(blob, name); return 'downloaded'; }
  try { await navigator.share({ files: [f], title: name }); return 'shared'; }
  catch (e) { if (e?.name === 'AbortError') return 'cancel'; download(blob, name); return 'downloaded'; }
}

/* ---------- 备份 / 存档 ---------- */
async function collectImages(games) {
  const images = {};
  for (const g of games) for (const id of imageIdsOf(g)) if (!images[id]) { const u = await imgDataURL(id); if (u) images[id] = u; }
  return images;
}
export async function packGames(games, kind = 'backup') {
  await st.flush();
  return { app: 'jbs-helper', version: 1, kind, exportedAt: Date.now(), games, images: await collectImages(games) };
}
export async function backupBlob(games) {
  const data = await packGames(games);
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#5e6ad2"/><circle cx="29" cy="29" r="13" fill="none" stroke="#fff" stroke-width="5.5"/><path d="M39 39l10 10" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/></svg>';
export const ICON_DATA = 'data:image/svg+xml,' + encodeURIComponent(ICON_SVG);
export async function archiveBlob(g) {
  const style = document.getElementById('app-style')?.textContent;
  const script = document.getElementById('app-script')?.textContent;
  if (!style || !script) throw new Error('开发模式下无法导出离线存档，请使用正式版本');
  const data = await packGames([g], 'archive');
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = escHtml(bookTitle(g.title) + ' · 剧本杀小助手存档');
  const html = '<!doctype html>\n<html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">'
    + '<meta name="theme-color" content="#ffffff"><title>' + title + '</title>'
    + '<link rel="icon" href="' + ICON_DATA + '">'
    + '<style id="app-style">' + style + '</style></head><body><div id="root"></div>'
    + '<script id="jbs-archive" type="application/json">' + json + '<\/script>'
    + '<script id="app-script">' + script + '<\/script></body></html>';
  return new Blob([html], { type: 'text/html' });
}

/* ---------- 导入 ---------- */
export async function readImportFile(file) {
  const text = await file.text();
  let data;
  try {
    if (/^\s*</.test(text)) {
      const m = /<script id="jbs-archive" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
      if (!m) throw new Error('not-archive');
      data = JSON.parse(m[1]);
    } else data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(e?.message === 'not-archive' ? '这个 HTML 文件不是剧本杀小助手的存档' : '文件已损坏或格式不正确');
  }
  if (data?.app !== 'jbs-helper' || !Array.isArray(data.games)) throw new Error('无法识别的文件：请选择剧本杀小助手导出的备份（.json）或存档（.html）');
  data.games = data.games.filter((g) => g && typeof g === 'object' && Array.isArray(g.cards));
  return data;
}
// strategy: 'overwrite' | 'copy' | 'skip'（仅对已存在的剧本生效）
export async function applyImport(data, strategy = 'copy') {
  const S = st.getS();
  const imgs = data.images || {};
  const need = new Set();
  let n = 0, skipped = 0;
  const out = [];
  for (const raw of data.games) {
    const exists = !!S.games[raw.id];
    if (exists && strategy === 'skip') { skipped++; continue; }
    let g = st.migrate(raw);
    if (exists && strategy === 'copy') g = { ...g, id: uid(), title: g.title + '（导入）', updatedAt: Date.now() };
    if (exists && strategy === 'overwrite' && S.currentId === g.id) st.resetHist();
    imageIdsOf(g).forEach((i) => need.add(i));
    out.push(g);
  }
  for (const id of need) {
    if (!imgs[id]) continue;
    const has = await db.get('images', id).catch(() => null);
    if (!has) await putDataURL(id, imgs[id]).catch(() => {});
  }
  for (const g of out) { st.addGame(g); n++; }
  await st.flush();
  return { n, skipped, ids: out.map((g) => g.id) };
}
export const conflictsOf = (data) => data.games.filter((g) => st.getS().games[g.id]);
export const stampName = () => todayStr().replace(/-/g, '');
