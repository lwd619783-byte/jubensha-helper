import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { Btn, IconBtn, Modal, Seg, Toggle, TypeIcon } from './ui.jsx';
import * as st from './store.js';
import { TYPES, cx } from './util.js';
import { AI_PROVIDERS, aiReady, analyzeImages, getAiCfg, saveAiCfg, testConnection } from './ai.js';
import { applyAiGraph } from './aigraph.js';
import { compress, saveImage } from './images.js';

const MAX_IMAGES = 4;
const blobUrl = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result));
  fr.onerror = () => rej(new Error('图片读取失败'));
  fr.readAsDataURL(blob);
});
const typeLabel = (t) => (TYPES[t] || TYPES.note).label;
const ORDER = ['person', 'place', 'event', 'clue', 'question', 'deduction', 'note'];

/* =========================================================
   AI 设置（弹窗与向导内共用）
   ========================================================= */
export function AiConfigForm({ onDone, onCancel }) {
  const [f, setF] = useState(() => getAiCfg());
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const prov = AI_PROVIDERS.find((p) => p.id === f.provider) || AI_PROVIDERS[0];
  const set = (p) => { setF((x) => ({ ...x, ...p })); if (msg) setMsg(null); };
  const pickProv = (id) => {
    const p = AI_PROVIDERS.find((x) => x.id === id);
    setModels([]);
    setMsg(null);
    setF((x) => ({ ...x, provider: id, base: id === 'custom' ? x.base : p.base }));
  };

  const getModels = async () => {
    if (busy) return;
    setBusy('models'); setMsg(null);
    try {
      const r = await testConnection({ ...f, key: f.key.trim() });
      setModels(r.models || []);
      setMsg({ ok: true, text: r.note || '连接成功' });
      if (!f.model && r.models?.length) {
        const pick = r.models.find((m) => /vl|vision|4o|4\.1|gemini|glm-4|qwen/i.test(m)) || r.models[0];
        set({ model: pick });
      }
    } catch (e) {
      setMsg({ ok: false, text: e?.message || '连接失败', hint: e?.hint });
    } finally {
      setBusy('');
    }
  };
  const test = async () => {
    if (busy) return;
    if (!f.base.trim()) { setMsg({ ok: false, text: '先填写接口地址' }); return; }
    setBusy('test'); setMsg(null);
    try {
      const r = await testConnection({ ...f, key: f.key.trim() });
      setModels(r.models || []);
      setMsg({ ok: true, text: r.note || '连接成功，可以开始识图了' });
    } catch (e) {
      setMsg({ ok: false, text: e?.message || '连接失败', hint: e?.hint });
    } finally {
      setBusy('');
    }
  };
  const save = () => {
    if (!f.base.trim()) { setMsg({ ok: false, text: '先填写接口地址' }); return; }
    if (!f.model.trim()) { setMsg({ ok: false, text: '先填写模型名，或点「获取模型」从列表里选' }); return; }
    if (!f.key.trim() && f.provider !== 'ollama' && f.provider !== 'custom') { setMsg({ ok: false, text: '先填写密钥（本机服务或自建代理不需要时可以留空）' }); return; }
    saveAiCfg({ provider: f.provider, base: f.base.trim(), model: f.model.trim(), key: f.key.trim(), maxEdge: +f.maxEdge || 1600 });
    st.toast('AI 设置已保存');
    onDone?.();
  };

  return (
    <div className="ai-cfg">
      <div className="ai-hintline">
        <Icon name="info" size={14} />
        <span>小助手不经过任何中转服务器：图片只从这台设备直接发给你选择的模型服务商，密钥只存在本机浏览器里。</span>
      </div>

      <div className="ai-field">
        <span className="ai-l">服务商</span>
        <div className="ai-prov">
          {AI_PROVIDERS.map((p) => (
            <button type="button" key={p.id} className={cx('ai-prov-i', p.id === f.provider && 'on')} onClick={() => pickProv(p.id)}>{p.label}</button>
          ))}
        </div>
        <span className="ai-sub">{prov.hint}</span>
      </div>

      <label className="ai-field">
        <span className="ai-l">接口地址</span>
        <input className="in" value={f.base} placeholder="https://…/v1" spellCheck={false} autoComplete="off" onChange={(e) => set({ base: e.target.value })} />
      </label>

      <label className="ai-field">
        <span className="ai-l">密钥</span>
        <div className="ai-keyrow">
          <input className="in" type={showKey ? 'text' : 'password'} value={f.key} placeholder={f.provider === 'ollama' ? '本机 Ollama 不用填' : 'sk-…'} spellCheck={false} autoComplete="off" onChange={(e) => set({ key: e.target.value })} />
          <IconBtn icon="eye" title={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(!showKey)} />
        </div>
      </label>

      <div className="ai-field">
        <span className="ai-l">模型</span>
        <div className="ai-modelrow">
          <input className="in" value={f.model} list="jbs-ai-models" placeholder="选择或填写支持图片的模型" spellCheck={false} autoComplete="off" onChange={(e) => set({ model: e.target.value })} />
          <Btn size="sm" onClick={getModels} disabled={!!busy || !f.base.trim()}>{busy === 'models' ? '读取中…' : '获取模型'}</Btn>
        </div>
        <datalist id="jbs-ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        {!!models.length && <span className="ai-sub">已读取 {models.length} 个模型，输入框有候选；没有视觉能力的模型也能选，但读不出图片里的字。</span>}
      </div>

      <div className="ai-field">
        <span className="ai-l">识别清晰度</span>
        <Seg value={+f.maxEdge} onChange={(v) => set({ maxEdge: v })} options={[{ value: 1024, label: '省流量' }, { value: 1600, label: '推荐' }, { value: 2048, label: '最清楚' }]} />
        <span className="ai-sub">字多、字小的设定页用「最清楚」，但更慢也更贵。</span>
      </div>

      {msg && (
        <div className={cx('ai-msg', msg.ok ? 'ok' : 'bad')}>
          <Icon name={msg.ok ? 'check' : 'alert'} size={14} />
          <span>{msg.text}{msg.hint && <em>{msg.hint}</em>}</span>
        </div>
      )}

      <div className="ai-cfg-acts">
        {onCancel && <Btn size="sm" onClick={onCancel}>取消</Btn>}
        <div className="sp" />
        <Btn size="sm" onClick={test} disabled={!!busy}>{busy === 'test' ? '测试中…' : '测试连接'}</Btn>
        <Btn size="sm" kind="primary" onClick={save}>保存</Btn>
      </div>
    </div>
  );
}

export function AiSettingsModal() {
  return (
    <Modal title="AI 识图设置" onClose={st.closeModal} width={600} className="m-ai">
      <AiConfigForm onDone={st.closeModal} />
    </Modal>
  );
}

/* =========================================================
   AI 读卡 → 自动构图
   ========================================================= */
export function AiWizard() {
  const [stage, setStage] = useState(() => (aiReady() ? 'pick' : 'setup'));
  const [settingsMode, setSettingsMode] = useState(false);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [keep, setKeep] = useState(true);
  const [phase, setPhase] = useState('request');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [on, setOn] = useState(() => new Set());
  const [relsOn, setRelsOn] = useState(() => new Set());
  const [err, setErr] = useState(null);
  const [applying, setApplying] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const ctrl = useRef(null);
  const camRef = useRef(null), fileRef = useRef(null);
  const urls = useRef([]);

  useEffect(() => () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    ctrl.current?.abort();
  }, []);

  const addFiles = (list) => {
    const files = [...list].filter((x) => /^image\//.test(x.type));    if (!files.length) return;
    setItems((prev) => {
      const room = MAX_IMAGES - prev.length;
      if (room <= 0) { st.toast(`一次最多识别 ${MAX_IMAGES} 张，多余的可以分开两次`); return prev; }
      if (files.length > room) st.toast(`一次最多识别 ${MAX_IMAGES} 张，已取前 ${room} 张`);
      const next = files.slice(0, room).map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return { file, url };
      });
      return [...prev, ...next];
    });
  };
  const removeAt = (i) => setItems((prev) => prev.filter((_, j) => j !== i));
  const openSettings = () => { setSettingsMode(true); setStage('setup'); };

  useEffect(() => {
    if (stage !== 'pick') return;
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((x) => /^image\//.test(x.type));
      if (files.length) { e.preventDefault(); e.stopPropagation(); addFiles(files); }
    };
    addEventListener('paste', onPaste, true);
    return () => removeEventListener('paste', onPaste, true);
  }, [stage]);

  const run = async () => {
    if (!items.length) return;
    if (!aiReady()) { openSettings(); return; }
    const c = new AbortController();
    ctrl.current = c;
    setErr(null); setResult(null); setStage('run'); setPhase('compress'); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 400);
    try {
      const cfg = getAiCfg();
      const images = [];
      for (const it of items) {
        const { blob } = await compress(it.file, +cfg.maxEdge || 1600, 0.86);
        images.push(await blobUrl(blob));
      }
      setPhase('request');
      const r = await analyzeImages({ images, note, cfg, signal: c.signal, onPhase: setPhase });
      setResult(r);
      setOn(new Set(r.cards.map((x) => x.key)));
      setRelsOn(new Set(r.relations.map((x) => x.from + '>' + x.to)));
      setStage('review');
    } catch (e) {
      if (e?.message === '已取消' || e?.name === 'AbortError') { setStage('pick'); return; }
      setErr(e || new Error('分析失败'));
      setStage('error');
    } finally {
      clearInterval(timer);
      ctrl.current = null;
    }
  };

  const cancelRun = () => { ctrl.current?.abort(); };

  const groups = useMemo(() => {
    if (!result) return [];
    const map = new Map();
    for (const c of result.cards) {
      if (!map.has(c.type)) map.set(c.type, []);
      map.get(c.type).push(c);
    }
    return ORDER.filter((t) => map.has(t)).map((t) => [t, map.get(t)]);
  }, [result]);

  const relList = useMemo(() => {
    if (!result) return [];
    const byKey = new Map(result.cards.map((c) => [c.key, c]));
    return result.relations.map((r) => ({ ...r, k: r.from + '>' + r.to, a: byKey.get(r.from), b: byKey.get(r.to) })).filter((r) => r.a && r.b);
  }, [result]);

  const pickedCards = result ? result.cards.filter((c) => on.has(c.key)) : [];
  const pickedRels = relList.filter((r) => relsOn.has(r.k) && on.has(r.from) && on.has(r.to));

  const toggleCard = (key) => setOn((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleGroup = (arr) => setOn((s) => {
    const n = new Set(s);
    const all = arr.every((c) => n.has(c.key));
    arr.forEach((c) => (all ? n.delete(c.key) : n.add(c.key)));
    return n;
  });
  const toggleRel = (k) => setRelsOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const patchCard = (key, patch) => setResult((prev) => (prev ? { ...prev, cards: prev.cards.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : prev));

  const apply = async () => {
    if (!pickedCards.length || applying) return;
    setApplying(true);
    const ids = [];
    try {
      if (keep) for (const it of items) ids.push(await saveImage(it.file));
    } catch {}
    setApplying(false);
    const r = applyAiGraph(result, { selectedCards: on, selectedRelations: relsOn, imageIds: ids, keepImages: keep && ids.length > 0 });
    if (!r) { st.toast('没有可加入导图的卡片'); return; }
    st.closeModal();
  };

  const head = stage === 'setup' ? (settingsMode ? 'AI 识图设置' : '先接上 AI') : stage === 'run' ? '正在读卡' : stage === 'review' ? '核对识别结果' : stage === 'error' ? '这次没读成功' : 'AI 读卡构图';
  const foot = stage === 'pick' ? (
    <>
      <button type="button" className="linkbtn" onClick={openSettings}>AI 设置</button>
      <div className="sp" />
      <Btn onClick={st.closeModal}>取消</Btn>
      <Btn kind="primary" icon="sparkle" disabled={!items.length} onClick={run}>开始分析</Btn>
    </>
  ) : stage === 'review' && result ? (
    <>
      <button type="button" className="linkbtn" onClick={() => setStage('pick')}>返回照片</button>
      <div className="sp" />
      <Btn kind="primary" icon="map" disabled={!pickedCards.length || applying} onClick={apply}>{applying ? '正在加入…' : `加入导图（${pickedCards.length} 张${pickedRels.length ? ` · ${pickedRels.length} 条关系` : ''}）`}</Btn>
    </>
  ) : null;

  return (
    <Modal title={head} onClose={() => { cancelRun(); st.closeModal(); }} width={760} className={cx('m-ai', 'ai-' + stage)} footer={foot}>
      {stage === 'setup' && (
        <div className="ai-setup">
          {!settingsMode && (
            <>
              <p className="ai-lede">把线索卡拍下来，AI 会读出上面的人物、线索、时间和关系，直接摆到导图上。</p>
              <p className="ai-lede-sub">需要你提供一个支持图片的模型接口。密钥只保存在这台设备的浏览器里，随时可以在侧栏「AI 设置」里更换。</p>
            </>
          )}
          <AiConfigForm
            onDone={() => { setSettingsMode(false); setStage('pick'); }}
            onCancel={settingsMode ? () => { setSettingsMode(false); setStage('pick'); } : st.closeModal}
          />
        </div>
      )}

      {stage === 'pick' && (
        <div className="ai-pick">
          {!aiReady() && (
            <button type="button" className="ai-warn" onClick={openSettings}>
              <Icon name="alert" size={15} /><span>还没配置 AI 接口，点这里填密钥和模型。</span><Icon name="chevR" size={14} />
            </button>
          )}
          <div className={cx('ai-drop', items.length && 'has')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            {items.length ? (
              <div className="ai-thumbs">
                {items.map((it, i) => (
                  <figure className="ai-thumb" key={it.url}>
                    <img src={it.url} alt={`线索卡 ${i + 1}`} />
                    <button type="button" className="ai-thumb-x" onClick={() => removeAt(i)} aria-label="移除这张照片"><Icon name="x" size={12} /></button>
                  </figure>
                ))}
                {items.length < MAX_IMAGES && (
                  <button type="button" className="ai-thumb-add" onClick={() => fileRef.current?.click()}><Icon name="plus" size={18} /><span>再加一张</span></button>
                )}
              </div>
            ) : (
              <div className="ai-drop-in">
                <span className="ai-drop-ic"><Icon name="scan" size={26} /></span>
                <b>把线索卡放在画面里，拍一张</b>
                <span>一次 1–{MAX_IMAGES} 张。设定页文字多，可以分成几页拍；也可以直接把截图粘贴进来。</span>
                <span className="ai-drop-note"><Icon name="info" size={13} />点「开始分析」后，照片会直接发给你设置的 AI 服务商；结果先给你核对，确认后才写入导图。</span>
                <div className="ai-drop-acts">
                  <Btn icon="camera" kind="primary" onClick={() => camRef.current?.click()}>拍照</Btn>
                  <Btn icon="image" onClick={() => fileRef.current?.click()}>选择照片</Btn>
                </div>
              </div>
            )}
          </div>
          {items.length > 0 && (
            <div className="ai-addmore">
              <Btn size="sm" icon="camera" onClick={() => camRef.current?.click()}>拍照</Btn>
              <Btn size="sm" icon="image" onClick={() => fileRef.current?.click()}>从相册选</Btn>
              <span className="ai-sub">已选 {items.length} / {MAX_IMAGES}</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <label className="ai-field">
            <span className="ai-l">补充说明 <em className="ai-opt">可选</em></span>
            <textarea className="ta" rows={2} value={note} maxLength={300} placeholder="比如：这是第二幕；卡面上的「他」指顾老爷；时间看不清" onChange={(e) => setNote(e.target.value)} />
          </label>
          {items.length > 0 && <div className="ai-tip"><Icon name="info" size={13} /><span>照片会发给你设置的 AI 服务商；结果先给你核对，确认后才写入导图。</span></div>}
        </div>
      )}

      {stage === 'run' && (
        <div className="ai-run">
          <div className="ai-scan"><span className="ai-scan-ring" /><Icon name="scan" size={30} /></div>
          <b>{phase === 'compress' ? '正在压缩照片' : phase === 'parse' ? '正在整理成导图结构' : '正在读图、找人物和线索'}</b>
          <p className="muted small">{phase === 'compress' ? '把照片缩到适合模型识别的尺寸' : phase === 'parse' ? '把模型返回的内容拆成卡片和关系' : '文字越多、照片越多，等待越久；通常 10–40 秒'}</p>
          <div className="ai-elapsed"><span>{elapsed} 秒</span>{items.length > 1 && <span>· {items.length} 张照片</span>}</div>
          {!!items.length && <div className="ai-mini">{items.map((it) => <img key={it.url} src={it.url} alt="" />)}</div>}
          <Btn onClick={cancelRun}>取消</Btn>
        </div>
      )}

      {stage === 'review' && result && (
        <div className="ai-review">
          <div className="ai-sum">
            <div className="ai-sum-t">
              <span className="ai-sum-ic"><Icon name="sparkle" size={16} /></span>
              <div>
                <b>{result.title}</b>
                {result.summary && <p>{result.summary}</p>}
                <span className="ai-sum-hint">标题、时间和原文都可以直接改，再决定加不加入</span>
              </div>
            </div>
            <span className="ai-count">{pickedCards.length} 张卡片 · {pickedRels.length} 条关系</span>
          </div>

          <div className="ai-list">
            {groups.map(([type, arr]) => {
              const all = arr.every((c) => on.has(c.key));
              return (
                <section className="ai-group" key={type}>
                  <div className="ai-gh">
                    <TypeIcon type={type} size={11} />
                    <span>{typeLabel(type)}</span>
                    <em>{arr.filter((c) => on.has(c.key)).length}/{arr.length}</em>
                    <button type="button" className={cx('ai-gck', all && 'on')} onClick={() => toggleGroup(arr)} title={all ? '取消这一组' : '选中这一组'} aria-label={all ? '取消这一组' : '选中这一组'}>
                      <span className="ai-gck-box">{all && <Icon name="check" size={10} sw={3.2} />}</span>
                    </button>
                  </div>
                  {arr.map((c) => (
                    <div key={c.key} className={cx('ai-row', on.has(c.key) && 'on', editKey === c.key && 'editing')}>
                      <button type="button" role="checkbox" aria-checked={on.has(c.key)} className={cx('ai-ck', on.has(c.key) && 'on')} onClick={() => toggleCard(c.key)} aria-label={on.has(c.key) ? '取消这张卡' : '选中这张卡'}>
                        {on.has(c.key) && <Icon name="check" size={12} sw={3} />}
                      </button>
                      <div className="ai-row-main">
                        <button type="button" className="ai-row-hit" onClick={() => toggleCard(c.key)}>
                          <span className="ai-row-t">{c.title}</span>
                          {c.body && <span className="ai-row-b">{c.body}</span>}
                          <span className="ai-row-m">
                            {c.time && <span className="chip"><Icon name="clock" size={11} />{c.time}{c.timeEnd ? '–' + c.timeEnd : ''}</span>}
                            {c.place && <span className="chip place"><Icon name="pin" size={11} />{c.place}</span>}
                            {(c.persons || []).slice(0, 4).map((p) => <span key={p} className="chip"><Icon name="user" size={11} />{p}</span>)}
                            {(c.tags || []).slice(0, 3).map((t) => <span key={t} className="chip subtle">#{t}</span>)}
                            {c.note && <span className="ai-note" title={c.note}><Icon name="info" size={11} />{c.note}</span>}
                          </span>
                        </button>
                        {editKey === c.key && (
                          <div className="ai-edit">
                            <label className="ai-edit-f"><span>标题</span><input className="in sm" value={c.title} maxLength={60} onChange={(e) => patchCard(c.key, { title: e.target.value })} /></label>
                            <div className="ai-edit-2">
                              <label className="ai-edit-f"><span>时间</span><input className="in sm" value={c.time} placeholder="21:10" maxLength={5} onChange={(e) => patchCard(c.key, { time: e.target.value })} /></label>
                              <label className="ai-edit-f"><span>结束</span><input className="in sm" value={c.timeEnd} placeholder="可空" maxLength={5} onChange={(e) => patchCard(c.key, { timeEnd: e.target.value })} /></label>
                            </div>
                            <label className="ai-edit-f"><span>原文</span><textarea className="ta" rows={2} value={c.body} maxLength={900} onChange={(e) => patchCard(c.key, { body: e.target.value })} /></label>
                            <div className="ai-edit-acts"><span className="ai-sub">改完点「加入导图」生效</span><Btn size="sm" onClick={() => setEditKey(null)}>完成</Btn></div>
                          </div>
                        )}
                      </div>
                      <IconBtn icon="pen" className={cx('ai-edit-btn', editKey === c.key && 'on')} title={editKey === c.key ? '收起修改' : '修改识别结果'} onClick={() => setEditKey(editKey === c.key ? null : c.key)} />
                    </div>
                  ))}
                </section>
              );
            })}
            {!relList.length && <div className="ai-empty-rel">这次没有识别出明确的人物/线索关系，只生成卡片。</div>}
            {!!relList.length && (
              <section className="ai-group">
                <div className="ai-gh"><Icon name="link" size={12} /><span>关系</span><em>{pickedRels.length}/{relList.length}</em></div>
                {relList.map((r) => (
                  <div key={r.k} className={cx('ai-row', relsOn.has(r.k) && on.has(r.from) && on.has(r.to) && 'on')}>
                    <button type="button" role="checkbox" aria-checked={relsOn.has(r.k)} className={cx('ai-ck', relsOn.has(r.k) && 'on')} onClick={() => toggleRel(r.k)} aria-label="切换这条关系">
                      {relsOn.has(r.k) && <Icon name="check" size={12} sw={3} />}
                    </button>
                    <button type="button" className="ai-row-main ai-rel" onClick={() => toggleRel(r.k)}>
                      <span className={cx('ai-rel-l', r.style)}>{r.a.title}</span>
                      <span className={cx('ai-rel-x', r.style)}>{r.style === 'conflict' ? '≠' : '→'}<em>{r.label}</em></span>
                      <span className="ai-rel-l">{r.b.title}</span>
                    </button>
                  </div>
                ))}
              </section>
            )}
          </div>

          <div className="ai-review-foot">
            <Toggle value={keep} onChange={setKeep} label="保留原图" />
            <span className="ai-sub">存成一张「原图」卡片，方便以后核对</span>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="ai-error">
          <span className="ai-error-ic"><Icon name="alert" size={22} /></span>
          <b>{err?.message || '分析失败'}</b>
          {err?.hint && <p>{err.hint}</p>}
          <div className="ai-error-acts">
            <Btn icon="refresh" onClick={run} disabled={!items.length}>重试</Btn>
            <Btn onClick={() => setStage('pick')}>换照片</Btn>
            <Btn icon="key" onClick={openSettings}>检查 AI 设置</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
