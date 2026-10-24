import { useSyncExternalStore } from 'react';
import * as db from './db.js';
import { uid, COVERS, FRAME_COLORS, todayStr, bookTitle, pad2 } from './util.js';
import { tidyTargets, sz } from './layout.js';
import { saveImage } from './images.js';

export const EMPTY_SEL = Object.freeze({ cards: [], edge: null, frame: null });
let S = {
  ready: false, readOnly: false, archive: null,
  games: {}, currentId: null, view: 'library',
  sel: EMPTY_SEL, editing: null, inspector: false, deskPanel: true,
  layout: 'desk', touch: false, theme: 'light',
  toasts: [], modal: null, palette: false, ctx: null, linkFrom: null, focusReq: null, inbox: false, lightbox: null, quick: false,
  settings: { autoTidy: true }, hist: { u: 0, r: 0 },
};
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export const getS = () => S;
export function setS(p) { S = { ...S, ...(typeof p === 'function' ? p(S) : p) }; emit(); }
const subscribe = (f) => (subs.add(f), () => subs.delete(f));
export const useS = (sel) => useSyncExternalStore(subscribe, () => sel(S));
export const cur = (s = S) => s.games[s.currentId];
export const card = (id, g = cur()) => g?.cards.find((c) => c.id === id);
export const boardApi = { current: null };

/* ---------- 撤销 / 重做 ---------- */
let H = { past: [], future: [], key: null, t: 0 };
const histState = () => ({ u: H.past.length, r: H.future.length });
export function resetHist() { H = { past: [], future: [], key: null, t: 0 }; }
export function pushHist(g, key) {
  const now = Date.now();
  if (key && key === H.key && now - H.t < 1500) { H.t = now; return; }
  H.past.push(g);
  if (H.past.length > 150) H.past.shift();
  H.future = []; H.key = key || null; H.t = now;
}
export function markHist(g) { pushHist(g); setS({ hist: histState() }); }
function popHist(len) { if (H.past.length === len) H.past.pop(); setS({ hist: histState() }); }
export function commit(fn, { history = true, key = null } = {}) {
  if (S.readOnly) return false;
  const g = cur();
  if (!g) return false;
  const ng = fn(g);
  if (!ng || ng === g) return false;
  ng.updatedAt = Date.now();
  if (history) pushHist(g, key);
  S = { ...S, games: { ...S.games, [ng.id]: ng }, hist: histState() };
  emit(); queueSave(ng.id);
  return true;
}
function pruneSel(sel, g) {
  const ids = new Set(g.cards.map((c) => c.id));
  return { cards: sel.cards.filter((i) => ids.has(i)), edge: g.edges.some((e) => e.id === sel.edge) ? sel.edge : null, frame: g.frames.some((f) => f.id === sel.frame) ? sel.frame : null };
}
function swapTo(g) {
  S = { ...S, games: { ...S.games, [g.id]: g }, hist: histState(), sel: pruneSel(S.sel, g), editing: null };
  emit(); queueSave(g.id);
}
export function undo() {
  if (S.readOnly || !H.past.length) return;
  stopAnim();
  const g = cur(), p = H.past.pop();
  H.future.push(g); H.key = null; swapTo(p);
}
export function redo() {
  if (S.readOnly || !H.future.length) return;
  stopAnim();
  const g = cur(), n = H.future.pop();
  H.past.push(g); H.key = null; swapTo(n);
}

/* ---------- 保存 ---------- */
const dirty = new Set();
let saveT = 0;
function queueSave(id) { if (S.readOnly) return; dirty.add(id); clearTimeout(saveT); saveT = setTimeout(flush, 400); }
export async function flush() {
  clearTimeout(saveT);
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const g = S.games[id];
    if (g) await db.put('games', id, g).catch((e) => toast('保存失败：' + (e?.message || e)));
  }
}

/* ---------- 数据模型 ---------- */
export const emptyVerdict = () => ({ culpritIds: [], motive: '', method: '', time: '', evidenceIds: [], voteIds: [], voteNote: '', result: '', truth: '', ratings: { story: 0, logic: 0, role: 0, dm: 0, immersion: 0 }, overall: 0, oneLiner: '', highlights: '', thoughts: '', photoIds: [] });
const TYPE_DEFAULTS = {
  person: { identity: '', relation: '', player: '', isMe: false, alibi: '', motive: '', suspicion: 0 },
  clue: { source: '', credibility: '' },
  event: { day: 0, time: '', timeEnd: '', placeId: null },
  question: { done: false, answer: '', askIds: [] },
  deduction: { confidence: 0 },
};
const base = () => ({ title: '', body: '', x: 0, y: 0, onBoard: true, parentId: null, collapsed: false, imageIds: [], round: 0, tags: [], personIds: [], mark: null, createdAt: Date.now(), updatedAt: Date.now() });
export function newCard(type, extra = {}) {
  return { id: uid(), type, ...base(), ...(TYPE_DEFAULTS[type] || {}), ...extra };
}
export const retype = (c, type) => ({ ...(TYPE_DEFAULTS[type] || {}), ...c, type });
export function migrate(g) {
  const d = { id: uid(), title: '未命名剧本', caseNo: '', genre: '', tags: [], date: '', store: '', dm: '', players: '', myRole: '', companions: '', duration: '', cost: '', status: 'playing', cover: COVERS[0], currentRound: 1, rounds: 3, dayLabels: ['案发当天'], cards: [], edges: [], frames: [], notes: '', view: null, createdAt: Date.now(), updatedAt: Date.now() };
  const out = { ...d, ...g };
  const ev = emptyVerdict();
  out.verdict = { ...ev, ...(g.verdict || {}), ratings: { ...ev.ratings, ...(g.verdict?.ratings || {}) } };
  out.cards = (out.cards || []).map((c) => ({ ...base(), ...(TYPE_DEFAULTS[c.type] || {}), ...c }));
  if (!out.dayLabels?.length) out.dayLabels = ['案发当天'];
  return out;
}
export function newGame(info = {}) {
  const now = Date.now();
  const year = String(info.date || todayStr()).slice(0, 4);
  const seq = Object.values(S.games).filter((g) => (g.caseNo || '').startsWith(`No.${year}-`)).length + 1;
  const title = String(info.title || '未命名剧本').replace(/^《|》$/g, '');
  const root = newCard('topic', { title: bookTitle(title), x: 0, y: 0 });
  return migrate({ id: uid(), caseNo: `No.${year}-${String(seq).padStart(3, '0')}`, cover: COVERS[(seq - 1) % COVERS.length], cards: [root], createdAt: now, updatedAt: now, ...info, title });
}

/* ---------- 树结构工具 ---------- */
export function kidsMap(cards) {
  const m = new Map();
  for (const c of cards) if (c.parentId) {
    if (!m.has(c.parentId)) m.set(c.parentId, []);
    m.get(c.parentId).push(c);
  }
  return m;
}
export function descendants(g, id, km = kidsMap(g.cards)) {
  const out = [], seen = new Set([id]), st = [id];
  while (st.length) for (const c of km.get(st.pop()) || []) if (!seen.has(c.id)) { seen.add(c.id); out.push(c.id); st.push(c.id); }
  return out;
}
export function ancestors(g, id) {
  const m = new Map(g.cards.map((c) => [c.id, c]));
  const out = [], seen = new Set([id]);
  let c = m.get(id);
  while (c?.parentId && m.has(c.parentId) && !seen.has(c.parentId)) { seen.add(c.parentId); c = m.get(c.parentId); out.push(c); }
  return out;
}
export function rootOf(g, id) { const a = ancestors(g, id); return a.length ? a[a.length - 1].id : id; }
const stamp = (c, p) => ({ ...c, ...(typeof p === 'function' ? p(c) : p), updatedAt: Date.now() });
export const ops = {
  add: (g, cs) => ({ ...g, cards: [...g.cards, ...cs] }),
  upd: (g, id, p) => ({ ...g, cards: g.cards.map((c) => (c.id === id ? stamp(c, p) : c)) }),
  updMany: (g, ids, p) => { const s = new Set(ids); return { ...g, cards: g.cards.map((c) => (s.has(c.id) ? stamp(c, p) : c)) }; },
  del: (g, ids) => {
    const km = kidsMap(g.cards), all = new Set();
    ids.forEach((id) => { all.add(id); descendants(g, id, km).forEach((d) => all.add(d)); });
    const f = (a) => (a || []).filter((x) => !all.has(x));
    return {
      ...g,
      cards: g.cards.filter((c) => !all.has(c.id)).map((c) => (c.personIds?.some((x) => all.has(x)) || c.askIds?.some((x) => all.has(x)) || (c.placeId && all.has(c.placeId)) ? { ...c, personIds: f(c.personIds), ...(c.askIds ? { askIds: f(c.askIds) } : {}), ...(c.placeId && all.has(c.placeId) ? { placeId: null } : {}) } : c)),
      edges: g.edges.filter((e) => !all.has(e.from) && !all.has(e.to)),
      verdict: { ...g.verdict, culpritIds: f(g.verdict.culpritIds), evidenceIds: f(g.verdict.evidenceIds), voteIds: f(g.verdict.voteIds) },
    };
  },
  updEdge: (g, id, p) => ({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, ...p } : e)) }),
  delEdge: (g, id) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }),
  updFrame: (g, id, p) => ({ ...g, frames: g.frames.map((f) => (f.id === id ? { ...f, ...p } : f)) }),
  delFrame: (g, id) => ({ ...g, frames: g.frames.filter((f) => f.id !== id) }),
};
export const updCard = (id, p, key) => commit((g) => ops.upd(g, id, p), { key: key ? id + ':' + key : null });
export const updGame = (p, key) => commit((g) => ({ ...g, ...(typeof p === 'function' ? p(g) : p) }), { key: key ? 'g:' + key : null });
export const updVerdict = (p, key) => commit((g) => ({ ...g, verdict: { ...g.verdict, ...p } }), { key: key ? 'v:' + key : null });

/* ---------- 界面辅助 ---------- */
export function select(sel = {}) { setS({ sel: { ...EMPTY_SEL, ...sel }, ctx: null }); }
export function openCard(id) { setS({ sel: { ...EMPTY_SEL, cards: [id] }, inspector: true, deskPanel: true, ctx: null }); }
let tid = 0;
export function toast(msg, action, ms = 3400) {
  const id = ++tid;
  setS((s) => ({ toasts: [...s.toasts.slice(-2), { id, msg, action }] }));
  setTimeout(() => setS((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
export const confirmBox = (o) => new Promise((resolve) => setS({ modal: { kind: 'confirm', ...o, resolve } }));
export const openModal = (kind, p = {}) => setS({ modal: { kind, ...p }, ctx: null, palette: false });
export const closeModal = () => setS({ modal: null });
export function setSetting(k, v) {
  const settings = { ...S.settings, [k]: v };
  setS({ settings });
  try { localStorage.setItem('jbs-settings', JSON.stringify(settings)); } catch {}
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#191919' : '#ffffff');
  try { localStorage.setItem('jbs-theme', t); } catch {}
  setS({ theme: t });
}

/* ---------- 剧本 ---------- */
export function addGame(g) { S = { ...S, games: { ...S.games, [g.id]: g } }; emit(); queueSave(g.id); }
export function patchGame(id, fn) {
  if (S.readOnly) return;
  if (id === S.currentId) return commit(fn, { key: 'g:info' });
  const g = S.games[id];
  if (!g) return;
  const ng = { ...fn(g), updatedAt: Date.now() };
  S = { ...S, games: { ...S.games, [id]: ng } };
  emit(); queueSave(id);
}
export function updateGameInfo(id, patch) {
  patchGame(id, (g) => {
    const ng = { ...g, ...patch };
    if (patch.title != null && patch.title !== g.title) {
      const old = bookTitle(g.title);
      ng.cards = g.cards.map((c) => (c.type === 'topic' && c.title === old ? { ...c, title: bookTitle(patch.title) } : c));
    }
    return ng;
  });
}
export async function deleteGame(id) {
  const games = { ...S.games };
  delete games[id];
  dirty.delete(id);
  setS({ games, ...(S.currentId === id ? { currentId: null, view: 'library' } : {}) });
  await db.del('games', id).catch(() => {});
}
export function openGame(id) {
  flush(); resetHist(); stopAnim();
  setS({ currentId: id, view: 'board', sel: EMPTY_SEL, editing: null, inspector: false, inbox: false, linkFrom: null, ctx: null, hist: { u: 0, r: 0 } });
  try { localStorage.setItem('jbs-last', id); } catch {}
}
export function goLibrary() {
  flush();
  setS({ view: 'library', sel: EMPTY_SEL, editing: null, inspector: false, linkFrom: null, ctx: null });
  try { localStorage.removeItem('jbs-last'); } catch {}
}
export function setView(v) {
  setS({ view: v, ctx: null, linkFrom: null, editing: null, ...(S.view !== v ? { sel: EMPTY_SEL, inspector: false } : {}) });
}

/* ---------- 动画整理 ---------- */
let anim = 0, animTargets = new Map();
const applyTargets = (t) => (g) => ({ ...g, cards: g.cards.map((c) => { const p = t.get(c.id); return p ? { ...c, x: p.x, y: p.y } : c; }) });
export function stopAnim() {
  if (!anim) return;
  cancelAnimationFrame(anim); anim = 0;
  const t = animTargets;
  animTargets = new Map();
  if (t.size) commit(applyTargets(t), { history: false });
}
export function animateTo(targets, dur = 200) {
  if (anim) { cancelAnimationFrame(anim); anim = 0; for (const [k, v] of animTargets) if (!targets.has(k)) targets.set(k, v); }
  const g0 = cur();
  if (!g0) return false;
  const from = new Map();
  for (const c of g0.cards) {
    const t = targets.get(c.id);
    if (t && (Math.abs(c.x - t.x) > 0.5 || Math.abs(c.y - t.y) > 0.5)) from.set(c.id, { x: c.x, y: c.y, tx: t.x, ty: t.y });
  }
  if (!from.size) { animTargets = new Map(); return false; }
  animTargets = targets;
  if (document.hidden) { commit(applyTargets(targets), { history: false }); animTargets = new Map(); return true; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3;
    commit((g) => ({ ...g, cards: g.cards.map((c) => { const f = from.get(c.id); return f ? { ...c, x: Math.round(f.x + (f.tx - f.x) * e), y: Math.round(f.y + (f.ty - f.y) * e) } : c; }) }), { history: false });
    if (k < 1) anim = requestAnimationFrame(step);
    else { anim = 0; animTargets = new Map(); }
  };
  anim = requestAnimationFrame(step);
  return true;
}
const tidyQ = new Set();
let tidyT = 0;
export function requestTidy(id) {
  if (!id || !S.settings.autoTidy || S.readOnly) return;
  const g = cur();
  if (!g) return;
  tidyQ.add(rootOf(g, id));
  clearTimeout(tidyT);
  tidyT = setTimeout(() => {
    const g = cur();
    if (!g) return;
    const ids = [...tidyQ].filter((i) => g.cards.some((c) => c.id === i));
    tidyQ.clear();
    if (ids.length) animateTo(tidyTargets(g, ids));
  }, 50);
}
export function tidyAll(silent) {
  const g = cur();
  if (!g || S.readOnly) return;
  stopAnim();
  const t = tidyTargets(g, null);
  const changed = g.cards.some((c) => { const p = t.get(c.id); return p && (p.x !== c.x || p.y !== c.y); });
  if (!changed) { if (!silent) toast('已经很整齐了'); return; }
  markHist(cur());
  animateTo(t, 260);
}

/* ---------- 卡片操作 ---------- */
export function startEdit(id, isNew = false) {
  if (S.readOnly) return;
  setS({ editing: { id, isNew, hl: H.past.length }, sel: { ...EMPTY_SEL, cards: [id] }, ctx: null });
}
export function finishEdit(id, text, cancel) {
  const e = S.editing;
  if (!e || e.id !== id) return;
  setS({ editing: null });
  const c = card(id);
  if (!c) return;
  const t = (text ?? '').replace(/\s+$/, '');
  if (e.isNew && (cancel || !t.trim()) && !c.title && !c.body && !c.imageIds.length) {
    const pid = c.parentId;
    commit((g) => ops.del(g, [id]), { history: false });
    popHist(e.hl);
    select(pid ? { cards: [pid] } : {});
    if (pid) requestTidy(pid);
    return;
  }
  if (!cancel && t !== c.title) commit((g) => ops.upd(g, id, { title: t }), { history: !e.isNew });
  requestTidy(id);
}
function childType(g, p) {
  const sib = g.cards.filter((c) => c.parentId === p.id);
  if (sib.length) return sib[sib.length - 1].type;
  return p.type === 'topic' ? 'clue' : 'note';
}
export function addChild(pid) {
  const g = cur(), p = card(pid, g);
  if (!p || S.readOnly) return;
  const kids = g.cards.filter((c) => c.parentId === pid && c.onBoard).sort((a, b) => a.y - b.y);
  const ps = sz(p), last = kids[kids.length - 1];
  const x = kids.length ? kids[0].x : p.x + ps.w + 56;
  const y = last ? last.y + sz(last).h + 14 : p.y + ps.h / 2 - 20;
  const c = newCard(childType(g, p), { x: Math.round(x), y: Math.round(y), parentId: pid, round: g.currentRound });
  commit((g) => ops.add(p.collapsed ? ops.upd(g, pid, { collapsed: false }) : g, [c]));
  startEdit(c.id, true);
  requestTidy(c.id);
  return c.id;
}
export function addSibling(id) {
  const g = cur(), s = card(id, g);
  if (!s || S.readOnly) return;
  if (!s.parentId) {
    if (s.type === 'topic') return addChild(id);
    const c = newCard(s.type, { x: s.x, y: Math.round(s.y + sz(s).h + 24), round: g.currentRound });
    commit((g) => ops.add(g, [c]));
    startEdit(c.id, true);
    return c.id;
  }
  const c = newCard(s.type, { x: s.x, y: Math.round(s.y + sz(s).h + 7), parentId: s.parentId, round: g.currentRound });
  commit((g) => ops.add(g, [c]));
  startEdit(c.id, true);
  requestTidy(c.id);
  return c.id;
}
export function addFreeCard(type, at, edit = true) {
  const g = cur();
  if (!g || S.readOnly) return;
  const p = at || boardApi.current?.center() || { x: 0, y: 0 };
  const c = newCard(type, { x: Math.round(p.x - 70), y: Math.round(p.y - 24), round: g.currentRound });
  commit((g) => ops.add(g, [c]));
  if (edit) startEdit(c.id, true);
  return c.id;
}
export function newInboxCard(type, extra = {}) {
  const g = cur();
  if (!g || S.readOnly) return;
  const c = newCard(type, { onBoard: false, round: g.currentRound, ...extra });
  commit((g) => ops.add(g, [c]));
  return c.id;
}
export function toggleFold(id) {
  const c = card(id);
  if (!c) return;
  commit((g) => ops.upd(g, id, { collapsed: !c.collapsed }));
  requestTidy(id);
}
export function setTypeOf(ids, type) {
  commit((g) => ({ ...g, cards: g.cards.map((c) => (ids.includes(c.id) && c.type !== type && !(c.type === 'topic' && !c.parentId) ? { ...retype(c, type), updatedAt: Date.now() } : c)) }));
  ids.forEach(requestTidy);
}
export function duplicateCard(id) {
  const g = cur(), c = card(id, g);
  if (!c) return;
  const n = { ...c, id: uid(), title: c.title ? c.title + ' 副本' : '', x: c.x + 28, y: c.y + 28, collapsed: false, parentId: c.parentId, createdAt: Date.now(), updatedAt: Date.now() };
  if (c.parentId) n.y = c.y + sz(c).h + 7;
  commit((g) => ops.add(g, [n]));
  select({ cards: [n.id] });
  requestTidy(n.id);
}
export function detach(id) {
  const c = card(id);
  if (!c?.parentId) return;
  const oldRoot = rootOf(cur(), id);
  commit((g) => ops.upd(g, id, { parentId: null, x: c.x + 40, y: c.y + 20 }));
  requestTidy(oldRoot);
}
export function reparentTo(id, pid) {
  const g = cur();
  if (!g || id === pid) return false;
  if (pid && descendants(g, id).includes(pid)) return false;
  const old = card(id, g)?.parentId;
  const oldRoot = old ? rootOf(g, old) : null;
  commit((g) => ops.upd(g, id, { parentId: pid || null, onBoard: true }), { history: false });
  if (oldRoot) requestTidy(oldRoot);
  requestTidy(id);
  return true;
}
export function unplace(id) {
  const g = cur(), c = card(id, g);
  if (!c || c.type === 'topic') return;
  commit((g) => ({ ...g, cards: g.cards.map((x) => (x.id === id ? { ...x, onBoard: false, parentId: null } : x.parentId === id ? { ...x, parentId: c.parentId } : x)) }));
  select({});
  if (c.parentId) requestTidy(c.parentId);
  toast('已移回「待整理」');
}
function defaultSpot(g) {
  const on = g.cards.filter((c) => c.onBoard);
  if (!on.length) return { x: 0, y: 0 };
  let maxX = -Infinity, minY = Infinity;
  for (const c of on) { maxX = Math.max(maxX, c.x + sz(c).w); minY = Math.min(minY, c.y); }
  return { x: maxX + 220, y: minY + 60 };
}
export function placeOnBoard(ids, at, parentId) {
  const g = cur();
  if (!g || S.readOnly) return;
  const p = at || boardApi.current?.center() || defaultSpot(g);
  commit((g) => ({ ...g, cards: g.cards.map((c) => {
    const i = ids.indexOf(c.id);
    if (i < 0) return c;
    return { ...c, onBoard: true, parentId: parentId || null, x: Math.round(p.x - 110 + (i % 3) * 260), y: Math.round(p.y - 40 + Math.floor(i / 3) * 150) };
  }) }));
  if (parentId) requestTidy(parentId);
  if (S.view === 'board') select({ cards: ids });
}
export function addEdge(from, to, extra = {}) {
  const g = cur();
  if (!g || S.readOnly || from === to) return null;
  const dup = g.edges.find((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  if (dup) { select({ edge: dup.id }); toast('这两张卡片之间已经有连线'); return dup.id; }
  const e = { id: uid(), from, to, label: '', style: 'solid', arrow: 'end', ...extra };
  commit((g) => ({ ...g, edges: [...g.edges, e] }));
  select({ edge: e.id });
  return e.id;
}
export function addFrame(ids = [], at = null) {
  const g = cur();
  if (!g || S.readOnly) return;
  let f;
  const cs = ids.map((id) => card(id, g)).filter((c) => c && c.onBoard);
  if (cs.length) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const c of cs) { const s = sz(c); x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + s.w); y2 = Math.max(y2, c.y + s.h); }
    f = { id: uid(), title: '分区', x: Math.round(x1 - 24), y: Math.round(y1 - 52), w: Math.round(x2 - x1 + 48), h: Math.round(y2 - y1 + 76), color: FRAME_COLORS[1] };
  } else {
    const p = at || boardApi.current?.center() || { x: 0, y: 0 };
    f = { id: uid(), title: '分区', x: Math.round(p.x - 200), y: Math.round(p.y - 130), w: 400, h: 260, color: FRAME_COLORS[1] };
  }
  commit((g) => ({ ...g, frames: [...g.frames, f] }));
  select({ frame: f.id });
  return f.id;
}
export async function deleteSel() {
  const g = cur();
  if (!g || S.readOnly) return;
  const { cards, edge, frame } = S.sel;
  if (cards.length) {
    const km = kidsMap(g.cards), all = new Set();
    cards.forEach((id) => { all.add(id); descendants(g, id, km).forEach((d) => all.add(d)); });
    if (all.size > 3 && !(await confirmBox({ title: `删除 ${all.size} 张卡片？`, body: '所选卡片及其下级卡片都会被删除，可以用“撤销”恢复。', ok: '删除', danger: true }))) return;
    const parents = cards.map((id) => card(id, g)?.parentId).filter((p) => p && !all.has(p));
    commit((g) => ops.del(g, cards));
    select({});
    toast(`已删除 ${all.size} 张卡片`, { label: '撤销', fn: undo });
    parents.forEach(requestTidy);
  } else if (edge) { commit((g) => ops.delEdge(g, edge)); select({}); }
  else if (frame) { commit((g) => ops.delFrame(g, frame)); select({}); }
}
export function deleteCard(id) { select({ cards: [id] }); return deleteSel(); }
export function jumpTo(id) {
  const g = cur(), c = card(id, g);
  if (!c) return;
  if (c.onBoard) {
    const anc = ancestors(g, id).filter((a) => a.collapsed);
    if (anc.length) { commit((g) => ops.updMany(g, anc.map((a) => a.id), { collapsed: false }), { history: false }); requestTidy(id); }
    setS({ view: 'board', sel: { ...EMPTY_SEL, cards: [id] }, focusReq: { id, t: Date.now() }, palette: false, ctx: null, inspector: false });
  } else setS({ view: ['board', 'library', 'more'].includes(S.view) ? 'clues' : S.view, sel: { ...EMPTY_SEL, cards: [id] }, inspector: true, palette: false, ctx: null });
}

/* ---------- 速记 ---------- */
export function parseQuick(text, persons = []) {
  let t = text.trim(), time = '', timeEnd = '';
  const tm = /^(\d{1,2})[:：](\d{2})(?:\s*[-~～–—至到]\s*(\d{1,2})[:：](\d{2}))?\s*/.exec(t);
  if (tm && +tm[1] < 24 && +tm[2] < 60) {
    time = pad2(+tm[1]) + ':' + tm[2];
    if (tm[3] && +tm[3] < 24 && +tm[4] < 60) timeEnd = pad2(+tm[3]) + ':' + tm[4];
    t = t.slice(tm[0].length);
  }
  const names = [];
  const known = persons.map((p) => p.title).filter(Boolean).sort((a, b) => b.length - a.length);
  t = t.replace(/[@＠]([^\s@＠#＃]*)/g, (m, rest) => {
    const hit = known.find((n) => rest.startsWith(n));
    if (hit) { names.push(hit); return rest; }
    const n = rest.split(/[，,。；;：:、！!？?（(）)]/)[0];
    if (!n) return m;
    names.push(n);
    return rest;
  });
  const tags = [];
  t = t.replace(/[#＃]([^\s#＃@＠，,。；;]+)/g, (_, tg) => { tags.push(tg); return ''; });
  t = t.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n').trim();
  return { title: t, time, timeEnd, names: [...new Set(names)], tags: [...new Set(tags)] };
}
export function quickAdd(text, type = 'clue', extra = {}) {
  const g = cur();
  if (!g || S.readOnly || !text.trim()) return null;
  const persons = g.cards.filter((c) => c.type === 'person');
  const q = parseQuick(text, persons);
  let tp = type;
  if (q.time && type === 'clue') tp = 'event';
  const fresh = [];
  const pids = q.names.map((n) => {
    const p = persons.find((p) => p.title === n) || fresh.find((p) => p.title === n);
    if (p) return p.id;
    const np = newCard('person', { title: n, onBoard: false, round: g.currentRound });
    fresh.push(np);
    return np.id;
  });
  const [first, ...rest] = q.title.split('\n');
  if (tp === 'person' && !first.trim() && fresh.length) return { card: fresh[0], fresh };
  const c = newCard(tp, {
    title: first.trim(), body: rest.join('\n').trim(), onBoard: false, round: g.currentRound, tags: q.tags,
    personIds: tp === 'question' ? [] : pids,
    ...(tp === 'question' ? { askIds: pids } : {}),
    ...(tp === 'event' ? { time: q.time, timeEnd: q.timeEnd } : {}),
    ...extra,
  });
  commit((g) => ops.add(g, [...fresh, c]));
  return { card: c, fresh };
}
export async function addImageCards(files, { onBoard = false, at = null, attachTo = null } = {}) {
  const g = cur();
  if (!g || S.readOnly) return [];
  const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(f.name || ''));
  if (!imgs.length) return [];
  const ids = [];
  let bad = 0;
  for (const f of imgs) { try { ids.push(await saveImage(f)); } catch { bad++; } }
  if (bad) toast(`${bad} 张图片无法读取（格式不支持）`);
  if (!ids.length) return [];
  if (attachTo) {
    commit((g) => ops.upd(g, attachTo, (c) => ({ imageIds: [...(c.imageIds || []), ...ids] })));
    toast(`已添加 ${ids.length} 张图片`);
    return [];
  }
  const p = at || (onBoard ? boardApi.current?.center() : null) || { x: 0, y: 0 };
  const cards = ids.map((id, i) => newCard('clue', { imageIds: [id], onBoard, x: Math.round(p.x - 120 + (i % 3) * 264), y: Math.round(p.y - 90 + Math.floor(i / 3) * 214), round: cur().currentRound }));
  commit((g) => ops.add(g, cards));
  if (onBoard) select({ cards: cards.map((c) => c.id) });
  toast(onBoard ? `已添加 ${cards.length} 张图片线索` : `${cards.length} 张图片已存入「待整理」`);
  return cards.map((c) => c.id);
}

/* ---------- 画布视图 / 即时整理（不进历史、不改 updatedAt） ---------- */
export function setGameView(id, v) {
  const g = S.games[id];
  if (!g || S.readOnly) return;
  S = { ...S, games: { ...S.games, [g.id]: { ...g, view: v } } };
  emit(); queueSave(g.id);
}
export function tidyNow() {
  const g = cur();
  if (!g) return;
  const t = tidyTargets(g, null);
  const ng = { ...applyTargets(t)(g), layoutPending: false };
  // 演示数据：分区框自动包住指定卡片
  ng.frames = (ng.frames || []).map((f) => {
    if (!f.fitIds) return f;
    const cs = f.fitIds.map((id) => ng.cards.find((c) => c.id === id)).filter((c) => c && c.onBoard);
    const { fitIds, ...rest } = f;
    if (!cs.length) return rest;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const c of cs) { const s = sz(c); x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + s.w); y2 = Math.max(y2, c.y + s.h); }
    return { ...rest, x: Math.round(x1 - 24), y: Math.round(y1 - 52), w: Math.round(x2 - x1 + 48), h: Math.round(y2 - y1 + 76) };
  });
  S = { ...S, games: { ...S.games, [g.id]: ng } };
  emit();
  if (!S.readOnly) queueSave(g.id);
}
