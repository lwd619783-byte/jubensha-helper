import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { TYPES, TYPE_KEYS, MARKS, CRED, CONF, EDGE_STYLES, FRAME_COLORS, cx, clamp, rgba, isTyping, uid, kb } from './util.js';
import { sizes, sz, HG } from './layout.js';
import * as st from './store.js';
import { useS, getS, setS, cur, EMPTY_SEL } from './store.js';
import { useImg } from './images.js';
import { IconBtn, Btn, MenuButton, TypeIcon, Thumb, Empty } from './ui.jsx';

export const MINK = 0.2, MAXK = 2.5;

/* ---------- 几何（导出图片时复用） ---------- */
export const rectOf = (c) => { const s = sz(c); return { x: c.x, y: c.y, w: s.w, h: s.h }; };
export function treeGeom(p, c) {
  const right = c.x + c.w / 2 >= p.x + p.w / 2;
  const x1 = right ? p.x + p.w : p.x, x2 = right ? c.x : c.x + c.w;
  const y1 = p.y + p.h / 2, y2 = c.y + c.h / 2;
  const dx = (x2 - x1) * 0.5;
  return [x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2];
}
export const treePath = (d) => `M${d[0]},${d[1]} C${d[2]},${d[3]} ${d[4]},${d[5]} ${d[6]},${d[7]}`;
export function clipRect(r, tx, ty, gap = 0) {
  const cx0 = r.x + r.w / 2, cy0 = r.y + r.h / 2;
  const dx = tx - cx0, dy = ty - cy0;
  if (!dx && !dy) return [cx0, cy0];
  const sx = dx ? (r.w / 2 + gap) / Math.abs(dx) : Infinity, sy = dy ? (r.h / 2 + gap) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return [cx0 + dx * s, cy0 + dy * s];
}
export function relGeom(a, b) {
  const ay = a.y + a.h / 2, by = b.y + b.h / 2;
  // 上下叠放（同一列）的两张卡：从右侧绕一道弧线，避免线和说明压在中间的卡片上
  if (Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.abs(ay - by) > (a.h + b.h) / 2) {
    const x1 = a.x + a.w + 3, x2 = b.x + b.w + 3;
    const X = Math.max(x1, x2) + 26 + Math.min(110, Math.abs(ay - by) * 0.15);
    return { x1, y1: ay, x2, y2: by, c: [X, ay, X, by], mx: (x1 + 6 * X + x2) / 8, my: (ay + by) / 2 };
  }
  const [x1, y1] = clipRect(a, b.x + b.w / 2, b.y + b.h / 2, 3);
  const [x2, y2] = clipRect(b, a.x + a.w / 2, a.y + a.h / 2, 3);
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}
export const relPath = (r) => (r.c ? `M${r.x1},${r.y1} C${r.c[0]},${r.c[1]} ${r.c[2]},${r.c[3]} ${r.x2},${r.y2}` : `M${r.x1},${r.y1} L${r.x2},${r.y2}`);

/* ---------- 卡片信息标签 ---------- */
export function metaChips(c, place = '', pn = '') {
  const out = [];
  if (c.type === 'event') {
    const t = c.time ? c.time + (c.timeEnd ? '–' + c.timeEnd : '') : '';
    if (t || place) out.push({ t: [t, place].filter(Boolean).join(' · '), k: 'ev' });
  }
  if (c.type === 'person') {
    if (c.isMe) out.push({ t: '我', k: 'me' });
    if (c.identity) out.push({ t: c.identity });
    if (c.suspicion > 0) out.push({ t: '嫌疑 ' + '●'.repeat(c.suspicion), k: 'susp' });
  }
  if (c.type === 'clue' && c.credibility) out.push({ t: CRED[c.credibility], k: 'cred-' + c.credibility });
  if (c.type === 'question') out.push(c.done ? { t: '已解决', k: 'ok' } : { t: '待解决', k: 'todo' });
  if (c.type === 'deduction' && c.confidence > 0) out.push({ t: '把握 · ' + CONF[c.confidence], k: 'conf' });
  if (pn) out.push({ t: pn, k: 'pn' });
  for (const tg of (c.tags || []).slice(0, 3)) out.push({ t: '#' + tg, k: 'tag' });
  return out;
}
export function namesOf(ids, names) {
  const ns = (ids || []).map((i) => names.get(i)).filter(Boolean);
  if (!ns.length) return '';
  return ns.slice(0, 2).join('、') + (ns.length > 2 ? ` +${ns.length - 2}` : '');
}
export const cardPh = (c) => (c.imageIds?.length ? '图片线索' : c.type === 'topic' ? '主题' : '未命名' + (TYPES[c.type]?.label || ''));

export function pickFiles(cb, capture) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*'; i.multiple = !capture;
  if (capture) i.setAttribute('capture', 'environment');
  i.onchange = () => { const f = [...(i.files || [])]; if (f.length) cb(f); };
  i.click();
}

/* ---------- 菜单 ---------- */
const typeRow = (ids, curType) => ({ row: [...TYPE_KEYS, 'topic'].map((t) => ({ text: TYPES[t].label, color: TYPES[t].color, active: curType === t, fn: () => st.setTypeOf(ids, t) })) });
export function cardMenu(c) {
  const S0 = getS(), g = cur();
  if (S0.readOnly) return [{ label: '查看详情', icon: 'info', fn: () => st.openCard(c.id) }];
  const hasKids = g.cards.some((x) => x.parentId === c.id && x.onBoard);
  const isRoot = c.type === 'topic' && !c.parentId;
  return [
    { label: '编辑标题', icon: 'pen', kbd: 'Space', fn: () => st.startEdit(c.id) },
    { label: '添加子卡片', icon: 'plus', kbd: 'Tab', fn: () => st.addChild(c.id) },
    { label: '添加同级卡片', icon: 'plus', kbd: 'Enter', fn: () => st.addSibling(c.id) },
    { label: '连线到…', icon: 'link', kbd: 'L', fn: () => setS({ linkFrom: c.id, sel: { ...EMPTY_SEL, cards: [c.id] } }) },
    '-',
    !isRoot && { header: '类型' },
    !isRoot && typeRow([c.id], c.type),
    c.type !== 'topic' && { header: '标记' },
    c.type !== 'topic' && { row: Object.entries(MARKS).map(([k, m]) => ({ text: m.label, color: m.color, active: c.mark === k, fn: () => st.updCard(c.id, { mark: c.mark === k ? null : k }) })) },
    '-',
    hasKids && { label: c.collapsed ? '展开分支' : '折叠分支', icon: c.collapsed ? 'chevR' : 'chevD', kbd: '/', fn: () => st.toggleFold(c.id) },
    c.parentId && { label: '脱离父级', icon: 'arrowR', fn: () => st.detach(c.id) },
    { label: '用分区框住', icon: 'frame', kbd: 'G', fn: () => st.addFrame([c.id]) },
    !isRoot && { label: '移回待整理', icon: 'inbox', fn: () => st.unplace(c.id) },
    { label: '创建副本', icon: 'copy', kbd: '⌘D', fn: () => st.duplicateCard(c.id) },
    { label: '查看详情', icon: 'info', kbd: 'I', fn: () => st.openCard(c.id) },
    '-',
    { label: '删除', icon: 'trash', kbd: 'Del', danger: true, fn: () => st.deleteCard(c.id) },
  ];
}
export function multiMenu(ids) {
  if (getS().readOnly) return [];
  return [
    { header: `已选 ${ids.length} 张卡片 · 改类型` },
    typeRow(ids, null),
    { header: '标记' },
    { row: Object.entries(MARKS).map(([k, m]) => ({ text: m.label, color: m.color, fn: () => st.commit((g) => st.ops.updMany(g, ids, { mark: k })) })) },
    '-',
    { label: '用分区框住', icon: 'frame', kbd: 'G', fn: () => st.addFrame(ids) },
    { label: '清除标记', icon: 'x', fn: () => st.commit((g) => st.ops.updMany(g, ids, { mark: null })) },
    '-',
    { label: '删除所选', icon: 'trash', kbd: 'Del', danger: true, fn: () => st.deleteSel() },
  ];
}
const updEdge = (id, p) => st.commit((g) => st.ops.updEdge(g, id, p));
export function edgeMenu(e) {
  if (getS().readOnly) return [];
  return [
    { label: '编辑连线说明', icon: 'pen', fn: () => setS({ sel: { ...EMPTY_SEL, edge: e.id }, inspector: true, deskPanel: true }) },
    { header: '关系' },
    { row: Object.entries(EDGE_STYLES).map(([k, s]) => ({ text: s.label, color: k === 'conflict' ? '#e5484d' : k === 'dashed' ? '#9b9a97' : '#5e6ad2', active: e.style === k, fn: () => updEdge(e.id, { style: k }) })) },
    { header: '箭头' },
    { row: [['none', '无'], ['end', '单向'], ['both', '双向']].map(([k, t]) => ({ text: t, active: e.arrow === k, fn: () => updEdge(e.id, { arrow: k }) })) },
    { label: '交换方向', icon: 'swap', fn: () => updEdge(e.id, { from: e.to, to: e.from }) },
    '-',
    { label: '删除连线', icon: 'trash', danger: true, fn: () => { st.commit((g) => st.ops.delEdge(g, e.id)); st.select({}); } },
  ];
}
export function frameMenu(f) {
  if (getS().readOnly) return [];
  return [
    { label: '重命名分区', icon: 'pen', fn: () => setS({ sel: { ...EMPTY_SEL, frame: f.id }, inspector: true, deskPanel: true }) },
    { header: '颜色' },
    { row: FRAME_COLORS.map((c) => ({ text: '', color: c, active: f.color === c, fn: () => st.commit((g) => st.ops.updFrame(g, f.id, { color: c })) })) },
    '-',
    { label: '删除分区（保留卡片）', icon: 'trash', danger: true, fn: () => { st.commit((g) => st.ops.delFrame(g, f.id)); st.select({}); } },
  ];
}
export function canvasMenu(p) {
  if (getS().readOnly) return [{ label: '适应画布', icon: 'fit', kbd: '⌘0', fn: () => st.boardApi.current?.fit() }];
  return [
    { header: '在这里新建' },
    { row: TYPE_KEYS.map((t) => ({ text: TYPES[t].label, color: TYPES[t].color, fn: () => st.addFreeCard(t, p) })) },
    { label: '新建主题', icon: 'target', fn: () => st.addFreeCard('topic', p) },
    { label: '新建分区', icon: 'frame', fn: () => st.addFrame([], p) },
    { label: '添加图片…', icon: 'image', fn: () => pickFiles((f) => st.addImageCards(f, { onBoard: true, at: p })) },
    { label: 'AI 读卡构图…', icon: 'sparkle', fn: () => st.openModal('ai') },
    '-',
    { label: '一键整理', icon: 'wand', fn: () => st.tidyAll() },
    { label: '适应画布', icon: 'fit', kbd: '⌘0', fn: () => st.boardApi.current?.fit() },
    { label: '打开「待整理」', icon: 'inbox', fn: () => setS({ inbox: true }) },
  ];
}
export const newCardItems = () => [
  { header: '新建卡片（画布中央）' },
  ...TYPE_KEYS.map((t) => ({ label: TYPES[t].label, dot: TYPES[t].color, fn: () => st.addFreeCard(t) })),
  { label: '主题', dot: TYPES.topic.color, fn: () => st.addFreeCard('topic') },
  '-',
  { label: '分区', icon: 'frame', kbd: 'G', fn: () => st.addFrame(getS().sel.cards) },
  { label: '图片…', icon: 'image', fn: () => pickFiles((f) => st.addImageCards(f, { onBoard: true })) },
];

/* ---------- 尺寸测量 ---------- */
let onSizes = null;
const RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((ents) => {
  let ch = false;
  const grown = [];
  for (const en of ents) {
    const el = en.target, id = el.dataset.card;
    if (!id) continue;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    const p = sizes.get(id);
    if (!p || Math.abs(p.w - w) > 0.5 || Math.abs(p.h - h) > 0.5) {
      sizes.set(id, { w, h });
      ch = true;
      if (p && (Math.abs(p.h - h) > 2 || Math.abs(p.w - w) > 2)) grown.push(id);
    }
  }
  if (ch) onSizes?.(grown);
}) : null;

/* ---------- 卡片 ---------- */
function TitleEditor({ c }) {
  const [t, setT] = useState(c.title || '');
  const ref = useRef(null), done = useRef(false);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = '0px'; el.style.height = el.scrollHeight + 'px'; };
  useLayoutEffect(() => { const el = ref.current; el.focus({ preventScroll: true }); el.select(); }, []);
  useLayoutEffect(fit, [t]);
  const end = (cancel, then) => {
    if (done.current) return;
    done.current = true;
    st.finishEdit(c.id, ref.current ? ref.current.value : t, cancel);
    then?.();
  };
  return (
    <textarea ref={ref} className="card-edit" rows={1} value={t} placeholder={c.type === 'topic' ? '主题' : '输入' + (TYPES[c.type]?.label || '内容') + '…'}
      onChange={(e) => setT(e.target.value)} onBlur={() => end(false)} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); end(false); }
        else if (e.key === 'Escape') { e.preventDefault(); end(true); }
        else if (e.key === 'Tab') { e.preventDefault(); end(false, () => st.addChild(c.id)); }
      }} />
  );
}
function CardImg({ ids }) {
  const u = useImg(ids[0]);
  return (
    <div className="card-img">
      {u && <img src={u} alt="" draggable={false} />}
      {ids.length > 1 && <span className="card-imgn"><Icon name="image" size={11} />{ids.length}</span>}
      <button type="button" data-act="img" className="card-zoom" title="查看大图" aria-label="查看大图" onClick={() => setS({ lightbox: { ids, i: 0 } })}><Icon name="eye" size={13} /></button>
    </div>
  );
}
const Card = memo(function Card({ c, sel, edit, drop, kids, place, pn, lsrc }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; RO?.observe(el); return () => RO?.unobserve(el); }, []);
  const t = TYPES[c.type] || TYPES.note;
  const isTopic = c.type === 'topic', root = isTopic && !c.parentId;
  const imgs = c.imageIds || [];
  const wide = !isTopic && !!(c.body || imgs.length);
  const chips = isTopic ? [] : metaChips(c, place, pn);
  const m = c.mark && MARKS[c.mark];
  return (
    <div ref={ref} data-card={c.id} className={cx('card', 'ty-' + c.type, isTopic && (root ? 'topic root' : 'topic sub'), wide && 'wide', sel && 'sel', drop && 'drop', edit && 'editing', lsrc && 'lsrc', c.type === 'question' && c.done && 'done', m && 'marked')}
      style={{ left: c.x, top: c.y, '--tc': t.color, '--tcs': rgba(t.color, 0.1), ...(m ? { '--mk': m.color } : null) }}>
      {!isTopic && (
        <div className="card-type">
          <Icon name={t.icon} size={12} sw={2.2} /><span>{t.label}</span>
          {c.round > 0 && <span className="card-rnd">R{c.round}</span>}
          {m && <span className="card-mark">{m.label}</span>}
        </div>
      )}
      {edit ? <TitleEditor c={c} /> : <div className={cx('card-title', !c.title && 'ph')}>{c.title || cardPh(c)}</div>}
      {!isTopic && c.body && <div className="card-body">{c.body}</div>}
      {!isTopic && imgs.length > 0 && <CardImg ids={imgs} />}
      {chips.length > 0 && <div className="card-chips">{chips.map((x, i) => <span key={i} className={cx('cchip', x.k && 'cc-' + x.k)}>{x.t}</span>)}</div>}
      {kids > 0 && (
        <button type="button" data-act="fold" className={cx('fold', c.collapsed && 'on')} title={c.collapsed ? '展开分支 (/)' : '折叠分支 (/)'} aria-label={c.collapsed ? '展开' : '折叠'} onClick={() => st.toggleFold(c.id)}>
          {c.collapsed ? kids : <Icon name="minus" size={10} sw={2.8} />}
        </button>
      )}
    </div>
  );
});
const Frame = memo(function Frame({ f, sel, ro }) {
  return (
    <div className={cx('frame', sel && 'sel')} style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--fc': f.color, background: rgba(f.color, 0.045), borderColor: rgba(f.color, sel ? 0.9 : 0.32) }}>
      <div className="frame-head" data-frame-move={f.id} style={{ color: f.color }}><span>{f.title || '分区'}</span></div>
      {!ro && <div className="frame-rs" data-act="frame-resize" data-id={f.id} />}
    </div>
  );
});
const MK = ['solid', 'dashed', 'conflict', 'sel'];
const Edges = memo(function Edges({ geo, selEdge }) {
  const b = geo.box;
  if (!b) return null;
  return (
    <svg className="edges" style={{ left: b.x, top: b.y }} width={b.w} height={b.h} aria-hidden="true">
      <defs>
        {MK.map((k) => (
          <marker key={k} id={'mk-' + k} className={'mk mk-' + k} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
            <path d="M1,1.2 L9,5 L1,8.8 z" />
          </marker>
        ))}
      </defs>
      <g transform={`translate(${-b.x},${-b.y})`}>
        {geo.tree.map((t) => <path key={t.id} className="tl" d={t.d} />)}
        {geo.rel.map((r) => {
          const { e } = r, on = e.id === selEdge, mk = `url(#mk-${on ? 'sel' : e.style})`, d = relPath(r);
          return (
            <g key={e.id}>
              <path className={cx('rl', 'rl-' + e.style, on && 'on')} d={d} markerEnd={e.arrow !== 'none' ? mk : undefined} markerStart={e.arrow === 'both' ? mk : undefined} />
              <path className="rhit" data-edge={e.id} d={d} />
            </g>
          );
        })}
      </g>
    </svg>
  );
});
const EdgeLabels = memo(function EdgeLabels({ rel, selEdge }) {
  return rel.map(({ e, mx, my }) => (e.label || e.style === 'conflict') ? (
    <div key={e.id} data-edge={e.id} className={cx('elabel', 'el-' + e.style, e.id === selEdge && 'on')} style={{ left: mx, top: my }}>
      {e.style === 'conflict' && <Icon name="alert" size={11} sw={2.4} />}{e.label && <span>{e.label}</span>}
    </div>
  ) : null);
});
function Handles({ r, k, id, kids }) {
  const s = (extra) => ({ transform: `translate(-50%,-50%) scale(${1 / k})`, ...extra });
  return (
    <div className="handles" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
      <button type="button" data-act="add-child" className="hd" style={s({ left: `calc(100% + ${(kids ? 36 : 22) / k}px)`, top: '50%' })} title="添加子卡片 (Tab)" aria-label="添加子卡片" onClick={() => st.addChild(id)}><Icon name="plus" size={14} sw={2.4} /></button>
      <button type="button" data-act="add-sib" className="hd" style={s({ left: '50%', top: `calc(100% + ${20 / k}px)` })} title="添加同级卡片 (Enter)" aria-label="添加同级卡片" onClick={() => st.addSibling(id)}><Icon name="plus" size={14} sw={2.4} /></button>
      <button type="button" data-act="connect" data-id={id} className="hd hd-link" style={s({ left: `calc(100% + ${(kids ? 36 : 22) / k}px)`, top: `min(${-4 / k}px, calc(50% - var(--hg) / ${k}))` })} title="拖到另一张卡片建立连线 (L)" aria-label="连线"><Icon name="link" size={13} sw={2.2} /></button>
    </div>
  );
}

/* ---------- 待整理 ---------- */
export const inboxCards = (g) => g.cards.filter((c) => !c.onBoard && c.type !== 'person' && c.type !== 'topic').sort((a, b) => b.createdAt - a.createdAt);
function InboxPanel({ g, ro }) {
  const items = useMemo(() => inboxCards(g), [g.cards]);
  const selOne = useS((s) => (s.sel.cards.length === 1 ? s.sel.cards[0] : null));
  const target = selOne ? g.cards.find((c) => c.id === selOne && c.onBoard) : null;
  return (
    <div className="bd-ui inbox" onPointerDown={(e) => e.stopPropagation()}>
      <div className="inbox-h">
        <Icon name="inbox" size={15} /><b>待整理</b><span className="muted">{items.length}</span>
        <div className="sp" />
        {items.length > 1 && !ro && <Btn size="sm" onClick={() => st.placeOnBoard(items.map((i) => i.id))}>全部上图</Btn>}
        <IconBtn icon="x" title="关闭" onClick={() => setS({ inbox: false })} />
      </div>
      <div className="inbox-tip">{target ? <>选中了「{target.title || cardPh(target)}」，可把条目直接挂到它下面。</> : <>速记、图片会先放在这里。{getS().touch ? '点「上图」放到画布，' : '拖到画布或卡片上即可整理，'}也可先选中一张卡片再「挂到所选」。</>}</div>
      <div className="inbox-list">
        {items.map((c) => (
          <div key={c.id} className="ib-item" draggable={!ro} onDragStart={(e) => { e.dataTransfer.setData('application/x-jbs-card', c.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => st.openCard(c.id)}>
            <TypeIcon type={c.type} size={12} />
            <div className="ib-main">
              <div className="ib-t">{c.title || cardPh(c)}</div>
              {(c.body || (c.type === 'event' && c.time)) && <div className="ib-b">{c.type === 'event' && c.time ? c.time + (c.timeEnd ? '–' + c.timeEnd : '') + ' ' : ''}{c.body}</div>}
            </div>
            {c.imageIds?.[0] && <Thumb id={c.imageIds[0]} />}
            {!ro && (
              <div className="ib-acts">
                {target && <button type="button" className="mini" onClick={(e) => { e.stopPropagation(); st.placeOnBoard([c.id], null, target.id); }}>挂到所选</button>}
                <button type="button" className="mini pri" onClick={(e) => { e.stopPropagation(); st.placeOnBoard([c.id]); }}>上图</button>
              </div>
            )}
          </div>
        ))}
        {!items.length && <Empty icon="inbox" title="都整理好了">新的速记、图片会出现在这里</Empty>}
      </div>
    </div>
  );
}

/* ---------- 触屏选中操作条 ---------- */
function SelBar() {
  const sel = useS((s) => s.sel), ro = useS((s) => s.readOnly), editing = useS((s) => s.editing), linkFrom = useS((s) => s.linkFrom);
  const g = useS(cur);
  if (editing || linkFrom) return null;
  const menuAt = (e, items) => { const r = e.currentTarget.getBoundingClientRect(); setS({ ctx: { x: r.left, y: r.top - 6, items } }); };
  const B = ({ icon, label, onClick, danger }) => <button type="button" className={cx(danger && 'danger')} onClick={onClick}><Icon name={icon} size={18} /><span>{label}</span></button>;
  let body = null;
  if (sel.cards.length === 1) {
    const c = g.cards.find((x) => x.id === sel.cards[0]);
    if (!c?.onBoard) return null;
    body = (
      <>
        <B icon="info" label="详情" onClick={() => st.openCard(c.id)} />
        {!ro && <B icon="pen" label="编辑" onClick={() => st.startEdit(c.id)} />}
        {!ro && <B icon="plus" label="子卡片" onClick={() => st.addChild(c.id)} />}
        {!ro && <B icon="link" label="连线" onClick={() => setS({ linkFrom: c.id })} />}
        {!ro && <B icon="more" label="更多" onClick={(e) => menuAt(e, cardMenu(c))} />}
      </>
    );
  } else if (sel.cards.length > 1) {
    body = (
      <>
        <span className="selbar-n">已选 {sel.cards.length}</span>
        {!ro && <B icon="frame" label="分区" onClick={() => st.addFrame(sel.cards)} />}
        {!ro && <B icon="more" label="更多" onClick={(e) => menuAt(e, multiMenu(sel.cards))} />}
        <B icon="x" label="取消" onClick={() => st.select({})} />
      </>
    );
  } else if (sel.edge) {
    const e = g.edges.find((x) => x.id === sel.edge);
    if (!e) return null;
    body = (
      <>
        <B icon="info" label="详情" onClick={() => setS({ inspector: true })} />
        {!ro && <B icon="more" label="样式" onClick={(ev) => menuAt(ev, edgeMenu(e))} />}
        {!ro && <B icon="trash" label="删除" danger onClick={() => st.deleteSel()} />}
      </>
    );
  } else if (sel.frame) {
    const f = g.frames.find((x) => x.id === sel.frame);
    if (!f) return null;
    body = (
      <>
        <B icon="info" label="详情" onClick={() => setS({ inspector: true })} />
        {!ro && <B icon="more" label="颜色" onClick={(ev) => menuAt(ev, frameMenu(f))} />}
        {!ro && <B icon="trash" label="删除" danger onClick={() => st.deleteSel()} />}
      </>
    );
  }
  if (!body) return null;
  return <div className="bd-ui selbar" onPointerDown={(e) => e.stopPropagation()}>{body}</div>;
}

/* ---------- 画布 ---------- */
export function Board() {
  const g = useS(cur);
  const sel = useS((s) => s.sel);
  const editing = useS((s) => s.editing);
  const ro = useS((s) => s.readOnly);
  const layout = useS((s) => s.layout);
  const touch = useS((s) => s.touch);
  const linkFrom = useS((s) => s.linkFrom);
  const inbox = useS((s) => s.inbox);
  const focusReq = useS((s) => s.focusReq);
  const desk = layout === 'desk', phone = layout === 'phone';

  const wrap = useRef(null);
  const [v, setV0] = useState({ x: 0, y: 0, k: 1 });
  const vRef = useRef(v);
  const [anim, setAnim] = useState(false);
  const [sizeV, setSizeV] = useState(0);
  const [drop, setDrop] = useState(null);
  const [temp, setTemp] = useState(null);
  const [marq, setMarq] = useState(null);
  const [drag, setDrag] = useState(false);
  const T = useRef({ anim: 0, save: 0 });
  const D = useRef(null), P = useRef(new Map()), last = useRef({ t: 0 }), lpAt = useRef(0), dropRef = useRef(null);
  const inited = useRef(false), pendFit = useRef(false);
  const lay = useRef(layout);
  lay.current = layout;
  const gid = g.id;

  const { vis, kids, names } = useMemo(() => {
    const km = st.kidsMap(g.cards);
    const hidden = new Set();
    for (const c of g.cards) if (c.collapsed) for (const id of st.descendants(g, c.id, km)) hidden.add(id);
    const vis = g.cards.filter((c) => c.onBoard && !hidden.has(c.id));
    const kids = new Map();
    for (const [pid, arr] of km) kids.set(pid, arr.filter((c) => c.onBoard).length);
    const names = new Map();
    for (const c of g.cards) if (c.type === 'person' || c.type === 'place') names.set(c.id, c.title || '未命名');
    return { vis, kids, names };
  }, [g.cards]);
  const visRef = useRef(vis);
  visRef.current = vis;

  const geo = useMemo(() => {
    const rects = new Map();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const c of vis) {
      const r = rectOf(c);
      rects.set(c.id, r);
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    const tree = [];
    for (const c of vis) { const p = c.parentId && rects.get(c.parentId); if (p) tree.push({ id: c.id, d: treePath(treeGeom(p, rects.get(c.id))) }); }
    const rel = [];
    for (const e of g.edges) { const a = rects.get(e.from), b = rects.get(e.to); if (a && b) rel.push({ e, ...relGeom(a, b) }); }
    // 说明标签：沿连线找第一个不压卡片、不和别的标签叠在一起的位置
    const placed = [];
    const nearCard = (x, y) => {
      for (const r of rects.values()) if (x > r.x - 30 && x < r.x + r.w + 30 && y > r.y - 6 && y < r.y + r.h + 6) return true;
      return false;
    };
    const pointAt = (r, t) => {
      if (!r.c) return { x: r.x1 + (r.x2 - r.x1) * t, y: r.y1 + (r.y2 - r.y1) * t };
      const [cx1, cy1, cx2, cy2] = r.c;
      const u = 1 - t;
      return {
        x: u * u * u * r.x1 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * r.x2,
        y: u * u * u * r.y1 + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * r.y2,
      };
    };
    for (const r of rel) {
      if (!r.e.label && r.e.style !== 'conflict') continue;
      const mid = pointAt(r, 0.5);
      const free = (p) => !placed.some((q) => Math.abs(q.x - p.x) < 96 && Math.abs(q.y - p.y) < 26) && !nearCard(p.x, p.y);
      let spot = null;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85]) {
        const p = pointAt(r, t);
        if (free(p)) { spot = p; break; }
      }
      if (!spot) {
        // 两条线挨得太近时，沿连线的法线再挪：先找既不压卡片也不叠标签的，再退一步只避开标签
        const dx = r.x2 - r.x1, dy = r.y2 - r.y1, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        let fallback = null, fallbackGap = -1;
        for (const d of [22, -22, 38, -38, 56, -56, 80, -80]) {
          const p = { x: mid.x + nx * d, y: mid.y + ny * d };
          const labelClash = placed.some((q) => Math.abs(q.x - p.x) < 96 && Math.abs(q.y - p.y) < 26);
          if (!labelClash && !nearCard(p.x, p.y)) { spot = p; break; }
          const gap = placed.length ? Math.min(...placed.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) : 999;
          if (gap > fallbackGap) { fallbackGap = gap; fallback = p; }
        }
        if (!spot) spot = fallback;
      }
      spot = spot || mid;
      r.mx = Math.round(spot.x);
      r.my = Math.round(spot.y);
      placed.push({ x: r.mx, y: r.my });
    }
    const PAD = 300;
    const box = isFinite(x1) ? { x: Math.floor(x1 - PAD), y: Math.floor(y1 - PAD), w: Math.ceil(x2 - x1 + PAD * 2), h: Math.ceil(y2 - y1 + PAD * 2) } : null;
    return { rects, tree, rel, box };
  }, [vis, g.edges, sizeV]);

  /* ----- 视图 ----- */
  const saveView = () => {
    const el = wrap.current;
    if (!el || !el.clientWidth) return;
    const v = vRef.current;
    st.setGameView(gid, { cx: Math.round((el.clientWidth / 2 - v.x) / v.k), cy: Math.round((el.clientHeight / 2 - v.y) / v.k), k: +v.k.toFixed(3) });
  };
  const setV = (nv, animate) => {
    vRef.current = nv;
    setV0(nv);
    if (animate) { setAnim(true); clearTimeout(T.current.anim); T.current.anim = setTimeout(() => setAnim(false), 300); }
    clearTimeout(T.current.save);
    T.current.save = setTimeout(saveView, 700);
  };
  const bottomInset = () => (lay.current === 'phone' ? 84 : 64);
  const fit = (animate = true) => {
    const el = wrap.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight, bi = bottomInset();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const c of visRef.current) { const s = sz(c); x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + s.w); y2 = Math.max(y2, c.y + s.h); }
    for (const f of cur()?.frames || []) { x1 = Math.min(x1, f.x); y1 = Math.min(y1, f.y); x2 = Math.max(x2, f.x + f.w); y2 = Math.max(y2, f.y + f.h); }
    if (!isFinite(x1)) { setV({ x: W / 2, y: (H - bi) / 2, k: 1 }, animate); return; }
    const pad = lay.current === 'phone' ? 18 : 48;
    const bw = Math.max(1, x2 - x1), bh = Math.max(1, y2 - y1);
    const k = clamp(Math.min((W - pad * 2) / bw, (H - pad * 2 - bi) / bh), MINK, 1);
    setV({ k, x: (W - bw * k) / 2 - x1 * k, y: Math.max(pad, (H - bi - bh * k) / 2) - y1 * k }, animate);
  };
  const zoomAt = (k, sx, sy, animate) => {
    const v = vRef.current;
    k = clamp(k, MINK, MAXK);
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    setV({ k, x: sx - wx * k, y: sy - wy * k }, animate);
  };
  const zoomTo = (k) => { const el = wrap.current; if (el) zoomAt(k, el.clientWidth / 2, (el.clientHeight - bottomInset()) / 2, true); };
  const zoomBy = (f) => zoomTo(vRef.current.k * f);
  const center = () => {
    const el = wrap.current, v = vRef.current;
    if (!el) return { x: 0, y: 0 };
    return { x: (el.clientWidth / 2 - v.x) / v.k, y: ((el.clientHeight - bottomInset()) / 2 - v.y) / v.k };
  };
  const toWorld = (x, y) => { const r = wrap.current.getBoundingClientRect(), v = vRef.current; return { x: (x - r.left - v.x) / v.k, y: (y - r.top - v.y) / v.k }; };
  const rectById = (id) => { const c = st.card(id); return c ? rectOf(c) : null; };
  const focusCard = (id, minK = 0.8) => {
    const el = wrap.current, r = rectById(id);
    if (!el || !r) return;
    const k = clamp(Math.max(vRef.current.k, minK), MINK, MAXK);
    setV({ k, x: el.clientWidth / 2 - (r.x + r.w / 2) * k, y: (el.clientHeight - bottomInset()) / 2 - (r.y + r.h / 2) * k }, true);
  };
  const focusBounds = (ids, minK = 0.5, pad = 72) => {
    const el = wrap.current;
    if (!el) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of ids) {
      const c = st.card(id);
      if (!c) continue;
      const s = sz(c);
      x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y);
      x2 = Math.max(x2, c.x + s.w); y2 = Math.max(y2, c.y + s.h);
    }
    if (!isFinite(x1)) return;
    const W = el.clientWidth, H = el.clientHeight, bi = bottomInset();
    const bw = Math.max(1, x2 - x1), bh = Math.max(1, y2 - y1);
    const k = clamp(Math.min((W - pad * 2) / bw, (H - pad * 2 - bi) / bh), minK, 1);
    setV({ k, x: (W - bw * k) / 2 - x1 * k, y: Math.max(pad, (H - bi - bh * k) / 2) - y1 * k }, true);
  };
  const ensureVisible = (id) => {
    const el = wrap.current, r = rectById(id);
    if (!el || !r) return;
    const v = vRef.current, W = el.clientWidth, H = el.clientHeight, m = 32, bm = lay.current === 'phone' ? 150 : 76;
    const sx1 = r.x * v.k + v.x, sy1 = r.y * v.k + v.y, sx2 = sx1 + r.w * v.k, sy2 = sy1 + r.h * v.k;
    let dx = 0, dy = 0;
    if (sx1 < m || sx2 - sx1 > W - 2 * m) dx = m - sx1; else if (sx2 > W - m) dx = W - m - sx2;
    if (sy1 < m || sy2 - sy1 > H - m - bm) dy = m - sy1; else if (sy2 > H - bm) dy = H - bm - sy2;
    if (dx || dy) setV({ ...v, x: v.x + dx, y: v.y + dy }, true);
  };
  const cardAt = (wx, wy, excl) => {
    const vs = visRef.current;
    for (let i = vs.length - 1; i >= 0; i--) {
      const c = vs[i];
      if (excl?.has(c.id)) continue;
      const s = sz(c);
      if (wx >= c.x && wx <= c.x + s.w && wy >= c.y && wy <= c.y + s.h) return c.id;
    }
    return null;
  };
  const setDropT = (id) => { if (dropRef.current !== id) { dropRef.current = id; setDrop(id); } };

  /* ----- 初始化 / 尺寸 ----- */
  useLayoutEffect(() => {
    if (inited.current) {
      if (pendFit.current) { pendFit.current = false; fit(false); }
      return;
    }
    const el = wrap.current;
    if (!el || !el.clientWidth) return;
    inited.current = true;
    el.querySelectorAll('[data-card]').forEach((n) => sizes.set(n.dataset.card, { w: n.offsetWidth, h: n.offsetHeight }));
    const g0 = cur();
    if (g0.layoutPending) { st.tidyNow(); pendFit.current = true; setSizeV((x) => x + 1); return; }
    const gv = g0.view;
    if (gv && isFinite(gv.cx) && isFinite(gv.cy) && !getS().readOnly) {
      const k = clamp(gv.k || 1, MINK, MAXK);
      const nv = { k, x: el.clientWidth / 2 - gv.cx * k, y: el.clientHeight / 2 - gv.cy * k };
      vRef.current = nv;
      setV0(nv);
    } else fit(false);
  });
  useEffect(() => {
    onSizes = (grown) => { setSizeV((x) => x + 1); for (const id of grown) st.requestTidy(id); };
    const el = wrap.current;
    let pw = el.clientWidth, ph = el.clientHeight;
    const ob = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!pw || !w || (w === pw && h === ph)) { pw = w; ph = h; return; }
      const v = vRef.current;
      setV({ ...v, x: v.x + (w - pw) / 2, y: v.y + (h - ph) / 2 });
      pw = w; ph = h;
      const ed = getS().editing;
      if (ed) setTimeout(() => ensureVisible(ed.id), 60);
    });
    ob.observe(el);
    return () => {
      onSizes = null;
      ob.disconnect();
      clearTimeout(T.current.anim);
      if (T.current.save) { clearTimeout(T.current.save); saveView(); }
    };
  }, []);
  useEffect(() => { st.boardApi.current = { center, fit, zoomBy, zoomTo, focus: focusCard, ensureVisible, toWorld, getView: () => vRef.current, el: () => wrap.current }; });
  useEffect(() => () => { st.boardApi.current = null; }, []);
  useEffect(() => {
    if (!focusReq || Date.now() - focusReq.t > 1500) return;
    const ids = focusReq.ids && focusReq.ids.length ? focusReq.ids : focusReq.id ? [focusReq.id] : [];
    if (!ids.length) return;
    const t = setTimeout(() => {
      if (ids.length > 1) focusBounds(ids);
      else focusCard(ids[0]);
    }, 60);
    return () => clearTimeout(t);
  }, [focusReq]);
  useEffect(() => {
    if (!editing?.id) return;
    const id = editing.id;
    const t = setTimeout(() => {
      if (getS().touch && vRef.current.k < 0.85) focusCard(id, 1);
      else ensureVisible(id);
    }, 240);
    return () => clearTimeout(t);
  }, [editing?.id]);

  /* ----- 滚轮 / 键盘 ----- */
  useEffect(() => {
    const el = wrap.current;
    const onWheel = (e) => {
      if (e.target.closest?.('textarea')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      let dx = e.deltaX, dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= r.width; dy *= r.height; }
      const v = vRef.current;
      if (e.ctrlKey || e.metaKey) zoomAt(v.k * Math.exp(-clamp(dy, -50, 50) * 0.008), e.clientX - r.left, e.clientY - r.top);
      else {
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        setV({ ...v, x: v.x - dx, y: v.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const nav = (key, one) => {
      const vs = visRef.current;
      if (!one) {
        const r = vs.find((c) => c.type === 'topic' && !c.parentId) || vs[0];
        if (r) { st.select({ cards: [r.id] }); ensureVisible(r.id); }
        return;
      }
      const c = vs.find((x) => x.id === one);
      if (!c) return;
      const cc = (x) => { const s = sz(x); return { x: x.x + s.w / 2, y: x.y + s.h / 2 }; };
      const me = cc(c);
      const byId = new Map(vs.map((x) => [x.id, x]));
      const par = c.parentId ? byId.get(c.parentId) : null;
      const ks = vs.filter((x) => x.parentId === one);
      const nearestY = (arr) => arr.slice().sort((a, b) => Math.abs(cc(a).y - me.y) - Math.abs(cc(b).y - me.y))[0];
      let next = null;
      if (key === 'ArrowLeft') next = par && cc(par).x < me.x ? par : nearestY(ks.filter((k) => cc(k).x < me.x));
      if (key === 'ArrowRight') next = nearestY(ks.filter((k) => cc(k).x > me.x)) || (par && cc(par).x > me.x ? par : null);
      if ((key === 'ArrowUp' || key === 'ArrowDown') && par) {
        const sib = vs.filter((x) => x.parentId === c.parentId).sort((a, b) => a.y - b.y);
        const i = sib.indexOf(c);
        next = sib[i + (key === 'ArrowUp' ? -1 : 1)] || null;
      }
      if (!next) {
        let best = null, bs = Infinity;
        for (const o of vs) {
          if (o.id === one) continue;
          const p = cc(o), dx = p.x - me.x, dy = p.y - me.y;
          let main, cross;
          if (key === 'ArrowRight') { main = dx; cross = dy; } else if (key === 'ArrowLeft') { main = -dx; cross = dy; } else if (key === 'ArrowDown') { main = dy; cross = dx; } else { main = -dy; cross = dx; }
          if (main <= 8) continue;
          const sc = main + Math.abs(cross) * 2.2;
          if (sc < bs) { bs = sc; best = o; }
        }
        next = best;
      }
      if (next) { st.select({ cards: [next.id] }); ensureVisible(next.id); }
    };
    const onKey = (e) => {
      const S0 = getS();
      if (S0.view !== 'board' || S0.modal || S0.palette || S0.lightbox || S0.ctx || S0.quick) return;
      // 已被面板 / 输入框处理过的按键（如命令面板回车后自动关闭）不再当作导图快捷键
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.key === 'Process') return;
      if (S0.editing || isTyping(document.activeElement) || isTyping(e.target)) return;
      if (document.activeElement?.closest?.('.inspector, .sheet')) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key, kl = k.length === 1 ? k.toLowerCase() : k;
      const ids = S0.sel.cards, one = ids.length === 1 ? ids[0] : null;
      if (mod && k === '0') { e.preventDefault(); fit(); return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1.25); return; }
      if (mod && (k === '-' || k === '_')) { e.preventDefault(); zoomBy(1 / 1.25); return; }
      if (mod && kl === 'a') { e.preventDefault(); st.select({ cards: visRef.current.map((c) => c.id) }); return; }
      if (mod && kl === 'd') { if (one && !S0.readOnly) { e.preventDefault(); st.duplicateCard(one); } return; }
      if (mod || e.altKey) return;
      if (k === 'Escape') { if (S0.linkFrom) setS({ linkFrom: null }); else if (S0.inbox && lay.current !== 'desk') setS({ inbox: false }); else st.select({}); return; }
      if (k.startsWith('Arrow')) { e.preventDefault(); nav(k, one); return; }
      if (S0.readOnly) { if ((k === 'Enter' || k === ' ') && one) { e.preventDefault(); st.openCard(one); } return; }
      if (k === 'Tab') { e.preventDefault(); if (one) st.addChild(one); else nav(null, null); return; }
      if (k === 'Enter') { if (one) { e.preventDefault(); st.addSibling(one); } return; }
      if (k === ' ' || k === 'F2') { if (one) { e.preventDefault(); st.startEdit(one); } return; }
      if (k === 'Delete' || k === 'Backspace') { if (ids.length || S0.sel.edge || S0.sel.frame) { e.preventDefault(); st.deleteSel(); } return; }
      if (/^[1-7]$/.test(k) && ids.length) { e.preventDefault(); st.setTypeOf(ids, TYPE_KEYS[+k - 1]); return; }
      if (k === '/') { if (one) { e.preventDefault(); st.toggleFold(one); } return; }
      if (kl === 'l' && one) { e.preventDefault(); setS({ linkFrom: one }); return; }
      if (kl === 'g' && ids.length) { e.preventDefault(); st.addFrame(ids); return; }
      if (kl === 'i' && (one || S0.sel.edge || S0.sel.frame)) { e.preventDefault(); setS({ inspector: true, deskPanel: true }); return; }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  /* ----- 指针 ----- */
  const sched = (d, fn) => { d.apply = fn; if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; d.apply?.(); }); };
  const openMenuFor = (t, x, y) => {
    if (Date.now() - lpAt.current < 700) return;
    lpAt.current = Date.now();
    const S0 = getS(), g0 = cur();
    const cel = t.closest?.('[data-card]'), eel = t.closest?.('[data-edge]'), fel = t.closest?.('[data-frame-move]');
    if (cel) {
      const id = cel.dataset.card, c = st.card(id);
      if (!c) return;
      if (!S0.sel.cards.includes(id)) st.select({ cards: [id] });
      const ids = getS().sel.cards;
      const items = ids.length > 1 ? multiMenu(ids) : cardMenu(c);
      if (items.length) setS({ ctx: { x, y, items } });
    } else if (eel) {
      const e = g0.edges.find((x) => x.id === eel.dataset.edge);
      if (!e) return;
      st.select({ edge: e.id });
      const items = edgeMenu(e);
      if (items.length) setS({ ctx: { x, y, items } });
    } else if (fel) {
      const f = g0.frames.find((x) => x.id === fel.dataset.frameMove);
      if (!f) return;
      st.select({ frame: f.id });
      const items = frameMenu(f);
      if (items.length) setS({ ctx: { x, y, items } });
    } else setS({ ctx: { x, y, items: canvasMenu(toWorld(x, y)) } });
  };
  const armLP = (d, e) => {
    if (e.pointerType === 'mouse') return;
    const t = e.target;
    d.lpT = setTimeout(() => {
      if (D.current !== d || d.moved) return;
      d.lp = true;
      try { navigator.vibrate?.(10); } catch {}
      openMenuFor(t, d.sx, d.sy);
    }, 520);
  };
  const beginPinch = () => {
    const d = D.current;
    if (d && d.kind !== 'pinch') {
      clearTimeout(d.lpT);
      if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; d.apply?.(); }
      if (d.kind === 'card' && d.moved) endCardDrag(d, true);
      else if ((d.kind === 'fmove' || d.kind === 'fresize') && d.moved) st.markHist(d.before);
    }
    setTemp(null); setMarq(null); setDropT(null);
    const [a, b] = [...P.current.values()];
    const r = wrap.current.getBoundingClientRect(), v = vRef.current;
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    D.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, wx: (mx - v.x) / v.k, wy: (my - v.y) / v.k, r };
  };
  const startCardDrag = (d) => {
    st.stopAnim();
    const g0 = cur(), km = st.kidsMap(g0.cards), selSet = new Set(d.ids);
    const tops = d.ids.filter((id) => st.card(id, g0)?.onBoard && !st.ancestors(g0, id).some((a) => selSet.has(a.id)));
    const move = new Set();
    for (const id of tops) { move.add(id); for (const x of st.descendants(g0, id, km)) move.add(x); }
    d.tops = tops; d.move = move; d.before = g0;
    d.start = new Map(g0.cards.filter((c) => move.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }]));
    setDrag(true);
  };
  const endCardDrag = (d, cancelled) => {
    setDrag(false); setDropT(null);
    const target = cancelled ? null : d.drop;
    st.markHist(d.before);
    if (target) {
      const tc = st.card(target);
      let ok = false;
      for (const id of d.tops) ok = st.reparentTo(id, target) || ok;
      if (ok && tc) {
        if (tc.collapsed) st.commit((g) => st.ops.upd(g, target, { collapsed: false }), { history: false });
        if (!getS().settings.autoTidy) {
          const ts = sz(tc), first = st.card(d.tops[0]);
          const dx = tc.x + ts.w + HG - first.x, dy = tc.y - first.y;
          st.commit((g) => ({ ...g, cards: g.cards.map((c) => (d.move.has(c.id) ? { ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) } : c)) }), { history: false });
        }
      }
    } else for (const id of d.tops) st.requestTidy(id);
  };
  const createLinked = (d) => {
    const g0 = cur(), w = d.wEnd;
    const c = st.newCard('clue', { x: Math.round(w.x - 60), y: Math.round(w.y - 24), round: g0.currentRound });
    const e = { id: uid(), from: d.id, to: c.id, label: '', style: 'solid', arrow: 'end' };
    st.commit((g) => ({ ...g, cards: [...g.cards, c], edges: [...g.edges, e] }));
    st.startEdit(c.id, true);
  };

  const down = (e) => {
    const t = e.target;
    if (e.button === 2) return;
    if (t.closest('textarea, input, [contenteditable="true"]')) return;
    if (isTyping(document.activeElement)) document.activeElement.blur();
    const S0 = getS();
    P.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { wrap.current.setPointerCapture(e.pointerId); } catch {}
    if (P.current.size === 2) { beginPinch(); return; }
    if (P.current.size > 2) return;
    const act = t.closest('[data-act]'), an = act?.dataset.act;
    if (act && an !== 'connect' && an !== 'frame-resize') {
      P.current.delete(e.pointerId);
      try { wrap.current.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    const base = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse', w0: toWorld(e.clientX, e.clientY) };
    if (e.button === 1) { D.current = { ...base, kind: 'pan', vx: vRef.current.x, vy: vRef.current.y }; return; }
    if (an === 'connect') { D.current = { ...base, kind: 'connect', id: act.dataset.id }; return; }
    if (an === 'frame-resize') {
      const f = cur().frames.find((x) => x.id === act.dataset.id);
      if (f) D.current = { ...base, kind: 'fresize', id: f.id, fw: f.w, fh: f.h };
      return;
    }
    const eel = t.closest('[data-edge]');
    if (eel) {
      if (S0.linkFrom) setS({ linkFrom: null });
      st.select({ edge: eel.dataset.edge });
      const d = (D.current = { ...base, kind: 'edge', id: eel.dataset.edge });
      armLP(d, e);
      return;
    }
    const fel = t.closest('[data-frame-move]');
    if (fel) {
      if (S0.linkFrom) setS({ linkFrom: null });
      const id = fel.dataset.frameMove;
      st.select({ frame: id });
      const d = (D.current = { ...base, kind: S0.readOnly ? 'pan' : 'fmove', id, vx: vRef.current.x, vy: vRef.current.y });
      armLP(d, e);
      return;
    }
    const cel = t.closest('[data-card]');
    if (cel) {
      const id = cel.dataset.card;
      if (S0.editing?.id === id) { P.current.delete(e.pointerId); return; }
      if (S0.linkFrom) {
        if (S0.linkFrom !== id) st.addEdge(S0.linkFrom, id);
        setS({ linkFrom: null });
        P.current.delete(e.pointerId);
        return;
      }
      let ids = S0.sel.cards;
      const wasSel = ids.includes(id);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        st.select({ cards: wasSel ? ids.filter((x) => x !== id) : [...ids, id] });
        P.current.delete(e.pointerId);
        return;
      }
      if (!wasSel) { st.select({ cards: [id] }); ids = [id]; }
      const d = (D.current = S0.readOnly ? { ...base, kind: 'pan', tapCard: true, id, vx: vRef.current.x, vy: vRef.current.y } : { ...base, kind: 'card', id, ids, wasSel });
      armLP(d, e);
      return;
    }
    if (S0.linkFrom) setS({ linkFrom: null });
    if (e.shiftKey && e.pointerType === 'mouse') { D.current = { ...base, kind: 'marq', add: S0.sel.cards }; return; }
    const d = (D.current = { ...base, kind: 'pan', vx: vRef.current.x, vy: vRef.current.y });
    armLP(d, e);
  };
  const move = (e) => {
    if (P.current.has(e.pointerId)) P.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = D.current;
    if (!d) return;
    if (d.kind === 'pinch') {
      const pts = [...P.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      sched(d, () => {
        const k = clamp((d.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0, MINK, MAXK);
        const mx = (a.x + b.x) / 2 - d.r.left, my = (a.y + b.y) / 2 - d.r.top;
        setV({ k, x: mx - d.wx * k, y: my - d.wy * k });
      });
      return;
    }
    if (d.pid !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < (d.touch ? 8 : 4)) return;
      d.moved = true;
      clearTimeout(d.lpT);
      if (d.kind === 'edge') d.kind = 'none';
      if (d.kind === 'card') startCardDrag(d);
      if (d.kind === 'fmove') {
        const g0 = cur(), f = g0.frames.find((x) => x.id === d.id);
        if (!f) { d.kind = 'none'; return; }
        st.stopAnim();
        const km = st.kidsMap(g0.cards), inside = new Set();
        for (const c of visRef.current) {
          const s = sz(c);
          if (c.x >= f.x && c.y >= f.y && c.x + s.w <= f.x + f.w && c.y + s.h <= f.y + f.h) { inside.add(c.id); for (const x of st.descendants(g0, c.id, km)) inside.add(x); }
        }
        d.before = g0; d.f0 = { x: f.x, y: f.y };
        d.start = new Map(g0.cards.filter((c) => inside.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y }]));
      }
      if (d.kind === 'fresize') d.before = cur();
    }
    const k = vRef.current.k;
    switch (d.kind) {
      case 'pan':
        sched(d, () => setV({ ...vRef.current, x: d.vx + dx, y: d.vy + dy }));
        break;
      case 'card': {
        const cx0 = e.clientX, cy0 = e.clientY;
        sched(d, () => {
          const ddx = dx / k, ddy = dy / k, s = d.start;
          st.commit((g) => ({ ...g, cards: g.cards.map((c) => { const p = s.get(c.id); return p ? { ...c, x: Math.round(p.x + ddx), y: Math.round(p.y + ddy) } : c; }) }), { history: false });
          const w = toWorld(cx0, cy0);
          d.drop = cardAt(w.x, w.y, d.move);
          setDropT(d.drop);
        });
        break;
      }
      case 'connect': {
        const w = toWorld(e.clientX, e.clientY);
        d.wEnd = w; d.far = Math.hypot(dx, dy) > 40;
        d.target = cardAt(w.x, w.y, new Set([d.id]));
        sched(d, () => {
          const src = rectById(d.id);
          if (!src) return;
          const [x1, y1] = clipRect(src, w.x, w.y, 2);
          setTemp({ x1, y1, x2: w.x, y2: w.y });
          setDropT(d.target);
        });
        break;
      }
      case 'marq': {
        const ex = e.clientX, ey = e.clientY;
        sched(d, () => {
          const r = wrap.current.getBoundingClientRect(), v = vRef.current;
          const x1 = Math.min(d.sx, ex) - r.left, y1 = Math.min(d.sy, ey) - r.top, w = Math.abs(ex - d.sx), h = Math.abs(ey - d.sy);
          setMarq({ x: x1, y: y1, w, h });
          const a = { x: (x1 - v.x) / v.k, y: (y1 - v.y) / v.k }, b = { x: (x1 + w - v.x) / v.k, y: (y1 + h - v.y) / v.k };
          const hit = visRef.current.filter((c) => { const s = sz(c); return c.x < b.x && c.x + s.w > a.x && c.y < b.y && c.y + s.h > a.y; }).map((c) => c.id);
          const all = [...new Set([...d.add, ...hit])], key = all.join(',');
          if (key !== d.key) { d.key = key; st.select({ cards: all }); }
        });
        break;
      }
      case 'fmove':
        sched(d, () => {
          const ddx = Math.round(dx / k), ddy = Math.round(dy / k), s = d.start;
          st.commit((g) => ({
            ...g,
            frames: g.frames.map((f) => (f.id === d.id ? { ...f, x: d.f0.x + ddx, y: d.f0.y + ddy } : f)),
            cards: s.size ? g.cards.map((c) => { const p = s.get(c.id); return p ? { ...c, x: p.x + ddx, y: p.y + ddy } : c; }) : g.cards,
          }), { history: false });
        });
        break;
      case 'fresize':
        sched(d, () => st.commit((g) => st.ops.updFrame(g, d.id, { w: Math.max(160, Math.round(d.fw + dx / k)), h: Math.max(100, Math.round(d.fh + dy / k)) }), { history: false }));
        break;
      default:
    }
  };
  const finish = (e, cancelled) => {
    P.current.delete(e.pointerId);
    const d = D.current;
    if (!d) return;
    if (d.kind === 'pinch') { if (P.current.size < 2) { if (d.raf) cancelAnimationFrame(d.raf); D.current = null; } return; }
    if (d.pid !== e.pointerId) return;
    D.current = null;
    clearTimeout(d.lpT);
    if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; d.apply?.(); }
    if (d.kind === 'card' && d.moved) { endCardDrag(d, cancelled); return; }
    if (d.kind === 'connect') {
      setTemp(null); setDropT(null);
      if (cancelled) return;
      if (!d.moved) { setS({ linkFrom: d.id }); return; }
      if (d.target) st.addEdge(d.id, d.target);
      else if (d.far && d.wEnd) createLinked(d);
      return;
    }
    if (d.kind === 'marq') { setMarq(null); return; }
    if ((d.kind === 'fmove' || d.kind === 'fresize') && d.moved) { st.markHist(d.before); return; }
    if (cancelled || d.moved || d.lp) return;
    const now = Date.now(), lt = last.current, key = d.kind + ':' + (d.id || '');
    const dbl = now - lt.t < 380 && lt.key === key && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 16;
    last.current = dbl ? { t: 0 } : { t: now, x: e.clientX, y: e.clientY, key };
    const S0 = getS();
    if (d.kind === 'card' || d.tapCard) {
      if (dbl) { if (S0.readOnly) st.openCard(d.id); else st.startEdit(d.id); }
      else if (d.ids?.length > 1) st.select({ cards: [d.id] });
      return;
    }
    if (d.kind === 'pan') {
      if (dbl) { if (!S0.readOnly) st.addFreeCard('clue', { x: d.w0.x + 50, y: d.w0.y }); }
      else {
        st.select({});
        if (lay.current !== 'desk') setS({ inspector: false, ...(lay.current === 'phone' ? { inbox: false } : null) });
      }
      return;
    }
    if (dbl && (d.kind === 'edge' || d.kind === 'fmove')) setS({ inspector: true, deskPanel: true });
  };
  const onCtx = (e) => {
    if (e.target.closest('textarea, input')) return;
    e.preventDefault();
    const d = D.current;
    if (d && d.kind !== 'pinch') { clearTimeout(d.lpT); if (d.moved) return; d.lp = true; }
    openMenuFor(e.target, e.clientX, e.clientY);
  };
  const dragOver = (e) => {
    if (ro) return;
    const ty = [...(e.dataTransfer?.types || [])];
    if (!ty.includes('Files') && !ty.includes('application/x-jbs-card')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = ty.includes('Files') ? 'copy' : 'move';
    const w = toWorld(e.clientX, e.clientY);
    setDropT(cardAt(w.x, w.y));
  };
  const onDrop = (e) => {
    if (ro) return;
    e.preventDefault();
    e.stopPropagation();
    setDropT(null);
    const w = toWorld(e.clientX, e.clientY), tg = cardAt(w.x, w.y);
    const cid = e.dataTransfer.getData('application/x-jbs-card');
    if (cid) { st.placeOnBoard([cid], tg ? null : { x: w.x, y: w.y }, tg); return; }
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) st.addImageCards(files, tg ? { attachTo: tg } : { onBoard: true, at: w });
  };

  /* ----- 渲染 ----- */
  const selSet = useMemo(() => new Set(sel.cards), [sel.cards]);
  const one = sel.cards.length === 1 && geo.rects.has(sel.cards[0]) ? sel.cards[0] : null;
  const showHandles = one && !ro && !editing && !drag && !linkFrom && !marq;
  const inboxN = useMemo(() => inboxCards(g).length, [g.cards]);
  return (
    <div className={cx('board', drag && 'dragging', linkFrom && 'linking', touch && 'touchb')}>
      <div ref={wrap} className="canvas" style={{ backgroundSize: `${24 * v.k * (v.k < 0.45 ? 2 : 1)}px ${24 * v.k * (v.k < 0.45 ? 2 : 1)}px`, backgroundPosition: `${v.x}px ${v.y}px` }} onPointerDown={down} onPointerMove={move} onPointerUp={(e) => finish(e, false)} onPointerCancel={(e) => finish(e, true)}
        onContextMenu={onCtx} onDragOver={dragOver} onDragLeave={(e) => { if (!wrap.current.contains(e.relatedTarget)) setDropT(null); }} onDrop={onDrop}>
        <div className={cx('world', anim && 'anim')} style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.k})` }}>
          {g.frames.map((f) => <Frame key={f.id} f={f} sel={sel.frame === f.id} ro={ro} />)}
          <Edges geo={geo} selEdge={sel.edge} />
          {vis.map((c) => (
            <Card key={c.id} c={c} sel={selSet.has(c.id)} edit={editing?.id === c.id} drop={drop === c.id} kids={kids.get(c.id) || 0}
              place={c.type === 'event' && c.placeId ? names.get(c.placeId) || '' : ''}
              pn={c.type !== 'person' && c.personIds?.length ? namesOf(c.personIds, names) : ''} lsrc={linkFrom === c.id} />
          ))}
          <EdgeLabels rel={geo.rel} selEdge={sel.edge} />
          {showHandles && <Handles r={geo.rects.get(one)} k={v.k} id={one} kids={kids.get(one) || 0} />}
          {temp && <svg className="ltemp" width="1" height="1"><path d={`M${temp.x1},${temp.y1} L${temp.x2},${temp.y2}`} /></svg>}
        </div>
        {marq && <div className="marq" style={{ left: marq.x, top: marq.y, width: marq.w, height: marq.h }} />}
        {!vis.length && (
          <div className="bd-empty">
            <Icon name="map" size={22} />
            <b>画布还是空的</b>
            <span>{ro ? '这份存档没有导图内容' : touch ? '双击空白处新建卡片，长按打开菜单' : '双击空白处新建卡片，右键打开菜单'}</span>
          </div>
        )}
      </div>
      <div className={cx('bd-ui btool', phone && 'vert')} onPointerDown={(e) => e.stopPropagation()}>
        {!phone && (
          <>
            <IconBtn icon="minus" title={kb('缩小 (⌘−)')} onClick={() => zoomBy(1 / 1.25)} />
            <button type="button" className="zoomv" title="重置为 100%" onClick={() => zoomTo(1)}>{Math.round(v.k * 100)}%</button>
            <IconBtn icon="plus" title={kb('放大 (⌘+)')} onClick={() => zoomBy(1.25)} />
            <span className="tsep" />
          </>
        )}
        <IconBtn icon="fit" title={kb('适应画布 (⌘0)')} onClick={() => fit()} />
        {!ro && <IconBtn icon="wand" title="一键整理" onClick={() => st.tidyAll()} />}
        {!ro && !phone && (
          <>
            <span className="tsep" />
            <MenuButton className="ibtn" title="新建卡片" items={newCardItems}><Icon name="plus" size={16} /></MenuButton>
            <IconBtn icon="frame" title="新建分区 (G)" onClick={() => st.addFrame(getS().sel.cards)} />
          </>
        )}
        {!ro && <IconBtn icon="inbox" title="待整理" active={inbox} badge={inboxN} onClick={() => setS({ inbox: !getS().inbox })} />}
      </div>
      {linkFrom && (
        <div className="bd-ui linkbar" onPointerDown={(e) => e.stopPropagation()}>
          <Icon name="link" size={15} /><span>点选另一张卡片完成连线</span>
          <button type="button" onClick={() => setS({ linkFrom: null })}>取消</button>
        </div>
      )}
      {inbox && !ro && <InboxPanel g={g} ro={ro} />}
      {!desk && <SelBar />}
    </div>
  );
}
