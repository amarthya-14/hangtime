// Game rules shared by the browser (solo and pass and play) and the server (online games).
const CATS = {
  animals: { label: 'Animals', words: ['ELEPHANT','GIRAFFE','PENGUIN','KANGAROO','DOLPHIN','OCTOPUS','CHEETAH','FLAMINGO','PORCUPINE','ARMADILLO','CHAMELEON','HEDGEHOG','JELLYFISH','RHINOCEROS','PLATYPUS','WALRUS','TORTOISE','PEACOCK','SQUIRREL','BUTTERFLY','CROCODILE','MONGOOSE','PANTHER','LOBSTER','HUMMINGBIRD','SEAHORSE','WOLVERINE','CAPYBARA','RED PANDA','SNOW LEOPARD'] },
  food: { label: 'Food', words: ['AVOCADO','BIRYANI','PANCAKE','LASAGNA','CROISSANT','DUMPLING','BURRITO','MANGO LASSI','CHEESECAKE','PRETZEL','SAMOSA','RAMEN','PISTACHIO','BLUEBERRY','CINNAMON','TIRAMISU','GUACAMOLE','MOZZARELLA','POPCORN','MASALA DOSA','PINEAPPLE','BROCCOLI','CHOCOLATE','WAFFLE','NOODLES','PAPRIKA','FRENCH TOAST','PANI PURI'] },
  places: { label: 'Places', words: ['BARCELONA','REYKJAVIK','HYDERABAD','KYOTO','MARRAKESH','SINGAPORE','PATAGONIA','ISTANBUL','VENICE','HONOLULU','CAPE TOWN','KATHMANDU','MONTREAL','SANTORINI','ZANZIBAR','EDINBURGH','BUENOS AIRES','LISBON','PRAGUE','SEOUL','NAIROBI','HAVANA','MALDIVES','BANGALORE','NEW YORK','AMSTERDAM'] },
  sports: { label: 'Sports', words: ['BADMINTON','CRICKET','VOLLEYBALL','MARATHON','SKATEBOARD','SNOOKER','ARCHERY','GYMNASTICS','PENALTY KICK','SLAM DUNK','TRIATHLON','FENCING','KABADDI','SURFING','HAT TRICK','OFFSIDE','CHECKMATE','HOME RUN','POLE VAULT','WIMBLEDON','LONG JUMP','TABLE TENNIS'] },
  science: { label: 'Science', words: ['GRAVITY','MOLECULE','TELESCOPE','VOLCANO','ECLIPSE','NEUTRON','MITOCHONDRIA','MAGNETISM','ASTEROID','FOSSIL','HYDROGEN','GALAXY','CHROMOSOME','EVAPORATION','BLACK HOLE','OXYGEN','NEBULA','ELECTRON','SUPERNOVA','CATALYST','DNA HELIX','PHOTON'] },
  nature: { label: 'Nature', words: ['RAINBOW','WATERFALL','MOUNTAIN','SUNFLOWER','THUNDERSTORM','SNOWFLAKE','FOREST','DESERT','ISLAND','GLACIER','MEADOW','CANYON','CORAL REEF','TORNADO','HURRICANE','PEBBLE','MOONLIGHT','SUNSET','SEASHELL','CACTUS','ACORN','MUSHROOM','LIGHTNING','BLOSSOM'] },
  jobs: { label: 'Jobs', words: ['ASTRONAUT','FIREFIGHTER','DETECTIVE','CARPENTER','PILOT','DENTIST','FARMER','MAGICIAN','LIBRARIAN','PHOTOGRAPHER','ARCHITECT','PLUMBER','SCIENTIST','CHEF','ZOOKEEPER','NURSE','TEACHER','ENGINEER','MUSICIAN','PAINTER','BAKER','LIFEGUARD','JUDGE','MAIL CARRIER'] },
  home: { label: 'Around the house', words: ['UMBRELLA','TOOTHBRUSH','BACKPACK','NOTEBOOK','CANDLE','MIRROR','LANTERN','BICYCLE','SUITCASE','HEADPHONES','TELEVISION','WARDROBE','SCISSORS','BLANKET','KETTLE','PAINTBRUSH','SUNGLASSES','ENVELOPE','CALENDAR','DOORBELL','BOOKSHELF','TEACUP','ALARM CLOCK'] }
};
const CAT_KEYS = Object.keys(CATS);
const ALL = CAT_KEYS.flatMap(c => CATS[c].words.map(w => ({ w, c })));
const DEFAULTS = { mode: 'each', source: 'friends', category: 'any', turns: true, maxMisses: 6, rounds: 0 };
const TEAM_IDS = ['a', 'b'];
const AVATARS = [['boy1', '👦'], ['girl1', '👧'], ['boy2', '👦'], ['girl2', '👧'], ['child1', '🧒'], ['boy3', '👦'], ['girl3', '👧'], ['child2', '🧒'], ['baby', '👶'], ['astronaut', '🧑\u200d🚀'], ['ninja', '🥷'], ['student', '🧑\u200d🎓'], ['artist', '🧑\u200d🎨'], ['prince', '🤴'], ['princess', '👸'], ['singer', '🧑\u200d🎤'], ['detective', '🕵️'], ['farmer', '🧑\u200d🌾']];
const AVATAR_KEYS = AVATARS.map(a => a[0]);
// A word picked by players always comes with a category, so the guessers know where to start.
function cleanLabel(s) {
  const t = String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return t.length >= 2 ? t : '';
}

const isLetter = ch => ch >= 'A' && ch <= 'Z';
function normalize(s) {
  return String(s || '').toUpperCase().replace(/[‘’`]/g, "'").replace(/[^A-Z' -]/g, '')
    .replace(/\s+/g, ' ').replace(/^[ '-]+|[ '-]+$/g, '');
}
function lettersOf(w) { return [...new Set([...w].filter(isLetter))]; }
function isSolved(w, g) { return [...w].every(ch => !isLetter(ch) || g.includes(ch)); }
function hiddenCount(w, g) { return [...w].filter(ch => isLetter(ch) && !g.includes(ch)).length; }
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function xorWith(str, salt) {
  let k = hash32(salt), out = '';
  for (let i = 0; i < str.length; i++) { k = (Math.imul(k, 1103515245) + 12345) >>> 0; out += String.fromCharCode(str.charCodeAt(i) ^ (k >>> 24)); }
  return out;
}
// The word travels obfuscated so it never sits in shared state as plain text; it keeps friends honest, it is not encryption.
function enc(word, salt) { return btoa(xorWith(word, salt)); }
function dec(s, salt) { try { return xorWith(atob(s), salt); } catch (e) { return ''; } }
function validateWord(w) {
  const n = [...w].filter(isLetter).length;
  if (n < 3) return 'Use at least 3 letters.';
  if (n > 24) return 'Keep it to 24 letters or fewer.';
  if (w.split(' ').length > 3) return 'Use up to 3 words.';
  if (lettersOf(w).length < 2) return 'Use at least 2 different letters.';
  return '';
}
function pickWord(cat, usedH, rnd) {
  rnd = rnd || Math.random;
  const pool = cat && CATS[cat] ? CATS[cat].words.map(w => ({ w, c: cat })) : ALL;
  const fresh = pool.filter(p => !(usedH || []).includes(hash32(p.w)));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rnd() * from.length)];
}
function saltOf(G) { return 'hangtime|' + (G.code || G.kind) + '|' + G.round + '|' + (G.createdAt || 0); }
function wordOf(G) { return G.secret ? dec(G.secret, saltOf(G)) : ''; }
function newGame(kind, o) {
  o = o || {};
  const now = Date.now();
  return {
    v: 1, kind, code: o.code || '', host: o.host || null, status: o.status || 'lobby',
    settings: Object.assign({}, DEFAULTS, o.settings || {}), order: o.order || [], names: o.names || {},
    round: 0, totalRounds: 0, setter: null, turn: null, secret: '', hint: '', category: '', len: 0,
    guessed: [], misses: 0, wrongWords: [], result: null, solver: null, answer: '',
    scores: {}, roundPts: {}, log: [], history: [], usedH: [], daily: o.daily || '', nicks: o.nicks || {}, version: 1,
    avatars: o.avatars || {}, teams: o.teams || {}, teamScores: { a: 0, b: 0 }, roundTeamPts: {}, pickTeam: null,
    createdAt: now, updatedAt: now
  };
}
// Teams mode: each round one team picks the word together and the other team guesses; they swap every round.
const teamsOn = G => G.settings.mode === 'teams';
const otherTeam = t => t === 'a' ? 'b' : 'a';
function membersOf(G, t) { return G.order.filter(id => G.teams[id] === t); }
function smallerTeam(G) { return membersOf(G, 'a').length <= membersOf(G, 'b').length ? 'a' : 'b'; }
// Who may pick (and see) this round's word.
function isPicker(G, id) { return teamsOn(G) && G.pickTeam ? G.teams[id] === G.pickTeam : G.setter === id; }
function guessersOf(G) {
  if (teamsOn(G) && G.pickTeam) return membersOf(G, otherTeam(G.pickTeam));
  return G.order.filter(id => id !== G.setter);
}
function firstGuesser(G) {
  const g = guessersOf(G);
  if (!g.length) return null;
  const i = teamsOn(G) ? Math.floor((G.round - 1) / 2) : G.round - 1;
  return g[((i % g.length) + g.length) % g.length];
}
function nextTurn(G, from) {
  const g = guessersOf(G);
  if (!g.length) return null;
  const n = G.order.length, i = G.order.indexOf(from);
  for (let k = 1; k <= n; k++) { const id = G.order[((i + k) % n + n) % n]; if (g.includes(id)) return id; }
  return g[0];
}
// Every word is worth the same: 60 points spread across its letters, 40 for finishing it,
// and 5 for each life left. If nobody solves it, whoever gave the word earns 50.
const LETTER_POOL = 60, SOLVE_BONUS = 40, LIFE_BONUS = 5, SURVIVE_BONUS = 50;
function letterSlots(w) { return [...w].filter(isLetter).length || 1; }
function revealedSlots(w, g) { return [...w].filter(ch => isLetter(ch) && g.includes(ch)).length; }
function poolShare(w, k) { return Math.round(LETTER_POOL * k / letterSlots(w)); }
function finishBonus(G) { return SOLVE_BONUS + LIFE_BONUS * Math.max(0, G.settings.maxMisses - G.misses); }
function addTeamPts(G, t, p) { if (!t) return; G.teamScores[t] = (G.teamScores[t] || 0) + p; G.roundTeamPts[t] = (G.roundTeamPts[t] || 0) + p; }
function addPts(G, id, p) {
  if (!id) return;
  G.scores[id] = (G.scores[id] || 0) + p; G.roundPts[id] = (G.roundPts[id] || 0) + p;
  if (teamsOn(G)) addTeamPts(G, G.teams[id], p);
}
function shuffleTeams(G, rnd) {
  rnd = rnd || Math.random;
  const ids = G.order.slice();
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  G.teams = {};
  ids.forEach((id, i) => { G.teams[id] = TEAM_IDS[i % 2]; });
}
function logIt(G, e) { G.log.push(Object.assign({}, e, { r: G.round, t: Date.now() })); if (G.log.length > 30) G.log = G.log.slice(-30); }
function setSecret(G, w, hint, cat) {
  G.secret = enc(w, saltOf(G)); G.hint = String(hint || '').slice(0, 80); G.category = cat || ''; G.len = w.length;
  G.usedH.push(hash32(w)); if (G.usedH.length > 80) G.usedH = G.usedH.slice(-80);
}
function resetRound(G) {
  G.guessed = []; G.misses = 0; G.wrongWords = []; G.result = null; G.solver = null; G.roundPts = {};
  G.secret = ''; G.hint = ''; G.category = ''; G.answer = ''; G.turn = null; G.setter = null; G.len = 0;
  G.roundTeamPts = {}; G.pickTeam = null;
}
function randomize(G, rnd) {
  const p = pickWord(G.settings.category, G.usedH, rnd);
  G.setter = null; setSecret(G, p.w, '', p.c); G.status = 'playing';
  G.turn = G.settings.turns ? firstGuesser(G) : null;
  logIt(G, { k: 'random' });
}
function beginRound(G, rnd) {
  resetRound(G);
  const n = G.order.length;
  if (teamsOn(G)) {
    if (!membersOf(G, 'a').length || !membersOf(G, 'b').length) { G.status = 'done'; return; }
    G.pickTeam = G.round % 2 === 1 ? 'a' : 'b';
    if (G.settings.source === 'friends') G.status = 'setting';
    else randomize(G, rnd);
    return;
  }
  if (G.settings.source === 'friends' && n >= 2) { G.setter = G.order[(G.round - 1) % n]; G.status = 'setting'; }
  else randomize(G, rnd);
}
function endRound(G, result, solver, w) {
  G.status = 'over'; G.result = result; G.solver = solver || null; G.turn = null; G.answer = w;
  if (result === 'hanged') {
    if (teamsOn(G) && G.pickTeam) {
      addTeamPts(G, G.pickTeam, SURVIVE_BONUS);
      if (G.setter) { G.scores[G.setter] = (G.scores[G.setter] || 0) + SURVIVE_BONUS; G.roundPts[G.setter] = (G.roundPts[G.setter] || 0) + SURVIVE_BONUS; }
    } else if (G.setter) addPts(G, G.setter, SURVIVE_BONUS);
    logIt(G, { k: 'hanged' });
  }
  G.history.push({ round: G.round, word: w, setter: G.setter, result, solver: solver || null, misses: G.misses, pickTeam: G.pickTeam });
  if (G.history.length > 20) G.history = G.history.slice(-20);
}
function canGuess(G, by) {
  if (G.status !== 'playing' || !by || !guessersOf(G).includes(by)) return false;
  return G.settings.turns ? G.turn === by : true;
}
function startGame(G, rnd) {
  if (teamsOn(G)) {
    for (const id of G.order) if (!TEAM_IDS.includes(G.teams[id])) G.teams[id] = smallerTeam(G);
    if (!membersOf(G, 'a').length || !membersOf(G, 'b').length) return false;
  }
  G.totalRounds = Number(G.settings.rounds) || (teamsOn(G) ? 4 : G.settings.source === 'friends' && G.order.length >= 2 ? G.order.length : 5);
  G.round = 1; G.scores = Object.fromEntries(G.order.map(id => [id, 0])); G.history = [];
  G.teamScores = { a: 0, b: 0 };
  beginRound(G, rnd);
  return true;
}
function act(G0, a, by, rnd) {
  const G = JSON.parse(JSON.stringify(G0));
  G.settings = Object.assign({}, DEFAULTS, G.settings || {});
  const word = wordOf(G);
  switch (a.t) {
    case 'guess': {
      const c = String(a.letter || '').toUpperCase();
      if (!canGuess(G, by) || c.length !== 1 || !isLetter(c) || G.guessed.includes(c)) return null;
      const before = revealedSlots(word, G.guessed);
      G.guessed.push(c);
      const n = [...word].filter(x => x === c).length;
      if (n) {
        let p = poolShare(word, before + n) - poolShare(word, before);
        const done = isSolved(word, G.guessed);
        if (done) p += finishBonus(G);
        addPts(G, by, p); logIt(G, { k: 'hit', by, c, n, p });
        if (done) { endRound(G, 'solved', by, word); return G; }
      } else {
        G.misses++; logIt(G, { k: 'miss', by, c });
        if (G.misses >= G.settings.maxMisses) { endRound(G, 'hanged', null, word); return G; }
      }
      // The turn passes after every guess, so everyone gets to play each round.
      if (G.settings.turns) G.turn = nextTurn(G, by);
      return G;
    }
    case 'solve': {
      const w = normalize(a.word);
      if (!canGuess(G, by) || !w) return null;
      if (w === word) {
        const p = LETTER_POOL - poolShare(word, revealedSlots(word, G.guessed)) + finishBonus(G);
        G.guessed = [...new Set(G.guessed.concat(lettersOf(word)))];
        addPts(G, by, p); logIt(G, { k: 'solved', by, p });
        endRound(G, 'solved', by, word);
      } else {
        G.misses++; G.wrongWords.push(w.slice(0, 30)); logIt(G, { k: 'wrong', by, w: w.slice(0, 30) });
        if (G.misses >= G.settings.maxMisses) endRound(G, 'hanged', null, word);
        else if (G.settings.turns) G.turn = nextTurn(G, by);
      }
      return G;
    }
    case 'setword': {
      const w = normalize(a.word);
      const cat = cleanLabel(a.category);
      if (G.status !== 'setting' || validateWord(w) || !cat) return null;
      if (teamsOn(G) ? G.teams[by] !== G.pickTeam : by !== G.setter) return null;
      G.setter = by;
      setSecret(G, w, a.hint, cat);
      G.status = 'playing';
      G.turn = G.settings.turns ? (teamsOn(G) ? firstGuesser(G) : nextTurn(G, G.setter)) : null;
      logIt(G, { k: 'set', by });
      return G;
    }
    case 'skip': {
      if (G.status === 'setting') { randomize(G, rnd); return G; }
      if (G.status !== 'playing' || !G.settings.turns || !G.turn) return null;
      const who = G.turn; G.turn = nextTurn(G, who); logIt(G, { k: 'skip', by, who });
      return G;
    }
    case 'next': {
      if (G.status !== 'over' || a.round !== G.round) return null;
      if (G.round >= G.totalRounds) { G.status = 'done'; return G; }
      G.round++; beginRound(G, rnd);
      return G;
    }
    case 'start': {
      if (G.status !== 'lobby' || by !== G.host || !G.order.length) return null;
      return startGame(G, rnd) ? G : null;
    }
    case 'again': {
      if (G.status !== 'done' || by !== G.host) return null;
      return startGame(G, rnd) ? G : null;
    }
    case 'settings': {
      if (G.status !== 'lobby' || by !== G.host) return null;
      const s = a.settings || {};
      if (s.mode === 'each' || s.mode === 'teams') G.settings.mode = s.mode;
      for (const id of G.order) if (!TEAM_IDS.includes(G.teams[id])) G.teams[id] = smallerTeam(G);
      if (s.source === 'friends' || s.source === 'random') G.settings.source = s.source;
      if (s.category === 'any' || CATS[s.category]) G.settings.category = s.category;
      if (typeof s.turns === 'boolean') G.settings.turns = s.turns;
      if ([6, 8, 10].includes(s.maxMisses)) G.settings.maxMisses = s.maxMisses;
      if ([0, 3, 5, 8].includes(s.rounds)) G.settings.rounds = s.rounds;
      return G;
    }
    case 'team': {
      if (G.status !== 'lobby' || !G.order.includes(a.id) || !TEAM_IDS.includes(a.team)) return null;
      if (by !== a.id && by !== G.host) return null;
      if (G.teams[a.id] === a.team) return null;
      G.teams[a.id] = a.team;
      return G;
    }
    case 'shuffle': {
      if (G.status !== 'lobby' || by !== G.host) return null;
      shuffleTeams(G, rnd); return G;
    }
    case 'join': {
      if (G.order.includes(a.id)) return null;
      G.order.push(a.id); if (G.scores[a.id] == null) G.scores[a.id] = 0;
      if (!TEAM_IDS.includes(G.teams[a.id])) G.teams[a.id] = smallerTeam(G);
      logIt(G, { k: 'join', by: a.id });
      return G;
    }
    case 'leave': {
      const id = a.id;
      if (!G.order.includes(id)) return null;
      const wasTurn = G.turn === id;
      const nt = wasTurn ? nextTurn(G, id) : G.turn;
      G.order = G.order.filter(x => x !== id);
      delete G.teams[id];
      logIt(G, { k: 'leave', by: id });
      if (!G.order.length) { G.status = 'done'; return G; }
      if (G.host === id) G.host = G.order[0];
      if (teamsOn(G) && G.status !== 'lobby' && (!membersOf(G, 'a').length || !membersOf(G, 'b').length)) { G.status = 'done'; G.turn = null; return G; }
      if (G.status === 'setting' && G.setter === id) randomize(G, rnd);
      else if (G.status === 'playing') {
        if (G.setter === id) G.setter = null;
        if (wasTurn && G.settings.turns) G.turn = (nt && G.order.includes(nt) && nt !== G.setter) ? nt : (guessersOf(G)[0] || null);
      }
      return G;
    }
  }
  return null;
}

export { LETTER_POOL, SOLVE_BONUS, LIFE_BONUS, SURVIVE_BONUS, AVATARS, AVATAR_KEYS, cleanLabel, TEAM_IDS, teamsOn, otherTeam, membersOf, isPicker, CATS, CAT_KEYS, ALL, DEFAULTS, isLetter, normalize, lettersOf, isSolved, hiddenCount, hash32, enc, dec, validateWord, pickWord, saltOf, wordOf, newGame, guessersOf, nextTurn, logIt, setSecret, canGuess, act };
