export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const cx = (...a) => a.filter(Boolean).join(' ');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
export const TYPES = {
  topic: { label: '主题', color: '#5e6ad2', icon: 'target' },
  person: { label: '人物', color: '#2f6fed', icon: 'user' },
  clue: { label: '线索', color: '#d97706', icon: 'search' },
  place: { label: '地点', color: '#0f9f6e', icon: 'pin' },
  event: { label: '事件', color: '#7c4ddb', icon: 'clock' },
  question: { label: '疑点', color: '#e5484d', icon: 'help' },
  deduction: { label: '推理', color: '#0e93b8', icon: 'bulb' },
  note: { label: '笔记', color: '#787774', icon: 'note' },
};
export const TYPE_KEYS = ['person', 'clue', 'place', 'event', 'question', 'deduction', 'note'];
export const MARKS = {
  key: { label: '关键', color: '#e5484d' },
  mislead: { label: '误导', color: '#d97706' },
  right: { label: '猜对', color: '#0f9f6e' },
  wrong: { label: '猜错', color: '#787774' },
};
export const EDGE_STYLES = {
  solid: { label: '确认', desc: '实线' },
  dashed: { label: '怀疑', desc: '虚线' },
  conflict: { label: '矛盾', desc: '红线' },
};
export const CRED = { '': '未评估', high: '可信', mid: '存疑', fake: '伪造' };
export const CONF = ['未定', '低', '中', '高'];
export const STATUS = { planned: '待开本', playing: '进行中', done: '已结案' };
export const RESULTS = { hit: '猜中', partial: '部分猜中', miss: '没猜中' };
export const COVERS = ['#5e6ad2', '#2f6fed', '#0e93b8', '#0f9f6e', '#d97706', '#e5484d', '#7c4ddb', '#37352f'];
export const FRAME_COLORS = ['#787774', '#2f6fed', '#0f9f6e', '#d97706', '#e5484d', '#7c4ddb'];
const AV = ['#2f6fed', '#0f9f6e', '#d97706', '#e5484d', '#7c4ddb', '#0e93b8', '#c2410c', '#be185d'];
export function avatarColor(s = '') {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AV[h % AV.length];
}
export const pad2 = (n) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const nowStr = (d = new Date()) => `${todayStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtTs = (t) => (t ? nowStr(new Date(t)) : '');
export function toMin(t) {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec((t || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}
// 凌晨 0–6 点视为“当晚”的延续，便于跨午夜排序
export function timeRange(e) {
  let s = toMin(e.time);
  if (s == null) return null;
  let en = toMin(e.timeEnd);
  if (s < 360) s += 1440;
  if (en == null) en = s;
  else {
    if (en < 360) en += 1440;
    if (en < s) en += 1440;
  }
  return [s, en];
}
export function overlap(a, b) {
  const pa = a[0] === a[1], pb = b[0] === b[1];
  if (pa || pb) return Math.max(a[0], b[0]) <= Math.min(a[1], b[1]);
  return Math.max(a[0], b[0]) < Math.min(a[1], b[1]);
}
export const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const ALLOWED = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'CODE', 'HR']);
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 1) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|LINK|META|IMG|VIDEO|AUDIO|SVG)$/i.test(ch.tagName)) { ch.remove(); continue; }
        walk(ch);
        if (!ALLOWED.has(ch.tagName)) { ch.replaceWith(...ch.childNodes); continue; }
        for (const a of [...ch.attributes]) ch.removeAttribute(a.name);
      } else if (ch.nodeType !== 3) ch.remove();
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const bookTitle = (t) => `《${(t || '未命名').replace(/^《|》$/g, '')}》`;
export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "HarmonyOS Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif';
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
export const kb = (s) => (IS_MAC || typeof s !== 'string' ? s : s.replace(/⇧⌘/g, 'Ctrl+Shift+').replace(/⌘([+−])/g, 'Ctrl $1').replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+'));
