/* ===== audio.js — 背景音樂與音效（Web Audio 即時合成，沒有外部音檔） =====
 *
 * 全部用振盪器現場合成，所以沒有授權問題；想換正式音檔時，
 * 只要把 sfx() / 音樂迴圈換成播放檔案即可，其他程式不用動。
 *
 * - 瀏覽器規定要等使用者第一次點擊才能出聲 → unlock() 綁在第一次點擊。
 * - 背景音樂與音效分開開關、分開音量，設定立即生效。
 * - 喊數語音用瀏覽器內建的 speechSynthesis（zh-TW），可在設定關掉。
 */
(function (root) {
  'use strict';

  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let settings = { bgm: true, bgmVol: 0.3, sfx: true, sfxVol: 0.7, voice: true };
  let musicTimer = null, musicStep = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    apply(settings);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
    if (settings.bgm) startMusic();
  }

  function apply(s) {
    settings = Object.assign(settings, s || {});
    if (!ctx) return;
    musicBus.gain.value = settings.bgm ? settings.bgmVol * 0.5 : 0;
    sfxBus.gain.value = settings.sfx ? settings.sfxVol : 0;
    if (settings.bgm) startMusic(); else stopMusic();
  }

  function tone(freq, t0, dur, type, vol, bus, glide) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, hp) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0);
  }

  /* 翻牌音效對每張牌都一樣 —— 不能比牌面更早透露「這張該拍」 */
  const SFX = {
    flip(t) { noise(t, 0.08, 0.35, 2200); tone(520, t, 0.06, 'triangle', 0.08); },
    slap(t) { noise(t, 0.16, 0.9, 300); tone(140, t, 0.14, 'sine', 0.5, null, 70); },
    wrong(t) { tone(330, t, 0.18, 'square', 0.1); tone(247, t + 0.16, 0.26, 'square', 0.1); },
    collect(t) { for (let i = 0; i < 5; i++) noise(t + i * 0.045, 0.06, 0.25, 1800); tone(392, t + 0.1, 0.2, 'triangle', 0.12, null, 262); },
    start(t) { tone(523, t, 0.12, 'triangle', 0.16); tone(784, t + 0.1, 0.18, 'triangle', 0.16); },
    click(t) { tone(880, t, 0.05, 'triangle', 0.08); },
    win(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.3, 'triangle', 0.18)); },
    lose(t) { [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.16, 0.3, 'sine', 0.16)); },
    chat(t) { tone(988, t, 0.07, 'sine', 0.08); tone(1319, t + 0.06, 0.08, 'sine', 0.06); }
  };

  function sfx(name) {
    if (!ctx || !settings.sfx) return;
    const fn = SFX[name];
    if (fn) fn(ctx.currentTime + 0.005);
  }

  /* 烏克麗麗風的輕快迴圈（C–Am–F–G），每拍一格 */
  const CHORDS = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
  const MELODY = [659, 0, 587, 523, 587, 0, 659, 784, 659, 0, 587, 523, 440, 0, 523, 587,
                  523, 0, 440, 392, 440, 0, 523, 587, 587, 0, 523, 494, 523, 0, 0, 0];

  function startMusic() {
    if (!ctx || musicTimer || !settings.bgm) return;
    const beat = 0.24;
    let next = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (next < ctx.currentTime + 0.5) {
        const chord = CHORDS[Math.floor(musicStep / 8) % 4];
        if (musicStep % 2 === 0) chord.forEach((f, i) => tone(f, next + i * 0.012, 0.32, 'triangle', 0.05, musicBus));
        if (musicStep % 8 === 0) tone(chord[0] / 2, next, 0.5, 'sine', 0.09, musicBus);
        const m = MELODY[musicStep % MELODY.length];
        if (m) tone(m, next, 0.2, 'sine', 0.05, musicBus);
        musicStep++;
        next += beat;
      }
    }, 120);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---------- 喊數語音 ---------- */

  const SAY = ['A', '二', '三', '四', '五', '六', '七', '八', '九', '十', 'J', 'Q', 'K'];
  let voice = null;
  function pickVoice() {
    if (!root.speechSynthesis) return null;
    const list = root.speechSynthesis.getVoices() || [];
    return list.find(v => /zh[-_]TW/i.test(v.lang)) || list.find(v => /^zh/i.test(v.lang)) || null;
  }
  if (root.speechSynthesis && root.speechSynthesis.addEventListener) {
    root.speechSynthesis.addEventListener('voiceschanged', () => { voice = pickVoice(); });
  }

  function call(rank) {
    if (!settings.voice || !settings.sfx || !root.speechSynthesis || !root.SpeechSynthesisUtterance) return;
    try {
      root.speechSynthesis.cancel();
      const u = new root.SpeechSynthesisUtterance(SAY[rank - 1]);
      u.lang = 'zh-TW';
      u.rate = 1.35;
      u.volume = Math.min(1, settings.sfxVol + 0.2);
      voice = voice || pickVoice();
      if (voice) u.voice = voice;
      root.speechSynthesis.speak(u);
    } catch (e) { /* 有些瀏覽器沒有語音，靜靜略過 */ }
  }

  root.Sound = { unlock, apply, sfx, call, stopMusic, get settings() { return settings; } };
})(typeof self !== 'undefined' ? self : this);
