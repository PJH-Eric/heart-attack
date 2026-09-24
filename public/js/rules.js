/* ===== rules.js — 心臟病規則核心（瀏覽器與伺服器共用） =====
 *
 * 純邏輯、沒有畫面也沒有計時器：所有時間都由呼叫端用 now（毫秒）帶進來，
 * 單機用「可暫停的遊戲時鐘」，伺服器用 Date.now()，測試用假時鐘，
 * 三邊跑的是同一套判定，不會各寫一份互相漂移。
 *
 * 一局的流程（規劃書 §3）：
 *   waitStart  —— 等「本段啟動者」按開始／自動發牌
 *   dealing    —— 依座位順序自動翻牌，同時喊 1、2……13（A＝1、J＝11、Q＝12、K＝13）；點數不同時留一小段時間給誤拍
 *   slapWindow —— 點數＝喊數，所有人搶拍；全員拍完或時間到就結算
 *   result     —— 顯示誰收走牌堆；接著判斷勝負，沒人贏就回 waitStart（由收牌者啟動）
 *   over       —— 有人手牌 0 張，勝負已定
 *
 * 已確認的規則：
 *   - 52 張、無鬼牌；系統決定座位順序，一人一張輪流發完。
 *   - 每段開始（第一段與每次收牌後）都從 1 重新喊。
 *   - 點數相同：最後拍的人收牌；有人沒拍，則從翻牌者往後數，最後一位沒拍的人收牌。
 *   - 點數不同卻拍：第一位誤拍者收牌。
 *   - 收牌放到收牌者手牌底部，順序照翻出的順序，不重洗。
 *   - 先把手牌出完（在判定都結束後仍為 0 張）的人獲勝。
 *   - 結束方式（endMode，房主／單機設定）：
 *       first —— 有一個人出完牌，這局就結束
 *       last  —— 出完的人依序得到名次並離場（不再拍牌），打到只剩一個人有牌才結束
 */
(function (root, factory) {
  'use strict';
  const api = factory(typeof require === 'function' && typeof module === 'object'
    ? require('./rng.js') : root.RNG);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof self !== 'undefined' ? self : this, function (RNG) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];            /* 黑桃 紅心 方塊 梅花 */
  const SUIT_NAMES = { S: '黑桃', H: '紅心', D: '方塊', C: '梅花' };
  const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;

  /* 節奏：幼幼班放慢，困難最快。線上房間可選 slow / normal / fast。 */
  const PACES = {
    kid:    { flipMs: 1700, windowMs: 3600, resultMs: 1800, name: '慢慢來' },
    slow:   { flipMs: 1400, windowMs: 2800, resultMs: 1600, name: '悠閒' },
    normal: { flipMs: 1150, windowMs: 2300, resultMs: 1500, name: '普通' },
    fast:   { flipMs: 950,  windowMs: 2000, resultMs: 1400, name: '緊張' }
  };

  const DIFFICULTIES = {
    kid:    { name: '幼幼班', pace: 'kid' },
    easy:   { name: '簡單',   pace: 'slow' },
    normal: { name: '普通',   pace: 'normal' },
    hard:   { name: '困難',   pace: 'fast' }
  };
  const DIFFICULTY_LIST = ['kid', 'easy', 'normal', 'hard'];
  const END_MODES = ['first', 'last'];
  const END_MODE_NAMES = { first: '有人出完就結束', last: '打到只剩一人有牌' };

  function rankLabel(rank) { return RANK_LABELS[rank - 1]; }
  function cardLabel(card) { return SUIT_NAMES[card.s] + rankLabel(card.r); }

  function newDeck() {
    const deck = [];
    for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ s: s, r: r });
    return deck;
  }

  /**
   * 建立一局。
   * @param {Array<{id:string,name:string}>} players 報名的人（順序不重要，系統會重排）
   * @param {object} opt { seed, pace: 'normal'|..., autoStartMs: 啟動者多久沒按就代按（null＝不代按） }
   */
  function create(players, opt) {
    opt = opt || {};
    if (!players || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error('人數要在 ' + MIN_PLAYERS + '～' + MAX_PLAYERS + ' 人之間');
    }
    const seed = opt.seed != null ? String(opt.seed) : RNG.newSeed();
    const rng = RNG.create(seed);
    const pace = Object.assign({}, PACES[opt.pace] || PACES.normal, opt.timing || {});
    const endMode = END_MODES.includes(opt.endMode) ? opt.endMode : 'first';

    /* 1. 系統決定座位順序 */
    const order = rng.shuffle(players.map(p => Object.assign({}, p)));
    /* 2. 洗牌，依順序一人一張發完 */
    const deck = rng.shuffle(newDeck());
    const seats = order.map((p, i) => ({
      id: p.id, name: p.name || ('玩家' + (i + 1)), char: p.char || null,
      ai: p.ai || null, hand: [], out: 0      /* out：出完後的名次（0＝還在場上） */
    }));
    deck.forEach((card, i) => seats[i % seats.length].hand.push(card));

    return {
      seed: seed,
      /* 對外用的對局代號（跟 seed 無關，猜不出牌序），畫面用來分辨「這是新的一局」 */
      gameId: Math.random().toString(36).slice(2, 10),
      pace: pace,
      endMode: endMode,
      finished: [],             /* 出完牌的座位，依名次排列 */
      autoStartMs: opt.autoStartMs == null ? null : opt.autoStartMs,
      seats: seats,
      pile: [],
      phase: 'waitStart',
      starter: 0,               /* 第一順位玩家喊開始 */
      waitSince: opt.now || 0,
      segment: 0,               /* 第幾段連續翻牌 */
      turn: 0,                  /* 下一張由誰翻 */
      callIdx: 0,               /* 下一張要喊的點數（0＝A） */
      revealId: 0,              /* 全局翻牌序號，拍牌要帶這個，避免拍到上一張 */
      reveal: null,             /* { id, card, call, by, match, at } */
      slaps: [],                /* 本張牌的拍牌順序 [{ seat, at }] */
      nextAt: 0,                /* dealing：下一張翻牌時間；slapWindow：窗口結束；result：結果顯示結束 */
      lastResult: null,         /* { reason:'last'|'miss'|'wrong', seat, count, revealId } */
      winner: null,
      flips: 0,
      version: 0,
      eventSeq: 0,
      events: []                /* 最近的事件，畫面拿來播動畫（只留最後 40 筆） */
    };
  }

  function push(state, ev) {
    ev.seq = ++state.eventSeq;
    state.events.push(ev);
    if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
    state.version++;
  }

  function seatIndex(state, id) {
    return state.seats.findIndex(s => s.id === id);
  }

  /** 從 from（含）開始往後找第一位還有牌的人；都沒牌回 -1 */
  function nextWithCards(state, from) {
    const n = state.seats.length;
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n;
      if (state.seats[i].hand.length > 0) return i;
    }
    return -1;
  }

  /** 手牌 0 張的人裡，以 first 為先、再依座位順序挑出勝者；沒人回 -1 */
  function findWinner(state, first) {
    const n = state.seats.length;
    for (let k = 0; k < n; k++) {
      const i = ((first || 0) + k) % n;
      if (state.seats[i].hand.length === 0) return i;
    }
    return -1;
  }

  function finish(state, winnerIdx, now, loserIdx) {
    state.phase = 'over';
    state.winner = winnerIdx;
    state.loser = loserIdx == null ? null : loserIdx;
    state.nextAt = 0;
    push(state, { type: 'win', seat: winnerIdx, loser: state.loser, at: now });
  }

  /** 還在場上（沒出完離場）的座位 */
  function activeSeats(state) {
    const out = [];
    state.seats.forEach((s, i) => { if (!s.out) out.push(i); });
    return out;
  }

  /**
   * 判定都結束後檢查有沒有人出完。回傳 true＝這局結束了。
   * first 以翻牌者為先、再依座位順序挑一位勝者；
   * last  把所有 0 張的人依同樣順序排進名次，剩一個人有牌就結束。
   */
  function settle(state, first, now) {
    if (state.endMode !== 'last') {
      const w = findWinner(state, first);
      if (w >= 0) { finish(state, w, now); return true; }
      return false;
    }
    const n = state.seats.length;
    for (let k = 0; k < n; k++) {
      const i = ((first || 0) + k) % n;
      const s = state.seats[i];
      if (!s.out && s.hand.length === 0) {
        state.finished.push(i);
        s.out = state.finished.length;
        push(state, { type: 'out', seat: i, place: s.out, at: now });
      }
    }
    const act = activeSeats(state);
    if (act.length <= 1) { finish(state, state.finished[0], now, act.length ? act[0] : null); return true; }
    return false;
  }

  /* ---------- 玩家動作 ---------- */

  /** 啟動者按「開始／自動發牌」。回傳 { ok, reason } */
  function start(state, playerId, now) {
    if (state.phase !== 'waitStart') return { ok: false, reason: 'not-waiting' };
    const idx = seatIndex(state, playerId);
    if (idx < 0) return { ok: false, reason: 'not-player' };
    if (idx !== state.starter) return { ok: false, reason: 'not-starter' };
    beginSegment(state, now, false);
    return { ok: true };
  }

  function beginSegment(state, now, auto) {
    state.phase = 'dealing';
    state.segment++;
    state.callIdx = 0;                        /* 每段都從 1 喊起 */
    state.turn = nextWithCards(state, state.starter);
    state.reveal = null;
    state.slaps = [];
    state.nextAt = now + 350;                 /* 按下去先停一下下，讓大家把手準備好 */
    push(state, { type: 'start', seat: state.starter, auto: !!auto, segment: state.segment, at: now });
  }

  /**
   * 拍牌。
   * @param {number} revealId 玩家看到的那張牌的序號（線上要帶，防止拍到上一張）
   */
  function slap(state, playerId, now, revealId) {
    const idx = seatIndex(state, playerId);
    if (idx < 0) return { ok: false, reason: 'not-player' };
    if (state.seats[idx].out) return { ok: false, reason: 'out' };   /* 已經出完離場的人不能拍 */
    const r = state.reveal;
    if (!r || (state.phase !== 'dealing' && state.phase !== 'slapWindow')) {
      return { ok: false, reason: 'no-card' };          /* 還沒翻牌就拍：不算、不罰 */
    }
    if (revealId != null && revealId !== r.id) return { ok: false, reason: 'stale' };
    if (state.slaps.some(s => s.seat === idx)) return { ok: false, reason: 'dup' };

    state.slaps.push({ seat: idx, at: now });

    if (!r.match) {
      /* 點數不同卻拍：第一位誤拍者收牌 */
      push(state, { type: 'slap', seat: idx, order: state.slaps.length, wrong: true, at: now });
      collect(state, idx, 'wrong', now);
      return { ok: true, wrong: true };
    }

    push(state, { type: 'slap', seat: idx, order: state.slaps.length, at: now });
    if (state.slaps.length >= activeSeats(state).length) resolveMatch(state, now);
    return { ok: true, order: state.slaps.length };
  }

  /* ---------- 時間推進 ---------- */

  /** 讓時間往前走到 now；回傳這次有沒有狀態變化 */
  function tick(state, now) {
    const before = state.version;
    let guard = 0;
    while (guard++ < 8) {
      const v = state.version;
      step(state, now);
      if (state.version === v) break;
    }
    return state.version !== before;
  }

  function step(state, now) {
    if (state.phase === 'waitStart') {
      if (state.autoStartMs != null && now - state.waitSince >= state.autoStartMs) {
        beginSegment(state, now, true);
      }
      return;
    }
    if (state.phase === 'dealing') {
      if (now < state.nextAt) return;
      /* 上一張的誤拍時間結束了；翻下一張之前，先看有沒有人已經出完 */
      if (settle(state, state.reveal ? state.reveal.by : state.starter, now)) return;
      flip(state, now);
      return;
    }
    if (state.phase === 'slapWindow') {
      if (now >= state.nextAt) resolveMatch(state, now);
      return;
    }
    if (state.phase === 'result') {
      if (now < state.nextAt) return;
      const by = state.lastResult && state.lastResult.flipper != null ? state.lastResult.flipper : 0;
      if (settle(state, by, now)) return;
      state.phase = 'waitStart';
      state.waitSince = now;
      state.reveal = null;
      state.slaps = [];
      push(state, { type: 'wait', seat: state.starter, at: now });
    }
  }

  function flip(state, now) {
    const by = nextWithCards(state, state.turn);
    if (by < 0) return;                       /* 理論上走不到：有人 0 張就已經結束了 */
    const card = state.seats[by].hand.shift();
    const call = state.callIdx + 1;
    state.pile.push(card);
    state.revealId++;
    state.flips++;
    const match = card.r === call;
    state.reveal = { id: state.revealId, card: card, call: call, by: by, match: match, at: now };
    state.slaps = [];
    state.callIdx = (state.callIdx + 1) % 13;
    state.turn = (by + 1) % state.seats.length;
    if (match) {
      state.phase = 'slapWindow';
      state.nextAt = now + state.pace.windowMs;
    } else {
      state.nextAt = now + state.pace.flipMs;
    }
    push(state, { type: 'flip', seat: by, card: card, call: call, revealId: state.revealId, at: now });
  }

  function resolveMatch(state, now) {
    if (state.phase !== 'slapWindow') return;
    const n = state.seats.length;
    const act = activeSeats(state);
    const slapped = new Set(state.slaps.map(s => s.seat));
    let loser = -1, reason = 'last';
    if (slapped.size >= act.length) {
      loser = state.slaps[state.slaps.length - 1].seat;
    } else {
      /* 沒拍的人比拍了的人更慢；多位沒拍時，從翻牌者往後數最後一位 */
      reason = 'miss';
      const by = state.reveal.by;
      for (let k = 0; k < n; k++) {
        const i = (by + k) % n;
        if (!slapped.has(i) && !state.seats[i].out) loser = i;
      }
    }
    collect(state, loser, reason, now);
  }

  function collect(state, seat, reason, now) {
    const count = state.pile.length;
    const flipper = state.reveal ? state.reveal.by : null;
    state.seats[seat].hand.push(...state.pile);
    state.pile = [];
    state.phase = 'result';
    state.nextAt = now + state.pace.resultMs;
    state.starter = seat;                      /* 收牌的人啟動下一段 */
    state.lastResult = {
      reason: reason, seat: seat, count: count, flipper: flipper,
      revealId: state.reveal ? state.reveal.id : 0,
      slaps: state.slaps.map(s => s.seat)
    };
    push(state, { type: 'collect', seat: seat, reason: reason, count: count, at: now });
  }

  /* ---------- 給畫面與網路用 ---------- */

  /**
   * 公開狀態：所有人（含觀戰者）看到的都一樣。
   * 沒翻出的牌、牌堆裡被蓋住的牌、seed 一律不送出去。
   */
  function publicView(state, now) {
    const r = state.reveal;
    /* slapWindow 對外也叫 dealing：畫面不能因為「這張該拍」而長得不一樣 */
    const phase = state.phase === 'slapWindow' ? 'dealing' : state.phase;
    return {
      gameId: state.gameId,
      phase: phase,
      seats: state.seats.map(s => ({
        id: s.id, name: s.name, char: s.char, ai: s.ai, count: s.hand.length, out: s.out || 0
      })),
      endMode: state.endMode,
      finished: state.finished.slice(),
      ranking: state.phase === 'over' ? ranking(state) : null,
      pileCount: state.pile.length,
      starter: state.starter,
      turn: state.turn,
      segment: state.segment,
      nextCall: state.callIdx + 1,
      reveal: r ? { id: r.id, card: r.card, call: r.call, by: r.by, match: (state.phase === 'result' || state.phase === 'over') ? r.match : undefined } : null,
      slaps: state.slaps.map(s => s.seat),
      lastResult: state.lastResult,
      winner: state.winner,
      loser: state.loser == null ? null : state.loser,
      flips: state.flips,
      waitLeft: state.phase === 'waitStart' && state.autoStartMs != null && now != null
        ? Math.max(0, state.autoStartMs - (now - state.waitSince)) : null,
      events: state.events.slice(-12),
      eventSeq: state.eventSeq,
      version: state.version
    };
  }

  /** 最後名次：先出完的依序在前，其餘照剩餘張數少的在前 */
  function ranking(state) {
    const done = state.endMode === 'last' ? state.finished.slice() : (state.winner != null ? [state.winner] : []);
    const rest = state.seats.map((s, i) => i).filter(i => !done.includes(i))
      .sort((a, b) => state.seats[a].hand.length - state.seats[b].hand.length);
    return done.concat(rest);
  }

  /** 檢查牌數守恆（測試用）：手牌＋牌堆＝52 且不重複 */
  function checkConservation(state) {
    const all = state.pile.slice();
    for (const s of state.seats) all.push(...s.hand);
    if (all.length !== 52) return false;
    const seen = new Set(all.map(c => c.s + c.r));
    return seen.size === 52;
  }

  return {
    SUITS, SUIT_NAMES, RANK_LABELS, PACES, DIFFICULTIES, DIFFICULTY_LIST, END_MODES, END_MODE_NAMES,
    MIN_PLAYERS, MAX_PLAYERS,
    newDeck, create, start, slap, tick, publicView, rankLabel, cardLabel,
    checkConservation, nextWithCards, findWinner
  };
});
