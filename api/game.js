// Online games: the server holds each game in Redis, applies every move with the shared rules,
// and sends each player a view without the secret word (the word picker sees it, guessers see blanks).
import { act, newGame, logIt, wordOf, isLetter, isPicker, teamsOn, AVATAR_KEYS } from '../public/logic.js';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL = 24 * 3600;
const MAX_PLAYERS = 12;
const ONLINE_MS = 25000;
const REACTS = ['👏', '😂', '😱', '🔥', '🤔', '💀'];
const MOVES = ['guess', 'solve', 'setword', 'skip', 'next', 'start', 'again', 'settings', 'team', 'shuffle'];
const CHAT_KEEP = 60;
// Writes the game only if nobody else wrote it since we read it, so simultaneous guesses never overwrite each other.
const CAS = "local v = redis.call('GET', KEYS[2]) if (v or '0') == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4]) redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]) return 1 end return 0";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function redis(path, body) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new HttpError(503, 'Online play is not set up yet: the game database is not connected.');
  const r = await fetch(REDIS_URL + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j;
}
const cmd = async (...args) => (await redis('', args)).result;
async function pipeline(cmds) {
  const out = await redis('/pipeline', cmds);
  return out.map(x => { if (x.error) throw new Error('Redis: ' + x.error); return x.result; });
}

const gKey = c => 'g:' + c, vKey = c => 'v:' + c, rxKey = c => 'rx:' + c, prKey = c => 'pr:' + c;
const chKey = (c, ch) => 'ch:' + c + ':' + ch;
// In teams mode each team talks in its own channel, so the guessers never see the pickers discussing the word.
function channelOf(G, id) { return teamsOn(G) && G.teams && G.teams[id] ? 'team-' + G.teams[id] : 'all'; }

async function playerId(key) {
  if (typeof key !== 'string' || !/^[a-z0-9]{16,64}$/.test(key)) throw new HttpError(400, 'Missing player key. Reload the page and try again.');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hangtime:' + key));
  return 'p' + [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
function cleanCode(c) {
  const code = String(c || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) throw new HttpError(400, 'Game codes have 4 letters.');
  return code;
}
function cleanNick(n) {
  const nick = String(n || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').trim().slice(0, 20);
  if (!nick) throw new HttpError(400, 'Add your name first so your friends know who you are.');
  return nick;
}
const cleanAvatar = a => AVATAR_KEYS.includes(a) ? a : null;
function genCode() {
  const A = 'BCDFGHJKLMNPQRSTVWXZ', b = new Uint32Array(4);
  crypto.getRandomValues(b);
  return [...b].map(x => A[x % A.length]).join('');
}

async function load(code) {
  const raw = await cmd('GET', gKey(code));
  if (!raw) throw new HttpError(404, 'No game with code ' + code + '. It may have expired, or the letters are off.');
  return JSON.parse(raw);
}
// Read, change, and write back with a compare-and-set, retrying when another move landed first.
async function update(code, fn) {
  for (let i = 0; i < 8; i++) {
    const [raw, v] = await cmd('MGET', gKey(code), vKey(code));
    if (!raw) throw new HttpError(404, 'No game with code ' + code + '. It may have expired, or the letters are off.');
    const G = JSON.parse(raw);
    const next = fn(G);
    if (!next) return G;
    next.version = (Number(v) || 0) + 1;
    next.updatedAt = Date.now();
    const ok = await cmd('EVAL', CAS, '2', gKey(code), vKey(code), String(v || '0'), JSON.stringify(next), String(next.version), String(TTL));
    if (ok === 1) return next;
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new HttpError(409, 'The game is busy. Try that again.');
}

function view(G, id) {
  const w = wordOf(G);
  const ended = G.status === 'over' || G.status === 'done';
  const v = Object.assign({}, G);
  delete v.secret; delete v.usedH;
  v.shown = [...w].map(ch => isLetter(ch) && !ended && !G.guessed.includes(ch) ? '?' : ch).join('');
  v.mine = !ended && isPicker(G, id) ? w : '';
  v.answer = ended ? G.answer : '';
  v.me = id;
  return v;
}

async function handlePost(body) {
  const id = await playerId(body.key);
  const op = body.op;
  if (op === 'create') {
    const nick = cleanNick(body.nick);
    for (let i = 0; i < 8; i++) {
      const code = genCode();
      const avatar = cleanAvatar(body.avatar);
      const G = newGame('online', { code, host: id, order: [id], nicks: { [id]: nick }, teams: { [id]: 'a' }, avatars: avatar ? { [id]: avatar } : {}, settings: body.mode === 'teams' ? { mode: 'teams' } : {} });
      G.scores[id] = 0;
      logIt(G, { k: 'join', by: id });
      const ok = await cmd('SET', gKey(code), JSON.stringify(G), 'NX', 'EX', String(TTL));
      if (ok === 'OK') { await cmd('SET', vKey(code), '1', 'EX', String(TTL)); return { code, game: view(G, id) }; }
    }
    throw new HttpError(503, 'Could not find a free game code. Try again.');
  }
  const code = cleanCode(body.code);
  if (op === 'join') {
    const nick = cleanNick(body.nick);
    const avatar = cleanAvatar(body.avatar);
    const G = await update(code, G => {
      const inGame = G.order.includes(id);
      if (!inGame && G.status === 'done') throw new HttpError(410, 'That game has finished. Ask your friend for a new code.');
      if (!inGame && G.order.length >= MAX_PLAYERS) throw new HttpError(409, 'That game is full (' + MAX_PLAYERS + ' players).');
      if (inGame && G.nicks[id] === nick && (!avatar || (G.avatars || {})[id] === avatar)) return null;
      const next = inGame ? JSON.parse(JSON.stringify(G)) : act(G, { t: 'join', id }, id);
      next.nicks = Object.assign({}, next.nicks, { [id]: nick });
      if (avatar) next.avatars = Object.assign({}, next.avatars, { [id]: avatar });
      return next;
    });
    return { game: view(G, id) };
  }
  if (op === 'nick') {
    const nick = cleanNick(body.nick);
    const avatar = cleanAvatar(body.avatar);
    const G = await update(code, G => {
      if (!G.order.includes(id) || (G.nicks[id] === nick && (!avatar || (G.avatars || {})[id] === avatar))) return null;
      const next = JSON.parse(JSON.stringify(G));
      next.nicks[id] = nick;
      if (avatar) next.avatars = Object.assign({}, next.avatars, { [id]: avatar });
      return next;
    });
    return { game: view(G, id) };
  }
  if (op === 'leave') {
    const G = await update(code, G => act(G, { t: 'leave', id }, id));
    if (!G.order.length) await pipeline([['DEL', gKey(code)], ['DEL', vKey(code)], ['DEL', rxKey(code)], ['DEL', prKey(code)]]);
    return { ok: true };
  }
  if (op === 'act') {
    const a = body.action || {};
    if (!MOVES.includes(a.t)) throw new HttpError(400, 'Unknown move.');
    let refused = false;
    const G = await update(code, G => {
      if (!G.order.includes(id)) throw new HttpError(403, 'You are not in this game. Join it again from the home screen.');
      const next = act(G, a, id);
      if (!next) refused = true;
      return next;
    });
    return { game: view(G, id), refused };
  }
  if (op === 'chat') {
    const G = await load(code);
    if (!G.order.includes(id)) throw new HttpError(403, 'You are not in this game.');
    const text = String(body.text || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 200);
    if (!text) throw new HttpError(400, 'Type a message first.');
    const key = chKey(code, channelOf(G, id));
    await pipeline([['RPUSH', key, JSON.stringify({ id, text, t: Date.now() })], ['LTRIM', key, String(-CHAT_KEEP), '-1'], ['EXPIRE', key, String(TTL)]]);
    return { ok: true };
  }
  if (op === 'react' || op === 'nudge') {
    const G = await load(code);
    if (!G.order.includes(id)) throw new HttpError(403, 'You are not in this game.');
    const now = Date.now();
    const entry = op === 'react' ? { k: 'react', id, e: body.e, t: now } : { k: 'nudge', id, to: String(body.to || ''), t: now };
    if (op === 'react' && !REACTS.includes(body.e)) throw new HttpError(400, 'Unknown reaction.');
    const raw = await cmd('GET', rxKey(code));
    const list = (raw ? JSON.parse(raw) : []).filter(x => now - x.t < 20000).slice(-15);
    list.push(entry);
    await cmd('SET', rxKey(code), JSON.stringify(list), 'EX', '60');
    return { ok: true };
  }
  throw new HttpError(400, 'Unknown request.');
}

async function handleGet(url) {
  const id = await playerId(url.searchParams.get('key'));
  const code = cleanCode(url.searchParams.get('code'));
  const since = Number(url.searchParams.get('v')) || 0;
  const rxSince = Number(url.searchParams.get('rx')) || 0;
  const hb = url.searchParams.get('hb') === '1';
  const askCh = String(url.searchParams.get('ch') || 'all');
  const chSince = Number(url.searchParams.get('ct')) || 0;
  if (!['all', 'team-a', 'team-b'].includes(askCh)) throw new HttpError(400, 'Unknown chat channel.');
  const now = Date.now();
  // The chat read rides in the same round trip; it is only returned if it really is this player's channel.
  const cmds = [['GET', gKey(code)], ['GET', rxKey(code)], ['LRANGE', chKey(code, askCh), String(-CHAT_KEEP), '-1']];
  if (hb) cmds.push(['HSET', prKey(code), id, String(now)], ['EXPIRE', prKey(code), String(TTL)], ['HGETALL', prKey(code)]);
  const res = await pipeline(cmds);
  if (!res[0]) throw new HttpError(404, 'This game has ended or expired.');
  const G = JSON.parse(res[0]);
  const out = { now, v: G.version };
  if (G.version !== since) out.game = view(G, id);
  out.rx = (res[1] ? JSON.parse(res[1]) : []).filter(x => x.t > rxSince);
  out.channel = channelOf(G, id);
  if (out.channel === askCh && G.order.includes(id)) out.chat = (res[2] || []).map(x => JSON.parse(x)).filter(m => m.t > chSince);
  if (hb) {
    const flat = res[5] || [];
    const online = [];
    for (let i = 0; i + 1 < flat.length; i += 2) if (now - Number(flat[i + 1]) < ONLINE_MS) online.push(flat[i]);
    out.online = online;
  }
  return out;
}

function reply(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function guard(fn) {
  try { return reply(await fn()); }
  catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message }, e.status);
    console.error(e);
    return reply({ error: 'Something went wrong on the server. Try again in a moment.' }, 500);
  }
}

export async function GET(request) { return guard(() => handleGet(new URL(request.url))); }
export async function POST(request) {
  return guard(async () => {
    let body;
    try { body = await request.json(); } catch (e) { throw new HttpError(400, 'Bad request.'); }
    return handlePost(body || {});
  });
}
