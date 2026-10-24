import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';
import { TYPES, TYPE_KEYS, MARKS, CRED, CONF, EDGE_STYLES, FRAME_COLORS, STATUS, cx, fmtTs, timeRange, bookTitle, kb } from './util.js';
import * as st from './store.js';
import { useS, setS, cur, card } from './store.js';
import { Btn, IconBtn, MenuButton, AutoText, Seg, Dots, TypeIcon, Toggle, Prop, RefPicker, PersonPicker, TagInput, ImagesField } from './ui.jsx';
import { cardPh, inboxCards } from './board.jsx';

export const byTime = (a, b) => (a.day || 0) - (b.day || 0) || (timeRange(a)?.[0] ?? 1e9) - (timeRange(b)?.[0] ?? 1e9) || a.createdAt - b.createdAt;
const blurOnEnter = (e) => { if ((e.key === 'Enter' || e.key === 'Escape') && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); e.currentTarget.blur(); } };

export function Sheet({ onClose, children, className }) {
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheet-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('sheet', className)} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grip"
          onPointerDown={(e) => { drag.current = { y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)); }}
          onPointerUp={(e) => { const d = drag.current; drag.current = null; setDy(0); if (d && e.clientY - d.y > 70) onClose(); }}
          onPointerCancel={() => { drag.current = null; setDy(0); }}><span /></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RowBtn({ c, sub, onClick }) {
  return (
    <button type="button" className="rowbtn" onClick={onClick || (() => st.openCard(c.id))}>
      <TypeIcon type={c.type} size={11} />
      <span className="rowbtn-t">{c.title || cardPh(c)}</span>
      {sub && <span className="rowbtn-s">{sub}</span>}
    </button>
  );
}
const evTime = (e) => (e.time ? e.time + (e.timeEnd ? '–' + e.timeEnd : '') : '');

function Connections({ c, g }) {
  const rel = g.edges.filter((e) => e.from === c.id || e.to === c.id);
  const parent = c.parentId ? card(c.parentId, g) : null;
  const kids = g.cards.filter((x) => x.parentId === c.id);
  if (!rel.length && !parent && !kids.length) return null;
  return (
    <div className="insp-sec">
      <div className="insp-sh">关联</div>
      {parent && <RowBtn c={parent} sub="上级" />}
      {kids.slice(0, 8).map((k) => <RowBtn key={k.id} c={k} sub="下级" />)}
      {kids.length > 8 && <div className="muted small">还有 {kids.length - 8} 张下级卡片</div>}
      {rel.map((e) => {
        const o = card(e.from === c.id ? e.to : e.from, g);
        if (!o) return null;
        const dir = e.arrow === 'both' ? '↔' : e.arrow === 'none' ? '—' : e.from === c.id ? '→' : '←';
        return (
          <button key={e.id} type="button" className={cx('rowbtn conn', 'cn-' + e.style)} onClick={() => st.select({ edge: e.id })}>
            <span className="conn-dir">{dir}</span>
            <TypeIcon type={o.type} size={11} />
            <span className="rowbtn-t">{o.title || cardPh(o)}</span>
            <span className="rowbtn-s">{e.label || EDGE_STYLES[e.style]?.label}</span>
          </button>
        );
      })}
    </div>
  );
}
function PersonRelated({ c, g }) {
  const evs = g.cards.filter((x) => x.type === 'event' && x.personIds?.includes(c.id)).sort(byTime);
  const others = g.cards.filter((x) => x.type !== 'event' && x.id !== c.id && (x.personIds?.includes(c.id) || x.askIds?.includes(c.id)));
  if (!evs.length && !others.length) return null;
  return (
    <div className="insp-sec">
      {evs.length > 0 && <div className="insp-sh">行动轨迹</div>}
      {evs.map((e) => <RowBtn key={e.id} c={e} sub={[g.dayLabels.length > 1 ? g.dayLabels[e.day] : '', evTime(e)].filter(Boolean).join(' ')} />)}
      {others.length > 0 && <div className="insp-sh">相关卡片</div>}
      {others.map((x) => <RowBtn key={x.id} c={x} sub={x.askIds?.includes(c.id) ? '要问 TA' : TYPES[x.type]?.label} />)}
    </div>
  );
}

function TypeSwitch({ c, ro }) {
  const t = TYPES[c.type] || TYPES.note;
  const fixed = ro || (c.type === 'topic' && !c.parentId);
  const pill = <span className="tpill" style={{ '--tc': t.color }}><Icon name={t.icon} size={13} /><span>{t.label}</span>{!fixed && <Icon name="chevD" size={12} />}</span>;
  if (fixed) return pill;
  return (
    <MenuButton className="tpill-btn" title="更改类型" items={() => [{ header: '更改类型' }, ...[...TYPE_KEYS, 'topic'].map((k, i) => ({ label: TYPES[k].label, dot: TYPES[k].color, kbd: i < 7 ? String(i + 1) : undefined, active: c.type === k, fn: () => st.setTypeOf([c.id], k) }))]}>
      {pill}
    </MenuButton>
  );
}

function CardInspector({ c, g, ro, onClose }) {
  const up = (p, key) => st.updCard(c.id, p, key);
  const isRoot = c.type === 'topic' && !c.parentId;
  const places = useMemo(() => g.cards.filter((x) => x.type === 'place'), [g.cards]);
  const setMe = (v) => st.commit((g) => ({ ...g, cards: g.cards.map((x) => (x.id === c.id ? { ...x, isMe: v, updatedAt: Date.now() } : v && x.isMe ? { ...x, isMe: false } : x)) }));
  const txt = (k, ph) => <input className="in" value={c[k] || ''} placeholder={ph} onChange={(e) => up({ [k]: e.target.value }, k)} onKeyDown={blurOnEnter} />;
  return (
    <div className="insp">
      <div className="insp-head">
        <TypeSwitch c={c} ro={ro} />
        {!c.onBoard && <span className="chip subtle">待整理</span>}
        <div className="sp" />
        {c.onBoard ? <IconBtn icon="target" title="在导图中定位" onClick={() => st.jumpTo(c.id)} /> : !ro && <Btn size="sm" icon="map" onClick={() => st.placeOnBoard([c.id])}>上图</Btn>}
        {!ro && (
          <MenuButton className="ibtn" title="更多" align="right" items={() => [
            { label: '创建副本', icon: 'copy', fn: () => st.duplicateCard(c.id) },
            c.onBoard && !isRoot && { label: '移回待整理', icon: 'inbox', fn: () => st.unplace(c.id) },
            c.parentId && { label: '脱离父级', icon: 'arrowR', fn: () => st.detach(c.id) },
            '-',
            { label: '删除卡片', icon: 'trash', danger: true, fn: () => st.deleteCard(c.id) },
          ]}><Icon name="more" size={16} /></MenuButton>
        )}
        <IconBtn icon="x" title="关闭" onClick={onClose} />
      </div>
      <fieldset className="insp-body" disabled={ro}>
        <AutoText className="insp-title" value={c.title} placeholder={cardPh(c)} onChange={(v) => up({ title: v }, 'title')} />
        {c.type !== 'topic' && <AutoText className="insp-desc" value={c.body} minRows={2} placeholder="补充细节、原话、出处…" onChange={(v) => up({ body: v }, 'body')} />}
        {c.type !== 'topic' && (c.imageIds.length > 0 || !ro) && (
          <ImagesField ids={c.imageIds} ro={ro} onAdd={(f) => st.addImageCards(f, { attachTo: c.id })} onRemove={(id) => up((x) => ({ imageIds: x.imageIds.filter((i) => i !== id) }))} />
        )}
        <div className="props">
          {c.type === 'person' && (
            <>
              <Prop label="身份" icon="user">{txt('identity', '如：管家、私人医生')}</Prop>
              <Prop label="与我关系" icon="users">{txt('relation', '如：雇主、旧识')}</Prop>
              <Prop label="扮演玩家" icon="user">{txt('player', '谁玩这个角色')}</Prop>
              <Prop label="这是我" icon="star"><Toggle value={c.isMe} onChange={setMe} disabled={ro} /></Prop>
              <Prop label="嫌疑度" icon="alert"><Dots value={c.suspicion} ro={ro} onChange={(v) => up({ suspicion: v })} /></Prop>
              <Prop label="不在场证明" icon="clock" top><AutoText value={c.alibi} placeholder="案发时在哪、谁能作证" onChange={(v) => up({ alibi: v }, 'alibi')} /></Prop>
              <Prop label="动机" icon="flag" top><AutoText value={c.motive} placeholder="可能的动机" onChange={(v) => up({ motive: v }, 'motive')} /></Prop>
            </>
          )}
          {c.type === 'clue' && (
            <>
              <Prop label="来源" icon="search">{txt('source', '如：书房抽屉、第二轮搜证')}</Prop>
              <Prop label="可信度" icon="checkSq"><Seg size="sm" disabled={ro} value={c.credibility || ''} options={Object.entries(CRED).map(([v, l]) => ({ value: v, label: l, color: v === 'fake' ? '#e5484d' : v === 'mid' ? '#d97706' : v === 'high' ? '#0f9f6e' : undefined }))} onChange={(v) => up({ credibility: v })} /></Prop>
            </>
          )}
          {c.type === 'event' && (
            <>
              {g.dayLabels.length > 1 && (
                <Prop label="日期" icon="calendar">
                  <select className="in" value={c.day || 0} onChange={(e) => up({ day: +e.target.value })}>{g.dayLabels.map((l, i) => <option key={i} value={i}>{l}</option>)}</select>
                </Prop>
              )}
              <Prop label="时间" icon="clock">
                <div className="trow">
                  <input type="time" className="in" value={c.time || ''} onChange={(e) => up({ time: e.target.value }, 'time')} aria-label="开始时间" />
                  <span>至</span>
                  <input type="time" className="in" value={c.timeEnd || ''} onChange={(e) => up({ timeEnd: e.target.value }, 'timeEnd')} aria-label="结束时间" />
                </div>
              </Prop>
              <Prop label="地点" icon="pin">
                <RefPicker single items={places} disabled={ro} value={c.placeId ? [c.placeId] : []} placeholder="选择地点" onChange={(v) => up({ placeId: v[0] || null })} onCreate={(name) => st.newInboxCard('place', { title: name })} />
              </Prop>
            </>
          )}
          {c.type === 'question' && (
            <>
              <Prop label="状态" icon="checkSq"><Toggle value={c.done} label={c.done ? '已解决' : '待解决'} disabled={ro} onChange={(v) => up({ done: v })} /></Prop>
              <Prop label="去问谁" icon="users"><PersonPicker value={c.askIds} disabled={ro} onChange={(v) => up({ askIds: v })} /></Prop>
              <Prop label="答案" icon="bulb" top><AutoText value={c.answer} placeholder="问到的答案 / 结论" onChange={(v) => up({ answer: v }, 'answer')} /></Prop>
            </>
          )}
          {c.type === 'deduction' && (
            <Prop label="把握" icon="bulb"><Seg size="sm" disabled={ro} value={c.confidence || 0} options={CONF.map((l, i) => ({ value: i, label: l }))} onChange={(v) => up({ confidence: v })} /></Prop>
          )}
          {c.type !== 'person' && c.type !== 'topic' && (
            <Prop label={c.type === 'event' ? '在场人物' : '相关人物'} icon="users"><PersonPicker value={c.personIds} disabled={ro} onChange={(v) => up({ personIds: v })} /></Prop>
          )}
          {g.rounds > 1 && c.type !== 'topic' && (
            <Prop label="轮次" icon="flag">
              <Seg size="sm" disabled={ro} value={c.round || 0} options={[{ value: 0, label: '—' }, ...Array.from({ length: g.rounds }, (_, i) => ({ value: i + 1, label: 'R' + (i + 1) }))]} onChange={(v) => up({ round: v })} />
            </Prop>
          )}
          <Prop label="标签" icon="note"><TagInput value={c.tags} disabled={ro} onChange={(v) => up({ tags: v })} /></Prop>
          {c.type !== 'topic' && (
            <Prop label="复盘标记" icon="star">
              <Seg size="sm" disabled={ro} value={c.mark || ''} options={[{ value: '', label: '无' }, ...Object.entries(MARKS).map(([k, m]) => ({ value: k, label: m.label, color: m.color }))]} onChange={(v) => up({ mark: v || null })} />
            </Prop>
          )}
        </div>
        {c.type === 'person' && <PersonRelated c={c} g={g} />}
        <Connections c={c} g={g} />
        <div className="insp-meta">创建 {fmtTs(c.createdAt)}{c.updatedAt - c.createdAt > 60000 ? ` · 更新 ${fmtTs(c.updatedAt)}` : ''}</div>
      </fieldset>
    </div>
  );
}

function EdgeInspector({ e, g, ro, desk, onClose }) {
  const a = card(e.from, g), b = card(e.to, g);
  const up = (p, key) => st.commit((g) => st.ops.updEdge(g, e.id, p), { key: key ? 'e:' + e.id + ':' + key : null });
  if (!a || !b) return null;
  return (
    <div className="insp">
      <div className="insp-head">
        <span className="insp-h"><Icon name="link" size={14} />连线</span>
        <div className="sp" />
        {!ro && <IconBtn icon="trash" title="删除连线" onClick={() => { st.commit((g) => st.ops.delEdge(g, e.id)); st.select({}); }} />}
        <IconBtn icon="x" title="关闭" onClick={onClose} />
      </div>
      <fieldset className="insp-body" disabled={ro}>
        <div className="ends">
          <button type="button" className="endc" onClick={() => st.openCard(a.id)}><TypeIcon type={a.type} size={11} /><span>{a.title || cardPh(a)}</span></button>
          <IconBtn icon="swap" title="交换方向" onClick={() => up({ from: e.to, to: e.from })} />
          <button type="button" className="endc" onClick={() => st.openCard(b.id)}><TypeIcon type={b.type} size={11} /><span>{b.title || cardPh(b)}</span></button>
        </div>
        <input className="in insp-label" autoFocus={desk && !e.label && !ro} value={e.label || ''} placeholder="连线说明，如：案发前见过面" onChange={(ev) => up({ label: ev.target.value }, 'label')} onKeyDown={blurOnEnter} />
        <div className="props">
          <Prop label="关系" icon="link">
            <Seg size="sm" disabled={ro} value={e.style} options={Object.entries(EDGE_STYLES).map(([k, s]) => ({ value: k, label: s.label, color: k === 'conflict' ? '#e5484d' : undefined }))} onChange={(v) => up({ style: v })} />
          </Prop>
          <Prop label="箭头" icon="arrowR">
            <Seg size="sm" disabled={ro} value={e.arrow} options={[{ value: 'none', label: '无' }, { value: 'end', label: '单向' }, { value: 'both', label: '双向' }]} onChange={(v) => up({ arrow: v })} />
          </Prop>
        </div>
        <div className="hint">实线＝已确认的关系；虚线＝怀疑、待验证；红线＝矛盾（例如两人的证词对不上）。</div>
      </fieldset>
    </div>
  );
}

function FrameInspector({ f, ro, desk, onClose }) {
  const up = (p, key) => st.commit((g) => st.ops.updFrame(g, f.id, p), { key: key ? 'f:' + f.id + ':' + key : null });
  return (
    <div className="insp">
      <div className="insp-head">
        <span className="insp-h"><Icon name="frame" size={14} />分区</span>
        <div className="sp" />
        {!ro && <IconBtn icon="trash" title="删除分区（保留卡片）" onClick={() => { st.commit((g) => st.ops.delFrame(g, f.id)); st.select({}); }} />}
        <IconBtn icon="x" title="关闭" onClick={onClose} />
      </div>
      <fieldset className="insp-body" disabled={ro}>
        <input className="in insp-label" autoFocus={desk && !ro} value={f.title || ''} placeholder="分区名称" onChange={(e) => up({ title: e.target.value }, 'title')} onKeyDown={blurOnEnter} />
        <div className="props">
          <Prop label="颜色" icon="sliders">
            <div className="swatches">{FRAME_COLORS.map((c) => <button key={c} type="button" className={cx('sw', f.color === c && 'on')} style={{ background: c }} onClick={() => up({ color: c })} aria-label="分区颜色" />)}</div>
          </Prop>
        </div>
        <div className="hint">拖动分区标题，可以连同框内的卡片一起移动；拖右下角调整大小。</div>
      </fieldset>
    </div>
  );
}

function MultiInspector({ ids, g, ro }) {
  const cs = ids.map((id) => card(id, g)).filter(Boolean);
  return (
    <div className="insp">
      <div className="insp-head">
        <span className="insp-h">已选 {cs.length} 张卡片</span>
        <div className="sp" />
        <IconBtn icon="x" title="取消选择" onClick={() => st.select({})} />
      </div>
      <fieldset className="insp-body" disabled={ro}>
        <div className="insp-sh">批量改类型</div>
        <div className="type-grid">
          {TYPE_KEYS.map((t, i) => <button key={t} type="button" className="tbtn" onClick={() => st.setTypeOf(ids, t)}><TypeIcon type={t} size={11} /><span>{TYPES[t].label}</span><kbd>{i + 1}</kbd></button>)}
        </div>
        <div className="insp-sh">复盘标记</div>
        <div className="type-grid">
          {Object.entries(MARKS).map(([k, m]) => <button key={k} type="button" className="tbtn" onClick={() => st.commit((g) => st.ops.updMany(g, ids, { mark: k }))}><span className="mdot" style={{ background: m.color }} /><span>{m.label}</span></button>)}
          <button type="button" className="tbtn" onClick={() => st.commit((g) => st.ops.updMany(g, ids, { mark: null }))}><span>清除</span></button>
        </div>
        <div className="btnrow">
          <Btn icon="frame" onClick={() => st.addFrame(ids)}>用分区框住</Btn>
          <Btn icon="trash" kind="danger" onClick={() => st.deleteSel()}>删除</Btn>
        </div>
        <div className="insp-sec">{cs.map((c) => <RowBtn key={c.id} c={c} />)}</div>
      </fieldset>
    </div>
  );
}

function Legend() {
  const L = ({ cls, label, desc }) => (
    <div className="lg-row">
      <svg width="44" height="10" aria-hidden="true"><line x1="2" y1="5" x2="42" y2="5" className={cls} /></svg>
      <b>{label}</b><span className="muted">{desc}</span>
    </div>
  );
  return (
    <>
      <L cls="lg-tree" label="分支" desc="导图的上下级" />
      <L cls="lg-solid" label="确认" desc="已证实的关系" />
      <L cls="lg-dashed" label="怀疑" desc="待验证" />
      <L cls="lg-conflict" label="矛盾" desc="证词 / 时间对不上" />
    </>
  );
}
export const SHORTS = [
  ['Tab', '添加子卡片'], ['Enter', '添加同级卡片'], ['Space / F2', '编辑标题'], ['1 – 7', '改为 人物/线索/地点/事件/疑点/推理/笔记'],
  ['L', '从所选卡片拉连线'], ['G', '用分区框住所选'], ['/', '折叠 / 展开分支'], ['方向键', '在卡片间移动'], ['Delete', '删除所选'],
  ['⌘D', '创建副本'], ['⌘A', '全选'], ['⌘Z / ⇧⌘Z', '撤销 / 重做'], ['⌘0', '适应画布'], ['⌘+ / ⌘−', '放大 / 缩小'],
  ['⌘K', '搜索与命令'], ['N', '速记'], ['I', '查看详情'], ['?', '快捷键一览'], ['Shift + 拖动', '框选'], ['双击空白', '新建卡片'],
].map(([k, d]) => [kb(k), d]);
function Overview({ g, ro }) {
  const counts = useMemo(() => { const m = {}; for (const c of g.cards) m[c.type] = (m[c.type] || 0) + 1; return m; }, [g.cards]);
  const openQ = g.cards.filter((c) => c.type === 'question' && !c.done).length;
  const inbox = useMemo(() => inboxCards(g).length, [g.cards]);
  const autoTidy = useS((s) => s.settings.autoTidy);
  return (
    <div className="insp">
      <div className="insp-head">
        <span className="insp-h">本局概览</span>
        <div className="sp" />
        <IconBtn icon="x" title="收起面板" onClick={() => setS({ deskPanel: false })} />
      </div>
      <div className="insp-body">
        <div className="ov-game">
          <div className="ov-badge" style={{ background: g.cover }}><Icon name="book" size={16} /></div>
          <div className="ov-gt">
            <div className="ov-title">{bookTitle(g.title)}</div>
            <div className="ov-meta">{[g.caseNo, STATUS[g.status], g.date, g.myRole && '我：' + g.myRole].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        {!ro && <Btn size="sm" icon="pen" className="ov-edit" onClick={() => st.openModal('gameInfo', { id: g.id })}>编辑本局信息</Btn>}
        <div className="insp-sh">卡片统计</div>
        <div className="ov-grid">
          {TYPE_KEYS.map((t, i) => (
            <div key={t} className="ov-stat"><TypeIcon type={t} size={11} /><span>{TYPES[t].label}</span><b>{counts[t] || 0}</b><kbd>{i + 1}</kbd></div>
          ))}
        </div>
        <div className="ov-line">连线 {g.edges.length} · 待整理 {inbox} · 未解决疑点 {openQ}</div>
        <div className="insp-sh">连线图例</div>
        <Legend />
        <div className="insp-sh">常用快捷键</div>
        <div className="kb-list">
          {SHORTS.slice(0, 7).map(([k, d]) => <div key={k} className="kb-row"><kbd>{k}</kbd><span>{d}</span></div>)}
          <button type="button" className="linkbtn" onClick={() => st.openModal('shortcuts')}>查看全部快捷键（?）</button>
        </div>
        {!ro && (
          <>
            <div className="insp-sh">布局</div>
            <div className="ov-set">
              <Toggle value={autoTidy} onChange={(v) => st.setSetting('autoTidy', v)} label="自动整理" />
              <div className="muted small">开启后，新建、拖动卡片会自动排成整齐的树；关闭后可完全自由摆放。</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const layout = useS((s) => s.layout), open = useS((s) => s.inspector), deskPanel = useS((s) => s.deskPanel), view = useS((s) => s.view);
  const sel = useS((s) => s.sel), ro = useS((s) => s.readOnly);
  const g = useS(cur);
  if (!g || view === 'library') return null;
  const desk = layout === 'desk', board = view === 'board';
  const close = () => { if (desk && board) st.select({}); else setS({ inspector: false }); };
  let body = null;
  if (sel.cards.length === 1) {
    const c = card(sel.cards[0], g);
    if (c) body = <CardInspector key={c.id} c={c} g={g} ro={ro} onClose={close} />;
  } else if (sel.cards.length > 1) body = <MultiInspector ids={sel.cards} g={g} ro={ro} />;
  else if (sel.edge) {
    const e = g.edges.find((x) => x.id === sel.edge);
    if (e) body = <EdgeInspector key={e.id} e={e} g={g} ro={ro} desk={desk} onClose={close} />;
  } else if (sel.frame) {
    const f = g.frames.find((x) => x.id === sel.frame);
    if (f) body = <FrameInspector key={f.id} f={f} ro={ro} desk={desk} onClose={close} />;
  }
  if (desk) {
    if (!deskPanel) return null;
    if (!board && !(open && body)) return null;
    return <aside className="inspector dock">{body || <Overview g={g} ro={ro} />}</aside>;
  }
  if (!open || !body) return null;
  if (layout === 'tab') {
    return (
      <>
        <div className="insp-bg" onPointerDown={() => setS({ inspector: false })} />
        <aside className="inspector over">{body}</aside>
      </>
    );
  }
  return <Sheet className="insp-sheet" onClose={() => setS({ inspector: false })}>{body}</Sheet>;
}
