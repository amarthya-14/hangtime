// In-memory stand-in for the Upstash REST API, covering the commands api/game.js uses.
const db = new Map(), hashes = new Map(), lists = new Map();
const slice = (arr, start, stop) => {
  const n = arr.length;
  let a = Number(start), b = Number(stop);
  if (a < 0) a = Math.max(0, n + a);
  if (b < 0) b = n + b;
  return arr.slice(a, b + 1);
};
export function run(c) {
  const [op, ...a] = c;
  switch (op) {
    case 'GET': return db.get(a[0]) ?? null;
    case 'MGET': return a.map(k => db.get(k) ?? null);
    case 'SET': { if (a.includes('NX') && db.has(a[0])) return null; db.set(a[0], a[1]); return 'OK'; }
    case 'DEL': db.delete(a[0]); hashes.delete(a[0]); lists.delete(a[0]); return 1;
    case 'EXPIRE': return 1;
    case 'HSET': { const h = hashes.get(a[0]) || {}; h[a[1]] = a[2]; hashes.set(a[0], h); return 1; }
    case 'HGETALL': return Object.entries(hashes.get(a[0]) || {}).flat();
    case 'RPUSH': { const l = lists.get(a[0]) || []; l.push(...a.slice(1)); lists.set(a[0], l); return l.length; }
    case 'LTRIM': { lists.set(a[0], slice(lists.get(a[0]) || [], a[1], a[2])); return 'OK'; }
    case 'LRANGE': return slice(lists.get(a[0]) || [], a[1], a[2]);
    case 'EVAL': { // the compare-and-set script
      const [, , k1, k2, expect, val, ver] = a;
      if ((db.get(k2) ?? '0') !== expect) return 0;
      db.set(k1, val); db.set(k2, ver); return 1;
    }
  }
  throw new Error('unsupported ' + op);
}
export function installFakeRedis(base, delay) {
  process.env.UPSTASH_REDIS_REST_URL = base;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'local';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(base)) return realFetch(url, init);
    if (delay) await new Promise(r => setTimeout(r, Math.random() * delay)); // let concurrent requests interleave
    const body = JSON.parse(init.body);
    const result = String(url).endsWith('/pipeline') ? body.map(cmd => ({ result: run(cmd) })) : { result: run(body) };
    return { ok: true, status: 200, json: async () => result };
  };
}
