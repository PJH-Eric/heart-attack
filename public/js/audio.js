/* ===== audio.js — 背景音樂與音效（Web Audio 即時合成，沒有外部音檔） =====
 *
 * 全部用振盪器現場合成，所以沒有授權問題；想換正式音檔時，
 * 只要把 sfx() / 音樂迴圈換成播放檔案即可，其他程式不用動。
 *
 * - 瀏覽器規定要等使用者第一次點擊才能出聲 → unlock() 綁在第一次點擊。
 * - 背景音樂與音效分開開關、分開音量，設定立即生效。
 * - 喊數語音：內建錄音（voice-clips.js）或裝置的中文語音，可在設定切換或關掉。
 */
(function (root) {
  'use strict';

  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let settings = { bgm: true, bgmVol: 0.3, sfx: true, sfxVol: 0.7, voice: true, voiceMode: 'auto' };
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
    loadClips();
    unlockSpeech();
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

  /* ---------- 喊數語音 ----------
   * 兩種來源：
   *   clip   —— 內建錄音（voice-clips.js），跟翻牌同一瞬間播出，每台裝置都一樣
   *   device —— 瀏覽器／系統的中文語音，比較自然，但有的裝置沒有中文語音、或會慢半拍
   *   auto   —— 裝置有中文語音就用裝置語音，沒有就用內建錄音（預設）
   */

  const SAY = ['A', '二', '三', '四', '五', '六', '七', '八', '九', '十', 'J', 'Q', 'K'];
  const clipBuf = {};
  let clipsLoading = false;
  let voice = null;
  const synth = root.speechSynthesis || null;

  function pickVoice() {
    if (!synth) return null;
    const list = synth.getVoices() || [];
    return list.find(v => /zh[-_]TW/i.test(v.lang)) ||
      list.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) ||
      list.find(v => /^(zh|cmn)/i.test(v.lang)) || null;
  }
  if (synth) {
    voice = pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', () => { voice = pickVoice(); });
  }

  function b64ToBuf(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function loadClips() {
    if (clipsLoading || !ctx || !root.VoiceClips) return;
    clipsLoading = true;
    for (const k in root.VoiceClips) {
      try {
        const p = ctx.decodeAudioData(b64ToBuf(root.VoiceClips[k]), b => { clipBuf[k] = b; }, () => {});
        if (p && p.then) p.then(b => { clipBuf[k] = b; }).catch(() => {});
      } catch (e) { /* 這一段解不開就算了，會改用裝置語音 */ }
    }
  }

  function playClip(rank) {
    const b = clipBuf[rank];
    if (!ctx || !b) return false;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = 1.25;
    src.connect(g); g.connect(sfxBus);
    src.start(ctx.currentTime + 0.01);
    playClip.count = (playClip.count || 0) + 1;
    return true;
  }

  function speakDevice(rank) {
    if (!synth || !root.SpeechSynthesisUtterance) return false;
    voice = voice || pickVoice();
    try {
      /* Chrome 閒置一陣子語音會卡住，先 resume；還在念上一個數字就直接打斷 */
      if (synth.speaking || synth.pending) synth.cancel();
      synth.resume();
      const u = new root.SpeechSynthesisUtterance(SAY[rank - 1]);
      u.lang = voice ? voice.lang : 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = 1.3;
      u.pitch = 1.25;
      u.volume = Math.min(1, settings.sfxVol + 0.3);
      u.onerror = e => { if (e && e.error !== 'interrupted' && e.error !== 'canceled') playClip(rank); };
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function voiceSource() {
    const mode = settings.voiceMode || 'auto';
    if (mode === 'clip') return 'clip';
    if (mode === 'device') return synth ? 'device' : 'clip';
    return voice ? 'device' : 'clip';
  }

  function call(rank) {
    if (!settings.voice || !settings.sfx) return;
    ensure();
    loadClips();
    if (voiceSource() === 'device') { if (!speakDevice(rank)) playClip(rank); }
    else if (!playClip(rank)) speakDevice(rank);
  }

  /** 設定裡的「試聽」：念 A、二、三 */
  function previewVoice() {
    unlock();
    const was = settings.voice;
    settings.voice = true;
    [1, 2, 3].forEach((r, i) => setTimeout(() => { const s0 = settings.sfx; settings.sfx = true; call(r); settings.sfx = s0; }, 150 + i * 750));
    setTimeout(() => { settings.voice = was; }, 150 + 3 * 750);
  }

  /** 第一次點擊時先念一個無聲的字，iPhone／iPad 才會允許之後自動念 */
  function unlockSpeech() {
    if (!synth || !root.SpeechSynthesisUtterance || unlockSpeech.done) return;
    unlockSpeech.done = true;
    try { const u = new root.SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { /* 忽略 */ }
  }

  root.Sound = {
    unlock, apply, sfx, call, previewVoice, stopMusic,
    get settings() { return settings; },
    get hasDeviceVoice() { return !!voice; },
    get voiceSource() { return voiceSource(); },
    get clipsReady() { return Object.keys(clipBuf).length; },
    get clipPlays() { return playClip.count || 0; }
  };
})(typeof self !== 'undefined' ? self : this);
