const NAME = 'jbs-helper', VER = 1, STORES = ['games', 'images', 'meta'];
const mem = { games: new Map(), images: new Map(), meta: new Map() };
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        STORES.forEach((s) => d.objectStoreNames.contains(s) || d.createObjectStore(s));
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}
async function run(s, mode, op, memOp) {
  const d = await open();
  if (!d) return memOp(mem[s]);
  return new Promise((res, rej) => {
    const t = d.transaction(s, mode);
    const r = op(t.objectStore(s));
    let v;
    if (r) r.onsuccess = () => (v = r.result);
    t.oncomplete = () => res(v);
    t.onerror = t.onabort = () => rej(t.error || new Error('数据库错误'));
  });
}
export const get = (s, k) => run(s, 'readonly', (o) => o.get(k), (m) => m.get(k));
export const put = (s, k, v) => run(s, 'readwrite', (o) => o.put(v, k), (m) => void m.set(k, v));
export const del = (s, k) => run(s, 'readwrite', (o) => o.delete(k), (m) => void m.delete(k));
export const keys = (s) => run(s, 'readonly', (o) => o.getAllKeys(), (m) => [...m.keys()]);
export const all = (s) => run(s, 'readonly', (o) => o.getAll(), (m) => [...m.values()]);
export async function isMemory() { return !(await open()); }
