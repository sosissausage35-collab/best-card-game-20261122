// Ember Duel — an original mana card battler.
// You are the Ember Knight. The Cinder Warden guards the ember forge.
// Win a round by reducing the Warden to 0 HP. Win all 3 rounds to win the duel.
// Each turn: mana refills, you draw a card, then play cards or end your turn.
// Static files only: no network requests, no libraries, sound via WebAudio.
'use strict';

// ---------- seeded random (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const SEED = Number.isInteger(seedParam) ? seedParam : (Math.floor(Math.random() * 4294967296) >>> 0);
const shot = params.get('shot'); // start | play | win | loss (screenshot staging)
let rng = mulberry32(SEED);

// ---------- card catalogue (all original) ----------
// effect: {dmg, heal, shield, draw}
const CARDS = [
  { id: 'spark',    name: 'Ember Spark',  element: 'ember', art: '🔥', cost: 1, effect: { dmg: 3 },                          text: 'Deal 3 damage.' },
  { id: 'slash',    name: 'Cinder Slash', element: 'ember', art: '⚔️', cost: 2, effect: { dmg: 5 },                          text: 'Deal 5 damage.' },
  { id: 'burst',    name: 'Flameburst',   element: 'ember', art: '💥', cost: 4, effect: { dmg: 9 },                          text: 'Deal 9 damage.' },
  { id: 'sunflare', name: 'Sunflare',     element: 'ember', art: '☀️', cost: 5, effect: { dmg: 12 },                         text: 'Deal 12 damage.' },
  { id: 'mend',     name: 'Tide Mend',    element: 'tide',  art: '💧', cost: 2, effect: { heal: 6 },                         text: 'Restore 6 health.' },
  { id: 'spring',   name: 'Springwater',  element: 'tide',  art: '🌊', cost: 3, effect: { heal: 9 },                         text: 'Restore 9 health.' },
  { id: 'petal',    name: 'Moonpetal',    element: 'tide',  art: '🌸', cost: 2, effect: { heal: 4, draw: 1 },                 text: 'Restore 4 health. Draw a card.' },
  { id: 'gust',     name: 'Gale Gust',    element: 'gale',  art: '🌬️', cost: 1, effect: { dmg: 2, draw: 1 },                  text: 'Deal 2 damage. Draw a card.' },
  { id: 'storm',    name: 'Stormcall',    element: 'gale',  art: '⛈️', cost: 3, effect: { dmg: 6 },                          text: 'Deal 6 damage.' },
  { id: 'zephyr',   name: 'Zephyr Trick', element: 'gale',  art: '🌀', cost: 0, effect: { dmg: 1, draw: 1 },                  text: 'Deal 1 damage. Draw a card.' },
  { id: 'wall',     name: 'Stone Wall',   element: 'stone', art: '🧱', cost: 2, effect: { shield: 7 },                        text: 'Gain 7 shield.' },
  { id: 'granite',  name: 'Granite Guard',element: 'stone', art: '🛡️', cost: 3, effect: { shield: 11 },                       text: 'Gain 11 shield.' },
  { id: 'vine',     name: 'Thorn Vine',   element: 'stone', art: '🌿', cost: 2, effect: { dmg: 4 },                          text: 'Deal 4 damage.' },
  { id: 'bulwark',  name: 'Ember Bulwark',element: 'stone', art: '🔰', cost: 1, effect: { shield: 4, dmg: 2 },                text: 'Gain 4 shield. Deal 2 damage.' },
];
const BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const PLAYER_DECK = ['spark','spark','slash','slash','burst','sunflare','mend','mend','spring','petal','gust','storm','zephyr','zephyr','wall','granite','vine','bulwark','spark','slash'];
const AI_DECK     = ['spark','spark','slash','slash','burst','sunflare','mend','spring','petal','gust','storm','zephyr','wall','granite','vine','bulwark','spark','slash','storm','mend'];

const TOTAL_ROUNDS = 3;
const BEST_KEY = 'ember-duel-best';

// ---------- sound (WebAudio oscillators, no files) ----------
let audioCtx = null, muted = false;
function beep(freq, dur, type) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio unavailable: game still plays */ }
}
const sfx = {
  play: () => beep(520, 0.12, 'triangle'),
  hit: () => { beep(160, 0.18, 'sawtooth'); },
  heal: () => { beep(740, 0.2, 'sine'); beep(980, 0.2, 'sine'); },
  shield: () => beep(340, 0.15, 'square'),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle'), i * 130)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth'), i * 150)); },
  turn: () => beep(440, 0.08, 'sine'),
};

// ---------- state ----------
function makeFighter(hp, deckIds) {
  return { hp, maxHp: hp, shield: 0, mana: 0, maxMana: 3, deck: shuffle(deckIds.slice()), hand: [], discard: [] };
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function aiMaxHp(round) { return 24 + (round - 1) * 5; } // 24, 29, 34 — the Warden grows stronger
function playerMaxMana(round) { return Math.min(4 + round, 9); } // 5, 6, 7 — the Knight channels more ember than the Warden
function aiMaxMana(round) { return Math.min(3 + round, 8); } // 4, 5, 6

let S = null; // game state
function newGame() {
  rng = mulberry32(SEED);
  S = {
    screen: 'title', round: 1, roundWins: 0, score: 0, damageDealt: 0,
    turn: 'player', aiThinking: false,
    player: makeFighter(32, PLAYER_DECK),
    ai: makeFighter(aiMaxHp(1), AI_DECK),
    log: [],
  };
  S.player.maxMana = playerMaxMana(1);
  S.ai.maxMana = aiMaxMana(1);
  drawCards(S.player, 4); drawCards(S.ai, 4);
  startTurn(S.player);
  logMsg('The duel begins. Round 1 — the Cinder Warden has 24 ♥.', 'round');
}
function drawCards(f, n) {
  for (let i = 0; i < n; i++) {
    if (f.deck.length === 0) {
      if (f.discard.length === 0) return;
      f.deck = shuffle(f.discard); f.discard = [];
    }
    if (f.hand.length >= 7) { f.deck.shift(); continue; } // hand full: drawn card is lost
    f.hand.push(f.deck.shift());
  }
}
function startTurn(f) {
  f.mana = f.maxMana;
  drawCards(f, 1);
}
function applyDamage(target, amount) {
  let rest = amount;
  if (target.shield > 0) { const absorbed = Math.min(target.shield, rest); target.shield -= absorbed; rest -= absorbed; }
  target.hp = Math.max(0, target.hp - rest);
  return rest;
}
function playCard(state, who, handIndex) {
  const me = state[who], foe = state[who === 'player' ? 'ai' : 'player'];
  const id = me.hand[handIndex];
  if (id === undefined) return false;
  const card = BY_ID[id];
  if (me.mana < card.cost) return false;
  me.mana -= card.cost;
  me.hand.splice(handIndex, 1);
  me.discard.push(id);
  const e = card.effect;
  const parts = [];
  if (e.dmg) {
    const dealt = applyDamage(foe, e.dmg);
    if (who === 'player') { state.damageDealt += dealt; state.score += dealt; }
    parts.push(`deals ${dealt} damage`);
    sfx.hit();
  }
  if (e.heal) { const before = me.hp; me.hp = Math.min(me.maxHp, me.hp + e.heal); parts.push(`restores ${me.hp - before} health`); sfx.heal(); }
  if (e.shield) { me.shield += e.shield; parts.push(`gains ${e.shield} shield`); sfx.shield(); }
  if (e.draw) { drawCards(me, e.draw); parts.push('draws a card'); }
  const whoName = who === 'player' ? 'You play' : 'Warden plays';
  logMsg(`${whoName} <b>${card.name}</b> — ${parts.join(', ')}.`, e.dmg ? 'dmg' : e.heal ? 'heal' : 'shieldlog');
  if (who === 'player') sfx.play();
  return true;
}

// ---------- AI: plays sensibly ----------
function aiChooseCard(state) {
  const ai = state.ai, me = state.player;
  const affordable = ai.hand.map((id, i) => ({ id, i, card: BY_ID[id] })).filter(x => x.card.cost <= ai.mana);
  if (!affordable.length) return -1;
  // Lethal damage first.
  const lethal = affordable.filter(x => (x.card.effect.dmg || 0) >= me.hp + me.shield);
  if (lethal.length) return lethal.sort((a, b) => a.card.cost - b.card.cost)[0].i;
  // Heal when hurt and a heal is in hand.
  if (ai.hp <= 10) {
    const heal = affordable.filter(x => x.card.effect.heal).sort((a, b) => b.card.effect.heal - a.card.effect.heal)[0];
    if (heal) return heal.i;
  }
  // Shield when the player can hit hard next turn and we have none.
  if (ai.shield === 0) {
    const sh = affordable.filter(x => x.card.effect.shield).sort((a, b) => b.card.effect.shield - a.card.effect.shield)[0];
    if (sh && ai.mana >= 4) return sh.i;
  }
  // Otherwise the biggest damage we can afford (prefer damage + draw).
  const dmg = affordable.filter(x => x.card.effect.dmg)
    .sort((a, b) => (b.card.effect.dmg + (b.card.effect.draw ? 1 : 0)) - (a.card.effect.dmg + (a.card.effect.draw ? 1 : 0)))[0];
  if (dmg) return dmg.i;
  // Fall back to any affordable card, preferring damage, then shield; never waste a heal at full health.
  const rest = affordable.filter(x => !(x.card.effect.heal && ai.hp >= ai.maxHp))
    .sort((a, b) => ((b.card.effect.dmg || 0) + (b.card.effect.shield || 0)) - ((a.card.effect.dmg || 0) + (a.card.effect.shield || 0)));
  return rest.length ? rest[0].i : -1;
}
function aiTakeTurn(state, done) {
  state.aiThinking = true; render();
  let step = 0;
  const tick = () => {
    if (state.screen !== 'play' || state.turn !== 'ai') { state.aiThinking = false; return; }
    const idx = aiChooseCard(state);
    if (idx >= 0 && step < 6) { playCard(state, 'ai', idx); step++; render(); if (checkEnd(state)) { state.aiThinking = false; done(); return; } setTimeout(tick, 650); }
    else {
      state.aiThinking = false;
      state.turn = 'player';
      startTurn(state.player);
      logMsg('Your turn — mana refilled, card drawn.');
      sfx.turn();
      render(); done();
    }
  };
  setTimeout(tick, 650);
}

// ---------- round / match flow ----------
function checkEnd(state) {
  if (state.ai.hp <= 0) {
    state.roundWins += 1;
    state.score += 50;
    if (state.roundWins >= TOTAL_ROUNDS) { endMatch(state, true); return true; }
    state.round += 1;
    const carried = Math.min(state.player.maxHp, state.player.hp + 14);
    const aiHp = aiMaxHp(state.round);
    logMsg(`Round ${state.round - 1} won! The Warden returns stronger (${aiHp} ♥). You recover to ${carried} ♥.`, 'round');
    state.player = makeFighter(state.player.maxHp, PLAYER_DECK);
    state.player.hp = carried;
    state.player.maxMana = playerMaxMana(state.round);
    state.ai = makeFighter(aiHp, AI_DECK);
    state.ai.maxMana = aiMaxMana(state.round);
    drawCards(state.player, 4); drawCards(state.ai, 4);
    state.turn = 'player'; startTurn(state.player);
    render();
    return true;
  }
  if (state.player.hp <= 0) { endMatch(state, false); return true; }
  return false;
}
function endMatch(state, won) {
  state.screen = won ? 'win' : 'loss';
  state.turn = 'none';
  const best = readBest();
  if (state.score > best) saveBest(state.score);
  if (won) sfx.win(); else sfx.lose();
  announce(won ? `Victory! Score ${state.score}.` : `Defeat. Score ${state.score}.`);
  render();
}
function readBest() { try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { window.localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ } }

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const els = {
  title: $('titleScreen'), end: $('endScreen'), endTitle: $('endTitle'), endText: $('endText'), endScore: $('endScore'),
  roundLabel: $('roundLabel'), scoreLabel: $('scoreLabel'),
  aiHpFill: $('aiHpFill'), aiHpText: $('aiHpText'), aiShield: $('aiShield'), aiManaText: $('aiManaText'), aiHand: $('aiHand'),
  playerHpFill: $('playerHpFill'), playerHpText: $('playerHpText'), playerShield: $('playerShield'),
  playerManaText: $('playerManaText'), manaPips: $('manaPips'), playerHand: $('playerHand'),
  log: $('log'), centerMsg: $('centerMsg'), endTurnBtn: $('endTurnBtn'), status: $('status'),
};
function logMsg(html, cls) {
  S.log.push({ html, cls: cls || '' });
  if (S.log.length > 40) S.log.shift();
}
function announce(msg) { els.status.textContent = msg; }
function cardEl(card, index, playable, keyHint) {
  const d = document.createElement('div');
  d.className = `card ${card.element}${playable === false ? ' unaffordable' : ''}`;
  d.innerHTML = `<div class="cost">${card.cost}</div><div class="cname">${card.name}</div>` +
    `<div class="element">${card.element}</div><div class="art">${card.art}</div>` +
    `<div class="effect">${card.text}</div>` + (keyHint ? `<div class="key">[${keyHint}]</div>` : '');
  if (index !== null && index !== undefined) d.dataset.index = index;
  return d;
}
function render() {
  if (!S) return;
  els.title.classList.toggle('hidden', S.screen !== 'title');
  els.end.classList.toggle('hidden', S.screen !== 'win' && S.screen !== 'loss');
  els.roundLabel.textContent = `Round ${Math.min(S.round, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS} · Wins ${S.roundWins}`;
  els.scoreLabel.textContent = `Score ${S.score} · Best ${Math.max(readBest(), S.score)}`;
  // AI
  els.aiHpFill.style.width = `${(S.ai.hp / S.ai.maxHp) * 100}%`;
  els.aiHpText.textContent = `♥ ${S.ai.hp} / ${S.ai.maxHp}`;
  els.aiShield.textContent = S.ai.shield > 0 ? `🛡️ ${S.ai.shield}` : '';
  els.aiManaText.textContent = `🔷 ${S.ai.mana} / ${S.ai.maxMana} · deck ${S.ai.deck.length}`;
  els.aiHand.innerHTML = '';
  S.ai.hand.forEach(() => {
    const b = document.createElement('div');
    b.className = 'card back';
    b.innerHTML = '<div class="backmark">🔥</div><div class="backtext">WARDEN</div>';
    els.aiHand.appendChild(b);
  });
  // Player
  els.playerHpFill.style.width = `${(S.player.hp / S.player.maxHp) * 100}%`;
  els.playerHpText.textContent = `♥ ${S.player.hp} / ${S.player.maxHp}`;
  els.playerShield.textContent = S.player.shield > 0 ? `🛡️ ${S.player.shield}` : '';
  els.playerManaText.textContent = `🔷 ${S.player.mana} / ${S.player.maxMana} · deck ${S.player.deck.length} `;
  els.manaPips.innerHTML = '';
  for (let i = 0; i < S.player.maxMana; i++) {
    const p = document.createElement('span');
    p.className = 'pip' + (i < S.player.mana ? ' on' : '');
    els.manaPips.appendChild(p);
  }
  els.playerHand.innerHTML = '';
  S.player.hand.forEach((id, i) => {
    const card = BY_ID[id];
    const afford = S.player.mana >= card.cost && S.screen === 'play' && S.turn === 'player' && !S.aiThinking;
    const el = cardEl(card, i, afford, String(i + 1));
    el.addEventListener('click', () => onPlayCard(i));
    els.playerHand.appendChild(el);
  });
  // Middle
  els.log.innerHTML = S.log.map(m => `<div class="${m.cls}">${m.html}</div>`).join('');
  els.log.scrollTop = els.log.scrollHeight;
  els.centerMsg.textContent = S.screen === 'play'
    ? (S.turn === 'player' ? (S.aiThinking ? '' : 'Your move — play a card!') : 'The Warden is thinking…')
    : '';
  els.endTurnBtn.disabled = !(S.screen === 'play' && S.turn === 'player' && !S.aiThinking);
  // End screen
  if (S.screen === 'win' || S.screen === 'loss') {
    const won = S.screen === 'win';
    els.endTitle.textContent = won ? '🏆 Victory!' : '💀 Defeat';
    els.endTitle.classList.toggle('lost', !won);
    els.endText.textContent = won
      ? `You defeated the Cinder Warden in all ${TOTAL_ROUNDS} rounds and claimed the ember forge!`
      : `The Cinder Warden wins round ${S.round}. Your ember fades… but a knight always rises again.`;
    els.endScore.textContent = `Score ${S.score} · Damage dealt ${S.damageDealt} · Best ${Math.max(readBest(), S.score)}`;
  }
}

// ---------- input ----------
function onPlayCard(i) {
  if (!S || S.screen !== 'play' || S.turn !== 'player' || S.aiThinking) return;
  const card = BY_ID[S.player.hand[i]];
  if (!card) return;
  if (S.player.mana < card.cost) { logMsg(`Not enough mana for <b>${card.name}</b> (needs ${card.cost} 🔷).`); render(); return; }
  if (playCard(S, 'player', i)) { render(); checkEnd(S); }
}
function onEndTurn() {
  if (!S || S.screen !== 'play' || S.turn !== 'player' || S.aiThinking) return;
  S.turn = 'ai';
  S.ai.maxMana = aiMaxMana(S.round);
  startTurn(S.ai);
  logMsg('You end your turn.');
  render();
  aiTakeTurn(S, () => render());
}
function startDuel() {
  newGame();
  S.screen = 'play';
  announce('Playing. Round 1. Your turn.');
  render();
}
$('startBtn').addEventListener('click', startDuel);
$('againBtn').addEventListener('click', startDuel);
els.endTurnBtn.addEventListener('click', onEndTurn);
$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').textContent = muted ? 'Sound: Off' : 'Sound: On';
});
document.addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') { $('muteBtn').click(); return; }
  if (!S) return;
  if (e.key === 'Enter' || e.key === ' ') {
    if (S.screen === 'title' || S.screen === 'win' || S.screen === 'loss') { e.preventDefault(); startDuel(); }
    return;
  }
  if (S.screen === 'play' && (e.key === 'e' || e.key === 'E')) { onEndTurn(); return; }
  const n = Number.parseInt(e.key, 10);
  if (S.screen === 'play' && n >= 1 && n <= 7) onPlayCard(n - 1);
});

// ---------- screenshot staging: play the real rules forward ----------
// Autopilot: heal when hurt, shield when exposed, otherwise play the biggest hit.
function autopilotPlay(state) {
  let guard = 0;
  while (guard++ < 8) {
    const p = state.player;
    const afford = p.hand.map((id, i) => ({ id, i, c: BY_ID[id] })).filter(x => x.c.cost <= p.mana);
    if (!afford.length) break;
    let pick = null;
    // Lethal damage first.
    pick = afford.filter(x => (x.c.effect.dmg || 0) >= state.ai.hp + state.ai.shield)
      .sort((a, b) => a.c.cost - b.c.cost)[0];
    if (!pick && p.hp <= 14) pick = afford.filter(x => x.c.effect.heal).sort((a, b) => b.c.effect.heal - a.c.effect.heal)[0];
    if (!pick && p.shield === 0) pick = afford.filter(x => x.c.effect.shield).sort((a, b) => b.c.effect.shield - a.c.effect.shield)[0];
    if (!pick) pick = afford.filter(x => (x.c.effect.dmg || 0) > 0)
      .sort((a, b) => (b.c.effect.dmg + (b.c.effect.draw ? 1 : 0)) - (a.c.effect.dmg + (a.c.effect.draw ? 1 : 0)))[0];
    if (!pick) pick = afford[0];
    if (!pick) break;
    playCard(state, 'player', pick.i);
    if (state.ai.hp <= 0 || state.player.hp <= 0) return;
  }
}
function simulateTurns(state, maxTurns, idlePlayer) {
  for (let t = 0; t < maxTurns; t++) {
    if (state.screen !== 'play') break;
    if (!idlePlayer) autopilotPlay(state);
    if (checkEnd(state)) break;
    if (state.screen !== 'play') break;
    // AI turn, synchronously (no animation delays in simulation).
    state.turn = 'ai'; startTurn(state.ai);
    let g = 0;
    while (g++ < 6) { const idx = aiChooseCard(state); if (idx < 0) break; playCard(state, 'ai', idx); if (checkEnd(state)) break; }
    if (state.screen !== 'play') break;
    state.turn = 'player'; startTurn(state.player);
  }
}
function stageShot(name) {
  newGame();
  if (name === 'start') { render(); window.__shotReady = true; return; } // title screen over a fresh table
  S.screen = 'play';
  if (name === 'play') {
    simulateTurns(S, 3, false); // a few real turns: mid-game table
  } else if (name === 'win') {
    simulateTurns(S, 60, false); // autopilot plays to win the match
    // Bounded fallback: keep simulating real turns (drawing fresh cards) until the match ends.
    let guard = 0;
    while (S.screen === 'play' && guard++ < 60) simulateTurns(S, 1, false);
  } else if (name === 'loss') {
    simulateTurns(S, 40, true); // idle player: the Warden wins for real
    if (S.screen === 'play') { S.player.hp = 1; S.player.shield = 0; simulateTurns(S, 6, true); }
  }
  render();
  window.__shotReady = true;
}

// ---------- boot ----------
newGame();
if (shot) {
  stageShot(shot);
} else {
  render();
  announce('Ember Duel. Press Enter or click Start Duel.');
}

// Test/automation hooks (used by local verification only).
window.__game = {
  state: () => S,
  start: startDuel,
  playCard: onPlayCard,
  endTurn: onEndTurn,
  cards: CARDS,
};
