import {
  AVATARS, AVATAR_KEYS, cleanLabel, TEAM_IDS, teamsOn, otherTeam, membersOf, isPicker,
  CATS, CAT_KEYS, ALL, isLetter, normalize, hiddenCount, hash32, validateWord, pickWord,
  wordOf, newGame, setSecret, canGuess, guessersOf, roundsEach, timerSecs, act
} from './logic.js';

// ---------- helpers ----------
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => n === 1 ? one : many;
const store = {
  get(k, d) { try { const v = localStorage.getItem('hangtime:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hangtime:' + k, JSON.stringify(v)); } catch (e) {} }
};
const catLabel = c => (CATS[c] && CATS[c].label) || (c ? String(c) : 'Mixed');
const CAT_SUGGEST = ['Movie', 'Animal', 'Food', 'Place', 'Sport', 'Person', 'Thing', 'Song', 'Brand', 'Game'];
const initials = n => (String(n || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2) || '?');
// Quick reactions float up everyone's screen as a big 3D emoji with the sender's name (3D icons: Fluent Emoji, MIT).
const QUICK = { nice: ['Nice!', 'clap'], close: ['So close!', 'shock'], gg: ['GG', 'party'], hurry: ['Hurry up!', 'hurry'], oops: ['Oops!', 'oops'], haha: ['Haha', 'laugh'], wow: ['Wow!', 'wow'], love: ['Love it', 'heart'] };
const REACTS = Object.keys(QUICK);
const reactImg = k => '<img src="/reactions/' + QUICK[k][1] + '.png" alt="" draggable="false">';
function reactDock(G) {
  if (G.kind !== 'online' || !ON) return '';
  return '<div class="dock" role="group" aria-label="Send a reaction">' + REACTS.map(e =>
    '<button class="dock-btn" data-act="react" data-e="' + e + '" aria-label="' + QUICK[e][0] + '">' + reactImg(e) + '<span class="dock-tip" aria-hidden="true">' + QUICK[e][0] + '</span></button>').join('') + '</div>';
}
function flyReaction(id, k) {
  const G = ON && ON.game;
  if (!G || !QUICK[k]) return;
  SND.play('pop');
  const who = id === ME.id ? 'You' : nameOf(G, id);
  if (reduceMotion()) { toast(who + ': ' + QUICK[k][0]); return; }
  // Reactions rise through the empty space under the side panel, or up the right edge on a phone, never over the board.
  const dock = [...document.querySelectorAll('.dock')].find(d => d.offsetParent);
  const rail = dock && dock.closest('.rail');
  let x, rise;
  if (rail) {
    const r = rail.getBoundingClientRect();
    x = r.left + 60 + Math.random() * Math.max(0, r.width - 120);
    rise = Math.max(150, innerHeight - r.bottom - 120);
  } else {
    x = Math.min(innerWidth - 80, innerWidth * (.66 + Math.random() * .16));
    rise = innerHeight * .5;
  }
  const layer = $('#flyers');
  const el = document.createElement('div');
  el.className = 'fly' + (rail ? ' side' : '') + (id === ME.id ? ' mine' : '');
  el.style.left = x + 'px';
  el.style.setProperty('--rise', Math.round(rise) + 'px');
  el.innerHTML = '<div class="fly-sway" style="animation-delay:-' + Math.round(Math.random() * 1600) + 'ms">' + reactImg(k) +
    '<span class="fly-tag">' + avatarImg(avatarKeyOf(G, id)) + '<b>' + esc(who) + '</b>' + QUICK[k][0] + '</span></div>';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3400);
  // A small burst of copies fans out from where the big one starts.
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = x + 'px';
    s.style.setProperty('--dx', Math.round((Math.random() - .5) * 140) + 'px');
    s.style.setProperty('--dy', -Math.round(Math.min(rise, 100 + Math.random() * 180)) + 'px');
    s.style.setProperty('--r', Math.round((Math.random() - .5) * 90) + 'deg');
    s.style.animationDelay = Math.round(Math.random() * 180) + 'ms';
    s.innerHTML = reactImg(k);
    layer.appendChild(s);
    setTimeout(() => s.remove(), 2000);
  }
}
const API = '/api/game';
const TEAM = { a: { name: 'Red', color: 'var(--p2)' }, b: { name: 'Blue', color: 'var(--p1)' } };
const teamName = t => (TEAM[t] ? TEAM[t].name : '') + ' team';

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 17h.01"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

// ---------- identity ----------
// Each browser keeps a private key; the server derives the public player id from it, so nobody can move as someone else.
function newKey() { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 24); }
const KEY = (() => { let k = store.get('key', ''); if (!/^[a-z0-9]{16,64}$/.test(k)) { k = newKey(); store.set('key', k); } return k; })();
const ME = { id: null };
async function deriveId() {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hangtime:' + KEY));
  ME.id = 'p' + [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- state ----------
const params = new URLSearchParams(location.search);
const S = {
  view: 'home', kind: null, solo: null, local: null, modal: null,
  setup: Object.assign({ teams: [] }, store.get('setup', { names: ['', ''], settings: { mode: 'each', source: 'friends', category: 'any', maxMisses: 6, rounds: 0 } })),
  practiceCat: CATS[store.get('practiceCat', 'any')] ? store.get('practiceCat', 'any') : 'any', solveOpen: false, reveal: false, showWord: false,
  err: '', busy: false, invite: (params.get('g') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4), clear: []
};
let ON = null;
const fx = { mask: {}, misses: {}, wrong: {}, score: {}, seen: {}, lastGuess: {}, chatSeen: 0 };
let STATS = store.get('stats', { played: 0, won: 0, streak: 0, best: 0, dist: {}, last: null });

// ---------- sound ----------
const SND = {
  on: store.get('sound', true), ctx: null,
  unlock() { if (!this.on || this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  play(kind) {
    if (!this.on) return;
    try {
      this.unlock(); const c = this.ctx; if (!c) return;
      if (c.state === 'suspended') c.resume();
      const seq = {
        hit: [[660, 0, .09], [990, .06, .14]], miss: [[170, 0, .22]], tick: [[880, 0, .06]],
        win: [[523, 0, .12], [659, .1, .12], [784, .2, .12], [1047, .3, .3]], lose: [[311, 0, .22], [233, .2, .4]],
        nudge: [[740, 0, .08], [740, .15, .08]], pop: [[520, 0, .05]]
      }[kind] || [];
      const t0 = c.currentTime;
      for (const [f, dt, dur] of seq) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = (kind === 'miss' || kind === 'lose') ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.25 : 0.14, t0 + dt + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + dur);
        o.connect(g); g.connect(c.destination); o.start(t0 + dt); o.stop(t0 + dt + dur + 0.03);
      }
    } catch (e) {}
  }
};

// ---------- theme ----------
function applyTheme() {
  const t = store.get('theme', 'system');
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();

// ---------- daily ----------
function todayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayNumber(key) { const [y, m, d] = key.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) + 1; }
function dailyPick(key) { const idx = (hash32('hangtime-daily') + dayNumber(key) * 2654435761) >>> 0; return ALL[idx % ALL.length]; }
function countdown() {
  const now = new Date(), next = new Date(now); next.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
}

// ---------- names, avatars ----------
function nameOf(G, id) {
  if (!id) return 'Someone';
  if (G.kind === 'local') return G.names[id] || 'Player';
  if (G.kind === 'solo') return 'You';
  return (G.nicks && G.nicks[id]) || ('Player ' + ((G.order.indexOf(id) + 1) || ''));
}
const avatarEmoji = k => (AVATARS.find(a => a[0] === k) || AVATARS[0])[1];
function avatarKeyOf(G, id) {
  const k = G.avatars && G.avatars[id];
  if (AVATAR_KEYS.includes(k)) return k;
  if (G.kind === 'solo') return myAvatar();
  return AVATAR_KEYS[hash32(String(id)) % AVATAR_KEYS.length];
}
// Full-body 3D chibi kid (Kenney, CC0) standing on a soft shadow; 'cheer' is the jumping pose.
function avatarImg(k, pose) {
  return '<img src="/avatars/' + k + (pose === 'cheer' ? '-cheer' : '') + '.png" alt="" draggable="false" decoding="async" onerror="this.replaceWith(\'' + avatarEmoji(k) + '\')">';
}
function avatarHTML(G, id, cls) {
  const idx = Math.max(0, G.order.indexOf(id));
  const online = G.kind === 'online' && ON && ON.online.has(id);
  const t = teamsOn(G) && G.teams && G.teams[id];
  const color = t ? TEAM[t].color : 'var(--p' + ((idx % 6) + 1) + ')';
  return '<span class="av av3d' + (cls ? ' ' + cls : '') + '" style="--avc:' + color + '" title="' + esc(nameOf(G, id)) + '" aria-hidden="true">' + avatarImg(avatarKeyOf(G, id), /\bcheer\b/.test(cls || '') ? 'cheer' : '') + (online ? '<span class="dot"></span>' : '') + '</span>';
}
function myNick() { return String(store.get('nick', '') || '').slice(0, 20); }
function myAvatar() {
  let a = store.get('avatar', '');
  if (!AVATAR_KEYS.includes(a)) { a = AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)]; store.set('avatar', a); }
  return a;
}
function avatarPicker(selected, act, extra) {
  return '<div class="avpick" role="radiogroup" aria-label="Choose your avatar">' + AVATARS.map(([k, e]) =>
    '<button type="button" class="avopt" role="radio" aria-checked="' + (k === selected) + '" aria-label="' + k + '" data-act="' + act + '" data-v="' + k + '"' + (extra || '') + '>' + avatarImg(k) + '</button>').join('') + '</div>';
}
// The word as this viewer may see it: the full word in solo and pass and play; online, blanks ("?") unless you picked it or the round is over.
function displayWord(G) { return G.kind === 'online' ? (G.answer || G.mine || G.shown || '') : wordOf(G); }

// ---------- stats ----------
function recordStats(G) {
  const won = G.result === 'solved';
  STATS = JSON.parse(JSON.stringify(STATS));
  STATS.dist = STATS.dist || {};
  STATS.played = (STATS.played || 0) + 1;
  if (won) { STATS.won = (STATS.won || 0) + 1; STATS.streak = (STATS.streak || 0) + 1; STATS.best = Math.max(STATS.best || 0, STATS.streak); STATS.dist[G.misses] = (STATS.dist[G.misses] || 0) + 1; }
  else { STATS.streak = 0; STATS.dist.x = (STATS.dist.x || 0) + 1; }
  STATS.last = won ? String(G.misses) : 'x';
  store.set('stats', STATS);
}

// ---------- effects ----------
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3000);
}
function confetti(n) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement);
  const cols = ['--hit', '--turn', '--p1', '--p2', '--p4', '--p6'].map(v => cs.getPropertyValue(v).trim() || '#888');
  const P = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - .5) * W * .35, y: H * .32, vx: (Math.random() - .5) * 10, vy: -Math.random() * 10 - 3, r: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
  cancelAnimationFrame(confetti.raf);
  const t0 = performance.now(); let last = t0;
  const step = now => {
    const dt = Math.min(32, now - last) / 16; last = now;
    ctx.clearRect(0, 0, W, H); let alive = false;
    for (const p of P) {
      p.vy += .24 * dt; p.vx *= .995; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
      if (p.y < H + 20) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
    }
    if (alive && now - t0 < 4200) confetti.raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, W, H);
  };
  confetti.raf = requestAnimationFrame(step);
}
function gameEffects(prev, G, me) {
  if (!prev) return;
  const word = displayWord(G);
  if (prev.round === G.round && G.guessed.length > prev.guessed.length && G.status === 'playing') {
    const c = G.guessed[G.guessed.length - 1]; SND.play(word.includes(c) ? 'hit' : 'miss');
  }
  if (prev.round === G.round && G.wrongWords.length > prev.wrongWords.length && G.status === 'playing') SND.play('miss');
  if (prev.status !== 'over' && G.status === 'over') {
    const setterSide = G.kind === 'online' && !!me && isPicker(G, me);
    if (G.result === 'solved') { SND.play(setterSide ? 'lose' : 'win'); confetti(G.kind !== 'online' || G.solver === me ? 150 : 70); }
    else { SND.play(setterSide ? 'win' : 'lose'); if (setterSide) confetti(80); }
  }
  if (prev.status !== 'done' && G.status === 'done' && G.kind !== 'solo') { SND.play('win'); confetti(140); }
  if (me && G.status === 'playing' && G.settings.turns && G.turn === me && (prev.turn !== me || prev.status !== 'playing')) { spotlight(avatarKeyOf(G, me) + '-cheer', 'Your turn!', 'Pick a letter or solve the word'); SND.play('tick'); }
  if (me && G.status === 'setting' && isPicker(G, me) && !(prev.status === 'setting' && isPicker(prev, me))) { spotlight(avatarKeyOf(G, me) + '-cheer', teamsOn(G) ? 'Your team gives the word' : 'You pick the word', teamsOn(G) ? 'Agree in team chat, then lock it in' : 'Choose a word and its category'); SND.play('tick'); }
}

// ---------- online ----------
async function api(op, body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ op, key: KEY }, body || {})) });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error(j.error || 'Request failed'); err.status = r.status; err.msg = j.error || 'Could not reach the game server. Check your connection and try again.'; throw err; }
  return j;
}
function recent() { return store.get('recent', []).filter(r => r && /^[A-Z]{4}$/.test(r.code) && Date.now() - r.t < 24 * 3600e3); }
function recentAdd(code) { store.set('recent', [{ code, t: Date.now() }].concat(recent().filter(r => r.code !== code)).slice(0, 5)); }
function recentRemove(code) { store.set('recent', recent().filter(r => r.code !== code)); }
function needNick() {
  const n = myNick().trim();
  if (n) return n;
  toast('Add your name first so your friends know who you are.');
  const i = $('#nick-invite') || $('#nick-home'); if (i) { i.focus(); i.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  return '';
}
async function createGame(mode) {
  const nick = needNick(); if (!nick || S.busy) return;
  S.busy = true; render();
  try { const j = await api('create', { nick, avatar: myAvatar(), mode: mode || 'each' }); openOnline(j.code, j.game); }
  catch (e) { toast(e.msg); }
  finally { S.busy = false; render(); }
}
async function joinGame(raw, quiet) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { toast('Game codes have 4 letters.'); return; }
  const nick = quiet ? myNick().trim() || 'Player' : needNick();
  if (!nick || S.busy) return;
  S.busy = true; if (!quiet) render();
  try { const j = await api('join', { code, nick, avatar: myAvatar() }); S.invite = ''; openOnline(code, j.game); }
  catch (e) {
    if (e.status === 404 || e.status === 410) recentRemove(code);
    if (quiet) { history.replaceState(null, '', location.pathname); S.view = 'home'; }
    toast(e.msg);
  }
  finally { S.busy = false; render(); }
}
function openOnline(code, game) {
  closeOnline();
  ON = { code, game: null, v: 0, online: new Set(), rxT: 0, timer: 0, lastHb: 0, busy: false, failures: 0, ch: 'all', ct: 0, chat: [] };
  if (game) { ON.game = game; ON.v = game.version; }
  S.view = 'online'; S.kind = 'online'; S.solveOpen = false; S.modal = null;
  recentAdd(code);
  history.replaceState(null, '', location.pathname + '?g=' + code);
  render(); window.scrollTo(0, 0);
  poll();
}
// Server time, so every player's countdown agrees.
function serverNow() { return Date.now() + (S.view === 'online' && ON && ON.skew ? ON.skew : 0); }
const timeoutSent = {};
function tickTimers() {
  const els = document.querySelectorAll('.timer[data-deadline]');
  if (!els.length) return;
  const G = curG();
  els.forEach(el => {
    const dl = Number(el.dataset.deadline);
    const left = dl - serverNow(), secs = Math.max(0, Math.ceil(left / 1000));
    const b = el.querySelector('b');
    if (b && b.textContent !== String(secs)) {
      b.textContent = secs;
      const mine = G && ((G.status === 'playing' && G.turn && (G.turn === ME.id || S.view !== 'online')) || (G.status === 'setting' && (S.view !== 'online' || isPicker(G, ME.id))));
      if (secs > 0 && secs <= 5 && mine) SND.play('tick');
    }
    const total = ((G && timerSecs(G)) || 60) * 1000;
    el.style.setProperty('--p', Math.max(0, Math.min(1, left / total)));
    el.classList.toggle('low', secs <= 10);
    if (left <= 0 && G && G.deadline === dl) {
      const last = timeoutSent[dl] || 0;
      if (Date.now() - last > 1500) { timeoutSent[dl] = Date.now(); dispatch({ t: 'timeout', deadline: dl }); }
    }
  });
}
setInterval(tickTimers, 250);
function closeOnline() { if (!ON) return; clearTimeout(ON.timer); ON = null; }
function schedulePoll() { if (!ON) return; clearTimeout(ON.timer); ON.timer = setTimeout(poll, document.hidden ? 5000 : 1200); }
async function poll() {
  if (!ON) return;
  const mine = ON, code = ON.code;
  const hb = Date.now() - ON.lastHb > 8000;
  try {
    const r = await fetch(API + '?code=' + code + '&key=' + KEY + '&v=' + ON.v + '&rx=' + ON.rxT + '&ch=' + ON.ch + '&ct=' + ON.ct + (hb ? '&hb=1' : ''), { cache: 'no-store' });
    if (ON !== mine) return;
    if (r.status === 404) { toast('This game has ended or expired.'); recentRemove(code); goHome(); return; }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    ON.failures = 0;
    let changed = false;
    if (hb) { ON.lastHb = Date.now(); if (j.online) { ON.online = new Set(j.online); changed = true; } }
    if (j.now) ON.skew = j.now - Date.now();
    if (j.game) { applyGame(j.game); changed = true; }
    if (j.channel && j.channel !== ON.ch) { ON.ch = j.channel; ON.ct = 0; ON.chat = []; changed = true; setTimeout(poll, 0); }
    else if (j.chat && j.chat.length) {
      const fresh = j.chat.filter(m => m.t > ON.ct);
      if (fresh.length) {
        const firstLoad = ON.ct === 0;
        ON.chat = ON.chat.concat(fresh).slice(-60);
        ON.ct = Math.max(ON.ct, ...fresh.map(m => m.t));
        if (!firstLoad && fresh.some(m => m.id !== ME.id)) SND.play('pop');
        changed = true;
      }
    }
    const first = ON.rxT === 0;
    for (const x of j.rx || []) {
      ON.rxT = Math.max(ON.rxT, x.t);
      if (first) continue;
      if (x.k === 'react') { if (x.id !== ME.id) flyReaction(x.id, x.e); }
      else if (x.k === 'nudge' && x.to === ME.id && x.id !== ME.id) { toast('Your friends are waiting on you'); SND.play('nudge'); }
    }
    if (first) ON.rxT = Math.max(ON.rxT, j.now || 0);
    if (changed) scheduleRender();
  } catch (e) {
    if (ON === mine) { ON.failures++; if (ON.failures === 4) toast('Connection is shaky. Still trying…'); }
  }
  if (ON === mine) schedulePoll();
}
function applyGame(g) {
  if (!ON) return;
  if (ON.game && g.version < ON.game.version) return;
  const prev = ON.game; ON.game = g; ON.v = g.version;
  gameEffects(prev, g, ME.id);
}
document.addEventListener('visibilitychange', () => { if (ON && !document.hidden) { clearTimeout(ON.timer); poll(); } });
async function leaveOnline() {
  if (!ON) return;
  const code = ON.code;
  try { await api('leave', { code }); } catch (e) {}
  recentRemove(code);
  goHome();
}
function goHome() {
  closeOnline();
  history.replaceState(null, '', location.pathname);
  S.view = 'home'; S.modal = null; S.solveOpen = false;
  render(); window.scrollTo(0, 0);
}

// ---------- local + solo ----------
function saveSolo() { if (S.solo) store.set(S.solo.mode === 'daily' ? 'daily' : 'practice', S.solo.G); }
function saveLocal() { if (S.local) store.set('local', S.local.G); }
function freshSolo(mode) {
  const key = todayKey();
  const G = newGame('solo', { host: 'me', order: ['me'], daily: mode === 'daily' ? key : '', settings: { source: 'random', turns: true, maxMisses: 6, rounds: 1 } });
  G.round = 1; G.totalRounds = 1; G.scores.me = 0; G.status = 'playing'; G.turn = 'me';
  if (mode === 'daily') { const p = dailyPick(key); setSecret(G, p.w, '', p.c); }
  else {
    const used = store.get('practiceUsed', []);
    const p = pickWord(S.practiceCat, used); setSecret(G, p.w, '', p.c);
    store.set('practiceUsed', used.concat(hash32(p.w)).slice(-120));
  }
  return G;
}
function startSolo(mode, forceNew) {
  let G = null;
  if (mode === 'daily') { const saved = store.get('daily', null); if (saved && saved.daily === todayKey()) G = saved; }
  else if (!forceNew) { const saved = store.get('practice', null); if (saved && saved.status === 'playing') G = saved; }
  if (!G) G = freshSolo(mode);
  closeOnline();
  S.solo = { mode, G }; S.kind = 'solo'; S.view = 'game'; S.solveOpen = false;
  saveSolo(); render(); window.scrollTo(0, 0);
}
function startLocal() {
  const names = S.setup.names.map((n, i) => String(n || '').trim().slice(0, 16) || ('Player ' + (i + 1)));
  const order = names.map((_, i) => 'p' + (i + 1));
  const G = newGame('local', { host: 'p1', order, names: Object.fromEntries(order.map((id, i) => [id, names[i]])), avatars: Object.fromEntries(order.map((id, i) => [id, localAvatar(i)])), teams: Object.fromEntries(order.map((id, i) => [id, localTeam(i)])), settings: Object.assign({}, S.setup.settings, { turns: true }) });
  closeOnline();
  const started = act(G, { t: 'start' }, 'p1');
  if (!started) { toast('Each team needs at least one player.'); return; }
  S.local = { G: started };
  S.kind = 'local'; S.view = 'game'; S.reveal = false; S.showWord = false; S.err = ''; S.solveOpen = false;
  saveLocal(); render(); window.scrollTo(0, 0);
}
function curG() { if (S.view === 'online') return ON && ON.game; if (S.kind === 'solo') return S.solo && S.solo.G; return S.local && S.local.G; }
async function dispatch(a) {
  if (S.view === 'online') {
    if (!ON || ON.busy) return;
    const mine = ON;
    ON.busy = true;
    try { const j = await api('act', { code: ON.code, action: a }); if (ON === mine && j.game) applyGame(j.game); }
    catch (e) { toast(e.msg); }
    finally { mine.busy = false; }
    S.solveOpen = false; scheduleRender();
    return;
  }
  const holder = S.kind === 'solo' ? S.solo : S.local;
  if (!holder) return;
  const G = holder.G;
  const by = S.kind === 'solo' ? 'me' : (a.t === 'setword' ? (teamsOn(G) ? membersOf(G, G.pickTeam)[0] : G.setter) : (G.turn || G.host));
  const next = act(G, a, by);
  if (!next) return;
  next.updatedAt = Date.now();
  holder.G = next;
  gameEffects(G, next, null);
  if (S.kind === 'solo') {
    if (next.status === 'over' && !next.recorded) { next.recorded = true; recordStats(next); }
    saveSolo();
  } else saveLocal();
  S.solveOpen = false;
  render();
}

// ---------- rendering ----------
let rafPending = false;
function scheduleRender() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); }
function captureInputs() {
  const out = [];
  document.querySelectorAll('#view input[id], #view textarea[id]').forEach(el => {
    out.push({ id: el.id, value: el.value, focus: document.activeElement === el, s: el.selectionStart, e: el.selectionEnd });
  });
  return out;
}
function restoreInputs(list) {
  for (const k of list) {
    if (S.clear.includes(k.id)) continue;
    const el = document.getElementById(k.id);
    if (!el) continue;
    el.value = k.value;
    if (k.focus) { el.focus(); try { if (k.s != null) el.setSelectionRange(k.s, k.e); } catch (e) {} }
  }
  S.clear = [];
}
function render() {
  const keep = captureInputs();
  $('#top').innerHTML = renderTop();
  let html = '';
  if (S.view === 'home') html = renderHome();
  else if (S.view === 'local-setup') html = renderSetup();
  else if (S.view === 'game') html = S.kind === 'solo' ? renderSolo() : renderLocal();
  else if (S.view === 'online') html = renderOnline();
  $('#view').innerHTML = html;
  restoreInputs(keep);
  const msgs = $('#msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  renderModal();
  postRender();
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastViewKey = '', enterTimer = 0;
function viewKey() { const G = curG(); return S.view + ':' + (S.kind || '') + ':' + (G ? gameKeyBase(G) + G.status + ':' + G.round : ''); }
// Animations that should play once per change, not on every re-render.
function postRender() {
  document.documentElement.style.setProperty('--bob', -(Date.now() % 2400) + 'ms');
  const v = $('#view'), k = viewKey();
  if (k !== lastViewKey) {
    lastViewKey = k;
    v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    clearTimeout(enterTimer); enterTimer = setTimeout(() => v.classList.remove('enter'), 900);
  }
  document.querySelectorAll('.vs-score[data-k]').forEach(el => {
    const key = el.dataset.k, to = Number(el.dataset.to), from = fx.score[key];
    fx.score[key] = to;
    if (from == null || from === to) { el.textContent = to; return; }
    if (to > from) el.closest('.vs-side').classList.add('bump');
    if (reduceMotion()) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 700); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  const G = curG();
  if (G && G.guessed) {
    const gk = gameKeyBase(G) + G.round;
    const last = G.guessed[G.guessed.length - 1] || '';
    const sig = G.guessed.length + last + ':' + G.misses;
    if (fx.lastGuess[gk] != null && fx.lastGuess[gk] !== sig && last) {
      const key = document.querySelector('.key[data-k="' + last + '"]');
      if (key) key.classList.add('just');
      const prevMiss = Number(String(fx.lastGuess[gk]).split(':')[1]);
      if (G.misses > prevMiss) { const f = $('.figure'); if (f) f.classList.add('hurt'); }
    }
    fx.lastGuess[gk] = sig;
    const seen = fx.seen[gameKeyBase(G)] || (fx.seen[gameKeyBase(G)] = new Set(G.order));
    document.querySelectorAll('.pl[data-id]').forEach(li => { if (!seen.has(li.dataset.id)) li.classList.add('pop'); });
    G.order.forEach(id => seen.add(id));
  }
  if (ON && ON.chat.length) fx.chatSeen = Math.max(fx.chatSeen, ...ON.chat.map(m => m.t));
}
function spotlight(avatarKey, title, sub) {
  if (reduceMotion()) { toast(title); return; }
  document.querySelectorAll('.spot').forEach(n => n.remove());
  const el = document.createElement('div');
  el.className = 'spot'; el.setAttribute('role', 'status');
  el.innerHTML = (avatarKey ? '<span class="spot-av"><img src="/avatars/' + avatarKey + '.png" alt=""></span>' : '') + '<div><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1800);
  setTimeout(() => el.remove(), 2300);
}
function renderTop() {
  const inGame = S.view !== 'home';
  return (inGame ? '<button class="icon-btn" data-act="home" aria-label="Back to home">' + ICON.back + '</button>' : '') +
    '<button class="brand" data-act="home" aria-label="Hangtime home"><span class="brand-mark">H</span>Hangtime</button>' +
    '<button class="icon-btn" data-act="help" aria-label="How to play">' + ICON.help + '</button>' +
    '<button class="icon-btn" data-act="stats" aria-label="Your statistics">' + ICON.stats + '</button>' +
    '<button class="icon-btn" data-act="sound" aria-label="' + (SND.on ? 'Mute sounds' : 'Turn sounds on') + '">' + (SND.on ? ICON.soundOn : ICON.soundOff) + '</button>' +
    '<button class="icon-btn" data-act="theme" aria-label="Switch between system, light and dark theme">' + ICON.theme + '</button>';
}
function tileRow(text, blank) {
  return [...text].map((ch, i) => '<span class="t on' + (blank === i ? ' blank' : '') + '" style="--i:' + i + '">' + (blank === i ? '' : esc(ch)) + '</span>').join('');
}
function renderHome() {
  const key = todayKey();
  const daily = store.get('daily', null);
  const dailyToday = daily && daily.daily === key ? daily : null;
  const dailyState = !dailyToday ? '<span class="state"><span class="pip"></span>New word today</span>'
    : dailyToday.status === 'over' ? '<span class="state"><span class="pip done"></span>' + (dailyToday.result === 'solved' ? 'Solved with ' + dailyToday.misses + ' ' + plural(dailyToday.misses, 'miss', 'misses') : 'Played, come back tomorrow') + '</span>'
    : '<span class="state"><span class="pip"></span>In progress</span>';
  const practice = store.get('practice', null);
  const local = store.get('local', null);
  const localResume = local && local.status !== 'done';
  const art = (k, cls) => '<img class="mode-art' + (cls ? ' ' + cls : '') + '" src="/avatars/' + k + '.png" alt="" aria-hidden="true" draggable="false">';
  return '<section class="home">' +
    (S.invite ? renderInvite() : '') +
    '<div class="hero">' +
      '<div class="floaters" aria-hidden="true">' + ['f2-cheer', 'm3', 'f4', 'm4-cheer', 'f6', 'm1'].map((k, i) => '<img class="fl f' + i + '" src="/avatars/' + k + '.png" alt="" draggable="false">').join('') + '</div>' +
      '<h1 class="logo" aria-label="Hangtime">' + tileRow('HANGTIME', 4) + '</h1>' +
      '<p class="lede">Guess the word one letter at a time before the drawing is finished. Play today’s word, practise, or start a game and send your friends the link.</p>' +
    '</div>' +
    '<div class="modes">' +
      '<button class="mode" data-act="daily">' + art('m5') + '<span class="eyebrow">Daily · #' + dayNumber(key) + '</span><b>Today’s word</b><span class="desc">One word for everyone, every day. Share your result and compare.</span>' + dailyState + '</button>' +
      '<button class="mode" data-act="practice">' + art('f3') + '<span class="eyebrow">Practice · ' + esc(S.practiceCat === 'any' ? 'Mixed' : catLabel(S.practiceCat)) + '</span><b>Endless words</b><span class="desc">As many rounds as you like. Pick a category below.</span>' + (practice && practice.status === 'playing' ? '<span class="state"><span class="pip"></span>Continue your word</span>' : '') + '</button>' +
      '<button class="mode mode-vs" data-act="create-teams">' + art('m2-cheer', 'art-b') + art('f5-cheer') + '<span class="eyebrow">Online \u00b7 2 or more players</span><b><span class="vs-word t-a">Red</span> vs <span class="vs-word t-b">Blue</span></b><span class="desc">One team gives the word and its category, the other team guesses. Each team plans in its own private chat.</span><span class="state"><span class="pip"></span>Start a team battle</span></button>' +
      '<button class="mode" data-act="' + (localResume ? 'local-resume' : 'local-setup') + '">' + art('m6') + '<span class="eyebrow">2 to 6 players · one device</span><b>Pass and play</b><span class="desc">Take turns picking words for each other on one phone or laptop.</span>' + (localResume ? '<span class="state"><span class="pip"></span>Resume round ' + local.round + '</span>' : '') + '</button>' +
    '</div>' +
    '<div class="chips" role="group" aria-label="Practice category"><span class="eyebrow" style="margin-right:4px">Practice words</span>' +
      [['any', 'Mixed']].concat(CAT_KEYS.map(c => [c, CATS[c].label])).map(([v, l]) => '<button class="chip" data-act="pcat" data-v="' + v + '" aria-pressed="' + (S.practiceCat === v) + '">' + esc(l) + '</button>').join('') +
    '</div>' +
    renderOnlineCard() +
  '</section>';
}
function renderInvite() {
  return '<section class="panel online invite"><div><div class="eyebrow">You’re invited</div><h2>Join game <span class="code-chip">' + esc(S.invite) + '</span></h2><p class="muted" style="margin:0">Pick an avatar and a name, then jump in. No account needed.</p></div>' +
    avatarPicker(myAvatar(), 'pick-avatar') +
    '<form class="joinform" data-form="invite"><input id="nick-invite" class="field" maxlength="20" value="' + esc(myNick()) + '" placeholder="Your name" aria-label="Your name" data-input="nick" autocomplete="nickname"><button class="btn primary" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Joining…' : 'Join game') + '</button></form>' +
    '<button class="btn quiet" data-act="invite-dismiss" style="justify-self:start">Not now</button></section>';
}
function renderOnlineCard() {
  const rec = recent();
  return '<section class="panel online"><div><h2>Play online with friends</h2><p class="muted" style="margin:0">Create a game and send the link. Each round someone picks a word and everyone else races to save the stick figure. Works on any phone or laptop, no sign-up.</p></div>' +
    '<div class="online-grid">' +
      '<div><label class="lbl" for="nick-home">Your name in games</label><input id="nick-home" class="field" maxlength="20" value="' + esc(myNick()) + '" placeholder="e.g. Amar" data-input="nick" autocomplete="nickname"></div>' +
      '<div class="row"><button class="btn primary big" data-act="create"' + (S.busy ? ' disabled' : '') + ' style="flex:1">' + (S.busy ? 'Working\u2026' : 'Create a game') + '</button><button class="btn big btn-vs" data-act="create-teams"' + (S.busy ? ' disabled' : '') + ' style="flex:1">Team battle</button></div>' +
    '</div>' +
    '<div><span class="lbl">Your avatar</span>' + avatarPicker(myAvatar(), 'pick-avatar') + '</div>' +
    '<form class="joinform" data-form="join"><input id="join-code" class="field code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Game code"><button class="btn" type="submit">Join with code</button></form>' +
    (rec.length ? '<div><div class="eyebrow" style="margin-bottom:8px">Your recent games</div><ul class="games">' + rec.map(r => '<li><span class="code-chip">' + esc(r.code) + '</span><span class="g-info">Opened ' + esc(timeAgo(r.t)) + '</span><button class="btn" data-act="join-open" data-code="' + esc(r.code) + '">Rejoin</button></li>').join('') + '</ul></div>' : '') +
  '</section>';
}
function timeAgo(t) { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); return h + ' ' + plural(h, 'hour', 'hours') + ' ago'; }
function seg(act, key, val, opts, enabled) {
  return '<div class="seg" role="group">' + opts.map(([v, l]) =>
    '<button type="button" data-act="' + act + '" data-k="' + key + '" data-v="' + v + '" aria-pressed="' + (String(v) === String(val)) + '"' + (enabled ? '' : ' disabled') + '>' + esc(l) + '</button>').join('') + '</div>';
}
function settingsHTML(act, s, enabled, local) {
  const cats = [['any', 'Mixed']].concat(CAT_KEYS.map(c => [c, CATS[c].label]));
  const teams = s.mode === 'teams';
  return '<div class="settings">' +
    '<div class="setting"><span class="lbl">Play as</span>' + seg(act, 'mode', s.mode || 'each', [['each', 'Every player for themselves'], ['teams', 'Team battle: Red vs Blue']], enabled) + '</div>' +
    '<div class="setting"><span class="lbl">Who picks the words</span>' + seg(act, 'source', s.source, [['friends', teams ? 'Teams pick for each other' : 'Players take turns'], ['random', 'Random words']], enabled) + '</div>' +
    (s.source === 'random' ? '<div class="setting"><span class="lbl">Category</span>' + seg(act, 'category', s.category, cats, enabled) + '</div>' : '') +
    (local ? '' : '<div class="setting"><span class="lbl">Guessing</span>' + seg(act, 'turns', s.turns, [[true, 'One at a time'], [false, 'Everyone at once']], enabled) + '</div>') +
    '<div class="setting"><span class="lbl">Lives per word</span>' + seg(act, 'maxMisses', s.maxMisses, [[6, '6 classic'], [8, '8'], [10, '10 relaxed']], enabled) + '</div>' +
    '<div class="setting"><span class="lbl">Timer</span>' + seg(act, 'timer', s.timer || 0, [[0, 'Off'], [60, '60 s to guess, 120 s to give a word']], enabled) + '</div>' +
    '<div class="setting"><span class="lbl">Rounds</span>' + seg(act, 'rounds', roundsEach(s), teams || s.source === 'friends' ? [1, 2, 3, 5].map(n => [n, n + ' each']) : [[3, '3 words'], [5, '5 words'], [8, '8 words']], enabled) + '</div>' +
  '</div>';
}
function localAvatar(i) { const a = (S.setup.avatars || [])[i]; return AVATAR_KEYS.includes(a) ? a : AVATAR_KEYS[(i * 5) % AVATAR_KEYS.length]; }
if (S.setup.settings && S.setup.settings.category !== 'any' && !CATS[S.setup.settings.category]) S.setup.settings.category = 'any';
function localTeam(i) { return TEAM_IDS.includes(S.setup.teams[i]) ? S.setup.teams[i] : TEAM_IDS[i % 2]; }
function renderSetup() {
  const n = S.setup.names;
  const teamsBad = S.setup.settings.mode === 'teams' && (!n.some((_, i) => localTeam(i) === 'a') || !n.some((_, i) => localTeam(i) === 'b'));
  return '<section class="setup"><div class="panel">' +
    '<h2>Pass and play</h2><p class="muted" style="margin:0 0 14px">One device, 2 to 6 players. Each round one player picks a word while the others look away, then the rest take turns guessing. Tap an avatar to change it.</p>' +
    '<div class="names">' + n.map((v, i) =>
      '<div class="row"><button type="button" class="av av3d av-btn" style="--avc:' + (S.setup.settings.mode === 'teams' ? TEAM[localTeam(i)].color : 'var(--p' + (i + 1) + ')') + '" data-act="lavatar" data-i="' + i + '" aria-label="Change player ' + (i + 1) + '\u2019s avatar">' + avatarImg(localAvatar(i)) + '</button><input id="pn-' + i + '" class="field" maxlength="16" value="' + esc(v) + '" placeholder="Player ' + (i + 1) + '" aria-label="Player ' + (i + 1) + ' name" data-input="pname" data-i="' + i + '">' +
      (S.setup.settings.mode === 'teams' ? '<button class="team-chip t-' + localTeam(i) + '" data-act="lteam" data-i="' + i + '" aria-label="Player ' + (i + 1) + ' is on the ' + teamName(localTeam(i)) + '. Switch team">' + TEAM[localTeam(i)].name + '</button>' : '') +
      (n.length > 2 ? '<button class="icon-btn" data-act="pdel" data-i="' + i + '" aria-label="Remove player ' + (i + 1) + '">' + ICON.close + '</button>' : '') + '</div>').join('') + '</div>' +
    (n.length < 6 ? '<div style="margin-top:10px"><button class="btn" data-act="padd">Add a player</button></div>' : '') +
    settingsHTML('lsetting', S.setup.settings, true, true) +
    '<div class="row" style="margin-top:18px"><button class="btn primary big" data-act="local-start"' + (teamsBad ? ' disabled' : '') + '>Start the game</button>' + (teamsBad ? '<span class="muted small">Each team needs at least one player.</span>' : '') + '</div>' +
  '</div></section>';
}
function partsFor(m, max) { return Math.min(6, Math.ceil(m * 6 / Math.max(1, max))); }
// The hangman scene is rendered in 3D (public/hangman): each wrong guess adds a piece of the gallows,
// while the guesser's own avatar stands on the crate. Out of lives: the crate tips and they tumble off.
const HANG_STAGES = ['0', '1', '2', '3', '4', '5', 'lost'];
HANG_STAGES.forEach(st => { const im = new Image(); im.src = '/hangman/stage-' + st + '.png'; });
function heroOf(G) {
  if (G.kind === 'solo') return 'me';
  if (G.status === 'over' || G.status === 'done') return G.solver || guessersOf(G)[0] || G.order[0];
  return G.turn || guessersOf(G)[0] || G.order[0];
}
function figureHTML(G, key) {
  const ended = G.status === 'over' || G.status === 'done';
  const won = ended && G.result === 'solved', lost = ended && G.result === 'hanged';
  const shown = partsFor(G.misses, G.settings.maxMisses);
  const stage = lost ? 'lost' : String(Math.min(5, shown));
  const prev = fx.misses[key];
  fx.misses[key] = G.misses;
  const grew = prev != null && partsFor(prev, G.settings.maxMisses) < shown && !lost;
  const k = avatarKeyOf(G, heroOf(G));
  const pose = lost ? 'down' : won ? 'cheer' : 'stand';
  const src = '/avatars/' + k + (pose === 'stand' ? '' : '-' + pose) + '.png';
  const label = won ? 'Saved! The word was solved.' : lost ? 'Out of lives. The crate tipped over.' : Math.min(5, shown) + ' of 5 gallows pieces built';
  return '<div class="hang' + (grew ? ' grew' : '') + '" role="img" aria-label="' + label + '">' +
    '<img class="hang-bg" src="/hangman/stage-' + stage + '.png" alt="" draggable="false">' +
    '<img class="hang-kid ' + pose + '" src="' + src + '" alt="" draggable="false">' +
    (lost ? '<span class="dizzy" aria-hidden="true"><i>★</i><i>✦</i><i>★</i></span>' : '') +
  '</div>';
}
function livesHTML(G) {
  const max = G.settings.maxMisses, left = Math.max(0, max - G.misses);
  let d = '';
  for (let i = 0; i < max; i++) d += '<span class="life' + (i >= left ? ' gone' : '') + '"></span>';
  return '<div class="lives" role="img" aria-label="' + left + ' of ' + max + ' lives left">' + d + '<span class="lives-n">' + left + ' ' + plural(left, 'life', 'lives') + ' left</span></div>';
}
function gameKeyBase(G) { return G.kind + ':' + (G.code || '') + ':' + G.createdAt + ':'; }
function gameKey(G) { return G.kind + ':' + (G.code || G.daily || '') + ':' + G.round + ':' + G.createdAt; }
// "?" marks a letter the server keeps hidden from this viewer.
const isSlot = ch => isLetter(ch) || ch === '?';
function tilesHTML(G, word, key, opts) {
  opts = opts || {};
  const mask = [...word].map(ch => ch === '?' ? '_' : (!isLetter(ch) || G.guessed.includes(ch)) ? ch : '_').join('');
  const prev = fx.mask[key];
  fx.mask[key] = mask;
  const groups = word.split(' ');
  const longest = Math.max(6, ...groups.map(g => g.length));
  let i = 0, html = '';
  groups.forEach((gw, gi) => {
    html += '<span class="wordg">';
    for (const ch of gw) {
      const shown = mask[i] !== '_';
      const pop = shown && prev && prev[i] === '_' && isSlot(ch);
      const cls = ['t'];
      if (!isSlot(ch)) cls.push('punct', 'on');
      else if (shown) cls.push('on');
      else if (opts.reveal) cls.push('missed');
      else if (opts.mine) cls.push('mine');
      if (pop) cls.push('pop');
      const content = shown || ((opts.reveal || opts.mine) && ch !== '?') ? esc(ch) : '';
      html += '<span class="' + cls.join(' ') + '" style="--i:' + i + ';--n:' + longest + (pop ? ';animation-delay:' + (Math.min(i, 10) * 40) + 'ms' : '') + '">' + content + '</span>';
      i++;
    }
    html += '</span>';
    if (gi < groups.length - 1) i++;
  });
  const aria = 'Word: ' + [...mask].map(c => c === '_' ? 'blank' : c === ' ' ? ',' : c).join(' ');
  return { html, aria };
}
function keyboardHTML(G, word, enabled) {
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  return '<div class="kb' + (enabled ? '' : ' locked') + '" role="group" aria-label="Letters">' + rows.map(r => '<div class="kb-row">' + [...r].map(c => {
    const g = G.guessed.includes(c), hit = g && word.includes(c);
    return '<button class="key' + (g ? (hit ? ' hit' : ' miss') : '') + '" data-act="key" data-k="' + c + '"' + (g || !enabled ? ' disabled' : '') + ' aria-label="' + c + (g ? (hit ? ', in the word' : ', not in the word') : '') + '">' + c + '</button>';
  }).join('') + '</div>').join('') + '</div>';
}
function solveRow(enabled, extra) {
  extra = extra || '';
  if (!enabled) return extra ? '<div class="actions">' + extra + '</div>' : '';
  if (S.solveOpen) return '<form class="solve" data-form="solve"><input id="solve-input" class="field" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="Type the whole answer" aria-label="Your answer"><button class="btn accent" type="submit">Guess it</button><button class="btn quiet" type="button" data-act="solve-cancel">Cancel</button><p class="hintline">A wrong answer costs a life.</p></form>';
  return '<div class="actions"><button class="btn" data-act="solve-open">Solve the whole word</button>' + extra + '</div>';
}
function boardShell(o) {
  const G = o.G;
  const ended = G.status === 'over' || G.status === 'done';
  const prevWrong = fx.wrong[o.key];
  fx.wrong[o.key] = G.wrongWords.length;
  const shake = prevWrong != null && G.wrongWords.length > prevWrong;
  const won = ended && G.result === 'solved', lost = ended && G.result === 'hanged';
  const t = o.word ? tilesHTML(G, o.word, o.key, { reveal: ended, mine: o.mine }) : null;
  return '<section class="board' + (o.rail ? ' has-rail' : '') + '"><div class="play">' +
    '<div class="roundline">' + o.eyebrow + '</div>' +
    (teamsOn(G) && G.pickTeam ? vsBanner(G) : '') +
    // On wide screens the arena puts the hangman beside the word and keyboard, so a laptop sees the whole board at once.
    '<div class="arena"><div class="arena-fig"><div class="stage"><div class="figure' + (won ? ' won' : '') + (lost ? ' lost' : '') + '">' + figureHTML(G, o.key) + '</div></div>' +
    livesHTML(G) + '</div><div class="arena-main">' +
    (o.clue ? '<div class="clue">' + o.clue + '</div>' : '') +
    (t ? '<div class="tiles' + (shake ? ' shake' : '') + (won ? ' win' : '') + '" role="img" aria-label="' + esc(t.aria) + '">' + t.html + '</div>' : '') +
    '<div class="status-row">' + (G.status === 'playing' ? timerHTML(G) : '') + '<div class="status" aria-live="polite">' + (o.status || '') + '</div></div>' +
    (G.wrongWords.length ? '<div class="tried">Wrong answers: ' + G.wrongWords.map(w => '<s>' + esc(w) + '</s>').join(' ') + '</div>' : '') +
    (o.below || '') + reactDock(G) + '</div></div>' +
  '</div>' + (o.rail ? '<aside class="rail">' + o.rail + '</aside>' : '') + '</section>';
}
function miniStats() {
  const p = STATS.played || 0, w = STATS.won || 0;
  return '<div class="mini-stats"><div><b>' + p + '</b><span>Played</span></div><div><b>' + (p ? Math.round(w / p * 100) : 0) + '</b><span>Win %</span></div><div><b>' + (STATS.streak || 0) + '</b><span>Streak</span></div><div><b>' + (STATS.best || 0) + '</b><span>Best streak</span></div></div>';
}
function renderSolo() {
  const { G, mode } = S.solo;
  const word = wordOf(G), key = gameKey(G), over = G.status === 'over';
  const eyebrow = '<span class="eyebrow">' + (mode === 'daily' ? 'Daily · #' + dayNumber(G.daily) : 'Practice') + '</span>';
  const clue = '<span class="cat-chip"><span class="eyebrow">Category</span><b>' + esc(catLabel(G.category)) + '</b></span>';
  let status = '', below = '';
  if (!over) {
    const left = hiddenCount(word, G.guessed);
    status = G.misses === 0 && !G.guessed.length ? 'Pick a letter to start' : (left + ' ' + plural(left, 'letter', 'letters') + ' to go');
    below = keyboardHTML(G, word, true) + solveRow(true);
  } else {
    const won = G.result === 'solved';
    const title = won ? (G.misses === 0 ? 'Flawless' : G.misses <= 2 ? 'Sharp solve' : 'Close call') : 'Out of lives';
    below = '<div class="result"><div class="eyebrow">' + (won ? 'Solved with ' + G.misses + ' ' + plural(G.misses, 'miss', 'misses') : 'The figure is complete') + '</div><h2>' + title + '</h2>' +
      '<p class="muted">The word was <b style="color:var(--ink)">' + esc(word) + '</b>.</p>' + miniStats() +
      '<div class="row" style="justify-content:center">' +
      (mode === 'daily' ? '<button class="btn primary" data-act="share">' + ICON.share + 'Share result</button><button class="btn" data-act="practice-new">Practice more</button>'
        : '<button class="btn primary" data-act="practice-new">Next word</button><button class="btn" data-act="share">' + ICON.share + 'Share result</button>') +
      '</div>' + (mode === 'daily' ? '<p class="muted small">Next daily word in <span id="countdown">' + countdown() + '</span></p>' : '') + '</div>';
  }
  return boardShell({ G, word, key, eyebrow, clue, status, below });
}
function shareText(G) {
  const seq = G.log.filter(e => ['hit', 'miss', 'solved', 'wrong'].includes(e.k)).map(e => e.k === 'hit' ? '🟩' : e.k === 'miss' ? '🟥' : e.k === 'solved' ? '⭐' : '❌').join('');
  const head = G.daily ? 'Hangtime #' + dayNumber(G.daily) : 'Hangtime practice · ' + catLabel(G.category);
  const res = G.result === 'solved' ? 'Solved, ' + G.misses + '/' + G.settings.maxMisses + ' misses' : 'Hanged, ' + G.settings.maxMisses + '/' + G.settings.maxMisses + ' misses';
  return head + '\n' + res + '\n' + seq + '\n' + location.origin;
}
function clueFor(G) {
  const from = !G.setter ? 'Random word' : teamsOn(G) && G.pickTeam ? 'From the ' + teamName(G.pickTeam) : 'From ' + esc(nameOf(G, G.setter));
  return '<span class="cat-chip"><span class="eyebrow">Category</span><b>' + esc(catLabel(G.category)) + '</b></span><span class="clue-from">' + from + '</span>' +
    (G.hint ? '<span class="clue-hint">Hint: <b>\u201c' + esc(G.hint) + '\u201d</b></span>' : '');
}
function timerHTML(G) {
  if (!G.deadline || !(G.status === 'setting' || G.status === 'playing')) return '';
  return '<span class="timer" data-deadline="' + G.deadline + '" role="timer" aria-label="Time left"><svg viewBox="0 0 36 36"><circle class="tr-bg" cx="18" cy="18" r="15.5"/><circle class="tr-fg" cx="18" cy="18" r="15.5" pathLength="100"/></svg><b>' + Math.max(0, Math.ceil((G.deadline - serverNow()) / 1000)) + '</b></span>';
}
function roundEyebrow(G) {
  return (G.status === 'playing' ? '' : timerHTML(G)) + '<span class="eyebrow">Round ' + G.round + ' of ' + G.totalRounds + (teamsOn(G) && G.pickTeam ? ' \u00b7 ' + TEAM[G.pickTeam].name + ' picks, ' + TEAM[otherTeam(G.pickTeam)].name + ' guesses' : '') + '</span>' + (G.kind === 'online' ? '<span class="code-chip">' + esc(G.code) + '</span>' : '');
}
function playersHTML(G, lobby, list) {
  const ids = list || (lobby ? G.order : G.order.slice().sort((a, b) => (G.scores[b] || 0) - (G.scores[a] || 0)));
  return '<ul class="players">' + ids.map(id => {
    const turn = G.status === 'playing' && G.settings.turns && G.turn === id;
    const setter = !teamsOn(G) && G.setter === id && ['setting', 'playing', 'over'].includes(G.status);
    const off = G.kind === 'online' && ON && ON.lastHb && !ON.online.has(id);
    const tags = [];
    if (G.kind === 'online' && id === G.host) tags.push('Host');
    if (teamsOn(G) && G.teams[id] && !lobby) tags.push(TEAM[G.teams[id]].name);
    if (setter) tags.push(G.status === 'setting' ? 'Picking a word' : 'Picked this word');
    if (turn) tags.push('Guessing now');
    if (off) tags.push('Away');
    const isMe = G.kind === 'online' && id === ME.id;
    return '<li class="pl' + (turn ? ' turn' : '') + (off ? ' off' : '') + '" data-id="' + esc(id) + '">' + avatarHTML(G, id, turn ? 'bob' : '') +
      '<div class="who"><div class="nm">' + esc(nameOf(G, id)) + (isMe ? '<span class="you">you</span>' : '') + '</div>' + (tags.length ? '<div class="tag">' + tags.join(' · ') + '</div>' : '') + '</div>' +
      (lobby ? '' : '<div class="sc">' + (G.scores[id] || 0) + '</div>') + '</li>';
  }).join('') + '</ul>';
}
function vsBanner(G, compact) {
  const live = G.pickTeam && !['done', 'lobby'].includes(G.status);
  const ts = G.teamScores || { a: 0, b: 0 };
  const side = t => {
    const m = membersOf(G, t);
    const role = live ? (G.pickTeam === t ? 'Giving the word' : 'Guessing') : (G.status === 'done' && ts[t] > ts[otherTeam(t)] ? 'Winners' : '');
    return '<div class="vs-side t-' + t + (live && G.pickTeam === t ? ' giving' : '') + (live && G.pickTeam !== t ? ' guessing' : '') + '">' +
      '<div class="vs-head"><span class="vs-name">' + TEAM[t].name + '</span>' + (role ? '<span class="vs-role">' + role + '</span>' : '') + '</div>' +
      '<div class="vs-body"><div class="vs-avs">' + m.slice(0, 5).map(id => avatarHTML(G, id, '')).join('') + (m.length > 5 ? '<span class="av av-more">+' + (m.length - 5) + '</span>' : '') + '</div>' +
      '<b class="vs-score" data-k="' + esc(gameKeyBase(G) + t) + '" data-to="' + (ts[t] || 0) + '">' + (fx.score[gameKeyBase(G) + t] != null ? fx.score[gameKeyBase(G) + t] : (ts[t] || 0)) + '</b></div></div>';
  };
  return '<div class="vs' + (compact ? ' compact' : '') + '" role="group" aria-label="Red ' + (ts.a || 0) + ', Blue ' + (ts.b || 0) + '">' + side('a') + '<div class="vs-mid" aria-hidden="true">VS</div>' + side('b') + '</div>';
}
function chatHTML(G) {
  if (G.kind !== 'online' || !ON) return '';
  const myTeam = teamsOn(G) && G.teams[ME.id];
  const title = myTeam ? TEAM[myTeam].name + ' team chat' : 'Chat';
  const sub = myTeam ? 'Only your team sees this' : 'Everyone in the game sees this';
  const empty = myTeam && G.status === 'setting' && isPicker(G, ME.id) ? 'Pitch a word to your team.' : myTeam && G.status === 'setting' ? 'Plan your guessing order while they choose.' : 'No messages yet.';
  const msgs = ON.chat.slice(-40).map(m => '<li class="' + (m.id === ME.id ? 'me' : '') + (m.t > fx.chatSeen ? ' new' : '') + '">' + avatarHTML(G, m.id, 'sm') + '<div><b>' + esc(m.id === ME.id ? 'You' : nameOf(G, m.id)) + '</b><span>' + esc(m.text) + '</span></div></li>').join('');
  return '<div class="card chat' + (myTeam ? ' t-' + myTeam : '') + '"><div class="card-h"><span class="eyebrow">' + (myTeam ? '<span class="team-dot"></span>' : '') + esc(title) + '</span><span class="muted small">' + sub + '</span></div>' +
    '<ul class="msgs" id="msgs" aria-live="polite">' + (msgs || '<li class="muted small">' + empty + '</li>') + '</ul>' +
    '<form class="chatform" data-form="chat"><input id="chat-input" class="field" maxlength="200" autocomplete="off" placeholder="Message your ' + (myTeam ? 'team' : 'friends') + '" aria-label="Chat message"><button class="btn" type="submit">Send</button></form></div>';
}
function railHTML(G) {
  return chatHTML(G) +
    '<div class="card"><div class="card-h"><span class="eyebrow">' + (teamsOn(G) ? 'Players' : 'Scores') + '</span></div>' + playersHTML(G) + '</div>' + reactDock(G);
}
function roundResult(G, word) {
  const solved = G.result === 'solved';
  const last = G.round >= G.totalRounds;
  const teams = teamsOn(G) && G.pickTeam;
  let title, deltas, next = '';
  if (teams) {
    title = solved ? esc(nameOf(G, G.solver)) + ' solved it for the ' + teamName(otherTeam(G.pickTeam)) : 'The ' + teamName(G.pickTeam) + '’s word survived';
    deltas = TEAM_IDS.filter(t => (G.roundTeamPts || {})[t] > 0).map(t => '<span class="delta t-' + t + '"><span class="team-dot"></span>' + TEAM[t].name + ' <b>+' + G.roundTeamPts[t] + '</b></span>').join('');
    if (!last) next = 'The ' + teamName(otherTeam(G.pickTeam)) + ' picks the next word.';
  } else {
    title = solved ? esc(nameOf(G, G.solver)) + ' solved it' : G.setter ? esc(nameOf(G, G.setter)) + '’s word survived' : 'Nobody got it';
    deltas = Object.entries(G.roundPts || {}).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1])
      .map(([id, p]) => '<span class="delta">' + esc(nameOf(G, id)) + ' <b>+' + p + '</b></span>').join('');
    const nextSetter = !last && G.settings.source === 'friends' && G.order.length >= 2 ? G.order[G.round % G.order.length] : null;
    if (nextSetter) next = (G.kind === 'online' && nextSetter === ME.id ? 'You pick' : esc(nameOf(G, nextSetter)) + ' picks') + ' the next word.';
  }
  const hero = solved && G.solver ? avatarHTML(G, G.solver, 'xl celebrate cheer') : (teams ? membersOf(G, G.pickTeam).slice(0, 3).map(id => avatarHTML(G, id, 'lg celebrate')).join('') : G.setter ? avatarHTML(G, G.setter, 'xl celebrate') : '');
  return '<div class="result">' + (hero ? '<div class="result-av">' + hero + '</div>' : '') + '<div class="eyebrow">Round ' + G.round + ' of ' + G.totalRounds + '</div><h2>' + title + '</h2>' +
    '<p class="muted">The word was <b style="color:var(--ink)">' + esc(word) + '</b>' + (G.category ? ' <span class="muted">(' + esc(catLabel(G.category)) + ')</span>' : '') + '</p>' +
    (deltas ? '<div class="deltas">' + deltas + '</div>' : '') +
    '<button class="btn primary big" data-act="next">' + (last ? 'See final scores' : 'Next round') + '</button>' +
    (next ? '<p class="muted small">' + next + '</p>' : '') +
  '</div>';
}
function renderFinal(G) {
  const ids = G.order.slice().sort((a, b) => (G.scores[b] || 0) - (G.scores[a] || 0));
  const top = ids.length ? (G.scores[ids[0]] || 0) : 0;
  let title, teamBlock = '';
  if (teamsOn(G)) {
    const ts = G.teamScores || { a: 0, b: 0 };
    title = ts.a === ts.b ? 'The teams are tied' : 'The ' + teamName(ts.a > ts.b ? 'a' : 'b') + ' wins';
    teamBlock = vsBanner(G) + (ids.length && top > 0 ? '<p class="muted" style="margin:0">Most points: <b style="color:var(--ink)">' + esc(nameOf(G, ids[0])) + '</b> with ' + top + '</p>' : '');
  } else {
    const winners = ids.filter(id => (G.scores[id] || 0) === top);
    title = !ids.length ? 'Game over' : winners.length > 1 ? 'A tie between ' + winners.map(id => esc(nameOf(G, id))).join(' and ') : esc(nameOf(G, winners[0])) + ' wins';
  }
  const canAgain = G.kind === 'local' || (G.kind === 'online' && G.host === ME.id);
  const podium = ids.length >= 2 ? '<div class="podium">' + [1, 0, 2].filter(i => ids[i]).map(i => '<div class="pod p' + (i + 1) + '">' + (i === 0 ? '<img class="crown" src="/avatars/crown.png" alt="" aria-hidden="true">' : '') + avatarHTML(G, ids[i], i === 0 ? 'xl cheer' : 'lg') + '<b>' + esc(nameOf(G, ids[i])) + '</b><span>' + (G.scores[ids[i]] || 0) + '</span><div class="pod-block">' + (i + 1) + '</div></div>').join('') + '</div>' : '';
  return '<section class="final"><div class="eyebrow">Final scores · ' + G.totalRounds + ' ' + plural(G.totalRounds, 'round', 'rounds') + '</div><h1>' + title + '</h1>' + teamBlock + podium +
    '<ol class="standings">' + ids.map((id, i) => '<li class="' + (!teamsOn(G) && (G.scores[id] || 0) === top ? 'first' : '') + '"><span class="rank">' + (i + 1) + '</span>' + avatarHTML(G, id) + '<span class="nm">' + esc(nameOf(G, id)) + (teamsOn(G) && G.teams[id] ? ' <span class="muted small">' + TEAM[G.teams[id]].name + '</span>' : '') + '</span><span class="sc">' + (G.scores[id] || 0) + '</span></li>').join('') + '</ol>' +
    (G.history.length ? '<ul class="history">' + G.history.map(h => '<li>Round ' + h.round + ' · <b>' + esc(h.word) + '</b>' + (h.pickTeam && teamsOn(G) ? ' from the ' + teamName(h.pickTeam) : h.setter ? ' by ' + esc(nameOf(G, h.setter)) : '') + ' · ' + (h.result === 'solved' ? 'solved by ' + esc(nameOf(G, h.solver)) : 'nobody solved it') + '</li>').join('') + '</ul>' : '') +
    '<div class="row" style="justify-content:center">' + (canAgain ? '<button class="btn primary big" data-act="again">Play again</button>' : (G.kind === 'online' ? '<p class="muted">Waiting for ' + esc(nameOf(G, G.host)) + ' to start a new game<span class="dots"></span></p>' : '')) +
    '<button class="btn" data-act="' + (G.kind === 'online' ? 'leave' : 'home') + '">' + (G.kind === 'online' ? 'Leave game' : 'Back to home') + '</button></div></section>';
}
function setWordForm(masked, heading, note) {
  return '<form class="panel setform" data-form="setword">' +
    '<h2>' + (heading || 'Pick a word for your friends') + '</h2>' + (note ? '<p class="muted small" style="margin:-6px 0 0">' + note + '</p>' : '') +
    '<div><label class="lbl" for="sw-word">Word or short phrase</label><div class="row"><input id="sw-word" class="field big" type="' + (masked && !S.showWord ? 'password' : 'text') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="e.g. BUTTERFLY">' +
    (masked ? '<button type="button" class="btn" data-act="toggle-show">' + (S.showWord ? 'Hide' : 'Show') + '</button>' : '') + '</div></div>' +
    '<div><label class="lbl" for="sw-cat">Category <span class="req">required</span></label><input id="sw-cat" class="field" maxlength="24" autocomplete="off" placeholder="e.g. Movie">' +
      '<div class="chips catchips" role="group" aria-label="Category suggestions">' + CAT_SUGGEST.map(c => '<button type="button" class="chip" data-act="catchip" data-v="' + c + '">' + c + '</button>').join('') + '</div></div>' +
    '<div><label class="lbl" for="sw-hint">Hint (optional)</label><input id="sw-hint" class="field" maxlength="60" placeholder="e.g. Has colourful wings"></div>' +
    '<p class="err">' + esc(S.err) + '</p>' +
    '<div class="row"><button class="btn primary" type="submit">Lock it in</button><button type="button" class="btn" data-act="suggest">Suggest a word</button></div>' +
    '<p class="muted small" style="margin:0">3 to 24 letters, up to 3 words. Everyone sees the category and hint. Spaces, hyphens and apostrophes are shown for free.</p>' +
  '</form>';
}
function renderLocal() {
  const G = S.local.G;
  if (G.status === 'done') return renderFinal(G);
  if (G.status === 'setting') {
    const head = '<div class="eyebrow">Round ' + G.round + ' of ' + G.totalRounds + '</div>';
    if (teamsOn(G)) {
      const tn = teamName(G.pickTeam), on = teamName(otherTeam(G.pickTeam));
      if (!S.reveal) return '<section class="setword center">' + head + vsBanner(G) + '<h2>Pass the device to the ' + tn + '</h2><p class="muted" style="margin:0">The ' + on + ' looks away while the ' + tn + ' huddles and agrees on a word.</p><div class="row" style="justify-content:center"><button class="btn primary big" data-act="reveal">We’re the ' + tn + '</button><button class="btn" data-act="random-word">Use a random word</button></div></section>';
      return '<section class="setword">' + head + setWordForm(true, 'Pick a word for the ' + on, 'Talk it over quietly, then lock it in.') + '</section>';
    }
    const nm = esc(nameOf(G, G.setter));
    if (!S.reveal) return '<section class="setword center">' + head + '<h2>Pass the device to ' + nm + '</h2><p class="muted" style="margin:0">Everyone else, look away while ' + nm + ' picks a word.</p><div class="row" style="justify-content:center"><button class="btn primary big" data-act="reveal">I’m ' + nm + '</button><button class="btn" data-act="random-word">Use a random word</button></div></section>';
    return '<section class="setword"><div class="eyebrow">Round ' + G.round + ' of ' + G.totalRounds + ' · ' + nm + ' is picking</div>' + setWordForm(true) + '</section>';
  }
  const word = wordOf(G), key = gameKey(G), over = G.status === 'over';
  const status = over ? '' : avatarHTML(G, G.turn) + '<span>' + esc(nameOf(G, G.turn)) + '’s turn' + (teamsOn(G) ? ' (' + TEAM[G.teams[G.turn]].name + ')' : '') + '</span>';
  const below = over ? roundResult(G, word) : keyboardHTML(G, word, true) + solveRow(true);
  return boardShell({ G, word, key, eyebrow: roundEyebrow(G), clue: clueFor(G), status, below, rail: railHTML(G) });
}
function lobbyPlayers(G) {
  if (!teamsOn(G)) return playersHTML(G, true);
  const mine = G.teams[ME.id];
  return '<div class="teamcols">' + TEAM_IDS.map(t => {
    const m = membersOf(G, t);
    return (t === 'b' ? '<div class="vs-mid lobby-vs" aria-hidden="true">VS</div>' : '') + '<div class="teamcol t-' + t + '"><div class="teamcol-h"><span class="team-dot"></span>' + TEAM[t].name + ' <span class="count">' + m.length + '</span></div>' +
      (m.length ? playersHTML(G, true, m) : '<p class="muted small" style="margin:6px 0">Nobody yet</p>') +
      (mine !== t ? '<button class="btn quiet" data-act="team" data-team="' + t + '">Join ' + TEAM[t].name + '</button>' : '') + '</div>';
  }).join('') + '</div>' + (G.host === ME.id && G.order.length > 1 ? '<button class="btn" data-act="shuffle" style="margin-top:10px">Shuffle teams</button>' : '');
}
function renderLobby(G) {
  const isHost = G.host === ME.id;
  const teamsBad = teamsOn(G) && (!membersOf(G, 'a').length || !membersOf(G, 'b').length);
  return '<section class="lobby">' +
    '<div class="panel"><div class="eyebrow">Game code</div><div class="code-tiles">' + [...G.code].map(c => '<span class="t on">' + esc(c) + '</span>').join('') + '</div>' +
      '<p class="muted" style="margin:0 0 12px">Send friends the link, or have them open Hangtime and enter this code.</p>' +
      '<div class="row"><button class="btn primary" data-act="invite">' + ICON.share + 'Invite friends</button><button class="btn" data-act="copy-code">' + ICON.copy + 'Copy link</button></div></div>' +
    '<div class="panel"><h2>Players <span class="count">' + G.order.length + '</span></h2>' + lobbyPlayers(G) +
      '<div style="margin-top:12px"><label class="lbl" for="nick-lobby">Your name in this game</label><div class="row"><input id="nick-lobby" class="field" maxlength="20" value="' + esc((G.nicks && G.nicks[ME.id]) || myNick()) + '" placeholder="Your name"><button class="btn" data-act="save-nick">Save</button></div>' +
      '<span class="lbl" style="margin-top:10px">Your avatar</span>' + avatarPicker(avatarKeyOf(G, ME.id), 'lobby-avatar') + '</div></div>' +
    '<div class="panel span"><h2>Settings</h2>' + (isHost ? '' : '<p class="muted small" style="margin:0">Only ' + esc(nameOf(G, G.host)) + ' can change these.</p>') + settingsHTML('setting', G.settings, isHost, false) +
      '<p class="rules">' + (teamsOn(G) ? 'Teams swap every round: one team agrees on a word and its category in its private chat, the other team guesses it.' : 'Everyone takes a turn giving the word. Guess a right letter and you go again; miss and the turn passes on.') + ' Every word is worth the same, short or long: up to 100 points, plus 5 for each life left.</p></div>' +
    '<div class="span">' + chatHTML(G) + '</div>' +
    '<div class="span start-row">' + (isHost
      ? '<button class="btn primary big" data-act="start"' + (teamsBad ? ' disabled' : '') + '>Start game</button>' + (teamsBad ? '<span class="muted small">Each team needs at least one player.</span>' : G.order.length < 2 && G.settings.source === 'friends' ? '<span class="muted small">With one player the words are random until a friend joins.</span>' : '')
      : '<p class="muted" style="margin:0">Waiting for ' + esc(nameOf(G, G.host)) + ' to start<span class="dots"></span></p>') +
      '<button class="btn quiet" data-act="leave">Leave game</button></div>' +
  '</section>';
}
function renderOnline() {
  if (!ON || !ON.game) return '<div class="loading">Opening game ' + esc(ON ? ON.code : '') + '<span class="dots"></span></div>';
  const G = ON.game;
  if (!G.order.includes(ME.id)) {
    return '<section class="setword center"><h2>You’re not in game ' + esc(G.code) + '</h2><p class="muted" style="margin:0">You left this game, maybe from another tab.</p><div class="row" style="justify-content:center">' + (G.status !== 'done' ? '<button class="btn primary" data-act="join-open" data-code="' + esc(G.code) + '">Join again</button>' : '') + '<button class="btn" data-act="home">Back to home</button></div></section>';
  }
  if (G.status === 'lobby') return renderLobby(G);
  if (G.status === 'done') return renderFinal(G);
  const key = gameKey(G);
  const teams = teamsOn(G) && G.pickTeam;
  const picker = isPicker(G, ME.id) || (!teams && G.setter === ME.id);
  if (G.status === 'setting') {
    if (picker) {
      const form = teams ? setWordForm(false, 'Pick a word for the ' + teamName(otherTeam(G.pickTeam)), 'Agree on it in your team chat. Anyone on your team can lock it in.') : setWordForm(false);
      return '<section class="board has-rail"><div class="play"><div class="roundline">' + roundEyebrow(G) + '</div>' + (teams ? vsBanner(G) : '') + '<div class="setword">' + form + '</div>' + reactDock(G) + '</div><aside class="rail">' + railHTML(G) + '</aside></section>';
    }
    const who = teams ? 'The ' + teamName(G.pickTeam) + ' is' : esc(nameOf(G, G.setter)) + ' is';
    const pickers = teams ? membersOf(G, G.pickTeam) : [G.setter];
    const away = ON.lastHb && !pickers.some(id => ON.online.has(id));
    const below = '<div class="waiting"><h2>' + who + ' picking a word<span class="dots"></span></h2><p class="muted" style="margin:0">' + (teams ? 'Plan your guesses in team chat. Guessing starts as soon as they lock it in.' : 'Guessing starts as soon as it’s locked in.') + '</p>' +
      (away || G.host === ME.id ? '<button class="btn" data-act="random-word">Draw a random word instead</button>' : '') + '</div>';
    return boardShell({ G, word: '', key, eyebrow: roundEyebrow(G), status: '', below, rail: railHTML(G) });
  }
  const word = displayWord(G), over = G.status === 'over';
  const myTurn = canGuess(G, ME.id);
  let status = '', extra = '';
  if (!over) {
    if (picker) status = teams ? 'Your team picked this word. Watch the ' + teamName(otherTeam(G.pickTeam)) + ' try.' : 'You picked this word. See if they can get it.';
    else if (!G.settings.turns) status = teams ? 'Your whole team can guess. Talk it through in team chat.' : 'Everyone guesses at once. Solve it first for the bonus.';
    else if (myTurn) status = '<span>Your turn. Pick a letter or solve the word.</span>';
    else {
      status = avatarHTML(G, G.turn) + '<span>' + esc(nameOf(G, G.turn)) + '’s turn</span>';
      extra += '<button class="btn quiet" data-act="nudge">Nudge</button>';
    }
    if (G.settings.turns && G.turn && G.turn !== ME.id && (G.host === ME.id || (ON.lastHb && !ON.online.has(G.turn)))) extra += '<button class="btn quiet" data-act="skip">Skip ' + esc(nameOf(G, G.turn)) + '’s turn</button>';
  }
  const canPlay = !over && !picker;
  const below = over ? roundResult(G, word) : keyboardHTML(G, word, myTurn) + (canPlay ? solveRow(myTurn, extra) : (extra ? '<div class="actions">' + extra + '</div>' : ''));
  return boardShell({ G, word, key, eyebrow: roundEyebrow(G), clue: clueFor(G), status, below, rail: railHTML(G), mine: picker && !over });
}
function renderModal() {
  const root = $('#modal-root');
  if (!S.modal) { root.innerHTML = ''; return; }
  let body = '';
  if (S.modal === 'help') {
    body = '<h2>How to play</h2><ul>' +
      '<li>Guess the hidden word one letter at a time. Each wrong letter draws another part of the figure.</li>' +
      '<li>Solve the whole word whenever you think you know it. A wrong answer costs a life, the same as a wrong letter.</li>' +
      '<li>The daily word is the same for everyone and changes at midnight. Share your result to compare with friends.</li>' +
      '<li>Every word is worth the same, short or long. Letters you uncover share 60 points. Finishing the word earns 40 more, plus 5 for each life left. If nobody solves it, whoever gave the word earns 50.</li>' +
      '<li>Guess a right letter and you go again; miss and the turn passes to the next player. Each player (or each team) takes a turn giving the word.</li>' +
      '<li>With the timer on, you have 60 seconds to guess and 120 seconds to give a word. Run out while guessing and the turn passes on; run out while giving a word and a random word is drawn.</li>' +
      '<li>Team battle: Red vs Blue. One team agrees on a word and its category in its private chat, the other team guesses, then they swap. Team points decide the winner.</li>' +
      '<li>On a computer you can type letters on your keyboard.</li></ul>';
  } else if (S.modal === 'stats') {
    const d = STATS.dist || {};
    const rows = [0, 1, 2, 3, 4, 5].map(String).concat(['x']);
    const max = Math.max(1, ...rows.map(r => d[r] || 0));
    body = '<h2>Your statistics</h2>' + miniStats() +
      '<div class="eyebrow" style="margin-top:18px">Misses per solved word</div><div class="dist">' +
      rows.map(r => '<div class="dist-row"><span>' + (r === 'x' ? '✕' : r) + '</span><span class="dist-bar' + (STATS.last === r ? ' hl' : '') + '" style="width:' + Math.max(8, Math.round((d[r] || 0) / max * 100)) + '%">' + (d[r] || 0) + '</span></div>').join('') +
      '</div><p class="muted small" style="margin:12px 0 0">Counts daily and practice words on this device. ✕ means out of lives.</p>';
  } else if (S.modal && S.modal.avatarFor != null) {
    const i = S.modal.avatarFor;
    body = '<h2>Pick an avatar</h2><p class="muted small" style="margin:-6px 0 12px">For ' + esc(String(S.setup.names[i] || '').trim() || 'Player ' + (i + 1)) + '</p>' + avatarPicker(localAvatar(i), 'lavatar-pick', ' data-i="' + i + '"');
  } else if (S.modal && S.modal.copy) {
    body = '<h2>Copy this</h2><p class="muted small">Your browser blocked automatic copying. Select the text and copy it.</p><textarea id="copy-area" readonly>' + esc(S.modal.copy) + '</textarea>';
  }
  root.innerHTML = '<div class="scrim" data-act="modal-close-scrim"><div class="modal" role="dialog" aria-modal="true">' +
    '<button class="icon-btn x" data-act="modal-close" aria-label="Close">' + ICON.close + '</button>' + body + '</div></div>';
  const ta = $('#copy-area'); if (ta) { ta.focus(); ta.select(); }
}
async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch (e) { S.modal = { copy: text }; renderModal(); }
}
async function shareOrCopy(data, ok) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(data.url ? data.text + ' ' + data.url : data.text, ok);
}
const inviteUrl = code => location.origin + location.pathname + '?g=' + code;

let lastChat = 0;
async function sendChat() {
  const i = $('#chat-input');
  const text = String(i ? i.value : '').trim();
  if (!text || !ON || Date.now() - lastChat < 400) return;
  lastChat = Date.now();
  i.value = '';
  const mine = ON;
  try { await api('chat', { code: ON.code, text }); if (ON === mine) { clearTimeout(ON.timer); poll(); } }
  catch (e) { toast(e.msg); if (i && !i.value) i.value = text; }
}

// ---------- events ----------
let lastReact = 0;
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act;
  if (a === 'modal-close-scrim' && e.target !== el) return;
  SND.unlock();
  const G = curG();
  switch (a) {
    case 'home': goHome(); break;
    case 'help': case 'stats': S.modal = a; renderModal(); break;
    case 'modal-close': case 'modal-close-scrim': S.modal = null; renderModal(); break;
    case 'sound': SND.on = !SND.on; store.set('sound', SND.on); if (SND.on) SND.play('pop'); render(); break;
    case 'theme': { const order = ['system', 'light', 'dark']; const cur = store.get('theme', 'system'); const nx = order[(order.indexOf(cur) + 1) % 3]; store.set('theme', nx); applyTheme(); toast(nx === 'system' ? 'Theme follows your system' : nx === 'light' ? 'Light theme' : 'Dark theme'); break; }
    case 'daily': startSolo('daily'); break;
    case 'practice': startSolo('practice'); break;
    case 'practice-new': S.solo = null; startSolo('practice', true); break;
    case 'pcat': S.practiceCat = el.dataset.v; store.set('practiceCat', S.practiceCat); render(); break;
    case 'local-setup': S.view = 'local-setup'; render(); break;
    case 'local-resume': { const L = store.get('local', null); if (L) { closeOnline(); S.local = { G: L }; S.kind = 'local'; S.view = 'game'; S.reveal = false; render(); } break; }
    case 'padd': if (S.setup.names.length < 6) { S.setup.names.push(''); store.set('setup', S.setup); render(); } break;
    case 'pdel': { const i = Number(el.dataset.i); S.setup.names.splice(i, 1); S.setup.teams.splice(i, 1); (S.setup.avatars || []).splice(i, 1); store.set('setup', S.setup); render(); break; }
    case 'lsetting': { const k = el.dataset.k; let v = el.dataset.v; if (k === 'maxMisses' || k === 'rounds' || k === 'timer') v = Number(v); S.setup.settings[k] = v; store.set('setup', S.setup); render(); break; }
    case 'local-start': startLocal(); break;
    case 'reveal': S.reveal = true; S.err = ''; render(); { const i = $('#sw-word'); if (i) i.focus(); } break;
    case 'toggle-show': { S.showWord = !S.showWord; const i = $('#sw-word'); if (i) i.type = S.showWord ? 'text' : 'password'; el.textContent = S.showWord ? 'Hide' : 'Show'; break; }
    case 'suggest': { const i = $('#sw-word'); if (i) { const p = pickWord('any', []); i.value = p.w; i.focus(); } break; }
    case 'random-word': S.reveal = false; dispatch({ t: 'skip' }); break;
    case 'key': dispatch({ t: 'guess', letter: el.dataset.k }); break;
    case 'solve-open': S.solveOpen = true; render(); { const i = $('#solve-input'); if (i) i.focus(); } break;
    case 'solve-cancel': S.solveOpen = false; render(); break;
    case 'next': if (G) dispatch({ t: 'next', round: G.round }); break;
    case 'again': dispatch({ t: 'again' }); break;
    case 'share': if (S.solo) shareOrCopy({ text: shareText(S.solo.G) }, 'Result copied. Paste it to your friends.'); break;
    case 'create': createGame(); break;
    case 'create-teams': createGame('teams'); break;
    case 'pick-avatar': store.set('avatar', el.dataset.v); SND.play('pop'); render(); break;
    case 'lobby-avatar': {
      store.set('avatar', el.dataset.v); SND.play('pop');
      if (ON && G) { const mine = ON; const nick = (G.nicks && G.nicks[ME.id]) || myNick() || 'Player'; api('nick', { code: ON.code, nick, avatar: el.dataset.v }).then(j => { if (ON === mine && j.game) { applyGame(j.game); scheduleRender(); } }, err => toast(err.msg)); }
      break;
    }
    case 'lavatar': S.modal = { avatarFor: Number(el.dataset.i) }; renderModal(); break;
    case 'lavatar-pick': { const i = Number(el.dataset.i); S.setup.avatars = S.setup.avatars || []; S.setup.avatars[i] = el.dataset.v; store.set('setup', S.setup); S.modal = null; SND.play('pop'); render(); break; }
    case 'catchip': { const i = $('#sw-cat'); if (i) { i.value = el.dataset.v; i.focus(); } break; }
    case 'join-open': joinGame(el.dataset.code); break;
    case 'invite-dismiss': S.invite = ''; history.replaceState(null, '', location.pathname); render(); break;
    case 'invite': if (G) shareOrCopy({ title: 'Hangtime', text: 'Play Hangtime with me. Game code ' + G.code + '.', url: inviteUrl(G.code) }, 'Invite link copied'); break;
    case 'copy-code': if (G) copyText(inviteUrl(G.code), 'Invite link copied'); break;
    case 'setting': { const k = el.dataset.k; let v = el.dataset.v; if (k === 'maxMisses' || k === 'rounds' || k === 'timer') v = Number(v); if (k === 'turns') v = v === 'true'; dispatch({ t: 'settings', settings: { [k]: v } }); break; }
    case 'start': dispatch({ t: 'start' }); break;
    case 'leave': leaveOnline(); break;
    case 'save-nick': {
      const i = $('#nick-lobby'); const v = String(i ? i.value : '').trim().slice(0, 20);
      if (!v) { toast('Names can’t be empty.'); break; }
      store.set('nick', v);
      if (ON) { const mine = ON; api('nick', { code: ON.code, nick: v, avatar: myAvatar() }).then(j => { if (ON === mine && j.game) { applyGame(j.game); scheduleRender(); } toast('Name saved'); }, err => toast(err.msg)); }
      break;
    }
    case 'skip': dispatch({ t: 'skip' }); break;
    case 'team': if (ME.id) dispatch({ t: 'team', id: ME.id, team: el.dataset.team }); break;
    case 'shuffle': dispatch({ t: 'shuffle' }); break;
    case 'lteam': { const i = Number(el.dataset.i); S.setup.teams[i] = localTeam(i) === 'a' ? 'b' : 'a'; store.set('setup', S.setup); render(); break; }
    case 'nudge': if (ON && G && G.turn) api('nudge', { code: ON.code, to: G.turn }).then(() => toast('Nudge sent'), err => toast(err.msg)); break;
    case 'react': {
      if (!ON || Date.now() - lastReact < 1200) break;
      lastReact = Date.now();
      const em = el.dataset.e; flyReaction(ME.id, em);
      api('react', { code: ON.code, e: em }).catch(() => {});
      break;
    }
  }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  SND.unlock();
  const kind = f.dataset.form;
  if (kind === 'join') joinGame($('#join-code').value);
  else if (kind === 'invite') joinGame(S.invite);
  else if (kind === 'chat') sendChat();
  else if (kind === 'solve') { const v = $('#solve-input').value; if (!normalize(v)) return; S.clear.push('solve-input'); dispatch({ t: 'solve', word: v }); }
  else if (kind === 'setword') {
    const w = normalize($('#sw-word').value), hint = String($('#sw-hint').value || '').trim().slice(0, 60);
    const category = cleanLabel($('#sw-cat').value);
    const err = validateWord(w) || (category ? '' : 'Add a category so the guessers know where to start.');
    if (err) { S.err = err; render(); const i = $('#sw-word'); if (i) i.focus(); return; }
    S.err = ''; S.reveal = false; S.showWord = false; S.clear.push('sw-word', 'sw-hint', 'sw-cat');
    dispatch({ t: 'setword', word: w, hint, category });
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'pname') { S.setup.names[Number(el.dataset.i)] = el.value; store.set('setup', S.setup); }
  else if (el.dataset.input === 'nick') store.set('nick', el.value.slice(0, 20));
  else if (el.id === 'join-code') el.value = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; renderModal(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || S.modal) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const k = e.key && e.key.length === 1 ? e.key.toUpperCase() : '';
  if (!isLetter(k)) return;
  const btn = document.querySelector('.key[data-k="' + k + '"]');
  if (btn && !btn.disabled) { e.preventDefault(); btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 120); SND.unlock(); dispatch({ t: 'guess', letter: k }); }
});
setInterval(() => { const el = $('#countdown'); if (el) el.textContent = countdown(); }, 1000);

// ---------- boot ----------
(async () => {
  render();
  await deriveId();
  // Reopening a game link you are already in takes you straight back to the table.
  if (S.invite && recent().some(r => r.code === S.invite)) { const c = S.invite; S.invite = ''; joinGame(c, true); return; }
  render();
})();
