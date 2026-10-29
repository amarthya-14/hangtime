// End-to-end test of api/game.js against an in-memory stand-in for the Upstash REST API.
import assert from 'node:assert/strict';

import { installFakeRedis } from './fake-redis.js';
installFakeRedis('https://redis.test', 5);
const { GET, POST } = await import('../api/game.js');
const post = async body => { const r = await POST(new Request('https://h/api/game', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, j: await r.json() }; };
const get = async q => { const r = await GET(new Request('https://h/api/game?' + new URLSearchParams(q))); return { status: r.status, j: await r.json() }; };

const A = 'aaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbb', C = 'cccccccccccccccccccc';
let r = await post({ op: 'create', key: A, nick: '' });
assert.equal(r.status, 400, 'name required');
r = await post({ op: 'create', key: A, nick: 'Asha' });
assert.equal(r.status, 200); const code = r.j.code; assert.match(code, /^[A-Z]{4}$/);
const idA = r.j.game.me;
assert.equal((await post({ op: 'join', key: B, code: 'ZZZZ', nick: 'Ravi' })).status, 404);
r = await post({ op: 'join', key: B, code, nick: 'Ravi' }); const idB = r.j.game.me;
await post({ op: 'join', key: C, code, nick: 'Kai' });
r = await post({ op: 'act', key: B, code, action: { t: 'start' } });
assert.equal(r.j.refused, true, 'only the host starts');
r = await post({ op: 'act', key: A, code, action: { t: 'start' } });
assert.equal(r.j.game.status, 'setting'); assert.equal(r.j.game.setter, idA);
r = await post({ op: 'act', key: A, code, action: { t: 'setword', word: 'Pit Stop', hint: 'during a race', category: 'Test' } });
assert.equal(r.j.game.mine, 'PIT STOP', 'setter sees the word');
// a guesser's view never contains the word or the encoded secret
r = await get({ code, key: B, v: 0 });
const raw = JSON.stringify(r.j.game);
assert.ok(!raw.includes('PIT STOP') && !raw.includes('STOP') && !('secret' in r.j.game), 'word hidden from guessers');
assert.equal(r.j.game.shown, '??? ????');
assert.equal(r.j.game.turn, idB);
// impersonation: C cannot move on B's turn
r = await post({ op: 'act', key: C, code, action: { t: 'guess', letter: 'P' } });
assert.equal(r.j.refused, true);
r = await post({ op: 'act', key: B, code, action: { t: 'guess', letter: 'P' } });
assert.equal(r.j.game.shown, 'P?? ???P'); assert.equal(r.j.game.scores[idB], 17, '2 of 7 letters = 17 of the 60-point pool');
assert.notEqual(r.j.game.turn, idB, 'the turn passes after a hit too');
// unchanged version returns no game payload
const v = r.j.game.version;
r = await get({ code, key: B, v, hb: 1 });
assert.equal(r.j.game, undefined); assert.ok(r.j.online.length >= 1);
// reactions are delivered to polls
await post({ op: 'react', key: C, code, e: 'gg' });
assert.equal((await post({ op: 'react', key: C, code, e: '<script>' })).status, 400);
r = await get({ code, key: A, v, rx: 0 });
assert.ok(r.j.rx.some(x => x.e === 'gg'));
// everyone-at-once: simultaneous guesses must both land (compare-and-set retries)
let F = (await post({ op: 'create', key: A, nick: 'Asha' })).j; const fc = F.code;
await post({ op: 'join', key: B, code: fc, nick: 'Ravi' }); await post({ op: 'join', key: C, code: fc, nick: 'Kai' });
await post({ op: 'act', key: A, code: fc, action: { t: 'settings', settings: { turns: false } } });
await post({ op: 'act', key: A, code: fc, action: { t: 'start' } });
await post({ op: 'act', key: A, code: fc, action: { t: 'setword', word: 'ALGORITHM', category: 'Test' } });
await Promise.all([
  post({ op: 'act', key: B, code: fc, action: { t: 'guess', letter: 'A' } }),
  post({ op: 'act', key: C, code: fc, action: { t: 'guess', letter: 'Z' } }),
  post({ op: 'act', key: B, code: fc, action: { t: 'guess', letter: 'O' } }),
  post({ op: 'act', key: C, code: fc, action: { t: 'guess', letter: 'Q' } })
]);
r = await get({ code: fc, key: A, v: 0 });
assert.deepEqual([...r.j.game.guessed].sort(), ['A', 'O', 'Q', 'Z'], 'no lost guesses');
assert.equal(r.j.game.misses, 2);
// solve, then the round reveals the answer to everyone
r = await post({ op: 'act', key: C, code: fc, action: { t: 'solve', word: 'algorithm' } });
assert.equal(r.j.game.status, 'over'); assert.equal(r.j.game.answer, 'ALGORITHM');
// leaving: last player out deletes the game
for (const k of [A, B, C]) await post({ op: 'leave', key: k, code: fc });
assert.equal((await get({ code: fc, key: A })).status, 404);
assert.equal((await get({ code, key: 'bad' })).status, 400);
console.log('API TESTS PASSED');

// ---------- teams mode ----------
const D = 'dddddddddddddddddddd';
let T = (await post({ op: 'create', key: A, nick: 'Asha' })).j; const tc = T.code;
for (const [k, n] of [[B, 'Ravi'], [C, 'Kai'], [D, 'Mo']]) await post({ op: 'join', key: k, code: tc, nick: n });
await post({ op: 'act', key: A, code: tc, action: { t: 'settings', settings: { mode: 'teams' } } });
let tg = (await get({ code: tc, key: A, v: 0 })).j.game;
const teamOf = id => tg.teams[id];
assert.equal(Object.values(tg.teams).filter(t => t === 'a').length, 2, 'join balances teams');
assert.equal(Object.keys(tg.teams).length, 4, 'the host is on a team too');
// put Asha + Ravi on Red (a), Kai + Mo on Blue (b)
const ids = {}; for (const [k] of [[A], [B], [C], [D]]) ids[k] = (await get({ code: tc, key: k, v: 0 })).j.game.me;
await post({ op: 'act', key: A, code: tc, action: { t: 'team', id: ids[A], team: 'a' } });
await post({ op: 'act', key: B, code: tc, action: { t: 'team', id: ids[B], team: 'a' } });
await post({ op: 'act', key: C, code: tc, action: { t: 'team', id: ids[C], team: 'b' } });
await post({ op: 'act', key: D, code: tc, action: { t: 'team', id: ids[D], team: 'b' } });
r = await post({ op: 'act', key: C, code: tc, action: { t: 'team', id: ids[A], team: 'b' } });
assert.equal(r.j.refused, true, 'only you or the host can move you');
r = await post({ op: 'act', key: A, code: tc, action: { t: 'start' } });
tg = r.j.game;
assert.equal(tg.status, 'setting'); assert.equal(tg.pickTeam, 'a'); assert.equal(tg.totalRounds, 4);
// red team chats privately about the word
await post({ op: 'chat', key: A, code: tc, text: 'how about MONZA?' });
await post({ op: 'chat', key: C, code: tc, text: 'blue: start with vowels' });
const red = (await get({ code: tc, key: B, v: 0, ch: 'team-a' })).j;
const blue = (await get({ code: tc, key: D, v: 0, ch: 'team-b' })).j;
assert.equal(red.channel, 'team-a'); assert.ok(red.chat.some(m => m.text.includes('MONZA')));
assert.ok(!red.chat.some(m => m.text.includes('vowels')), 'red never sees blue chat');
assert.ok(!blue.chat.some(m => m.text.includes('MONZA')), 'blue never sees red chat');
const sneaky = (await get({ code: tc, key: D, v: 0, ch: 'team-a' })).j;
assert.equal(sneaky.chat, undefined, 'asking for the other team channel returns nothing');
// any red player can lock it in; blue cannot
assert.equal((await post({ op: 'act', key: C, code: tc, action: { t: 'setword', word: 'MONZA', category: 'Test' } })).j.refused, true);
r = await post({ op: 'act', key: B, code: tc, action: { t: 'setword', word: 'MONZA', hint: 'Temple of speed', category: 'Test' } });
assert.equal(r.j.game.status, 'playing'); assert.equal(r.j.game.mine, 'MONZA');
assert.equal((await get({ code: tc, key: A, v: 0 })).j.game.mine, 'MONZA', 'whole red team sees the word');
const bv = (await get({ code: tc, key: C, v: 0 })).j.game;
assert.equal(bv.mine, ''); assert.ok(!JSON.stringify(bv).includes('MONZA'), 'blue never sees the word');
assert.ok([ids[C], ids[D]].includes(bv.turn), 'a blue player guesses first');
// red cannot guess its own word
assert.equal((await post({ op: 'act', key: A, code: tc, action: { t: 'guess', letter: 'M' } })).j.refused, true);
const firstKey = bv.turn === ids[C] ? C : D, secondKey = firstKey === C ? D : C;
r = await post({ op: 'act', key: firstKey, code: tc, action: { t: 'guess', letter: 'O' } });
assert.equal(r.j.game.teamScores.b, 12, '1 of 5 letters = 12');
assert.equal(r.j.game.turn, ids[secondKey], 'turn passes within blue after a hit');
r = await post({ op: 'act', key: secondKey, code: tc, action: { t: 'guess', letter: 'X' } });
assert.equal(r.j.game.turn, ids[firstKey], 'and after a miss');
r = await post({ op: 'act', key: firstKey, code: tc, action: { t: 'solve', word: 'monza' } });
assert.equal(r.j.game.status, 'over'); assert.equal(r.j.game.teamScores.b, 12 + 48 + 40 + 5 * 5, 'rest of the pool + solve bonus + 5 per life left');
r = await post({ op: 'act', key: A, code: tc, action: { t: 'next', round: 1 } });
assert.equal(r.j.game.pickTeam, 'b', 'teams swap');
// red player leaving does not end the game while red still has a player
r = await post({ op: 'leave', key: B, code: tc });
assert.equal((await get({ code: tc, key: A, v: 0 })).j.game.status, 'setting');
await post({ op: 'leave', key: A, code: tc });
assert.equal((await get({ code: tc, key: C, v: 0 })).j.game.status, 'done', 'an empty team ends the game');

// pass and play teams via the shared rules
const L = await import('../public/logic.js');
let P = L.newGame('local', { host: 'p1', order: ['p1', 'p2', 'p3', 'p4'], names: {}, teams: { p1: 'a', p2: 'b', p3: 'a', p4: 'b' }, settings: { mode: 'teams', source: 'random' } });
P = L.act(P, { t: 'start' }, 'p1');
assert.equal(P.status, 'playing'); assert.equal(P.pickTeam, 'a'); assert.ok(['p2', 'p4'].includes(P.turn));
let guard = 0; while (P.status === 'playing' && guard++ < 30) { const w = L.wordOf(P); const miss = 'QXZJVKWYFB'.split('').find(c => !w.includes(c) && !P.guessed.includes(c)); P = L.act(P, { t: 'guess', letter: miss }, P.turn) || P; }
assert.equal(P.result, 'hanged'); assert.equal(P.teamScores.a, 50, 'picking team scores when nobody solves');
let bad = L.newGame('local', { host: 'p1', order: ['p1', 'p2'], teams: { p1: 'a', p2: 'a' }, settings: { mode: 'teams' } });
assert.equal(L.act(bad, { t: 'start' }, 'p1'), null, 'teams need a player each');
console.log('TEAM TESTS PASSED');

// ---------- categories, avatars, team battle ----------
let V = (await post({ op: 'create', key: A, nick: 'Asha', avatar: 'f1', mode: 'teams' })).j;
assert.equal(V.game.settings.mode, 'teams', 'team battle starts in teams mode');
assert.equal(V.game.avatars[V.game.me], 'f1', 'avatar stored');
const vc = V.code;
r = await post({ op: 'join', key: B, code: vc, nick: 'Ravi', avatar: '<img src=x>' });
assert.equal(r.j.game.avatars[r.j.game.me], undefined, 'unknown avatars are ignored');
r = await post({ op: 'nick', key: B, code: vc, nick: 'Ravi', avatar: 'm3' });
assert.equal(r.j.game.avatars[r.j.game.me], 'm3', 'avatar can change in the lobby');
await post({ op: 'act', key: A, code: vc, action: { t: 'start' } });
r = await post({ op: 'act', key: A, code: vc, action: { t: 'setword', word: 'INCEPTION' } });
assert.equal(r.j.refused, true, 'a word without a category is refused');
r = await post({ op: 'act', key: A, code: vc, action: { t: 'setword', word: 'INCEPTION', category: '  Movie ' } });
assert.equal(r.j.game.category, 'Movie', 'category is stored, trimmed');
const guesserView = (await get({ code: vc, key: B, v: 0 })).j.game;
assert.equal(guesserView.category, 'Movie', 'guessers see the category');
for (const k of [A, B]) await post({ op: 'leave', key: k, code: vc });
console.log('CATEGORY + AVATAR TESTS PASSED');

// ---------- fairness: a word's value does not depend on its length ----------
const play = (word, letters) => {
  let G = L.newGame('local', { host: 'a', order: ['a', 'b'], settings: { source: 'friends' } });
  G = L.act(G, { t: 'start' }, 'a'); G = L.act(G, { t: 'setword', word, category: 'Test' }, 'a');
  for (const c of letters) G = L.act(G, { t: 'guess', letter: c }, G.turn) || G;
  return G;
};
const shortWord = play('CAKE', ['C', 'A', 'K', 'E']), longWord = play('BLUEBERRY', ['B', 'L', 'U', 'E', 'R', 'Y']);
assert.equal(shortWord.scores.b, longWord.scores.b, 'a solved 4-letter word scores the same as a solved 9-letter word');
const partial = play('WATERMELON', ['W', 'A', 'T', 'E', 'R']);
assert.ok(partial.scores.b < shortWord.scores.b, 'most of a long word unsolved scores less than a whole short word');
let R3 = L.newGame('local', { host: 'a', order: ['a', 'b', 'c'], settings: { source: 'friends' } });
R3 = L.act(R3, { t: 'start' }, 'a');
const setters = [];
for (let r = 1; r <= 3; r++) { setters.push(R3.setter); R3 = L.act(R3, { t: 'setword', word: 'CAKE', category: 'Food' }, R3.setter); R3 = L.act(R3, { t: 'solve', word: 'cake' }, R3.turn); R3 = L.act(R3, { t: 'next', round: r }, 'a'); }
assert.deepEqual(setters, ['a', 'b', 'c'], 'with 3 players everyone gives a word once');
console.log('FAIRNESS TESTS PASSED');


