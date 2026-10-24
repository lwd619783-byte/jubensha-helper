import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';
import { cx, clamp, avatarColor, TYPES, rgba, kb } from './util.js';
import { useS, setS, getS, cur, newInboxCard } from './store.js';
import { useImg } from './images.js';

export function Btn({ icon, children, kind, size, className, ...p }) {
  return (
    <button type="button" className={cx('btn', kind && 'btn-' + kind, size && 'btn-' + size, !children && 'btn-icon', className)} {...p}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children != null && children !== false && <span>{children}</span>}
    </button>
  );
}
export function IconBtn({ icon, title, active, className, size = 16, badge, ...p }) {
  return (
    <button type="button" className={cx('ibtn', active && 'on', className)} title={title} aria-label={title} {...p}>
      <Icon name={icon} size={size} />
      {badge ? <span className="badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}
export function Popover({ anchor, onClose, children, className, align = 'left' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), el = ref.current;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = align === 'right' ? r.right - w : r.left;
    let y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    setPos({ x: clamp(x, 8, Math.max(8, innerWidth - w - 8)), y });
  }, [anchor, align]);
  useEffect(() => {
    const f = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', f, true);
    addEventListener('keydown', k, true);
    return () => { document.removeEventListener('pointerdown', f, true); removeEventListener('keydown', k, true); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={cx('pop', className)} style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: 'hidden' }}>{children}</div>,
    document.body,
  );
}
export function MenuList({ items, onDone }) {
  return (
    <div className="menu" role="menu">
      {items.filter(Boolean).map((it, i) =>
        it === '-' ? <div key={i} className="menu-sep" /> : it.header ? <div key={i} className="menu-h">{it.header}</div> : it.row ? (
          <div key={i} className="menu-row">
            {it.row.map((b, j) => (
              <button key={j} type="button" className={cx('menu-chip', b.active && 'on')} style={b.color ? { '--mc': b.color } : undefined} onClick={() => { onDone?.(); b.fn(); }}>
                {b.color && <span className="mdot" />}{b.text}
              </button>
            ))}
          </div>
        ) : (
          <button key={i} type="button" role="menuitem" className={cx('menu-item', it.danger && 'danger')} disabled={it.disabled}
            onClick={() => { onDone?.(); it.fn(); }}>
            {it.icon ? <Icon name={it.icon} size={15} /> : it.dot ? <span className="mdot" style={{ background: it.dot }} /> : <span className="menu-sp" />}
            <span className="menu-l">{it.label}</span>
            {it.kbd && <kbd>{kb(it.kbd)}</kbd>}
            {it.active && <Icon name="check" size={14} className="menu-ck" />}
          </button>
        ))}
    </div>
  );
}
export function MenuButton({ items, children, className, title, align = 'left' }) {
  const [anc, setAnc] = useState(null);
  return (
    <>
      <button type="button" className={className} title={title} aria-label={title} onClick={(e) => setAnc(anc ? null : e.currentTarget)}>{children}</button>
      {anc && <Popover anchor={anc} align={align} onClose={() => setAnc(null)}><MenuList items={typeof items === 'function' ? items() : items} onDone={() => setAnc(null)} /></Popover>}
    </>
  );
}
export function CtxMenu() {
  const ctx = useS((s) => s.ctx);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!ctx) return;
    const el = ref.current, w = el.offsetWidth, h = el.offsetHeight;
    setPos({ x: clamp(ctx.x, 8, innerWidth - w - 8), y: ctx.y + h > innerHeight - 8 ? Math.max(8, ctx.y - h) : ctx.y });
  }, [ctx]);
  useEffect(() => {
    if (!ctx) return;
    const t0 = Date.now();
    const close = (e) => { if (!ref.current?.contains(e.target) && Date.now() - t0 > 150) setS({ ctx: null }); };
    const k = (e) => e.key === 'Escape' && setS({ ctx: null });
    document.addEventListener('pointerdown', close, true);
    addEventListener('keydown', k);
    addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', close, true); removeEventListener('keydown', k); removeEventListener('resize', close); };
  }, [ctx]);
  if (!ctx) return null;
  return createPortal(
    <div ref={ref} className="pop ctx" style={pos ? { left: pos.x, top: pos.y } : { left: ctx.x, top: ctx.y, visibility: 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      {ctx.title && <div className="menu-h">{ctx.title}</div>}
      <MenuList items={ctx.items} onDone={() => setS({ ctx: null })} />
    </div>,
    document.body,
  );
}
export function Modal({ title, onClose, children, footer, width = 520, className }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', className)} style={{ maxWidth: width }} role="dialog" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><IconBtn icon="x" title="关闭" onClick={onClose} /></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
export function AutoText({ value, onChange, className, placeholder, minRows = 1, ...p }) {
  const ref = useRef(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  useLayoutEffect(fit, [value]);
  return <textarea ref={ref} rows={minRows} className={cx('ta', className)} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={fit} {...p} />;
}
export function Seg({ value, options, onChange, size, disabled }) {
  return (
    <div className={cx('seg', size && 'seg-' + size)}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} disabled={disabled} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)} style={o.color ? { '--sc': o.color } : undefined}>
          {o.icon && <Icon name={o.icon} size={13} />}{o.label}
        </button>
      ))}
    </div>
  );
}
export function Stars({ value = 0, onChange, size = 18, ro }) {
  return (
    <div className={cx('stars', ro && 'ro')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={ro} className={cx('star', i <= value && 'on')} onClick={() => onChange?.(value === i ? 0 : i)} aria-label={`${i} 星`}>
          <Icon name="star" size={size} fill={i <= value ? 'currentColor' : 'none'} sw={1.6} />
        </button>
      ))}
    </div>
  );
}
export function Dots({ value = 0, onChange, color = '#e5484d', ro }) {
  return (
    <div className="dots">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={ro} className={cx('dotb', i <= value && 'on')} style={{ '--dc': color }} onClick={() => onChange?.(value === i ? 0 : i)} aria-label={`嫌疑度 ${i}`} />
      ))}
    </div>
  );
}
export function Avatar({ name, size = 22 }) {
  const c = avatarColor(name || '?');
  return <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.46), background: rgba(c, 0.14), color: c }}>{(name || '?').trim().slice(0, 1) || '?'}</span>;
}
export function TypeIcon({ type, size = 14 }) {
  const t = TYPES[type] || TYPES.note;
  return <span className="ticon" style={{ color: t.color, background: rgba(t.color, 0.12), width: size + 10, height: size + 10 }}><Icon name={t.icon} size={size} /></span>;
}
export function Toggle({ value, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" disabled={disabled} aria-checked={!!value} className={cx('tgl', value && 'on')} onClick={() => onChange(!value)}>
      <span className="tgl-k" />{label && <em>{label}</em>}
    </button>
  );
}
export const Prop = ({ label, icon, children, top }) => (
  <div className={cx('prop', top && 'top')}>
    <div className="prop-l">{icon && <Icon name={icon} size={14} />}<span>{label}</span></div>
    <div className="prop-v">{children}</div>
  </div>
);
export function RefPicker({ items, value = [], onChange, placeholder = '添加', onCreate, single, renderItem, disabled }) {
  const [anc, setAnc] = useState(null);
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sel = value.map((id) => byId.get(id)).filter(Boolean);
  const opts = items.filter((i) => !value.includes(i.id) && (!q || (i.title || '').toLowerCase().includes(q.toLowerCase())));
  const label = (i) => (renderItem ? renderItem(i) : <span>{i.title || '未命名'}</span>);
  const add = (id) => { onChange(single ? [id] : [...value, id]); setQ(''); if (single) setAnc(null); };
  const create = () => { const id = onCreate(q.trim()); if (id) add(id); };
  return (
    <div className="refs">
      {sel.map((i) => (
        <span key={i.id} className="chip ref">{label(i)}
          {!disabled && <button type="button" className="chip-x" onClick={() => onChange(value.filter((x) => x !== i.id))} aria-label="移除"><Icon name="x" size={11} /></button>}
        </span>
      ))}
      {!disabled && (!single || !sel.length) && (
        <button type="button" className="chip add" onClick={(e) => setAnc(anc ? null : e.currentTarget)}><Icon name="plus" size={12} />{sel.length ? null : <span>{placeholder}</span>}</button>
      )}
      {single && sel.length > 0 && !disabled && <button type="button" className="chip add" onClick={(e) => setAnc(anc ? null : e.currentTarget)}><Icon name="swap" size={12} /></button>}
      {anc && (
        <Popover anchor={anc} onClose={() => { setAnc(null); setQ(''); }} className="pick">
          <input autoFocus={!getS().touch} className="pick-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={onCreate ? '搜索或新建…' : '搜索…'}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              if (opts[0]) add(opts[0].id);
              else if (q.trim() && onCreate) create();
            }} />
          <div className="pick-list">
            {opts.slice(0, 60).map((i) => <button type="button" key={i.id} className="pick-item" onClick={() => add(i.id)}>{label(i)}</button>)}
            {q.trim() && onCreate && !items.some((i) => i.title === q.trim()) && (
              <button type="button" className="pick-item create" onClick={create}><Icon name="plus" size={13} /><span>新建「{q.trim()}」</span></button>
            )}
            {!opts.length && !q && <div className="pick-empty">暂无可选项</div>}
          </div>
        </Popover>
      )}
    </div>
  );
}
export function PersonPicker({ value, onChange, placeholder, single, disabled }) {
  const g = useS(cur);
  const persons = useMemo(() => g.cards.filter((c) => c.type === 'person'), [g.cards]);
  return (
    <RefPicker items={persons} value={value || []} onChange={onChange} single={single} disabled={disabled} placeholder={placeholder || '添加人物'}
      onCreate={(name) => newInboxCard('person', { title: name })}
      renderItem={(p) => <><Avatar name={p.title} size={18} /><span>{p.title || '未命名'}</span></>} />
  );
}
export function CardPicker({ value, onChange, types, placeholder, disabled }) {
  const g = useS(cur);
  const items = useMemo(() => g.cards.filter((c) => c.type !== 'topic' && (!types || types.includes(c.type))), [g.cards, types]);
  return (
    <RefPicker items={items} value={value || []} onChange={onChange} disabled={disabled} placeholder={placeholder || '添加卡片'}
      renderItem={(c) => <><TypeIcon type={c.type} size={11} /><span>{c.title || (c.imageIds?.length ? '图片线索' : '未命名')}</span></>} />
  );
}
export function TagInput({ value = [], onChange, disabled }) {
  const [t, setT] = useState('');
  const add = () => { const v = t.trim().replace(/^[#＃]/, ''); if (v && !value.includes(v)) onChange([...value, v]); setT(''); };
  return (
    <div className="refs">
      {value.map((x) => (
        <span key={x} className="chip">#{x}{!disabled && <button type="button" className="chip-x" onClick={() => onChange(value.filter((y) => y !== x))} aria-label="移除"><Icon name="x" size={11} /></button>}</span>
      ))}
      {!disabled && (
        <input className="tag-in" value={t} placeholder={value.length ? '' : '添加标签'} onChange={(e) => setT(e.target.value)} onBlur={add}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); add(); }
            else if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1));
          }} />
      )}
    </div>
  );
}
export function Thumb({ id, onOpen, onRemove }) {
  const u = useImg(id);
  return (
    <div className="thumb">
      {u ? <img src={u} alt="" onClick={onOpen} draggable={false} /> : <div className="thumb-ph" />}
      {onRemove && <button type="button" className="thumb-x" onClick={onRemove} title="移除图片" aria-label="移除图片"><Icon name="x" size={12} /></button>}
    </div>
  );
}
export function ImagesField({ ids = [], onAdd, onRemove, ro }) {
  const fileRef = useRef(null), camRef = useRef(null);
  const pick = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onAdd(f); };
  return (
    <div className="imgs">
      {ids.map((id, i) => <Thumb key={id} id={id} onOpen={() => setS({ lightbox: { ids, i } })} onRemove={ro ? null : () => onRemove(id)} />)}
      {!ro && (
        <>
          <button type="button" className="thumb add" onClick={() => fileRef.current.click()}><Icon name="image" size={18} /><span>图片</span></button>
          <button type="button" className="thumb add" onClick={() => camRef.current.click()}><Icon name="camera" size={18} /><span>拍照</span></button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        </>
      )}
    </div>
  );
}
function LbImg({ id }) {
  const u = useImg(id);
  return u ? <img className="lb-img" src={u} alt="" onClick={(e) => e.stopPropagation()} /> : <div className="lb-img ph" />;
}
export function Lightbox() {
  const lb = useS((s) => s.lightbox);
  useEffect(() => {
    if (!lb) return;
    const k = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setS({ lightbox: null }); }
      if (e.key === 'ArrowRight') setS({ lightbox: { ...lb, i: (lb.i + 1) % lb.ids.length } });
      if (e.key === 'ArrowLeft') setS({ lightbox: { ...lb, i: (lb.i - 1 + lb.ids.length) % lb.ids.length } });
    };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  }, [lb]);
  if (!lb) return null;
  const n = lb.ids.length;
  return createPortal(
    <div className="lb" onClick={() => setS({ lightbox: null })}>
      <LbImg id={lb.ids[lb.i]} />
      <button type="button" className="lb-x" aria-label="关闭"><Icon name="x" size={20} /></button>
      {n > 1 && (
        <>
          <button type="button" className="lb-nav l" aria-label="上一张" onClick={(e) => { e.stopPropagation(); setS({ lightbox: { ...lb, i: (lb.i - 1 + n) % n } }); }}><Icon name="chevL" size={22} /></button>
          <button type="button" className="lb-nav r" aria-label="下一张" onClick={(e) => { e.stopPropagation(); setS({ lightbox: { ...lb, i: (lb.i + 1) % n } }); }}><Icon name="chevR" size={22} /></button>
          <div className="lb-n">{lb.i + 1} / {n}</div>
        </>
      )}
    </div>,
    document.body,
  );
}
export function Toasts() {
  const ts = useS((s) => s.toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {ts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.msg}</span>
          {t.action && <button type="button" onClick={() => { setS((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })); t.action.fn(); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
export function Empty({ icon, title, children }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={22} /></div>
      <div className="empty-t">{title}</div>
      {children && <div className="empty-d">{children}</div>}
    </div>
  );
}
