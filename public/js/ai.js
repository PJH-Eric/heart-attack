/* ===== ai.js — 電腦玩家（瀏覽器與伺服器共用） =====
 *
 * 電腦只看得到公開資訊：翻出來的牌與喊數；不會偷看還沒翻的牌。
 * 四段難度的差別是「看得到的」：反應時間、會不會發呆沒拍、會不會手滑誤拍。
 *
 *   幼幼班：反應很慢（1.3～2.2 秒）、常發呆、從不誤拍 → 小朋友拍得到
 *   簡單　：0.75～1.3 秒，偶爾發呆，點數差一點點時會看錯
 *   普通　：0.48～0.85 秒，很少出錯
 *   困難　：0.3～0.52 秒，幾乎不出錯，但仍是人類做得到的反應時間
 *
 * 驅動器 createDriver() 只負責「什麼時候要做什麼」，真正的動作仍呼叫 Rules，
 * 跟真人走同一個合法行動入口。
 */
(function (root, factory) {
  'use strict';
  const api = factory(typeof require === 'function' && typeof module === 'object'
    ? require('./rng.js') : root.RNG);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AI = api;
})(typeof self !== 'undefined' ? self : this, function (RNG) {
  'use strict';

  const PROFILES = {
    kid:    { react: [1300, 2200], freeze: 0.18, falseSlap: 0,     nearSlap: 0,     start: [1200, 2000] },
    easy:   { react: [750, 1300],  freeze: 0.06, falseSlap: 0.02,  nearSlap: 0.09,  start: [900, 1500] },
    normal: { react: [480, 850],   freeze: 0.02, falseSlap: 0.008, nearSlap: 0.035, start: [650, 1100] },
    hard:   { react: [300, 520],   freeze: 0,    falseSlap: 0.002, nearSlap: 0.01,  start: [450, 800] }
  };

  function profile(level) { return PROFILES[level] || PROFILES.normal; }

  /**
   * 一張牌翻出來時，這個電腦要不要拍、幾毫秒後拍。
   * @returns {number|null} 延遲毫秒；null＝不拍
   */
  function decide(level, card, call, rng) {
    const p = profile(level);
    const match = card.r === call;
    if (match) {
      if (rng.chance(p.freeze)) return null;
      return Math.round(rng.range(p.react[0], p.react[1]));
    }
    /* 點數只差 1（例如喊 7 翻出 8）最容易看錯 */
    const near = Math.abs(card.r - call) === 1 || Math.abs(card.r - call) === 12;
    if (rng.chance(near ? p.nearSlap : p.falseSlap)) {
      return Math.round(rng.range(p.react[0], p.react[1]) * 0.9);
    }
    return null;
  }

  function startDelay(level, rng) {
    const p = profile(level);
    return Math.round(rng.range(p.start[0], p.start[1]));
  }

  /**
   * 建立驅動器。每次時間推進時呼叫 actions(state, now)，
   * 拿回「現在該做的動作」清單，由呼叫端交給 Rules.start / Rules.slap。
   * state 是 Rules 的完整狀態；seats[i].ai 有值（難度字串）就是電腦。
   */
  function createDriver(seed) {
    const rng = RNG.create(seed != null ? seed : RNG.newSeed());
    let seenReveal = 0;
    let plan = [];          /* [{ at, seat, revealId }] */
    let startPlan = null;   /* { at, seat, waitSince } */

    function actions(state, now) {
      const out = [];
      if (state.phase === 'over') return out;

      /* 新翻出一張 → 替每個電腦排好反應 */
      const r = state.reveal;
      if (r && r.id !== seenReveal) {
        seenReveal = r.id;
        plan = [];
        state.seats.forEach((s, i) => {
          if (!s.ai) return;
          const d = decide(s.ai, r.card, r.call, rng);
          if (d != null) plan.push({ at: r.at + d, seat: i, revealId: r.id });
        });
      }
      if (plan.length && r) {
        const still = [];
        for (const p of plan) {
          if (p.revealId !== r.id) continue;
          if (now >= p.at) {
            if (state.phase === 'dealing' || state.phase === 'slapWindow') {
              out.push({ type: 'slap', id: state.seats[p.seat].id, revealId: p.revealId });
            }
          } else still.push(p);
        }
        plan = still;
      }

      /* 輪到電腦當啟動者 */
      if (state.phase === 'waitStart') {
        const s = state.seats[state.starter];
        if (s && s.ai) {
          if (!startPlan || startPlan.waitSince !== state.waitSince || startPlan.seat !== state.starter) {
            startPlan = { at: state.waitSince + startDelay(s.ai, rng), seat: state.starter, waitSince: state.waitSince };
          }
          if (now >= startPlan.at) {
            out.push({ type: 'start', id: s.id });
            startPlan = null;
          }
        }
      } else startPlan = null;

      return out;
    }

    return { actions: actions };
  }

  return { PROFILES, profile, decide, startDelay, createDriver };
});
