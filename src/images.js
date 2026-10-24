import { useEffect, useState } from 'react';
import * as db from './db.js';
import { uid } from './util.js';

const urls = new Map();
let arch = null;
export function setArchiveImages(m) { arch = m || {}; }
export async function loadImg(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  if (arch) {
    const u = arch[id] || null;
    if (u) urls.set(id, u);
    return u;
  }
  const rec = await db.get('images', id).catch(() => null);
  if (!rec?.blob) return null;
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  return u;
}
export function useImg(id) {
  const [u, setU] = useState(() => urls.get(id) || null);
  useEffect(() => {
    let on = true;
    if (!id) return;
    if (urls.has(id)) setU(urls.get(id));
    else loadImg(id).then((x) => on && setU(x));
    return () => { on = false; };
  }, [id]);
  return u;
}
export async function compress(file, max = 2048, q = 0.85) {
  let src, w, h;
  try {
    src = await createImageBitmap(file);
    w = src.width; h = src.height;
  } catch {
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('无法读取图片'));
      im.src = URL.createObjectURL(file);
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  if (!w || !h) throw new Error('无法读取图片');
  const s = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, cw, ch);
  x.drawImage(src, 0, 0, cw, ch);
  src.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  if (!blob) throw new Error('图片压缩失败');
  return { blob, w: cw, h: ch };
}
export async function saveImage(file) {
  const { blob, w, h } = await compress(file);
  const id = 'img_' + uid();
  await db.put('images', id, { blob, w, h, at: Date.now() });
  urls.set(id, URL.createObjectURL(blob));
  return id;
}
export async function imgDataURL(id) {
  if (arch) return arch[id] || null;
  const rec = await db.get('images', id).catch(() => null);
  if (!rec?.blob) return null;
  return new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.onerror = () => r(null);
    fr.readAsDataURL(rec.blob);
  });
}
export async function putDataURL(id, url) {
  const blob = await (await fetch(url)).blob();
  await db.put('images', id, { blob, at: Date.now() });
  urls.delete(id);
}
export function loadEl(url) {
  return new Promise((r) => {
    if (!url) return r(null);
    const im = new Image();
    im.onload = () => r(im);
    im.onerror = () => r(null);
    im.src = url;
  });
}
export function imageIdsOf(g) {
  const s = new Set();
  g.cards.forEach((c) => (c.imageIds || []).forEach((i) => s.add(i)));
  (g.verdict?.photoIds || []).forEach((i) => s.add(i));
  return [...s];
}
export async function gcImages(games) {
  if (arch) return;
  const used = new Set();
  games.forEach((g) => imageIdsOf(g).forEach((i) => used.add(i)));
  const ks = await db.keys('images').catch(() => []);
  for (const k of ks) if (!used.has(k)) await db.del('images', k).catch(() => {});
}
