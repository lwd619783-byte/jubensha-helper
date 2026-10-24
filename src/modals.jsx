import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { STATUS, COVERS, cx, bookTitle, todayStr, fmtTs, kb } from './util.js';
import * as st from './store.js';
import { useS, getS } from './store.js';
import { Modal, Btn, Seg, Toggle, TagInput } from './ui.jsx';
import { SHORTS } from './inspector.jsx';
import * as db from './db.js';
import { gcImages } from './images.js';
import { renderBoard, canvasBlob, download, shareFile, canShareFiles, safeName, backupBlob, archiveBlob, readImportFile, applyImport, conflictsOf, stampName, RATIOS } from './exporter.js';

/* ---------- 导入 ---------- */
export async function importFile(file) {
  if (getS().readOnly) { st.toast('存档是只读的，请在「剧本杀小助手」网页版中导入'); return; }
  let data;
  try { data = await readImportFile(file); } catch (e) { st.toast(e?.message || '导入失败'); return; }
  if (!data.games.length) { st.toast('文件里没有剧本'); return; }
  const conflicts = conflictsOf(data);
  if (conflicts.length) { st.openModal('import', { data, conflicts }); return; }
  await doImport(data, 'copy');
}
async function doImport(data, strategy) {
  try {
    const r = await applyImport(data, strategy);
    const msg = r.n ? `已导入 ${r.n} 个剧本${r.skipped ? `，跳过 ${r.skipped} 个重复` : ''}` : `没有导入新剧本${r.skipped ? `（跳过 ${r.skipped} 个重复）` : ''}`;
    st.toast(msg, r.ids.length === 1 ? { label: '打开', fn: () => st.openGame(r.ids[0]) } : null, 5200);
  } catch (e) { st.toast('导入失败：' + (e?.message || e)); }
}
const pickFile = (accept, cb) => {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept;
  i.onchange = () => { const f = i.files?.[0]; if (f) cb(f); };
  i.click();
};
export const pickImport = () => pickFile('.json,.html,.htm,application/json,text/html', (f) => { st.closeModal(); importFile(f); });

/* ---------- 入口 ---------- */
export function Modals() {
  const m = useS((s) => s.modal);
  if (!m) return null;
  switch (m.kind) {
    case 'confirm': return <ConfirmModal m={m} />;
    case 'newGame': return <GameInfoModal key="new" />;
    case 'gameInfo': return <GameInfoModal key={m.id} id={m.id} />;
    case 'export': return <ExportModal id={m.id} tab0={m.tab} />;
    case 'data': return <DataModal />;
    case 'import': return <ImportModal m={m} />;
    case 'shortcuts': return <ShortcutsModal />;
    default: return null;
  }
}

function ConfirmModal({ m }) {
  const done = (v) => { st.closeModal(); m.resolve?.(v); };
  return (
    <Modal title={m.title || '确认'} onClose={() => done(false)} width={420} className="m-confirm"
      footer={<><Btn onClick={() => done(false)}>{m.cancel || '取消'}</Btn><Btn kind={m.danger ? 'danger' : 'primary'} autoFocus onClick={() => done(true)}>{m.ok || '确定'}</Btn></>}>
      {m.body && <p className="m-text">{m.body}</p>}
    </Modal>
  );
}

/* ---------- 本局信息 ---------- */
const GENRES = ['刑侦本', '本格', '变格', '硬核推理', '还原本', '情感本', '欢乐本', '机制本', '阵营本', '恐怖本', '立意本', '古风', '民国', '现代', '日式', '欧式', '城限', '独家'];
const FIELDS = [
  ['store', '店家', '在哪家店玩的'], ['dm', 'DM', '主持人'], ['myRole', '我的角色', '我扮演谁'], ['players', '人数', '如：6 人（3 男 3 女）'],
  ['companions', '同行', '和谁一起'], ['duration', '时长', '如：5 小时'], ['cost', '花费', '如：¥168'],
];
function GameInfoModal({ id }) {
  const g0 = useS((s) => (id ? s.games[id] : null));
  const isNew = !id;
  const [f, setF] = useState(() => (g0
    ? { title: g0.title, genre: g0.genre, date: g0.date, status: g0.status, store: g0.store, dm: g0.dm, myRole: g0.myRole, players: g0.players, companions: g0.companions, duration: g0.duration, cost: g0.cost, caseNo: g0.caseNo, cover: g0.cover, tags: g0.tags || [] }
    : { title: '', genre: '', date: todayStr(), status: 'playing', store: '', dm: '', myRole: '', players: '', companions: '', duration: '', cost: '', cover: '', tags: [] }));
  const genres = useMemo(() => [...new Set([...GENRES, ...Object.values(getS().games).map((g) => g.genre).filter(Boolean)])], []);
  if (id && !g0) return null;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e && e.target ? e.target.value : e }));
  const save = (e) => {
    e?.preventDefault?.();
    const title = f.title.trim().replace(/^《|》$/g, '') || '未命名剧本';
    if (isNew) {
      const info = { ...f, title };
      if (!info.cover) delete info.cover;
      const g = st.newGame(info);
      st.addGame(g);
      st.closeModal();
      st.openGame(g.id);
      st.toast(`已新建${bookTitle(title)}，从导图开始记录吧`);
    } else {
      st.updateGameInfo(id, { ...f, title });
      st.closeModal();
    }
  };
  const del = async () => {
    const ok = await st.confirmBox({ title: `删除${bookTitle(g0.title)}？`, body: '本局的导图、线索、笔记和图片都会被删除，且无法撤销。建议先导出备份。', ok: '删除', danger: true });
    if (ok) { await st.deleteGame(id); st.toast('已删除'); }
    else st.openModal('gameInfo', { id });
  };
  return (
    <Modal title={isNew ? '新建剧本' : '本局信息'} onClose={st.closeModal} width={600} className="m-info"
      footer={<>
        {!isNew && <Btn kind="ghost-danger" icon="trash" onClick={del}>删除</Btn>}
        <div className="sp" />
        <Btn onClick={st.closeModal}>取消</Btn>
        <Btn kind="primary" onClick={save}>{isNew ? '创建并开始' : '保存'}</Btn>
      </>}>
      <form className="form" onSubmit={save}>
        <label className="f-row f-full">
          <span className="f-l">剧本名</span>
          <input className="in f-title" value={f.title} onChange={set('title')} placeholder="如：雨夜山庄" autoFocus={isNew} maxLength={60} enterKeyHint="done" />
        </label>
        <label className="f-row">
          <span className="f-l">类型</span>
          <input className="in" list="jbs-genres" value={f.genre} onChange={set('genre')} placeholder="如：刑侦本 / 本格" maxLength={40} />
          <datalist id="jbs-genres">{genres.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="f-row">
          <span className="f-l">日期</span>
          <input className="in" type="date" value={f.date || ''} onChange={set('date')} />
        </label>
        <div className="f-row f-full">
          <span className="f-l">状态</span>
          <Seg value={f.status} onChange={set('status')} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} />
        </div>
        {FIELDS.map(([k, l, ph]) => (
          <label key={k} className="f-row">
            <span className="f-l">{l}</span>
            <input className="in" value={f[k] || ''} onChange={set(k)} placeholder={ph} maxLength={80} />
          </label>
        ))}
        {!isNew && (
          <label className="f-row">
            <span className="f-l">案件编号</span>
            <input className="in mono" value={f.caseNo || ''} onChange={set('caseNo')} placeholder="No.2026-001" maxLength={30} />
          </label>
        )}
        <div className="f-row f-full">
          <span className="f-l">封面色</span>
          <div className="swatches">
            {COVERS.map((c) => <button key={c} type="button" className={cx('sw', (f.cover || (isNew ? '' : COVERS[0])) === c && 'on')} style={{ background: c }} onClick={() => setF((p) => ({ ...p, cover: c }))} aria-label="封面色" />)}
            {isNew && <span className={cx('sw-auto', !f.cover && 'on')} onClick={() => setF((p) => ({ ...p, cover: '' }))}>自动</span>}
          </div>
        </div>
        <div className="f-row f-full">
          <span className="f-l">标签</span>
          <TagInput value={f.tags} onChange={(tags) => setF((p) => ({ ...p, tags }))} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ---------- 导出 ---------- */
const EXP_DEF = { theme: 'light', ratio: 'orig', scale: 2, header: true, legend: true };
function loadExp() {
  try { return { ...EXP_DEF, theme: getS().theme, ...JSON.parse(localStorage.getItem('jbs-export') || '{}') }; } catch { return { ...EXP_DEF }; }
}
function ExportModal({ id, tab0 }) {
  const g = useS((s) => s.games[id || s.currentId]);
  const touch = useS((s) => s.touch);
  const [tab, setTab] = useState(tab0 || 'png');
  const [o, setO] = useState(loadExp);
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const box = useRef(null);
  const share = useMemo(() => touch && canShareFiles(), [touch]);
  const maxArea = touch ? 40e6 : 140e6;
  const up = (p) => setO((x) => { const n = { ...x, ...p }; try { localStorage.setItem('jbs-export', JSON.stringify(n)); } catch {} return n; });
  useEffect(() => {
    if (!g || tab !== 'png') return;
    let dead = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await renderBoard(g, { ...o, scale: 1, maxArea: 3e6 });
        if (dead) return;
        r.canvas.className = 'ex-cv';
        box.current?.replaceChildren(r.canvas);
        const fin = Math.max(0.1, Math.min(o.scale, 16384 / r.W, 16384 / r.H, Math.sqrt(maxArea / (r.W * r.H))));
        setInfo({ w: Math.round(r.W * fin), h: Math.round(r.H * fin), reduced: fin < o.scale - 0.01, empty: r.empty });
      } catch (e) { if (!dead) setInfo({ err: e?.message || String(e) }); }
      if (!dead) setLoading(false);
    }, 120);
    return () => { dead = true; clearTimeout(t); };
  }, [g?.cards, g?.edges, g?.frames, g?.title, o.theme, o.ratio, o.header, o.legend, o.scale, tab]);
  if (!g) return null;
  const base = safeName(bookTitle(g.title).replace(/[《》]/g, ''));
  const run = async (key, make, name, how) => {
    if (busy) return;
    setBusy(key);
    try {
      const blob = await make();
      if (how === 'share') { const r = await shareFile(blob, name); if (r === 'downloaded') st.toast('已保存：' + name); }
      else { download(blob, name); st.toast('已导出：' + name, null, 4200); }
    } catch (e) { st.toast('导出失败：' + (e?.message || e), null, 5000); }
    setBusy('');
  };
  const png = async () => {
    const r = await renderBoard(g, { ...o, maxArea });
    if (r.scale < o.scale - 0.01) st.toast(`导图较大，清晰度已自动调整为 ${r.scale.toFixed(1)}×`);
    const b = await canvasBlob(r.canvas);
    r.canvas.width = r.canvas.height = 0;
    return b;
  };
  const pngName = `${base}_导图_${stampName()}.png`;
  const htmlName = `${base}_存档_${stampName()}.html`;
  const jsonName = `${base}_备份_${stampName()}.json`;
  const allName = `剧本杀小助手_全部备份_${stampName()}.json`;
  return (
    <Modal title="导出" onClose={st.closeModal} width={tab === 'png' ? 760 : 560} className="m-export">
      <div className="ex-tabs">
        <Seg value={tab} onChange={setTab} options={[{ value: 'png', label: '导图图片', icon: 'image' }, { value: 'html', label: '离线存档', icon: 'archive' }, { value: 'json', label: '数据备份', icon: 'database' }]} />
      </div>
      {tab === 'png' && (
        <div className="ex-png">
          <div className={cx('ex-prev', o.theme === 'dark' && 'dk', loading && 'loading')}>
            <div ref={box} className="ex-box" />
            {loading && <div className="ex-spin" />}
            {info?.err && <div className="ex-err">{info.err}</div>}
          </div>
          <div className="ex-opts">
            <div className="ex-o"><span className="f-l">外观</span><Seg size="sm" value={o.theme} onChange={(v) => up({ theme: v })} options={[{ value: 'light', label: '浅色', icon: 'sun' }, { value: 'dark', label: '深色', icon: 'moon' }]} /></div>
            <div className="ex-o"><span className="f-l">比例</span><Seg size="sm" value={o.ratio} onChange={(v) => up({ ratio: v })} options={Object.entries(RATIOS).map(([value, label]) => ({ value, label }))} /></div>
            <div className="ex-o"><span className="f-l">清晰度</span><Seg size="sm" value={o.scale} onChange={(v) => up({ scale: v })} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }]} /></div>
            <div className="ex-o"><span className="f-l">内容</span><div className="ex-tg"><Toggle value={o.header} onChange={(v) => up({ header: v })} label="标题信息" /><Toggle value={o.legend} onChange={(v) => up({ legend: v })} label="图例" /></div></div>
            <div className="ex-size muted small">
              {info && !info.err ? <>约 {info.w} × {info.h} 像素{info.reduced ? '（已按设备上限自动调整）' : ''}{info.empty ? ' · 导图还是空的' : ''}</> : ' '}
            </div>
            <div className="ex-hint muted small">{o.ratio === 'orig' ? '「原比例」按导图实际范围裁切；「√2」与 A4 纸、华为 Pura X 内屏比例接近，适合打印和年终合集。' : '√2 比例 ≈ A4 纸；空白处会自动留白居中。'}</div>
            <div className="ex-acts">
              {share && <Btn icon="share" disabled={!!busy} onClick={() => run('share', png, pngName, 'share')}>分享</Btn>}
              <Btn kind="primary" icon="download" disabled={!!busy} onClick={() => run('png', png, pngName)}>{busy === 'png' ? '生成中…' : touch ? '保存图片' : '导出 PNG'}</Btn>
            </div>
          </div>
        </div>
      )}
      {tab === 'html' && (
        <div className="ex-doc">
          <div className="ex-card">
            <div className="ex-ic"><Icon name="archive" size={20} /></div>
            <div>
              <b>单文件离线存档（.html）</b>
              <p>把本局的导图、线索、人物、时间线、笔记、复盘和所有图片打包进一个网页文件。不需要联网、不需要安装，任何浏览器双击就能打开浏览（只读）。适合永久保存、发给同车好友，年底做总结时一份份翻看。</p>
              <ul>
                <li>存档也可以「导入」回来继续编辑</li>
                <li>文件里包含图片，体积 = 图片总大小左右</li>
              </ul>
            </div>
          </div>
          <div className="ex-acts">
            {share && <Btn icon="share" disabled={!!busy} onClick={() => run('share', () => archiveBlob(g), htmlName, 'share')}>分享</Btn>}
            <Btn kind="primary" icon="download" disabled={!!busy} onClick={() => run('html', () => archiveBlob(g), htmlName)}>{busy === 'html' ? '打包中…' : '导出离线存档'}</Btn>
          </div>
        </div>
      )}
      {tab === 'json' && (
        <div className="ex-doc">
          <div className="ex-card">
            <div className="ex-ic"><Icon name="database" size={20} /></div>
            <div>
              <b>数据备份（.json）</b>
              <p>完整的可编辑数据（含图片），用来换设备、在电脑和手机之间同步，或者防止浏览器清理数据。在另一台设备上打开「数据与备份 → 导入」即可恢复。</p>
            </div>
          </div>
          <div className="ex-acts">
            <Btn icon="database" disabled={!!busy} onClick={() => run('all', () => backupBlob(Object.values(getS().games)), allName, share ? 'share' : undefined)}>备份全部剧本</Btn>
            <Btn kind="primary" icon="download" disabled={!!busy} onClick={() => run('json', () => backupBlob([g]), jsonName, share ? 'share' : undefined)}>{busy === 'json' ? '打包中…' : '备份本局'}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- 数据与备份 ---------- */
const fmtSize = (n) => (n == null ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
function DataModal() {
  const games = useS((s) => s.games);
  const touch = useS((s) => s.touch);
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const r = {};
      try { r.mem = await db.isMemory(); } catch {}
      try { r.imgs = (await db.keys('images')).length; } catch {}
      try { const e = await navigator.storage?.estimate?.(); if (e) { r.usage = e.usage; r.quota = e.quota; } } catch {}
      try { r.persisted = await navigator.storage?.persisted?.(); } catch {}
      setInfo(r);
    })();
  }, []);
  const list = Object.values(games);
  const cards = list.reduce((a, g) => a + g.cards.length, 0);
  const backup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const name = `剧本杀小助手_全部备份_${stampName()}.json`;
      const b = await backupBlob(list);
      if (touch && canShareFiles()) { const r = await shareFile(b, name); if (r === 'downloaded') st.toast('已保存：' + name); }
      else { download(b, name); st.toast('已导出：' + name); }
      try { localStorage.setItem('jbs-backup-at', String(Date.now())); } catch {}
    } catch (e) { st.toast('备份失败：' + (e?.message || e)); }
    setBusy(false);
  };
  const persist = async () => {
    try { const ok = await navigator.storage?.persist?.(); setInfo((x) => ({ ...x, persisted: ok })); st.toast(ok ? '已开启持久存储' : '浏览器暂未允许，建议定期备份'); } catch { st.toast('当前浏览器不支持'); }
  };
  const clean = async () => { setBusy(true); await gcImages(list).catch(() => {}); const n = (await db.keys('images').catch(() => [])).length; setInfo((x) => ({ ...x, imgs: n })); setBusy(false); st.toast('已清理未使用的图片'); };
  let last = null;
  try { last = +localStorage.getItem('jbs-backup-at') || null; } catch {}
  return (
    <Modal title="数据与备份" onClose={st.closeModal} width={560} className="m-data">
      {info.mem && <div className="dm-warn"><Icon name="alert" size={15} /><span>当前浏览器无法使用本地数据库（可能是无痕模式），关闭页面后数据会丢失，请及时导出备份。</span></div>}
      <div className="dm-stats">
        <div className="dm-st"><b>{list.length}</b><span>剧本</span></div>
        <div className="dm-st"><b>{cards}</b><span>卡片</span></div>
        <div className="dm-st"><b>{info.imgs ?? '—'}</b><span>图片</span></div>
        <div className="dm-st"><b>{fmtSize(info.usage)}</b><span>已用空间</span></div>
      </div>
      <div className="dm-line muted small">
        数据只保存在这台设备的浏览器里，不会上传到任何服务器。{info.persisted ? '已开启持久存储。' : <>持久存储未开启，<button type="button" className="linkbtn" onClick={persist}>申请开启</button>。</>}
        {last ? ` 上次备份：${fmtTs(last)}` : ' 还没有备份过。'}
      </div>
      <div className="dm-acts">
        <button type="button" className="dm-act" disabled={busy} onClick={backup}>
          <span className="dm-ic"><Icon name="download" size={18} /></span>
          <span><b>备份全部</b><em>导出一个 .json 文件，含所有剧本和图片</em></span>
        </button>
        <button type="button" className="dm-act" disabled={busy} onClick={pickImport}>
          <span className="dm-ic"><Icon name="upload" size={18} /></span>
          <span><b>导入</b><em>选择备份（.json）或离线存档（.html）</em></span>
        </button>
      </div>
      <div className="dm-sync">
        <div className="dm-sh">在电脑和手机之间同步</div>
        <ol>
          <li>在有最新记录的设备上点「备份全部」</li>
          <li>把文件发到另一台设备（微信文件传输助手、网盘、隔空投送都可以）</li>
          <li>在另一台设备打开小助手 →「数据与备份」→「导入」；同一个剧本会询问覆盖还是保留两份</li>
        </ol>
      </div>
      <div className="dm-foot">
        <button type="button" className="linkbtn" disabled={busy} onClick={clean}>清理未使用的图片</button>
      </div>
    </Modal>
  );
}

function ImportModal({ m }) {
  const games = useS((s) => s.games);
  const { data, conflicts } = m;
  const go = (s) => { st.closeModal(); doImport(data, s); };
  const fresh = data.games.length - conflicts.length;
  return (
    <Modal title="导入剧本" onClose={st.closeModal} width={520} className="m-import"
      footer={<>
        <Btn onClick={() => go('skip')}>{fresh ? '跳过重复' : '取消'}</Btn>
        <div className="sp" />
        <Btn onClick={() => go('copy')}>保留两份</Btn>
        <Btn kind="primary" onClick={() => go('overwrite')}>覆盖</Btn>
      </>}>
      <p className="m-text">文件里有 {data.games.length} 个剧本，其中 {conflicts.length} 个在这台设备上已经存在{fresh ? `，另外 ${fresh} 个会直接导入` : ''}。重复的剧本要怎么处理？</p>
      <div className="imp-list">
        {conflicts.map((x) => {
          const mine = games[x.id];
          const newer = (x.updatedAt || 0) > (mine?.updatedAt || 0);
          return (
            <div key={x.id} className="imp-row">
              <span className="imp-badge" style={{ background: x.cover || COVERS[0] }}><Icon name="book" size={13} /></span>
              <div className="imp-t">
                <b>{bookTitle(x.title)}</b>
                <span>文件：{fmtTs(x.updatedAt) || '—'}（{x.cards.length} 张卡）· 本机：{fmtTs(mine?.updatedAt) || '—'}（{mine?.cards.length || 0} 张卡）</span>
              </div>
              <em className={cx('imp-tag', newer && 'new')}>{newer ? '文件较新' : '本机较新'}</em>
            </div>
          );
        })}
      </div>
      <p className="muted small">覆盖：用文件里的版本替换本机版本；保留两份：文件里的版本另存为「（导入）」副本。</p>
    </Modal>
  );
}

/* ---------- 快捷键 ---------- */
const GESTURES = [
  ['单指拖动空白', '平移画布'], ['双指捏合', '缩放画布'], ['点一下卡片', '选中并查看详情'], ['双击卡片', '编辑标题'],
  ['长按卡片 / 空白', '打开菜单'], ['拖动卡片到另一张上', '挂到它下面'], ['选中后点 ＋', '添加下级 / 同级卡片'], ['选中后拖 🔗 按钮', '拉一条关系线'],
];
const QUICK = [
  ['21:10 开头', '自动变成「事件」并记下时间；21:10-21:30 记为时间段'], ['@人名', '关联人物；新名字会自动建人物卡'], ['#标签', '添加标签，如 #证词 #关键'],
  ['第一行', '标题；换行后的内容是正文'], ['截图 / 照片', '直接粘贴（⌘V）、拖进来，或在速记里点相机'],
];
function ShortcutsModal() {
  const touch = useS((s) => s.touch);
  const sections = [
    !touch && ['键盘快捷键', SHORTS],
    ['触屏手势', GESTURES],
    ['速记语法（N）', QUICK],
    touch && ['外接键盘', SHORTS],
  ].filter(Boolean);
  return (
    <Modal title="快捷键与手势" onClose={st.closeModal} width={680} className="m-keys">
      {sections.map(([t, rows]) => (
        <div key={t} className="sc-sec">
          <div className="sc-h">{t}</div>
          <div className="sc-grid">
            {rows.map(([k, d]) => <div key={k} className="sc-row"><kbd>{kb(k)}</kbd><span>{kb(d)}</span></div>)}
          </div>
        </div>
      ))}
    </Modal>
  );
}
