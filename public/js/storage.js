/* ===== storage.js — 本機設定與戰績（只存在這台裝置，不上傳） ===== */
(function (root) {
  'use strict';
  const KEY = 'heart-attack';

  const SETTING_DEFAULTS = {
    bgm: true, bgmVol: 0.3,
    sfx: true, sfxVol: 0.7,
    voice: true,          /* 喊數語音 */
    voiceMode: 'auto',    /* auto｜clip 內建錄音｜device 裝置語音 */
    vibrate: true,
    reduceMotion: false,
    bigCall: false        /* 喊數字特大 */
  };

  const DEFAULTS = Object.assign({
    nickname: '',
    char: 'otter',
    difficulty: 'normal',
    aiCount: 3,
    aiDiffs: null,        /* 每個電腦各自的難度（最多 3 個）；null＝全部跟 difficulty 一樣 */
    endMode: 'first',     /* 單機的結束方式：first｜last */
    seenHelp: false,
    stats: {},            /* { [難度|online]: { play, win } } */
    /* 拍速紀錄（只存在這台裝置）：總計、各難度、最近 30 局 */
    reaction: null
  }, SETTING_DEFAULTS);

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    const data = Object.assign({}, DEFAULTS, raw || {});
    /* 第一次玩：隨機配一隻小動物，免得線上大家都是同一隻水獺分不出來 */
    if (!raw || !raw.char) {
      const chars = ['otter', 'bunny', 'capybara', 'penguin', 'shiba', 'turtle', 'koala', 'cat'];
      data.char = chars[Math.floor(Math.random() * chars.length)];
      save(data);
    }
    data.stats = Object.assign({}, (raw && raw.stats) || {});
    data.reaction = normReaction(raw && raw.reaction);
    return data;
  }

  function normReaction(r) {
    r = r || {};
    return {
      best: r.best == null ? null : r.best,     /* 最快一拍（毫秒） */
      hits: r.hits || 0, sum: r.sum || 0,       /* 拍對次數與反應時間總和 → 平均 */
      wrong: r.wrong || 0, missed: r.missed || 0,
      games: r.games || 0,
      byKind: Object.assign({}, r.byKind || {}),   /* { kid|easy|normal|hard|online: { best, hits, sum } } */
      history: Array.isArray(r.history) ? r.history.slice(-30) : []   /* [{ d, kind, avg, best, hits, wrong, missed }] */
    };
  }

  /**
   * 一局結束後記下自己的拍速。
   * @param {{hits,wrong,missed,avg,best}} st 這局的統計（Rules.statView）
   * @returns {{ newBest: boolean, prevBest: number|null, newAvg: boolean }}
   */
  function recordReaction(data, kind, st) {
    const r = data.reaction = normReaction(data.reaction);
    const prevBest = r.best;
    const k = r.byKind[kind] || { best: null, hits: 0, sum: 0, bestAvg: null };
    const prevAvg = k.bestAvg;
    const sum = st.avg != null ? st.avg * st.hits : 0;
    r.hits += st.hits; r.sum += sum; r.wrong += st.wrong; r.missed += st.missed; r.games++;
    if (st.best != null) r.best = r.best == null ? st.best : Math.min(r.best, st.best);
    k.hits += st.hits; k.sum += sum;
    if (st.best != null) k.best = k.best == null ? st.best : Math.min(k.best, st.best);
    /* 單局平均的最佳：至少拍對 3 次才算，免得一次運氣好就破紀錄 */
    const avgCounts = st.avg != null && st.hits >= 3;
    if (avgCounts) k.bestAvg = k.bestAvg == null ? st.avg : Math.min(k.bestAvg, st.avg);
    r.byKind[kind] = k;
    r.history.push({ d: new Date().toISOString().slice(0, 10), kind, avg: st.avg, best: st.best, hits: st.hits, wrong: st.wrong, missed: st.missed });
    if (r.history.length > 30) r.history.shift();
    save(data);
    return {
      newBest: st.best != null && (prevBest == null || st.best < prevBest) && r.games > 1,
      prevBest,
      newAvg: avgCounts && prevAvg != null && st.avg < prevAvg
    };
  }

  function clearReaction(data) {
    data.reaction = normReaction(null);
    save(data);
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 無痕模式等，忽略 */ }
  }

  function resetSettings(data) {
    Object.assign(data, SETTING_DEFAULTS);
    save(data);
    return data;
  }

  function record(data, bucket, win) {
    const s = data.stats[bucket] || { play: 0, win: 0 };
    s.play++;
    if (win) s.win++;
    data.stats[bucket] = s;
    save(data);
    return s;
  }

  root.Store = { load, save, resetSettings, record, recordReaction, clearReaction, DEFAULTS, SETTING_DEFAULTS, KEY };
})(typeof self !== 'undefined' ? self : this);
