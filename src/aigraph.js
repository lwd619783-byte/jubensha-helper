// 把 AI 识别结果落到导图上：复用已有的人物/地点，新增卡片与关系，整个过程只产生一次撤销记录。
import { commit, cur, newCard, select, setS, setView, toast, undo, boardApi } from './store.js';
import { estimate } from './layout.js';
import { nowStr, uid } from './util.js';

const norm = (s) => String(s || '').replace(/[\s·・,，。.;；:：、]/g, '').toLowerCase();
const clock = (v) => {
  const s = String(v || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m && +m[1] < 24 && +m[2] < 60 ? (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] : '';
};
const TYPE_ORDER = { person: 0, place: 1, event: 2, clue: 3, question: 4, deduction: 5, note: 6 };
const EDGE_STYLE = { solid: 'solid', dashed: 'dashed', conflict: 'conflict' };

export function applyAiGraph(result, { selectedCards, selectedRelations, imageIds = [], keepImages = true } = {}) {
  const g = cur();
  if (!g) return null;
  const allowed = selectedCards instanceof Set ? selectedCards : new Set(result.cards.map((c) => c.key));
  const relOk = selectedRelations instanceof Set ? selectedRelations : new Set(result.relations.map((r) => r.from + '>' + r.to));
  const picked = result.cards.filter((c) => allowed.has(c.key)).sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  if (!picked.length) return null;

  const persons = new Map();
  const places = new Map();
  const same = new Map();
  for (const c of g.cards) {
    if (c.type === 'person' && c.title) persons.set(norm(c.title), c.id);
    if (c.type === 'place' && c.title) places.set(norm(c.title), c.id);
    if (c.title && c.type !== 'topic') same.set(c.type + '|' + norm(c.title), c.id);
  }

  const root = g.cards.find((c) => c.type === 'topic' && !c.parentId) || g.cards.find((c) => c.type === 'topic');
  const created = [];
  const idOf = new Map();
  const reused = [];
  const addedPersons = [];

  function ensurePerson(name) {
    const k = norm(name);
    if (!k) return null;
    if (persons.has(k)) return persons.get(k);
    const c = newCard('person', { title: name.trim().slice(0, 40), onBoard: true, round: g.currentRound, x: 0, y: 0 });
    created.push(c);
    addedPersons.push(c);
    persons.set(k, c.id);
    return c.id;
  }

  for (const item of picked) {
    const title = item.title.trim();
    if (!title) continue;
    if (item.type === 'person' || item.type === 'place') {
      const idx = item.type === 'person' ? persons : places;
      const hit = idx.get(norm(title));
      if (hit) { idOf.set(item.key, hit); if (!reused.includes(hit)) reused.push(hit); continue; }
    } else {
      const hit = same.get(item.type + '|' + norm(title));
      if (hit) { idOf.set(item.key, hit); if (!reused.includes(hit)) reused.push(hit); continue; }
    }
    const personIds = (item.persons || []).map(ensurePerson).filter(Boolean);
    const placeId = item.place ? ensurePlace(item.place) : null;
    const base = { title: title.slice(0, 60), body: item.body || '', onBoard: true, round: g.currentRound, x: 0, y: 0, tags: item.tags || [] };
    let c;
    if (item.type === 'person') c = newCard('person', base);
    else if (item.type === 'place') c = newCard('place', base);
    else if (item.type === 'event') c = newCard('event', { ...base, time: clock(item.time), timeEnd: clock(item.timeEnd), placeId, personIds });
    else if (item.type === 'question') c = newCard('question', { ...base, askIds: personIds });
    else if (item.type === 'deduction') c = newCard('deduction', { ...base, personIds });
    else if (item.type === 'note') c = newCard('note', base);
    else c = newCard('clue', { ...base, personIds });
    created.push(c);
    idOf.set(item.key, c.id);
    if (item.type === 'person') persons.set(norm(title), c.id);
    if (item.type === 'place') places.set(norm(title), c.id);
    same.set(item.type + '|' + norm(title), c.id);
  }

  function ensurePlace(name) {
    const k = norm(name);
    if (!k) return null;
    if (places.has(k)) return places.get(k);
    const c = newCard('place', { title: name.trim().slice(0, 40), onBoard: true, round: g.currentRound, x: 0, y: 0 });
    created.push(c);
    places.set(k, c.id);
    return c.id;
  }

  // 原始照片作为一张「原图」笔记卡，附在整组后面
  if (keepImages && imageIds.length) {
    const c = newCard('note', {
      title: '线索卡原图 · ' + nowStr().slice(5, 16),
      body: result.summary || '',
      imageIds: imageIds.slice(),
      onBoard: true,
      round: g.currentRound,
      x: 0, y: 0,
    });
    created.push(c);
    same.set('note|' + norm(c.title), c.id);
  }

  // 这一组线索挂在一个子主题下：导图上只多出一条主线，不会从根源拉出十几条长线。
  // 同一个标题的主题已经存在时直接复用，重复识别同一张卡不会堆出多个同名分支。
  const topicTitle = (result.title || 'AI 识别线索').slice(0, 24);
  let topic = null, topicIsNew = false;
  if (created.length) {
    topic = g.cards.find((c) => c.type === 'topic' && norm(c.title) === norm(topicTitle)) || null;
    if (!topic) {
      topic = newCard('topic', { title: topicTitle, onBoard: true, round: g.currentRound, x: 0, y: 0, parentId: root?.id || null });
      topicIsNew = true;
    }
  }

  // 摆在现有内容右侧：主题在前，卡片按 2 列排开；不触发整体重排，避免打乱玩家已有的布局
  const on = g.cards.filter((c) => c.onBoard);
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const c of on) {
    const s = estimate(c);
    x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y);
    x2 = Math.max(x2, c.x + s.w); y2 = Math.max(y2, c.y + s.h);
  }
  const center = boardApi.current?.center?.();
  const anchorX = isFinite(x2) ? x2 + 160 : (center ? center.x - 420 : 360);
  const anchorY = isFinite(y1) ? y1 : (center ? center.y - 160 : 0);
  const GAPX = 40, GAPY = 44, COLS = 2;
  const startX = topic ? (topicIsNew ? anchorX : topic.x) + estimate(topic).w + 96 : anchorX;
  const startY = topic && !topicIsNew ? topic.y : anchorY;
  let rowY = startY;
  for (let i = 0; i < created.length; i += COLS) {
    let rowX = startX, rowH = 0;
    for (const c of created.slice(i, i + COLS)) {
      const s = estimate(c);
      c.x = Math.round(rowX);
      c.y = Math.round(rowY);
      rowX += s.w + GAPX;
      rowH = Math.max(rowH, s.h);
    }
    rowY += rowH + GAPY;
  }
  const gridH = created.length ? rowY - GAPY - startY : 0;
  if (topic) {
    if (topicIsNew) {
      const th = estimate(topic).h;
      topic.x = Math.round(anchorX);
      topic.y = Math.round(anchorY + Math.max(0, gridH / 2 - th / 2));
    }
    created.forEach((c) => { c.parentId = topic.id; });
  }

  // 关系
  const existing = new Set(g.edges.map((e) => [e.from, e.to].sort().join('|')));
  const edges = [];
  for (const r of result.relations) {
    if (!relOk.has(r.from + '>' + r.to)) continue;
    const from = idOf.get(r.from), to = idOf.get(r.to);
    if (!from || !to || from === to) continue;
    const k = [from, to].sort().join('|');
    if (existing.has(k)) continue;
    existing.add(k);
    edges.push({ id: uid(), from, to, label: (r.label || '').slice(0, 12), style: EDGE_STYLE[r.style] || 'solid', arrow: 'end' });
  }

  const addedAll = topicIsNew && topic ? [topic, ...created] : created;
  if (!addedAll.length) {
    if (edges.length) {
      commit((gg) => ({ ...gg, edges: [...gg.edges, ...edges] }));
      toast(`补充了 ${edges.length} 条关系`, { label: '撤销', fn: undo }, 6000);
    } else if (reused.length) {
      setView('board');
      select({ cards: [reused[0]] });
      setS({ focusReq: { id: reused[0], t: Date.now() } });
      toast('这些内容已经在导图里了，已定位到对应卡片');
    }
    return { cards: [], edges, reused, all: [], topic, firstId: reused[0] || null };
  }
  const newly = addedAll.map((c) => c.id);
  const ok = commit((gg) => ({
    ...gg,
    cards: [
      ...gg.cards.map((c) => (root && c.id === root.id && c.collapsed ? { ...c, collapsed: false } : c)),
      ...addedAll,
    ],
    edges: [...gg.edges, ...edges],
  }));
  if (!ok) return null;

  const all = newly;
  setView('board');
  select({ cards: all });
  setS({ focusReq: { ids: all, t: Date.now() } });

  const bits = [];
  if (topicIsNew) bits.push('1 个分组');
  bits.push(`${created.length} 张卡片`);
  if (edges.length) bits.push(`${edges.length} 条关系`);
  if (reused.length === 1) {
    const t = g.cards.find((c) => c.id === reused[0])?.title || '已有卡片';
    bits.push(`复用「${t.slice(0, 12)}」`);
  } else if (reused.length) bits.push(`复用 ${reused.length} 张已有卡片`);
  toast(`已加入导图：${bits.join('、')}`, { label: '撤销', fn: undo }, 6000);
  return { cards: addedAll, edges, reused, all, topic, firstId: all[0] || reused[0] || null };
}
