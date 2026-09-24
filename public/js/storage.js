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
    endMode: 'first',     /* 單機的結束方式：first｜last */
    seenHelp: false,
    stats: {}             /* { [難度|online]: { play, win } } */
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
    return data;
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

  root.Store = { load, save, resetSettings, record, DEFAULTS, SETTING_DEFAULTS, KEY };
})(typeof self !== 'undefined' ? self : this);
