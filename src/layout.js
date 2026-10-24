export const sizes = new Map();
export const HG = 56, VG = 14;
export function estimate(c) {
  const t = c.title || '';
  if (c.type === 'topic') return { w: Math.min(320, Math.max(140, t.length * 18 + 40)), h: 54 };
  const wide = !!(c.body || c.imageIds?.length);
  const w = wide ? 240 : Math.min(240, Math.max(120, t.length * 14.5 + 28));
  let h = 58;
  if (c.body) h += 40;
  if (c.imageIds?.length) h += 128;
  return { w, h };
}
export const sz = (c) => sizes.get(c.id) || estimate(c);

// 右向树布局：根节点位置不动，子节点按当前纵坐标排序
export function tidyTargets(g, rootIds) {
  const cards = g.cards.filter((c) => c.onBoard);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const km = new Map();
  for (const c of cards) if (c.parentId && byId.has(c.parentId)) {
    if (!km.has(c.parentId)) km.set(c.parentId, []);
    km.get(c.parentId).push(c);
  }
  for (const arr of km.values()) arr.sort((a, b) => a.y - b.y || a.createdAt - b.createdAt);
  const roots = cards.filter((c) => (!c.parentId || !byId.has(c.parentId)) && km.has(c.id));
  const out = new Map();
  const H = new Map();
  const kidsOf = (c) => (c.collapsed ? [] : km.get(c.id) || []);
  const meas = (c, depth) => {
    const kids = depth > 60 ? [] : kidsOf(c);
    let kh = 0;
    kids.forEach((k, i) => (kh += meas(k, depth + 1) + (i ? VG : 0)));
    const h = Math.max(sz(c).h, kh);
    H.set(c.id, h);
    return h;
  };
  const place = (c, x, top, depth) => {
    const s = sz(c);
    const h = H.get(c.id) ?? s.h;
    const kids = depth > 60 ? [] : kidsOf(c);
    let kh = 0;
    kids.forEach((k, i) => (kh += H.get(k.id) + (i ? VG : 0)));
    const cy = top + h / 2;
    out.set(c.id, { x: Math.round(x), y: Math.round(cy - s.h / 2) });
    let ty = cy - kh / 2;
    for (const k of kids) {
      place(k, x + s.w + HG, ty, depth + 1);
      ty += H.get(k.id) + VG;
    }
  };
  const list = rootIds ? roots.filter((r) => rootIds.includes(r.id)) : roots;
  const trees = [];
  for (const r of list) {
    const h = meas(r, 0);
    const s = sz(r);
    const before = new Set(out.keys());
    place(r, r.x, r.y + s.h / 2 - h / 2, 0);
    trees.push({ ids: [...out.keys()].filter((k) => !before.has(k)) });
  }
  if (!rootIds && trees.length > 1) {
    const box = (t) => {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const id of t.ids) {
        const p = out.get(id), s = sz(byId.get(id));
        x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x + s.w); y2 = Math.max(y2, p.y + s.h);
      }
      return { x1, y1, x2, y2 };
    };
    trees.forEach((t) => (t.b = box(t)));
    trees.sort((a, b) => a.b.y1 - b.b.y1);
    const done = [];
    for (const t of trees) {
      let shift = 0;
      for (let pass = 0; pass < 3; pass++) for (const o of done) {
        const b = t.b;
        if (b.x1 < o.b.x2 + 24 && o.b.x1 < b.x2 + 24 && b.y1 + shift < o.b.y2 + 40 && o.b.y1 < b.y2 + shift + 40)
          shift = Math.max(shift, o.b.y2 + 40 - b.y1);
      }
      if (shift) {
        for (const id of t.ids) out.get(id).y += Math.round(shift);
        t.b = { ...t.b, y1: t.b.y1 + shift, y2: t.b.y2 + shift };
      }
      done.push(t);
    }
  }
  return out;
}
