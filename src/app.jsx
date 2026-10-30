import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { TYPES, TYPE_KEYS, STATUS, cx, bookTitle, isTyping, fmtTs, kb } from './util.js';
import * as st from './store.js';
import { useS, getS, setS, cur } from './store.js';
import { Btn, IconBtn, MenuButton, CtxMenu, Toasts, Lightbox, Toggle, TypeIcon } from './ui.jsx';
import { Board, inboxCards, pickFiles, cardPh } from './board.jsx';
import { Inspector } from './inspector.jsx';
import { Library, PeopleView, TimelineView, CluesView, QuestionsView, NotesView, VerdictView, MoreView, findConflicts } from './views.jsx';
import { Modals, importFile } from './modals.jsx';
import { makeDemo } from './demo.js';
import { backupBlob, download, stampName } from './exporter.js';

export const NAV = [
  { v: 'board', label: '导图', icon: 'map' },
  { v: 'clues', label: '线索', icon: 'search' },
  { v: 'people', label: '人物', icon: 'users' },
  { v: 'timeline', label: '时间线', icon: 'clock' },
  { v: 'questions', label: '疑点', icon: 'help' },
  { v: 'notes', label: '笔记', icon: 'note' },
  { v: 'verdict', label: '复盘', icon: 'flag' },
];
const VIEW_LABEL = { board: '导图', clues: '线索', people: '人物', timeline: '时间线', questions: '疑点 & 待问', notes: '笔记', verdict: '结案 & 复盘', more: '更多' };
const PHONE_TABS = [NAV[0], NAV[1], NAV[2], NAV[3], { v: 'more', label: '更多', icon: 'more' }];
const MORE_VIEWS = ['more', 'questions', 'notes', 'verdict'];

export const detectLayout = () => {
  const w = window.innerWidth;
  let touch = false;
  try { touch = matchMedia('(pointer: coarse)').matches; } catch {}
  return { layout: w >= 1100 ? 'desk' : w >= 700 ? 'tab' : 'phone', touch };
};
const toggleTheme = () => st.setTheme(getS().theme === 'dark' ? 'light' : 'dark');
export function openDemo() {
  const ex = Object.values(getS().games).find((x) => x.demo);
  if (ex) return st.openGame(ex.id);
  const d = makeDemo();
  st.addGame(d);
  st.openGame(d.id);
}
const openInbox = () => { st.setView('board'); setS({ inbox: true }); };
function useCounts(g) {
  return useMemo(() => ({
    openQ: g.cards.filter((c) => c.type === 'question' && !c.done).length,
    inbox: inboxCards(g).length,
    conflicts: findConflicts(g).list.length,
  }), [g.cards]);
}
function gameMenu(g) {
  const S = getS();
  const others = Object.values(S.games).filter((x) => x.id !== g.id).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  return [
    { header: '当前剧本' },
    !S.readOnly && { label: '编辑本局信息', icon: 'pen', fn: () => st.openModal('gameInfo', { id: g.id }) },
    { label: '导出…', icon: 'download', fn: () => st.openModal('export', { id: g.id }) },
    others.length > 0 && '-',
    others.length > 0 && { header: '切换到' },
    ...others.map((x) => ({ label: bookTitle(x.title), dot: x.cover, fn: () => st.openGame(x.id) })),
    '-',
    { label: '返回本库', icon: 'home', fn: st.goLibrary },
    !S.readOnly && { label: '新建剧本', icon: 'plus', fn: () => st.openModal('newGame') },
  ];
}

/* ---------- 轮次 ---------- */
const setRound = (fn) => st.commit((g) => ({ ...g, ...fn(g) }), { history: false });
function roundItems(g) {
  return [
    { header: '新卡片记入' },
    ...Array.from({ length: g.rounds || 1 }, (_, i) => ({ label: `第 ${i + 1} 轮`, active: g.currentRound === i + 1, fn: () => setRound(() => ({ currentRound: i + 1 })) })),
    { label: '不区分轮次', active: !g.currentRound, fn: () => setRound(() => ({ currentRound: 0 })) },
    '-',
    { label: '增加一轮', icon: 'plus', fn: () => setRound((g) => ({ rounds: (g.rounds || 1) + 1, currentRound: (g.rounds || 1) + 1 })) },
  ];
}
function RoundPicker({ g, compact }) {
  const ro = useS((s) => s.readOnly);
  if (ro) return null;
  const r = g.currentRound;
  if (compact) return <MenuButton className="rchip" title="当前轮次" align="right" items={() => roundItems(g)}>{r ? 'R' + r : 'R–'}</MenuButton>;
  return (
    <MenuButton className="side-round" title="当前轮次" items={() => roundItems(g)}>
      <Icon name="flag" size={15} /><span>当前轮次</span><b>{r ? `第 ${r} 轮` : '不区分'}</b><Icon name="chevD" size={13} />
    </MenuButton>
  );
}

/* ---------- 桌面侧栏 ---------- */
function Sidebar({ g }) {
  const view = useS((s) => s.view), ro = useS((s) => s.readOnly), theme = useS((s) => s.theme);
  const n = useCounts(g);
  const badge = (v) => (v === 'questions' && n.openQ ? <em>{n.openQ}</em> : v === 'timeline' && n.conflicts ? <em className="bad">{n.conflicts}</em> : null);
  return (
    <nav className="side">
      <MenuButton className="gsw" title="剧本菜单" items={() => gameMenu(g)}>
        <span className="gsw-badge" style={{ background: g.cover }}><Icon name="book" size={14} /></span>
        <span className="gsw-t"><b>{bookTitle(g.title)}</b><span>{[g.caseNo, STATUS[g.status]].filter(Boolean).join(' · ')}</span></span>
        <Icon name="chevD" size={14} className="muted" />
      </MenuButton>
      <button type="button" className="side-btn" onClick={() => setS({ palette: true })}><Icon name="search" size={15} /><span>搜索与命令</span><kbd>{kb('⌘K')}</kbd></button>
      {!ro && <button type="button" className="side-btn side-ai" onClick={() => st.openModal('ai')}><Icon name="sparkle" size={15} /><span>AI 读卡</span><em className="ai-pill">AI</em></button>}
      {!ro && <button type="button" className="side-btn" onClick={() => setS({ quick: true })}><Icon name="zap" size={15} /><span>速记</span><kbd>N</kbd></button>}
      <div className="side-sec">
        {NAV.map((x) => (
          <button key={x.v} type="button" className={cx('nav', view === x.v && 'on')} onClick={() => st.setView(x.v)}>
            <Icon name={x.icon} size={16} /><span>{x.label}</span>{badge(x.v)}
          </button>
        ))}
      </div>
      <RoundPicker g={g} />
      <div className="sp" />
      <div className="side-sec">
        {!ro && <button type="button" className="nav" onClick={openInbox}><Icon name="inbox" size={16} /><span>待整理</span>{n.inbox > 0 && <em>{n.inbox}</em>}</button>}
        <button type="button" className="nav" onClick={() => st.openModal('export', { id: g.id })}><Icon name="download" size={16} /><span>导出</span></button>
        {!ro && <button type="button" className="nav" onClick={() => st.openModal('data')}><Icon name="database" size={16} /><span>数据与备份</span></button>}
        <button type="button" className="nav" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /><span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span></button>
        <button type="button" className="nav" onClick={() => st.openModal('shortcuts')}><Icon name="keyboard" size={16} /><span>快捷键</span><kbd>?</kbd></button>
      </div>
      <button type="button" className="side-home" onClick={st.goLibrary}><Icon name="chevL" size={14} /><span>返回本库</span></button>
    </nav>
  );
}

/* ---------- 平板侧轨 ---------- */
function moreMenu(g) {
  const S = getS();
  return [
    !S.readOnly && { label: 'AI 读卡构图', icon: 'sparkle', fn: () => st.openModal('ai') },
    !S.readOnly && { label: 'AI 识图设置', icon: 'key', fn: () => st.openModal('aiSettings') },
    '-',
    !S.readOnly && { label: '待整理', icon: 'inbox', fn: openInbox },
    { label: '导出…', icon: 'download', fn: () => st.openModal('export', { id: g.id }) },
    !S.readOnly && { label: '编辑本局信息', icon: 'pen', fn: () => st.openModal('gameInfo', { id: g.id }) },
    !S.readOnly && { label: '数据与备份', icon: 'database', fn: () => st.openModal('data') },
    { label: S.theme === 'dark' ? '浅色模式' : '深色模式', icon: S.theme === 'dark' ? 'sun' : 'moon', fn: toggleTheme },
    { label: '搜索与命令', icon: 'search', fn: () => setS({ palette: true }) },
    { label: '快捷键与手势', icon: 'keyboard', fn: () => st.openModal('shortcuts') },
    '-',
    { label: '返回本库', icon: 'home', fn: st.goLibrary },
  ];
}
function Rail({ g }) {
  const view = useS((s) => s.view), ro = useS((s) => s.readOnly);
  const n = useCounts(g);
  return (
    <nav className="rail">
      <button type="button" className="rail-home" title="返回本库" onClick={st.goLibrary}><span className="gsw-badge" style={{ background: g.cover }}><Icon name="book" size={15} /></span></button>
      {!ro && <button type="button" className="rail-quick" title="速记 (N)" aria-label="速记" onClick={() => setS({ quick: true })}><Icon name="plus" size={20} sw={2.4} /></button>}
      {!ro && <button type="button" className="rail-i rail-ai" title="AI 读卡构图" onClick={() => st.openModal('ai')}><Icon name="sparkle" size={19} /><span>AI</span></button>}
      {NAV.map((x) => (
        <button key={x.v} type="button" className={cx('rail-i', view === x.v && 'on')} onClick={() => st.setView(x.v)}>
          <Icon name={x.icon} size={19} /><span>{x.label}</span>
          {x.v === 'questions' && n.openQ > 0 && <em>{n.openQ}</em>}
          {x.v === 'timeline' && n.conflicts > 0 && <em className="bad">{n.conflicts}</em>}
        </button>
      ))}
      <div className="sp" />
      <MenuButton className="rail-i" title="更多" items={() => moreMenu(g)}><Icon name="more" size={19} /><span>更多</span>{n.inbox > 0 && !ro && <em>{n.inbox}</em>}</MenuButton>
    </nav>
  );
}

/* ---------- 顶栏 / 底栏 ---------- */
function TopBar({ g }) {
  const layout = useS((s) => s.layout), view = useS((s) => s.view), hist = useS((s) => s.hist), ro = useS((s) => s.readOnly), deskPanel = useS((s) => s.deskPanel);
  const phone = layout === 'phone';
  return (
    <header className="topbar">
      {phone && <IconBtn icon="chevL" title="返回本库" onClick={st.goLibrary} />}
      <div className="tb-t">
        {phone ? (
          <><b>{bookTitle(g.title)}</b><span className="tb-sub">{VIEW_LABEL[view]}</span></>
        ) : (
          <><span className="tb-crumb">{bookTitle(g.title)}</span><Icon name="chevR" size={12} className="muted" /><b>{VIEW_LABEL[view]}</b></>
        )}
      </div>
      <div className="sp" />
      {layout !== 'desk' && <RoundPicker g={g} compact />}
      {!ro && <IconBtn icon="undo" title={kb('撤销 (⌘Z)')} disabled={!hist.u} onClick={st.undo} />}
      {!ro && <IconBtn icon="redo" title={kb('重做 (⇧⌘Z)')} disabled={!hist.r} onClick={st.redo} />}
      {!phone && <Btn size="sm" icon="download" onClick={() => st.openModal('export', { id: g.id })}>导出</Btn>}
      {layout === 'desk' && <IconBtn icon="sliders" title={deskPanel ? '收起右侧面板' : '展开右侧面板'} active={deskPanel} onClick={() => setS({ deskPanel: !deskPanel })} />}
      {phone && <MenuButton className="ibtn" title="更多" align="right" items={() => moreMenu(g)}><Icon name="more" size={16} /></MenuButton>}
    </header>
  );
}
function TabBar({ g }) {
  const view = useS((s) => s.view);
  const n = useCounts(g);
  return (
    <nav className="tabbar">
      {PHONE_TABS.map((x) => {
        const on = x.v === 'more' ? MORE_VIEWS.includes(view) : view === x.v;
        const b = x.v === 'more' ? n.openQ : x.v === 'timeline' ? n.conflicts : 0;
        return (
          <button key={x.v} type="button" className={cx('tab', on && 'on')} onClick={() => st.setView(x.v)}>
            <Icon name={x.icon} size={21} /><span>{x.label}</span>{b > 0 && <em className={x.v === 'timeline' ? 'bad' : ''}>{b}</em>}
          </button>
        );
      })}
    </nav>
  );
}
function Fab() {
  const view = useS((s) => s.view), ro = useS((s) => s.readOnly), sel = useS((s) => s.sel), inbox = useS((s) => s.inbox), editing = useS((s) => s.editing), quick = useS((s) => s.quick), insp = useS((s) => s.inspector);
  if (ro || quick || editing || insp || view === 'notes' || view === 'verdict') return null;
  if (view === 'board' && (sel.cards.length || sel.edge || sel.frame || inbox)) return null;
  return <button type="button" className="fab" aria-label="速记" title="速记" onClick={() => setS({ quick: true })}><Icon name="plus" size={24} sw={2.4} /></button>;
}
function ArchiveBanner() {
  const a = useS((s) => s.archive);
  if (!a) return null;
  return (
    <div className="arch">
      <Icon name="archive" size={14} />
      <span><b>只读存档</b>{a.exportedAt ? ` · 导出于 ${fmtTs(a.exportedAt)}` : ''}</span>
      <span className="arch-tip">想继续编辑？在剧本杀小助手的「数据与备份」中导入这个文件</span>
    </div>
  );
}

/* ---------- 速记 ---------- */
const QTYPES = ['clue', 'event', 'person', 'question', 'deduction', 'note', 'place'];
function QuickCapture() {
  const q = useS((s) => s.quick);
  const g = useS(cur);
  if (!q || !g) return null;
  return <QuickInner g={g} init={typeof q === 'object' ? q : {}} />;
}
function QuickInner({ g, init }) {
  const layout = useS((s) => s.layout), view = useS((s) => s.view), touch = useS((s) => s.touch);
  const [type, setType] = useState(init.type || 'clue');
  const [text, setText] = useState(init.text || '');
  const [onBoard, setOnBoard] = useState(() => getS().settings.quickOnBoard && view === 'board');
  const [n, setN] = useState(0);
  const ta = useRef(null);
  const persons = useMemo(() => g.cards.filter((c) => c.type === 'person'), [g.cards]);
  const p = useMemo(() => st.parseQuick(text, persons), [text, persons]);
  const close = () => setS({ quick: false });
  useLayoutEffect(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  }, []);
  const eff = p.time && type === 'clue' ? 'event' : type;
  const save = () => {
    if (!text.trim()) return;
    const r = st.quickAdd(text, type);
    if (!r) return;
    if (onBoard && view === 'board') {
      const s = getS().sel.cards;
      const pid = s.length === 1 && st.card(s[0])?.onBoard ? s[0] : null;
      st.placeOnBoard([r.card.id], null, pid);
    }
    setText('');
    setN((x) => x + 1);
    ta.current?.focus();
  };
  const known = new Set(persons.map((x) => x.title));
  return (
    <div className={cx('quick-bg', layout === 'phone' && 'ph')} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="quick" role="dialog" aria-label="速记">
        <div className="q-head">
          <Icon name="zap" size={15} /><b>速记</b>
          <span className="muted small">{n > 0 ? `已记录 ${n} 条，继续输入或按 Esc 关闭` : onBoard && view === 'board' ? '记录后直接放到导图' : '先存入「待整理」，有空再上图'}</span>
          <div className="sp" />
          <IconBtn icon="x" title="关闭" onClick={close} />
        </div>
        <div className="q-types">
          {QTYPES.map((t) => (
            <button key={t} type="button" className={cx('qt', type === t && 'on')} style={{ '--tc': TYPES[t].color }} onClick={() => { setType(t); ta.current?.focus(); }}>
              <Icon name={TYPES[t].icon} size={13} />{TYPES[t].label}
            </button>
          ))}
        </div>
        <textarea ref={ta} className="q-in" rows={layout === 'phone' ? 3 : 4} value={text} enterKeyHint="done"
          placeholder={type === 'event' || eff === 'event' ? '21:10 @沈小姐 在花园散步' : type === 'person' ? '人物名字，如：周管家' : type === 'question' ? '@许医生 为什么换了药瓶？' : '记点什么…  21:10 开头记为事件，@人物，#标签'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
          }} />
        <div className="q-parse">
          {text.trim() ? (
            <>
              <span className="chip" style={{ color: TYPES[eff].color }}><TypeIcon type={eff} size={10} />{TYPES[eff].label}{eff !== type && '（含时间）'}</span>
              {p.time && <span className="chip"><Icon name="clock" size={11} />{p.time}{p.timeEnd && '–' + p.timeEnd}</span>}
              {p.names.map((x) => <span key={x} className={cx('chip', !known.has(x) && 'subtle')}><Icon name="user" size={11} />{x}{!known.has(x) && ' · 新人物'}</span>)}
              {p.tags.map((x) => <span key={x} className="chip subtle">#{x}</span>)}
            </>
          ) : <span className="muted small">{touch ? '点「记录」保存，可连续记录多条' : '回车记录 · Shift+回车 换行 · 可连续记录多条'}</span>}
        </div>
        <div className="q-foot">
          <IconBtn icon="sparkle" title="AI 读卡构图" onClick={() => { setS({ quick: false }); st.openModal('ai'); }} />
          <IconBtn icon="camera" title="拍照" onClick={() => pickFiles((f) => st.addImageCards(f, view === 'board' && onBoard ? { onBoard: true } : {}), true)} />
          <IconBtn icon="image" title="添加图片" onClick={() => pickFiles((f) => st.addImageCards(f, view === 'board' && onBoard ? { onBoard: true } : {}))} />
          {view === 'board' && <Toggle value={onBoard} onChange={(v) => { setOnBoard(v); st.setSetting('quickOnBoard', v); }} label="直接上图" />}
          <div className="sp" />
          <Btn kind="primary" disabled={!text.trim()} onClick={save}>记录</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------- 搜索与命令 ---------- */
function Palette() {
  const open = useS((s) => s.palette);
  return open ? <PaletteInner /> : null;
}
function PaletteInner() {
  const g = useS(cur), games = useS((s) => s.games), view = useS((s) => s.view), ro = useS((s) => s.readOnly), theme = useS((s) => s.theme);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useRef(null);
  const inGame = g && view !== 'library';
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = (t) => !s || String(t || '').toLowerCase().includes(s);
    const cmds = [
      ...(inGame ? NAV.map((n) => ({ icon: n.icon, label: '前往：' + n.label, fn: () => st.setView(n.v) })) : []),
      inGame && !ro && { icon: 'zap', label: '速记', kbd: 'N', fn: () => setS({ quick: true }) },
      inGame && !ro && { icon: 'sparkle', label: 'AI 读卡构图', fn: () => st.openModal('ai') },
      { icon: 'key', label: 'AI 识图设置', fn: () => st.openModal('aiSettings') },
      ...(inGame && !ro ? TYPE_KEYS.map((t) => ({ type: t, label: '新建' + TYPES[t].label + '卡片', fn: () => { st.setView('board'); setTimeout(() => st.addFreeCard(t), 60); } })) : []),
      inGame && !ro && { icon: 'wand', label: '一键整理导图', fn: () => { st.setView('board'); setTimeout(() => st.tidyAll(), 60); } },
      inGame && !ro && { icon: 'inbox', label: '打开「待整理」', fn: openInbox },
      inGame && { icon: 'download', label: '导出图片 / 存档…', fn: () => st.openModal('export', { id: g.id }) },
      inGame && !ro && { icon: 'pen', label: '编辑本局信息', fn: () => st.openModal('gameInfo', { id: g.id }) },
      !ro && { icon: 'database', label: '数据与备份', fn: () => st.openModal('data') },
      { icon: theme === 'dark' ? 'sun' : 'moon', label: theme === 'dark' ? '切换到浅色模式' : '切换到深色模式', fn: toggleTheme },
      { icon: 'keyboard', label: '快捷键与手势', kbd: '?', fn: () => st.openModal('shortcuts') },
      inGame && { icon: 'home', label: '返回本库', fn: st.goLibrary },
      !ro && { icon: 'plus', label: '新建剧本', fn: () => st.openModal('newGame') },
    ].filter(Boolean).filter((c) => has(c.label));
    const cards = inGame && s ? g.cards.filter((c) => has(c.title) || has(c.body) || (c.tags || []).some(has) || has(c.identity) || has(c.answer)).slice(0, 40).map((c) => ({
      type: c.type, label: c.title || cardPh(c), sub: (c.body || '').slice(0, 60), fn: () => st.jumpTo(c.id),
    })) : [];
    const gl = (!inGame || s) ? Object.values(games).filter((x) => has(x.title) || has(x.caseNo) || has(x.genre)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((x) => ({ icon: 'book', label: bookTitle(x.title), sub: [x.caseNo, STATUS[x.status], x.date].filter(Boolean).join(' · '), fn: () => st.openGame(x.id) })) : [];
    return [['卡片', cards], ['剧本', gl], ['命令', cmds]].filter(([, l]) => l.length);
  }, [q, g, games, view, ro, theme]);
  const flat = groups.flatMap(([, l]) => l);
  const idx = Math.min(i, Math.max(0, flat.length - 1));
  const run = (it) => { setS({ palette: false }); it?.fn(); };
  useEffect(() => { list.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  let k = -1;
  return (
    <div className="pal-bg" onPointerDown={(e) => e.target === e.currentTarget && setS({ palette: false })}>
      <div className="pal" role="dialog" aria-label="搜索与命令">
        <div className="pal-top">
          <Icon name="search" size={16} />
          <input autoFocus className="pal-q" value={q} placeholder={inGame ? '搜索卡片、人物、命令…' : '搜索剧本或命令…'} onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((idx + 1) % Math.max(1, flat.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((idx - 1 + flat.length) % Math.max(1, flat.length)); }
              else if (e.key === 'Enter') { e.preventDefault(); run(flat[idx]); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setS({ palette: false }); }
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={list}>
          {groups.map(([h, l]) => (
            <div key={h}>
              <div className="pal-h">{h}</div>
              {l.map((it) => {
                k++;
                const my = k;
                return (
                  <button key={h + my} type="button" className={cx('pal-item', my === idx && 'on')} onMouseMove={() => my !== idx && setI(my)} onClick={() => run(it)}>
                    {it.type ? <TypeIcon type={it.type} size={11} /> : <span className="pal-ic"><Icon name={it.icon} size={15} /></span>}
                    <span className="pal-l">{it.label}</span>
                    {it.sub && <span className="pal-sub">{it.sub}</span>}
                    {it.kbd && <kbd>{kb(it.kbd)}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length && <div className="pal-empty">没有找到「{q}」</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- 错误兜底 ---------- */
async function rescue() {
  try {
    const blob = await backupBlob(Object.values(getS().games));
    download(blob, `剧本杀小助手-紧急备份-${stampName()}.json`);
  } catch (e) { alert('导出失败：' + (e?.message || e)); }
}
class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error(err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-in">
          <span className="crash-ic"><Icon name="alert" size={24} /></span>
          <h2>出了点问题</h2>
          <p className="muted">界面遇到了错误，但你的数据还保存在本机。建议先导出一份备份，再重新加载。</p>
          <pre>{String(this.state.err?.message || this.state.err)}</pre>
          <div className="btnrow">
            <Btn kind="primary" icon="download" onClick={rescue}>导出备份</Btn>
            <Btn icon="undo" onClick={() => location.reload()}>重新加载</Btn>
            <Btn onClick={() => { setS({ view: 'library', modal: null, sel: st.EMPTY_SEL, editing: null, inspector: false, quick: false, palette: false, ctx: null }); this.setState({ err: null }); }}>返回本库</Btn>
          </div>
        </div>
      </div>
    );
  }
}

/* ---------- 全局事件 ---------- */
function useGlobal() {
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const d = detectLayout(), S = getS();
        if (d.layout !== S.layout || d.touch !== S.touch) setS(d);
      });
    };
    const onKey = (e) => {
      const S = getS(), mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setS({ palette: !S.palette, quick: false, ctx: null }); return; }
      if (S.modal || S.palette || S.quick || S.lightbox) return;
      const typing = isTyping(document.activeElement) || isTyping(e.target);
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { if (typing) return; e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) { if (typing) return; e.preventDefault(); st.redo(); return; }
      if (typing || mod || e.altKey || S.editing) return;
      if (e.key === '?') { e.preventDefault(); st.openModal('shortcuts'); return; }
      if ((e.key === 'n' || e.key === 'N') && cur() && !S.readOnly && S.view !== 'library') { e.preventDefault(); setS({ quick: true, ctx: null }); }
    };
    const onPaste = (e) => {
      const S = getS();
      if (!cur() || S.readOnly || S.view === 'library' || S.modal || S.quick || S.palette || S.editing) return;
      if (isTyping(document.activeElement)) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); st.addImageCards(files, S.view === 'board' ? { onBoard: true } : {}); return; }
      const t = e.clipboardData?.getData('text/plain');
      if (t && t.trim()) { e.preventDefault(); setS({ quick: { text: t.trim().slice(0, 4000) } }); }
    };
    const onOver = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); };
    const onDrop = (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      const data = files.find((f) => /\.(json|html?)$/i.test(f.name || ''));
      if (data) { e.preventDefault(); importFile(data); return; }
      if (e.defaultPrevented) return;
      e.preventDefault();
      const S = getS();
      if (cur() && !S.readOnly && S.view !== 'library') st.addImageCards(files);
    };
    const onPop = () => {
      const S = getS();
      const overlay = S.lightbox || S.modal || S.quick || S.palette || S.ctx || (S.inspector && S.layout !== 'desk') || S.inbox || S.linkFrom;
      if (overlay) {
        if (S.modal?.kind === 'confirm') S.modal.resolve?.(false);
        setS({ lightbox: null, modal: null, quick: false, palette: false, ctx: null, inspector: false, inbox: false, linkFrom: null });
        history.pushState({ jbs: 1 }, '');
        return;
      }
      if (S.currentId && S.view !== 'library') {
        if (S.layout === 'phone' && S.view !== 'board') { st.setView('board'); history.pushState({ jbs: 1 }, ''); }
        else st.goLibrary();
      }
    };
    addEventListener('resize', onResize);
    addEventListener('keydown', onKey);
    addEventListener('paste', onPaste);
    addEventListener('dragover', onOver);
    addEventListener('drop', onDrop);
    addEventListener('popstate', onPop);
    let mq = null;
    try { mq = matchMedia('(pointer: coarse)'); mq.addEventListener?.('change', onResize); } catch {}
    return () => {
      removeEventListener('resize', onResize); removeEventListener('keydown', onKey); removeEventListener('paste', onPaste);
      removeEventListener('dragover', onOver); removeEventListener('drop', onDrop); removeEventListener('popstate', onPop);
      mq?.removeEventListener?.('change', onResize);
    };
  }, []);
}

/* ---------- 应用 ---------- */
function GameShell({ g }) {
  const layout = useS((s) => s.layout), view = useS((s) => s.view);
  let content;
  switch (view) {
    case 'clues': content = <CluesView />; break;
    case 'people': content = <PeopleView />; break;
    case 'timeline': content = <TimelineView />; break;
    case 'questions': content = <QuestionsView />; break;
    case 'notes': content = <NotesView key={g.id} />; break;
    case 'verdict': content = <VerdictView />; break;
    case 'more': content = <MoreView />; break;
    default: content = <Board key={g.id} />;
  }
  return (
    <>
      {layout === 'desk' && <Sidebar g={g} />}
      {layout === 'tab' && <Rail g={g} />}
      <main className="main">
        <ArchiveBanner />
        <TopBar g={g} />
        <div className="content">{content}</div>
        {layout === 'phone' && <TabBar g={g} />}
      </main>
      <Inspector />
      {layout === 'phone' && <Fab />}
    </>
  );
}
export function App() {
  const ready = useS((s) => s.ready), view = useS((s) => s.view), layout = useS((s) => s.layout), touch = useS((s) => s.touch), ro = useS((s) => s.readOnly);
  const g = useS(cur);
  useGlobal();
  const inGame = !!g && view !== 'library';
  useEffect(() => { if (inGame && !history.state?.jbs) history.pushState({ jbs: 1 }, ''); }, [inGame]);
  useLayoutEffect(() => { const d = document.documentElement.dataset; d.layout = layout; if (inGame) delete d.lib; else d.lib = '1'; }, [layout, inGame]);
  if (!ready) return null;
  return (
    <ErrorBoundary>
      <div className={cx('app', 'L-' + layout, touch && 'touch', ro && 'ro', !inGame && 'is-lib')}>
        {inGame ? <GameShell g={g} /> : <><ArchiveBanner /><Library onDemo={openDemo} /></>}
      </div>
      <Modals />
      <QuickCapture />
      <Palette />
      <CtxMenu />
      <Toasts />
      <Lightbox />
    </ErrorBoundary>
  );
}
