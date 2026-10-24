import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { TYPES, MARKS, CRED, STATUS, RESULTS, cx, rgba, timeRange, overlap, bookTitle, sanitizeHtml, todayStr, pad2, avatarColor, kb } from './util.js';
import * as st from './store.js';
import { useS, getS, setS, cur, card } from './store.js';
import { Btn, IconBtn, MenuButton, AutoText, Seg, Stars, Dots, Avatar, TypeIcon, Toggle, Prop, PersonPicker, CardPicker, ImagesField, Empty, Thumb } from './ui.jsx';
import { cardPh, pickFiles, inboxCards } from './board.jsx';
import { byTime } from './inspector.jsx';
import { useImg } from './images.js';

/* ---------- 公共 ---------- */
export function findConflicts(g) {
  const evs = g.cards.filter((c) => c.type === 'event' && timeRange(c));
  const list = [], ids = new Set();
  for (const p of g.cards) {
    if (p.type !== 'person') continue;
    const mine = evs.filter((e) => e.personIds?.includes(p.id));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i], b = mine[j];
      if ((a.day || 0) !== (b.day || 0) || !a.placeId || !b.placeId || a.placeId === b.placeId) continue;
      if (!overlap(timeRange(a), timeRange(b))) continue;
      list.push({ person: p, a, b });
      ids.add(a.id); ids.add(b.id);
    }
  }
  return { list, ids };
}
const evTime = (e) => (e.time ? e.time + (e.timeEnd ? '–' + e.timeEnd : '') : '');
function ViewHead({ icon, title, sub, children }) {
  return (
    <div className="vhead">
      <div className="vhead-t">
        {icon && <span className="vhead-ic"><Icon name={icon} size={18} /></span>}
        <div><h2>{title}</h2>{sub && <div className="vhead-s">{sub}</div>}</div>
      </div>
      <div className="vhead-a">{children}</div>
    </div>
  );
}
function AddLine({ placeholder, onAdd, icon = 'plus', extra }) {
  const [t, setT] = useState('');
  const ro = useS((s) => s.readOnly);
  if (ro) return null;
  const go = () => { if (t.trim()) { onAdd(t); setT(''); } };
  return (
    <div className="addline">
      <Icon name={icon} size={15} />
      <input value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); go(); } }} />
      {t.trim() && <Btn size="sm" kind="primary" onClick={go}>添加</Btn>}
      {extra}
    </div>
  );
}
const useGame = () => useS(cur);
const openC = (id) => st.openCard(id);
const added = (r, what = '已添加') => { if (r?.card) st.toast(`${what}「${r.card.title || cardPh(r.card)}」`, { label: '查看', fn: () => st.openCard(r.card.id) }); };

/* ---------- 本库 ---------- */
const yearOf = (g) => String(g.date || todayStr(new Date(g.createdAt))).slice(0, 4);
function stats(games) {
  const done = games.filter((g) => g.status === 'done');
  const res = games.filter((g) => g.verdict?.result);
  const hit = res.reduce((s, g) => s + (g.verdict.result === 'hit' ? 1 : g.verdict.result === 'partial' ? 0.5 : 0), 0);
  const rated = games.filter((g) => g.verdict?.overall > 0);
  const avg = rated.length ? rated.reduce((s, g) => s + g.verdict.overall, 0) / rated.length : 0;
  const genres = {};
  for (const g of games) for (const x of String(g.genre || '').split(/[\/、,，\s]+/).filter(Boolean)) genres[x] = (genres[x] || 0) + 1;
  const best = rated.slice().sort((a, b) => b.verdict.overall - a.verdict.overall)[0];
  return { n: games.length, done: done.length, hitRate: res.length ? Math.round((hit / res.length) * 100) : null, avg, genres, best };
}
function GameCard({ g }) {
  const ro = useS((s) => s.readOnly);
  const n = (t) => g.cards.filter((c) => c.type === t).length;
  const v = g.verdict || {};
  return (
    <div className="gcard" role="button" tabIndex={0} onClick={() => st.openGame(g.id)} onKeyDown={(e) => e.key === 'Enter' && st.openGame(g.id)}>
      <div className="gc-cover" style={{ backgroundColor: g.cover }}>
        <span className="gc-no">{g.caseNo || 'No.—'}</span>
        <span className="gc-title">{bookTitle(g.title)}</span>
        {g.genre && <span className="gc-genre">{g.genre}</span>}
        {g.demo && <span className="gc-demo">教程</span>}
      </div>
      <div className="gc-body">
        <div className="gc-row">
          <span className={cx('stt', 'stt-' + g.status)}>{STATUS[g.status] || '进行中'}</span>
          {v.result && <span className={cx('res', 'res-' + v.result)}>{RESULTS[v.result]}</span>}
          <div className="sp" />
          {v.overall > 0 && <Stars ro value={v.overall} size={12} />}
        </div>
        <div className="gc-meta">{[g.date || '日期未定', g.store, g.myRole && '我：' + g.myRole].filter(Boolean).join(' · ')}</div>
        <div className="gc-counts"><span>线索 {n('clue')}</span><span>人物 {n('person')}</span><span>事件 {n('event')}</span><span>卡片 {g.cards.length}</span></div>
        {v.oneLiner && <div className="gc-one">“{v.oneLiner}”</div>}
      </div>
      {!ro && (
        <span className="gc-more" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MenuButton className="ibtn" title="更多" align="right" items={() => [
            { label: '打开', icon: 'arrowR', fn: () => st.openGame(g.id) },
            { label: '编辑信息', icon: 'pen', fn: () => st.openModal('gameInfo', { id: g.id }) },
            { label: '导出…', icon: 'download', fn: () => st.openModal('export', { id: g.id }) },
            '-',
            { label: '删除', icon: 'trash', danger: true, fn: async () => { if (await st.confirmBox({ title: `删除${bookTitle(g.title)}？`, body: '本局的导图、线索、笔记和图片都会被删除，且无法撤销。建议先导出备份。', ok: '删除', danger: true })) st.deleteGame(g.id); } },
          ]}><Icon name="more" size={16} /></MenuButton>
        </span>
      )}
    </div>
  );
}
export function Library({ onDemo }) {
  const games = useS((s) => s.games);
  const theme = useS((s) => s.theme);
  const ro = useS((s) => s.readOnly);
  const list = useMemo(() => Object.values(games).sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')) || b.updatedAt - a.updatedAt), [games]);
  const years = useMemo(() => [...new Set(list.map(yearOf))].sort().reverse(), [list]);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const yl = year === 'all' ? list : list.filter((g) => yearOf(g) === year);
  const s = useMemo(() => stats(yl.filter((g) => !g.demo)), [yl]);
  const hasDemo = list.some((g) => g.demo);
  const yopts = [...new Set([String(new Date().getFullYear()), ...years])].sort().reverse();
  return (
    <div className="lib">
      <header className="lib-top">
        <div className="brand"><span className="logo"><Icon name="search" size={16} sw={2.4} /></span><b>剧本杀小助手</b></div>
        <div className="sp" />
        <IconBtn icon={theme === 'dark' ? 'sun' : 'moon'} title={theme === 'dark' ? '浅色模式' : '深色模式'} onClick={() => st.setTheme(theme === 'dark' ? 'light' : 'dark')} />
        {!ro && <IconBtn icon="database" title="数据与备份" onClick={() => st.openModal('data')} />}
        {!ro && <Btn kind="primary" icon="plus" onClick={() => st.openModal('newGame')}>新建剧本</Btn>}
      </header>
      <div className="lib-in">
        <div className="lib-hero">
          <div>
            <h1>我的本库</h1>
            <p className="muted">每一局的线索、推理和复盘都存在这台设备上。</p>
          </div>
          <select className="in yearsel" value={year} onChange={(e) => setYear(e.target.value)} aria-label="年份">
            {yopts.map((y) => <option key={y} value={y}>{y} 年</option>)}
            <option value="all">全部年份</option>
          </select>
        </div>
        <div className="ystats">
          <div className="ys"><b>{s.n}</b><span>本数</span></div>
          <div className="ys"><b>{s.done}</b><span>已结案</span></div>
          <div className="ys"><b>{s.hitRate == null ? '—' : s.hitRate + '%'}</b><span>猜中率</span></div>
          <div className="ys"><b>{s.avg ? s.avg.toFixed(1) : '—'}</b><span>平均评分</span></div>
        </div>
        {(Object.keys(s.genres).length > 0 || s.best) && (
          <div className="ysum">
            {s.best && <span>最爱：<b>{bookTitle(s.best.title)}</b> {'★'.repeat(s.best.verdict.overall)}</span>}
            {Object.entries(s.genres).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => <span key={k} className="chip subtle">{k} × {n}</span>)}
          </div>
        )}
        <div className="ggrid">
          {yl.map((g) => <GameCard key={g.id} g={g} />)}
          {!ro && (
            <button type="button" className="gcard gnew" onClick={() => st.openModal('newGame')}>
              <Icon name="plus" size={20} /><span>新建剧本</span>
            </button>
          )}
        </div>
        {!yl.length && <div className="muted center small">{year === 'all' ? '还没有剧本' : `${year} 年还没有记录`}</div>}
        {!ro && !hasDemo && (
          <button type="button" className="demo-tip" onClick={onDemo}>
            <Icon name="book" size={16} />
            <span><b>第一次用？</b>打开示例「雨夜山庄（教程）」，看看导图、时间线冲突和复盘长什么样。</span>
            <Icon name="chevR" size={16} />
          </button>
        )}
        <div className="lib-foot muted small">数据只保存在本机浏览器。换设备或清理浏览器前，请在「数据与备份」中导出。</div>
      </div>
    </div>
  );
}

/* ---------- 人物 ---------- */
function PersonTile({ p, g, conflicts }) {
  const evN = g.cards.filter((c) => c.type === 'event' && c.personIds?.includes(p.id)).length;
  const cluN = g.cards.filter((c) => c.type !== 'event' && c.personIds?.includes(p.id)).length;
  const qN = g.cards.filter((c) => c.type === 'question' && !c.done && c.askIds?.includes(p.id)).length;
  const cf = conflicts.list.filter((x) => x.person.id === p.id).length;
  const sel = useS((s) => s.sel.cards.includes(p.id));
  return (
    <button type="button" className={cx('ptile', sel && 'sel', p.isMe && 'me')} onClick={() => openC(p.id)}>
      <div className="pt-top">
        <Avatar name={p.title} size={38} />
        <div className="pt-n">
          <div className="pt-name">{p.title || '未命名人物'}{p.isMe && <span className="chip me">我</span>}</div>
          <div className="pt-id">{[p.identity, p.player && '玩家：' + p.player].filter(Boolean).join(' · ') || '身份未知'}</div>
        </div>
        {p.onBoard && <Icon name="map" size={13} className="pt-onb" />}
      </div>
      {p.suspicion > 0 && <div className="pt-row"><span className="muted">嫌疑</span><Dots value={p.suspicion} ro /></div>}
      {p.motive && <div className="pt-txt"><span className="muted">动机</span>{p.motive}</div>}
      {p.alibi && <div className="pt-txt"><span className="muted">不在场</span>{p.alibi}</div>}
      <div className="pt-foot">
        <span>事件 {evN}</span><span>线索 {cluN}</span>{qN > 0 && <span className="warn">待问 {qN}</span>}{cf > 0 && <span className="bad">冲突 {cf}</span>}
      </div>
    </button>
  );
}
export function PeopleView() {
  const g = useGame();
  const [sort, setSort] = useState('default');
  const conflicts = useMemo(() => findConflicts(g), [g.cards]);
  let ps = g.cards.filter((c) => c.type === 'person');
  if (sort === 'susp') ps = ps.slice().sort((a, b) => (b.suspicion || 0) - (a.suspicion || 0));
  else ps = ps.slice().sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0) || a.createdAt - b.createdAt);
  return (
    <div className="view">
      <div className="view-in">
        <ViewHead icon="users" title="人物" sub={`${ps.length} 位角色 · 点开填写身份、动机和不在场证明`}>
          <Seg size="sm" value={sort} onChange={setSort} options={[{ value: 'default', label: '默认' }, { value: 'susp', label: '按嫌疑' }]} />
        </ViewHead>
        <AddLine placeholder="添加人物，输入名字后回车（可一次输入多个，用空格或逗号分隔）" icon="user" onAdd={(t) => {
          const names = t.split(/[\s,，、]+/).map((x) => x.replace(/^[@＠]/, '')).filter(Boolean);
          const exist = new Set(ps.map((p) => p.title));
          let n = 0, lastId = null;
          for (const name of names) if (!exist.has(name)) { lastId = st.newInboxCard('person', { title: name }); exist.add(name); n++; }
          if (n) st.toast(`已添加 ${n} 位人物`, lastId ? { label: '查看', fn: () => st.openCard(lastId) } : undefined);
          else st.toast('这些人物已经存在');
        }} />
        {ps.length ? <div className="pgrid">{ps.map((p) => <PersonTile key={p.id} p={p} g={g} conflicts={conflicts} />)}</div>
          : <Empty icon="users" title="还没有人物">拿到人物本后，先把所有角色名字录进来；之后速记里用 @名字 就能自动关联。</Empty>}
      </div>
    </div>
  );
}

/* ---------- 时间线 ---------- */
function DayTabs({ g, day, setDay }) {
  const ro = useS((s) => s.readOnly);
  const [edit, setEdit] = useState(null);
  const save = (i, v) => {
    const t = v.trim();
    setEdit(null);
    if (!t) return;
    st.updGame((g) => ({ dayLabels: g.dayLabels.map((l, j) => (j === i ? t : l)) }));
  };
  const remove = async (i) => {
    const used = g.cards.some((c) => c.type === 'event' && (c.day || 0) === i);
    if (used && !(await st.confirmBox({ title: `删除「${g.dayLabels[i]}」？`, body: '这一天的事件会移到第一天。', ok: '删除', danger: true }))) return;
    st.commit((g) => ({ ...g, dayLabels: g.dayLabels.filter((_, j) => j !== i), cards: g.cards.map((c) => (c.type !== 'event' ? c : (c.day || 0) === i ? { ...c, day: 0 } : (c.day || 0) > i ? { ...c, day: c.day - 1 } : c)) }));
    setDay(0);
  };
  return (
    <div className="daytabs">
      {g.dayLabels.map((l, i) => edit === i ? (
        <input key={i} className="in dayin" autoFocus defaultValue={l} onBlur={(e) => save(i, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); if (e.key === 'Escape') setEdit(null); }} />
      ) : (
        <button key={i} type="button" className={cx('daytab', day === i && 'on')} onClick={() => setDay(i)} onDoubleClick={() => !ro && setEdit(i)}>
          {l}
          {day === i && !ro && (
            <span className="daytab-a">
              <span role="button" tabIndex={-1} title="重命名" onClick={(e) => { e.stopPropagation(); setEdit(i); }}><Icon name="pen" size={11} /></span>
              {g.dayLabels.length > 1 && <span role="button" tabIndex={-1} title="删除" onClick={(e) => { e.stopPropagation(); remove(i); }}><Icon name="x" size={11} /></span>}
            </span>
          )}
        </button>
      ))}
      {!ro && <button type="button" className="daytab add" title="添加一天" onClick={() => { st.updGame((g) => ({ dayLabels: [...g.dayLabels, `第 ${g.dayLabels.length + 1} 天`] })); setDay(g.dayLabels.length); }}><Icon name="plus" size={12} /></button>}
    </div>
  );
}
function TimelineList({ g, evs, names, conflicts }) {
  const timed = evs.filter((e) => timeRange(e)), untimed = evs.filter((e) => !timeRange(e));
  const Row = ({ e }) => (
    <button type="button" className={cx('tl-row', conflicts.ids.has(e.id) && 'conflict')} onClick={() => openC(e.id)}>
      <span className="tl-time">{evTime(e) || '—'}</span>
      <span className="tl-dot" />
      <span className="tl-main">
        <span className="tl-t">{e.title || cardPh(e)}</span>
        <span className="tl-meta">
          {e.placeId && names.get(e.placeId) && <span className="chip place"><Icon name="pin" size={11} />{names.get(e.placeId)}</span>}
          {(e.personIds || []).map((pid) => names.get(pid) && <span key={pid} className="chip"><Avatar name={names.get(pid)} size={14} />{names.get(pid)}</span>)}
          {conflicts.ids.has(e.id) && <span className="chip bad"><Icon name="alert" size={11} />冲突</span>}
          {!e.onBoard && <span className="chip subtle">待整理</span>}
        </span>
        {e.body && <span className="tl-b">{e.body}</span>}
      </span>
    </button>
  );
  return (
    <div className="tl">
      {timed.map((e) => <Row key={e.id} e={e} />)}
      {untimed.length > 0 && <div className="tl-sep">时间未定</div>}
      {untimed.map((e) => <Row key={e.id} e={e} />)}
    </div>
  );
}
function TimelineMatrix({ g, evs, names, conflicts }) {
  const persons = g.cards.filter((c) => c.type === 'person');
  const timed = evs.filter((e) => timeRange(e));
  const cols = [...new Set(timed.map((e) => timeRange(e)[0]))].sort((a, b) => a - b);
  const label = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
  const rows = persons.filter((p) => timed.some((e) => e.personIds?.includes(p.id)));
  const loose = timed.filter((e) => !e.personIds?.length);
  if (!cols.length) return <Empty icon="calendar" title="还没有带时间的事件">给事件填上时间（如 21:10），这里会生成「人物 × 时间」对照表，自动标出冲突。</Empty>;
  const cell = (list, key) => {
    const places = new Set(list.map((e) => e.placeId).filter(Boolean));
    const bad = places.size > 1 || list.some((e) => conflicts.ids.has(e.id) && list.length > 1);
    return (
      <td key={key} className={cx(list.length && 'has', bad && 'bad')}>
        {list.map((e) => (
          <button type="button" key={e.id} className="mx-ev" onClick={() => openC(e.id)} title={e.title}>
            {e.placeId && names.get(e.placeId) ? <b>{names.get(e.placeId)}</b> : null}
            <span>{e.title || cardPh(e)}</span>
          </button>
        ))}
      </td>
    );
  };
  const covers = (e, t) => { const r = timeRange(e); return r[0] <= t && t <= r[1]; };
  return (
    <div className="mx-wrap">
      <table className="mx">
        <thead><tr><th className="mx-corner">人物 \ 时间</th>{cols.map((t) => <th key={t}>{label(t)}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <th><span className="mx-p"><Avatar name={p.title} size={18} />{p.title || '未命名'}</span></th>
              {cols.map((t) => cell(timed.filter((e) => e.personIds?.includes(p.id) && covers(e, t)), t))}
            </tr>
          ))}
          {loose.length > 0 && (
            <tr>
              <th><span className="mx-p muted">未关联人物</span></th>
              {cols.map((t) => cell(loose.filter((e) => covers(e, t)), t))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function TimelineView() {
  const g = useGame();
  const [mode, setMode] = useState('list');
  const [day, setDay] = useState(0);
  const d = Math.min(day, g.dayLabels.length - 1);
  const names = useMemo(() => new Map(g.cards.filter((c) => c.type === 'person' || c.type === 'place').map((c) => [c.id, c.title || '未命名'])), [g.cards]);
  const conflicts = useMemo(() => findConflicts(g), [g.cards]);
  const evs = g.cards.filter((c) => c.type === 'event' && (c.day || 0) === d).sort(byTime);
  const dayConf = conflicts.list.filter((x) => (x.a.day || 0) === d);
  const ro = useS((s) => s.readOnly);
  const markConflict = (x) => {
    const g0 = cur();
    if (g0.edges.some((e) => (e.from === x.a.id && e.to === x.b.id) || (e.from === x.b.id && e.to === x.a.id))) { st.toast('已经连过线了'); return; }
    st.commit((g) => ({ ...g, edges: [...g.edges, { id: Math.random().toString(36).slice(2, 10), from: x.a.id, to: x.b.id, label: `${x.person.title}时间冲突`, style: 'conflict', arrow: 'none' }] }));
    st.toast(x.a.onBoard && x.b.onBoard ? '已在导图中用红线标出矛盾' : '已记录矛盾；两张卡片都上图后会显示红线');
  };
  return (
    <div className="view">
      <div className="view-in wide">
        <ViewHead icon="clock" title="时间线" sub="按时间排列事件；同一人物同一时间出现在两个地点会标红">
          <Seg size="sm" value={mode} onChange={setMode} options={[{ value: 'list', label: '列表', icon: 'list' }, { value: 'matrix', label: '人物×时间', icon: 'calendar' }]} />
        </ViewHead>
        <DayTabs g={g} day={d} setDay={setDay} />
        <AddLine icon="clock" placeholder="记一个事件，如：21:10 @沈小姐 在花园散步（时间写在开头）" onAdd={(t) => {
          const r = st.quickAdd(t, 'event', { day: d });
          if (r) { if (!r.card.time) st.toast('提示：在开头写上时间（如 21:10）就能排进时间线'); added(r, '已添加事件'); }
        }} />
        {dayConf.length > 0 && (
          <div className="conflicts">
            <div className="cf-h"><Icon name="alert" size={15} /><b>发现 {dayConf.length} 处时间冲突</b></div>
            {dayConf.map((x, i) => (
              <div key={i} className="cf-row">
                <span><b>{x.person.title}</b>：{evTime(x.a)} 在「{names.get(x.a.placeId)}」，{evTime(x.b)} 却在「{names.get(x.b.placeId)}」</span>
                {!ro && <button type="button" className="mini" onClick={() => markConflict(x)}>连红线</button>}
              </div>
            ))}
          </div>
        )}
        {!evs.length ? <Empty icon="clock" title="这一天还没有事件">在上面输入「时间 + 发生了什么」，比如：20:30 顾老爷回到书房</Empty>
          : mode === 'list' ? <TimelineList g={g} evs={evs} names={names} conflicts={conflicts} /> : <TimelineMatrix g={g} evs={evs} names={names} conflicts={conflicts} />}
      </div>
    </div>
  );
}

/* ---------- 线索库 ---------- */
const CLUE_TYPES = [['all', '全部'], ['clue', '线索'], ['deduction', '推理'], ['place', '地点'], ['note', '笔记'], ['event', '事件']];
function ClueTile({ c, names }) {
  const u = useImg(c.imageIds?.[0]);
  const sel = useS((s) => s.sel.cards.includes(c.id));
  const m = c.mark && MARKS[c.mark];
  return (
    <button type="button" className={cx('ctile', sel && 'sel')} onClick={() => openC(c.id)} style={{ '--tc': TYPES[c.type].color }}>
      {c.imageIds?.length > 0 && <div className="ct-img">{u && <img src={u} alt="" />}{c.imageIds.length > 1 && <span>{c.imageIds.length}</span>}</div>}
      <div className="ct-b">
        <div className="ct-type"><Icon name={TYPES[c.type].icon} size={12} />{TYPES[c.type].label}{c.round > 0 && <span className="muted">R{c.round}</span>}{m && <span className="card-mark" style={{ '--mk': m.color }}>{m.label}</span>}</div>
        <div className="ct-t">{c.title || cardPh(c)}</div>
        {c.body && <div className="ct-d">{c.body}</div>}
        <div className="ct-meta">
          {c.credibility && <span className={cx('cchip', 'cc-cred-' + c.credibility)}>{CRED[c.credibility]}</span>}
          {c.type === 'event' && evTime(c) && <span className="cchip cc-ev">{evTime(c)}</span>}
          {(c.personIds || []).slice(0, 3).map((p) => names.get(p) && <span key={p} className="cchip cc-pn">{names.get(p)}</span>)}
          {(c.tags || []).slice(0, 3).map((t) => <span key={t} className="cchip cc-tag">#{t}</span>)}
          {!c.onBoard && <span className="cchip">待整理</span>}
        </div>
      </div>
    </button>
  );
}
export function CluesView() {
  const g = useGame();
  const ro = useS((s) => s.readOnly);
  const [type, setType] = useState('clue');
  const [q, setQ] = useState('');
  const [cred, setCred] = useState('any');
  const [mark, setMark] = useState('any');
  const [round, setRound] = useState(-1);
  const [where, setWhere] = useState('any');
  const [person, setPerson] = useState([]);
  const names = useMemo(() => new Map(g.cards.filter((c) => c.type === 'person' || c.type === 'place').map((c) => [c.id, c.title || '未命名'])), [g.cards]);
  const base = g.cards.filter((c) => c.type !== 'topic' && c.type !== 'person' && c.type !== 'question');
  const ql = q.trim().toLowerCase();
  const list = base.filter((c) =>
    (type === 'all' || c.type === type) &&
    (!ql || [c.title, c.body, c.source, ...(c.tags || [])].join(' ').toLowerCase().includes(ql)) &&
    (cred === 'any' || (c.credibility || '') === cred) &&
    (mark === 'any' || (mark === 'none' ? !c.mark : c.mark === mark)) &&
    (round < 0 || (c.round || 0) === round) &&
    (where === 'any' || (where === 'board' ? c.onBoard : !c.onBoard)) &&
    (!person.length || person.every((p) => c.personIds?.includes(p))),
  ).sort((a, b) => b.createdAt - a.createdAt);
  const count = (t) => (t === 'all' ? base.length : base.filter((c) => c.type === t).length);
  const filtered = cred !== 'any' || mark !== 'any' || round >= 0 || where !== 'any' || person.length > 0;
  const reset = () => { setCred('any'); setMark('any'); setRound(-1); setWhere('any'); setPerson([]); };
  return (
    <div className="view">
      <div className="view-in wide">
        <ViewHead icon="search" title="线索库" sub="所有线索、推理、地点和笔记；点开可补充细节">
          {!ro && <Btn size="sm" icon="image" onClick={() => pickFiles((f) => st.addImageCards(f))}>图片</Btn>}
          {!ro && <Btn size="sm" icon="camera" onClick={() => pickFiles((f) => st.addImageCards(f), true)}>拍照</Btn>}
        </ViewHead>
        <AddLine icon="search" placeholder="记一条线索，可用 @人物、#标签；回车保存到「待整理」" onAdd={(t) => added(st.quickAdd(t, type === 'all' || type === 'event' ? 'clue' : type), '已添加')} />
        <div className="ftabs">
          {CLUE_TYPES.map(([k, l]) => <button key={k} type="button" className={cx('ftab', type === k && 'on')} onClick={() => setType(k)}>{k !== 'all' && <span className="mdot" style={{ background: TYPES[k].color }} />}{l}<em>{count(k)}</em></button>)}
        </div>
        <div className="fbar">
          <div className="search"><Icon name="search" size={14} /><input value={q} placeholder="搜索标题、内容、标签" onChange={(e) => setQ(e.target.value)} />{q && <button type="button" onClick={() => setQ('')} aria-label="清除"><Icon name="x" size={12} /></button>}</div>
          <select className="in sm" value={cred} onChange={(e) => setCred(e.target.value)} aria-label="可信度"><option value="any">可信度</option>{Object.entries(CRED).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="in sm" value={mark} onChange={(e) => setMark(e.target.value)} aria-label="标记"><option value="any">标记</option><option value="none">无标记</option>{Object.entries(MARKS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
          {g.rounds > 1 && <select className="in sm" value={round} onChange={(e) => setRound(+e.target.value)} aria-label="轮次"><option value={-1}>轮次</option><option value={0}>未分轮</option>{Array.from({ length: g.rounds }, (_, i) => <option key={i} value={i + 1}>R{i + 1}</option>)}</select>}
          <select className="in sm" value={where} onChange={(e) => setWhere(e.target.value)} aria-label="位置"><option value="any">位置</option><option value="board">在导图上</option><option value="inbox">待整理</option></select>
          <div className="fperson"><PersonPicker value={person} onChange={setPerson} placeholder="人物" /></div>
          {filtered && <button type="button" className="linkbtn" onClick={reset}>清除筛选</button>}
        </div>
        {list.length ? <div className="cgrid">{list.map((c) => <ClueTile key={c.id} c={c} names={names} />)}</div>
          : <Empty icon="search" title={base.length ? '没有符合条件的卡片' : '还没有线索'}>{base.length ? '换个筛选条件试试' : '搜证时拍照或速记，线索会出现在这里'}</Empty>}
      </div>
    </div>
  );
}

/* ---------- 疑点 & 待问 ---------- */
function QRow({ c, names }) {
  const ro = useS((s) => s.readOnly);
  return (
    <div className={cx('qrow', c.done && 'done')}>
      <button type="button" className={cx('qcheck', c.done && 'on')} disabled={ro} aria-label={c.done ? '标记为未解决' : '标记为已解决'} onClick={() => st.updCard(c.id, { done: !c.done })}>{c.done && <Icon name="check" size={12} sw={3} />}</button>
      <button type="button" className="qmain" onClick={() => openC(c.id)}>
        <span className="q-t">{c.title || cardPh(c)}</span>
        {(c.askIds?.length > 0 || c.answer) && (
          <span className="q-meta">
            {(c.askIds || []).map((p) => names.get(p) && <span key={p} className="chip"><Avatar name={names.get(p)} size={14} />问 {names.get(p)}</span>)}
            {c.answer && <span className="q-ans">答：{c.answer}</span>}
          </span>
        )}
      </button>
    </div>
  );
}
export function QuestionsView() {
  const g = useGame();
  const [group, setGroup] = useState('status');
  const names = useMemo(() => new Map(g.cards.filter((c) => c.type === 'person').map((c) => [c.id, c.title || '未命名'])), [g.cards]);
  const qs = g.cards.filter((c) => c.type === 'question').sort((a, b) => a.createdAt - b.createdAt);
  const open = qs.filter((c) => !c.done), done = qs.filter((c) => c.done);
  const persons = g.cards.filter((c) => c.type === 'person');
  return (
    <div className="view">
      <div className="view-in">
        <ViewHead icon="help" title="疑点 & 待问" sub={`${open.length} 个待解决 · ${done.length} 个已解决`}>
          <Seg size="sm" value={group} onChange={setGroup} options={[{ value: 'status', label: '按状态' }, { value: 'person', label: '按要问的人' }]} />
        </ViewHead>
        <AddLine icon="help" placeholder="记一个疑点，用 @名字 标记要问谁，如：@许医生 为什么换了药瓶？" onAdd={(t) => added(st.quickAdd(t, 'question'), '已添加疑点')} />
        {!qs.length && <Empty icon="help" title="还没有疑点">想不通的地方、要追问别人的问题都记在这里，公聊时逐个问。</Empty>}
        {group === 'status' ? (
          <>
            {open.length > 0 && <div className="sec-h">待解决 <em>{open.length}</em></div>}
            {open.map((c) => <QRow key={c.id} c={c} names={names} />)}
            {done.length > 0 && <div className="sec-h">已解决 <em>{done.length}</em></div>}
            {done.map((c) => <QRow key={c.id} c={c} names={names} />)}
          </>
        ) : (
          <>
            {persons.map((p) => {
              const mine = open.filter((c) => c.askIds?.includes(p.id));
              if (!mine.length) return null;
              return <div key={p.id}><div className="sec-h"><Avatar name={p.title} size={18} />问 {p.title} <em>{mine.length}</em></div>{mine.map((c) => <QRow key={c.id} c={c} names={names} />)}</div>;
            })}
            {open.some((c) => !c.askIds?.length) && <div className="sec-h">没指定对象 <em>{open.filter((c) => !c.askIds?.length).length}</em></div>}
            {open.filter((c) => !c.askIds?.length).map((c) => <QRow key={c.id} c={c} names={names} />)}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 笔记 ---------- */
function exec(cmd, val) { document.execCommand(cmd, false, val); }
export function NotesView() {
  const g = useGame();
  const ro = useS((s) => s.readOnly);
  const ref = useRef(null), t = useRef(0), gid = useRef(g.id);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (g.notes || '')) el.innerHTML = sanitizeHtml(g.notes || '');
    gid.current = g.id;
  }, [g.id]);
  const save = () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const el = ref.current;
      if (!el || gid.current !== cur()?.id) return;
      const html = sanitizeHtml(el.innerHTML);
      if (html !== (cur().notes || '')) st.updGame({ notes: html }, 'notes');
    }, 400);
  };
  useEffect(() => () => {
    clearTimeout(t.current);
    const el = ref.current;
    if (el && !getS().readOnly && gid.current === cur()?.id) { const html = sanitizeHtml(el.innerHTML); if (html !== (cur().notes || '')) st.updGame({ notes: html }, 'notes'); }
  }, []);
  const block = (tag) => { ref.current.focus(); exec('formatBlock', tag); save(); };
  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); exec('bold'); save(); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); exec('italic'); save(); return; }
    if (e.key !== ' ') return;
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return;
    const node = s.anchorNode;
    if (!node || node.nodeType !== 3) return;
    const before = node.textContent.slice(0, s.anchorOffset);
    const blk = node.parentElement?.closest('p,div,h2,h3,li,blockquote');
    if (blk && blk !== ref.current && blk.textContent.trim() !== before.trim()) return;
    const map = { '#': 'h2', '##': 'h3', '>': 'blockquote', '-': 'ul', '*': 'ul', '1.': 'ol', '---': 'hr' };
    const m = map[before.trim()];
    if (!m || before !== before.trimStart()) return;
    e.preventDefault();
    const r = document.createRange();
    r.setStart(node, 0); r.setEnd(node, s.anchorOffset);
    s.removeAllRanges(); s.addRange(r);
    exec('delete');
    if (m === 'ul') exec('insertUnorderedList');
    else if (m === 'ol') exec('insertOrderedList');
    else if (m === 'hr') exec('insertHorizontalRule');
    else exec('formatBlock', m);
    save();
  };
  const onPaste = (e) => {
    const txt = e.clipboardData?.getData('text/plain');
    if (txt == null) return;
    e.preventDefault();
    exec('insertText', txt);
    save();
  };
  const stamp = () => {
    ref.current.focus();
    const d = new Date();
    exec('insertText', `${pad2(d.getHours())}:${pad2(d.getMinutes())} `);
    save();
  };
  const T = ({ icon, title, on }) => <button type="button" className="ibtn" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={on}><Icon name={icon} size={15} /></button>;
  return (
    <div className="view">
      <div className="view-in">
        <ViewHead icon="note" title="笔记" sub="随手记：DM 的提示、公聊要点、自己的推理过程" />
        {!ro && (
          <div className="ntool">
            <T icon="bold" title={kb('粗体 ⌘B')} on={() => { exec('bold'); save(); }} />
            <button type="button" className="ibtn txt" title="标题（# 空格）" onMouseDown={(e) => e.preventDefault()} onClick={() => block('h2')}>H</button>
            <T icon="ul" title="列表（- 空格）" on={() => { exec('insertUnorderedList'); save(); }} />
            <T icon="ol" title="编号（1. 空格）" on={() => { exec('insertOrderedList'); save(); }} />
            <T icon="quote" title="引用（> 空格）" on={() => block('blockquote')} />
            <button type="button" className="ibtn txt" title="正文" onMouseDown={(e) => e.preventDefault()} onClick={() => block('p')}>T</button>
            <span className="tsep" />
            <T icon="clock" title="插入当前时间" on={stamp} />
          </div>
        )}
        <div ref={ref} className="notes" contentEditable={!ro} suppressContentEditableWarning spellCheck={false}
          data-ph="在这里写笔记… 支持 # 标题、- 列表、> 引用 等快捷写法" onInput={save} onKeyDown={onKeyDown} onPaste={onPaste} onBlur={save} />
      </div>
    </div>
  );
}

/* ---------- 结案 & 复盘 ---------- */
const RATE = [['story', '剧情'], ['logic', '逻辑'], ['role', '角色'], ['dm', '主持'], ['immersion', '沉浸']];
export function VerdictView() {
  const g = useGame();
  const ro = useS((s) => s.readOnly);
  const v = g.verdict;
  const up = (p, key) => st.updVerdict(p, key);
  const marks = useMemo(() => Object.keys(MARKS).map((k) => [k, g.cards.filter((c) => c.mark === k)]), [g.cards]);
  const T = (k, ph, rows = 2) => <AutoText value={v[k]} minRows={rows} placeholder={ph} onChange={(x) => up({ [k]: x }, k)} />;
  return (
    <div className="view">
      <div className="view-in">
        <ViewHead icon="flag" title="结案 & 复盘" sub="先写下你的推理，揭晓真相后再对答案、打分">
          {!ro && g.status !== 'done' && <Btn size="sm" kind="primary" icon="check" onClick={() => { st.updateGameInfo(g.id, { status: 'done' }); st.toast('已标记为「已结案」'); }}>标记已结案</Btn>}
          <Btn size="sm" icon="download" onClick={() => st.openModal('export', { id: g.id })}>导出</Btn>
        </ViewHead>
        <fieldset disabled={ro} className="vd">
          <section className="vd-sec">
            <h3><span className="vd-n">1</span>我的推理</h3>
            <div className="props">
              <Prop label="凶手" icon="user"><PersonPicker value={v.culpritIds} disabled={ro} onChange={(x) => up({ culpritIds: x })} placeholder="选择凶手" /></Prop>
              <Prop label="动机" icon="flag" top>{T('motive', '为什么要这么做')}</Prop>
              <Prop label="手法" icon="zap" top>{T('method', '怎么做到的')}</Prop>
              <Prop label="作案时间" icon="clock"><input className="in" value={v.time} placeholder="如：21:10–21:20" onChange={(e) => up({ time: e.target.value }, 'time')} /></Prop>
              <Prop label="关键证据" icon="search"><CardPicker value={v.evidenceIds} disabled={ro} types={['clue', 'event', 'deduction', 'place', 'note']} onChange={(x) => up({ evidenceIds: x })} placeholder="选择证据卡片" /></Prop>
              <Prop label="我投给了" icon="checkSq"><PersonPicker value={v.voteIds} disabled={ro} onChange={(x) => up({ voteIds: x })} placeholder="投票对象" /></Prop>
              <Prop label="投票备注" icon="note"><input className="in" value={v.voteNote} placeholder="如：全场 4:2 投出" onChange={(e) => up({ voteNote: e.target.value }, 'voteNote')} /></Prop>
            </div>
          </section>
          <section className="vd-sec">
            <h3><span className="vd-n">2</span>真相揭晓</h3>
            <div className="props">
              <Prop label="结果" icon="target">
                <Seg size="sm" disabled={ro} value={v.result} onChange={(x) => up({ result: v.result === x ? '' : x })} options={[{ value: 'hit', label: '猜中', color: '#0f9f6e' }, { value: 'partial', label: '部分猜中', color: '#d97706' }, { value: 'miss', label: '没猜中', color: '#e5484d' }]} />
              </Prop>
              <Prop label="真相" icon="eye" top>{T('truth', '复盘时 DM 讲的真相', 3)}</Prop>
            </div>
          </section>
          <section className="vd-sec">
            <h3><span className="vd-n">3</span>评分</h3>
            <div className="rate-all"><span>总评</span><Stars value={v.overall} size={26} ro={ro} onChange={(x) => up({ overall: x })} /></div>
            <div className="rate-grid">
              {RATE.map(([k, l]) => <div key={k} className="rate"><span>{l}</span><Stars value={v.ratings[k]} size={17} ro={ro} onChange={(x) => up({ ratings: { ...v.ratings, [k]: x } })} /></div>)}
            </div>
          </section>
          <section className="vd-sec">
            <h3><span className="vd-n">4</span>复盘</h3>
            <div className="props">
              <Prop label="一句话" icon="quote"><input className="in" value={v.oneLiner} placeholder="用一句话评价这个本" onChange={(e) => up({ oneLiner: e.target.value }, 'oneLiner')} /></Prop>
              <Prop label="高光时刻" icon="star" top>{T('highlights', '最精彩的一刻')}</Prop>
              <Prop label="感想" icon="pen" top>{T('thoughts', '玩后感、给自己的提醒', 3)}</Prop>
              <Prop label="合照" icon="camera" top>
                <ImagesField ids={v.photoIds} ro={ro} onAdd={async (files) => { const { saveImage } = await import('./images.js'); const ids = []; for (const f of files) { try { ids.push(await saveImage(f)); } catch {} } if (ids.length) up({ photoIds: [...(cur().verdict.photoIds || []), ...ids] }); }} onRemove={(id) => up({ photoIds: v.photoIds.filter((x) => x !== id) })} />
              </Prop>
            </div>
          </section>
          <section className="vd-sec">
            <h3><span className="vd-n">5</span>卡片标记</h3>
            <p className="muted small">在导图卡片上右键 / 长按 →「标记」，复盘时回顾哪些线索是关键、哪些是误导。</p>
            <div className="mk-grid">
              {marks.map(([k, cs]) => (
                <div key={k} className="mk-col" style={{ '--mk': MARKS[k].color }}>
                  <div className="mk-h"><span className="mdot" style={{ background: MARKS[k].color }} />{MARKS[k].label}<em>{cs.length}</em></div>
                  {cs.map((c) => <button key={c.id} type="button" className="mk-item" onClick={() => openC(c.id)}>{c.title || cardPh(c)}</button>)}
                  {!cs.length && <div className="muted small">暂无</div>}
                </div>
              ))}
            </div>
          </section>
        </fieldset>
      </div>
    </div>
  );
}

/* ---------- 更多（手机） ---------- */
export function MoreView() {
  const g = useGame();
  const theme = useS((s) => s.theme), ro = useS((s) => s.readOnly);
  const openQ = g.cards.filter((c) => c.type === 'question' && !c.done).length;
  const inbox = inboxCards(g).length;
  const Item = ({ icon, label, sub, onClick, badge }) => (
    <button type="button" className="more-item" onClick={onClick}>
      <span className="more-ic"><Icon name={icon} size={18} /></span>
      <span className="more-l"><b>{label}</b>{sub && <span>{sub}</span>}</span>
      {badge ? <span className="badge static">{badge}</span> : null}
      <Icon name="chevR" size={16} className="muted" />
    </button>
  );
  return (
    <div className="view">
      <div className="view-in">
        <div className="more-game">
          <div className="ov-badge" style={{ background: g.cover }}><Icon name="book" size={16} /></div>
          <div className="ov-gt"><div className="ov-title">{bookTitle(g.title)}</div><div className="ov-meta">{[g.caseNo, STATUS[g.status], g.date].filter(Boolean).join(' · ')}</div></div>
          {!ro && <IconBtn icon="pen" title="编辑本局信息" onClick={() => st.openModal('gameInfo', { id: g.id })} />}
        </div>
        <div className="more-list">
          <Item icon="help" label="疑点 & 待问" sub="公聊时逐个问" badge={openQ} onClick={() => st.setView('questions')} />
          <Item icon="note" label="笔记" sub="DM 提示、推理过程" onClick={() => st.setView('notes')} />
          <Item icon="flag" label="结案 & 复盘" sub="推理、真相、评分" onClick={() => st.setView('verdict')} />
          {!ro && <Item icon="inbox" label="待整理" sub="速记和图片先放这里" badge={inbox} onClick={() => { st.setView('board'); setS({ inbox: true }); }} />}
        </div>
        <div className="more-list">
          <Item icon="download" label="导出" sub="图片 / 离线存档 / 备份" onClick={() => st.openModal('export', { id: g.id })} />
          {!ro && <Item icon="database" label="数据与备份" sub="导入、导出全部数据" onClick={() => st.openModal('data')} />}
          <Item icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? '浅色模式' : '深色模式'} onClick={() => st.setTheme(theme === 'dark' ? 'light' : 'dark')} />
          <Item icon="keyboard" label="快捷键与手势" onClick={() => st.openModal('shortcuts')} />
          {!ro && <Item icon="home" label="返回本库" sub="所有剧本" onClick={() => st.goLibrary()} />}
        </div>
        <div className="muted small center">剧本杀小助手 · 数据只保存在本机</div>
      </div>
    </div>
  );
}
