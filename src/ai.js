// 剧本杀小助手 · AI 读卡
// 只用浏览器直连用户自己填写的 OpenAI 兼容接口；没有中转服务器，密钥只存在本机 localStorage。
// 调用发生在用户点击「开始分析」之后，图片只发给用户选定的服务商。

const LS_KEY = 'jbs-ai';
export const AI_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', hint: '填入支持图片的模型（可在 DeepSeek 控制台查看）' },
  { id: 'zhipu', label: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', hint: 'GLM 视觉模型' },
  { id: 'qwen', label: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', hint: 'qwen-vl 系列' },
  { id: 'moonshot', label: '月之暗面', base: 'https://api.moonshot.cn/v1', hint: '视觉模型' },
  { id: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', hint: 'gpt-4.1-mini 等支持图片的模型' },
  { id: 'gemini', label: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', hint: 'gemini 的 OpenAI 兼容接口' },
  { id: 'ark', label: '火山方舟', base: 'https://ark.cn-beijing.volces.com/api/v3', hint: '模型名填推理接入点 ID' },
  { id: 'ollama', label: '本机 Ollama', base: 'http://127.0.0.1:11434/v1', hint: '本机运行，不需要密钥；需设置 OLLAMA_ORIGINS=*' },
  { id: 'custom', label: '自定义', base: '', hint: '任何兼容 /chat/completions 的地址，可填自建代理' },
];
const DEFAULTS = { provider: 'deepseek', base: AI_PROVIDERS[0].base, model: '', key: '', maxEdge: 1600 };

export function getAiCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const p = AI_PROVIDERS.find((x) => x.id === raw.provider) || AI_PROVIDERS[0];
    const base = typeof raw.base === 'string' ? raw.base : p.base;
    return { ...DEFAULTS, provider: p.id, base, model: String(raw.model || ''), key: String(raw.key || ''), maxEdge: +raw.maxEdge || DEFAULTS.maxEdge };
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveAiCfg(patch) {
  const next = { ...getAiCfg(), ...patch };
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export const aiReady = (c = getAiCfg()) => !!c.base.trim() && !!c.model.trim() && (!!c.key.trim() || c.provider === 'ollama' || c.provider === 'custom');

/* ---------- 错误 ---------- */
export class AiError extends Error {
  constructor(message, hint) { super(message); this.name = 'AiError'; this.hint = hint || ''; }
}
const NET_HINT = '常见原因：服务商不允许浏览器直连（跨域）、地址写错，或本机网络被代理拦截。也可以把地址换成你自己的转发地址。';

function statusError(status, body) {
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message || j?.message || j?.error?.code || '';
  } catch {}
  const tail = detail ? `（${String(detail).slice(0, 180)}）` : '';
  if (status === 401 || status === 403) return new AiError('密钥无效或没有调用权限' + tail, '到「AI 设置」里检查密钥是否复制完整、有没有该模型的权限。');
  if (status === 404) return new AiError('地址或模型名不存在' + tail, '检查 Base URL 是否包含 /v1，模型名是否与服务商控制台一致。');
  if (status === 429) return new AiError('请求太频繁或额度用尽' + tail, '等一会儿再试，或换一个模型/账号。');
  if (status === 413) return new AiError('图片太大，被服务端拒绝了', '在 AI 设置里把图片尺寸调到 1024 再试。');
  if (status >= 500) return new AiError(`服务商暂时不可用（HTTP ${status}）` + tail, '过一会儿重试，或换一个服务商。');
  return new AiError(`请求失败（HTTP ${status}）` + tail, '检查 AI 设置里的地址、密钥和模型名。');
}

/* ---------- 请求 ---------- */
async function postJson(cfg, path, body, { signal, timeout = 90000 } = {}) {
  const base = cfg.base.trim().replace(/\/+$/, '');
  if (!base) throw new AiError('还没有填写接口地址', '打开「AI 设置」，选择服务商或填入 Base URL。');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const onAbort = () => ctrl.abort(new DOMException('cancelled', 'AbortError'));
  signal?.addEventListener('abort', onAbort);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.key.trim()) headers.Authorization = 'Bearer ' + cfg.key.trim();
    const res = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw statusError(res.status, text);
    try { return JSON.parse(text); } catch { throw new AiError('服务商返回的不是 JSON', '确认地址指向的是 OpenAI 兼容接口。'); }
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e?.name === 'AbortError') throw new AiError('已取消');
    if (e?.name === 'TimeoutError') throw new AiError('分析超时了', '网络较慢时可以只拍一张、把图片尺寸调小，或换一个更快的模型。');
    if (e instanceof TypeError) throw new AiError('连不上这个接口' + (String(e.message || '') ? '（' + e.message + '）' : ''), NET_HINT);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ---------- 模型列表 / 连接测试 ---------- */
async function getModels(cfg, { signal } = {}) {
  const base = cfg.base.trim().replace(/\/+$/, '');
  if (!base) throw new AiError('还没有填写接口地址', '打开「AI 设置」填写 Base URL。');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), 20000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const headers = {};
    if (cfg.key.trim()) headers.Authorization = 'Bearer ' + cfg.key.trim();
    const res = await fetch(base + '/models', { headers, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw statusError(res.status, text);
    const j = JSON.parse(text);
    const list = (j.data || j.models || []).map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    return [...new Set(list)].sort();
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e?.name === 'AbortError') throw new AiError('已取消');
    if (e?.name === 'TimeoutError') throw new AiError('读取模型列表超时');
    if (e instanceof TypeError) throw new AiError('连不上这个接口', NET_HINT);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchModelList(cfg, opts) {
  try {
    const list = await getModels(cfg, opts);
    if (!list.length) throw new AiError('这个接口没有返回模型列表', '有些服务商不支持 /models，直接在「模型」里手动填写模型名即可。');
    return list;
  } catch (e) {
    if (e instanceof AiError && /没有返回模型列表/.test(e.message)) throw e;
    // /models 不可用时退化为一次极小的对话，用来验证地址和密钥
    const r = await chat(cfg, [{ role: 'user', content: '只回复 OK' }], { ...opts, maxTokens: 8 });
    if (!/ok/i.test(r.text)) throw e instanceof AiError ? e : new AiError('连接失败');
    return [];
  }
}

// 设置页的「测试连接」：优先读模型列表（免费），不支持时再用一句极短的对话验证
export async function testConnection(cfg, opts) {
  if (!cfg.base.trim()) throw new AiError('先填写接口地址', '选择服务商会自动填好默认地址。');
  try {
    const models = await getModels(cfg, opts);
    return { models, note: models.length ? `连接成功，接口返回 ${models.length} 个模型` : '连接成功' };
  } catch (e) {
    if (!cfg.model.trim()) throw e;
    const r = await chat(cfg, [{ role: 'user', content: '只回复 OK' }], { ...opts, maxTokens: 8, timeout: 30000 });
    return { models: [], note: /ok/i.test(r.text) ? '连接成功（该服务商不提供模型列表）' : '连接成功，但模型返回了意外内容' };
  }
}

/* ---------- 对话 ---------- */
function contentOf(msg) {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
  return '';
}
async function chat(cfg, messages, { signal, maxTokens = 2400, timeout = 90000 } = {}) {
  const j = await postJson(cfg, '/chat/completions', { model: cfg.model.trim(), messages, temperature: 0.2, max_tokens: maxTokens, stream: false }, { signal, timeout });
  const msg = j?.choices?.[0]?.message;
  const text = contentOf(msg);
  if (!text.trim()) throw new AiError('模型没有返回内容', '可能是模型名不支持图片，或本次请求被内容策略拦截。');
  return { text, usage: j?.usage || null };
}

/* ---------- 提示词 ---------- */
const SYSTEM = `你是剧本杀玩家的线索整理助手。用户会给你线索卡、设定页或人物本的照片，你要把上面的信息拆成结构化卡片和它们之间的关系，帮玩家自动搭好思维导图。

工作要求：
1. 只写图片和补充说明里确实出现的信息。看不清的字用「□」代替，并在该卡的 note 里写「原图此处不清」。不要补充你没看到的剧情，不要推断凶手。
2. 每张卡只讲一件事；同一个人物、地点只建一张卡。clue 的 title 用不超过 20 字的短语，body 保留卡面原文（去掉重复的抬头和页脚），不要改写成推理。
3. type 只能用：person（人物）、clue（线索/证物）、place（地点）、event（带时刻的事件）、question（疑点或要追问的事）、deduction（已有依据的推理）、note（其他设定）。
4. 人物姓名填在 person 卡的 title；地点填在 place 卡的 title。线索涉及哪些人物，写在 persons 数组里（用卡面上出现的名字）。
5. 时间统一写成 24 小时制 HH:MM（如 21:10），放进 event 的 time；跨时段用 timeEnd。
6. relations 只写有依据的关系：from / to 必须是 cards 里某张卡的 key；label 不超过 8 个字（如「在场」「动机」「时间冲突」「同一人」）；style：solid=卡面确认，dashed=推测，conflict=互相矛盾。
7. 最多 18 张卡、24 条关系；宁可少而准，也不要为了凑数编造。
8. 只输出一个 JSON 对象，不要 markdown 代码块，不要解释。

输出格式：
{"title":"这张卡的主题（≤12字）","summary":"一句话概括（≤40字）","cards":[{"key":"c1","type":"clue","title":"...","body":"卡面原文","persons":["姓名"],"place":"地点名","time":"","tags":["关键词"],"note":""}],"relations":[{"from":"c1","to":"c2","label":"在场","style":"solid"}]}`;

function userText(note) {
  const extra = note.trim() ? `\n\n用户的补充说明：${note.trim()}` : '';
  return `请整理这些线索卡照片，输出 JSON。${extra}`;
}

/* ---------- 解析 ---------- */
export const AI_TYPES = ['clue', 'person', 'place', 'event', 'question', 'deduction', 'note'];
const clean = (v, n) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, n) : '');
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 12) : []);
function pickJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = t.indexOf('{');
  if (s < 0) throw new AiError('模型没有按要求返回 JSON', '换一个支持结构化输出的模型再试，或在设置里换成视觉能力更强的模型。');
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (!depth) {
        try { return JSON.parse(t.slice(s, i + 1)); } catch { break; }
      }
    }
  }
  throw new AiError('模型返回的 JSON 不完整', '常见于输出被截断。可以少拍一张、分开识别，或换一个输出上限更高的模型。');
}
export function normalizeResult(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const cards = [];
  for (const c of Array.isArray(o.cards) ? o.cards : []) {
    if (!c || typeof c !== 'object') continue;
    const type = AI_TYPES.includes(c.type) ? c.type : 'clue';
    const title = clean(c.title, 60) || clean(c.body, 24);
    if (!title) continue;
    let key = clean(c.key, 24) || `c${cards.length + 1}`;
    while (seen.has(key)) key += '_';
    seen.add(key);
    cards.push({
      key, type, title,
      body: clean(c.body, 900),
      persons: list(c.persons),
      place: clean(c.place, 40),
      time: /^\d{1,2}:\d{2}$/.test(clean(c.time, 5)) ? clean(c.time, 5).padStart(5, '0') : '',
      timeEnd: /^\d{1,2}:\d{2}$/.test(clean(c.timeEnd, 5)) ? clean(c.timeEnd, 5).padStart(5, '0') : '',
      tags: list(c.tags),
      note: clean(c.note, 200),
    });
    if (cards.length >= 18) break;
  }
  if (!cards.length) throw new AiError('没有从图片里识别出可用卡片', '换一张更清晰、没有反光的照片，或把设定页分成两张拍。');
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const byTitle = new Map(cards.map((c) => [c.title, c]));
  const rels = [];
  const rseen = new Set();
  for (const r of Array.isArray(o.relations) ? o.relations : []) {
    if (!r || typeof r !== 'object') continue;
    const a = byKey.get(clean(r.from, 24)) || byTitle.get(clean(r.from, 60));
    const b = byKey.get(clean(r.to, 24)) || byTitle.get(clean(r.to, 60));
    if (!a || !b || a.key === b.key) continue;
    const k = `${a.key}>${b.key}`;
    if (rseen.has(k)) continue;
    rseen.add(k);
    rels.push({ from: a.key, to: b.key, label: clean(r.label, 12) || '相关', style: ['solid', 'dashed', 'conflict'].includes(r.style) ? r.style : 'solid' });
    if (rels.length >= 24) break;
  }
  return {
    title: clean(o.title, 40) || cards[0].title,
    summary: clean(o.summary, 120),
    cards,
    relations: rels,
  };
}

/* ---------- 主入口 ---------- */
export async function analyzeImages({ images, note = '', cfg = getAiCfg(), signal, onPhase }) {
  if (!aiReady(cfg)) throw new AiError('还没有配置 AI', '先打开「AI 设置」，选一个服务商并填入密钥和模型名。');
  if (!images.length) throw new AiError('还没有照片', '先拍一张线索卡，或从相册里选择。');
  onPhase?.('request');
  const content = [{ type: 'text', text: userText(note) }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))];
  const r = await chat(cfg, [{ role: 'system', content: SYSTEM }, { role: 'user', content }], { signal, maxTokens: 2600, timeout: 120000 });
  onPhase?.('parse');
  const raw = pickJson(r.text);
  const result = normalizeResult(raw);
  return { ...result, usage: r.usage };
}
