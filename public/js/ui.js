/* ===== ui.js — 共用介面零件：畫面切換、Modal、提示、設定彈窗、聊天室、暱稱 ===== */
(function (root) {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 畫面切換 ---------- */

  let current = 'home';
  const listeners = [];
  function show(name) {
    $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    current = name;
    document.body.dataset.screen = name;
    const lobbyLink = $('#lobby-home-link');
    if (lobbyLink) lobbyLink.hidden = name !== 'home';
    listeners.forEach(fn => fn(name));
    const h = $('.screen:not([hidden]) h2, .screen:not([hidden]) h1');
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* 舊瀏覽器 */ } }
  }
  function onShow(fn) { listeners.push(fn); }

  /* ---------- Modal：遮罩、焦點鎖定、Esc／返回鍵關閉、關閉後焦點回原處 ---------- */

  const stack = [];
  function modal(el, opt) {
    opt = opt || {};
    let lastFocus = null;
    const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const items = () => $$(FOCUSABLE, el).filter(n => n.offsetParent !== null);

    function onKey(e) {
      if (stack[stack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function open(from) {
      if (!el.hidden) return;
      lastFocus = from || document.activeElement;
      el.hidden = false;
      stack.push(api);
      document.addEventListener('keydown', onKey, true);
      const list = items();
      if (list.length) list[0].focus();
      if (opt.onOpen) opt.onOpen();
    }
    function close() {
      if (el.hidden) return;
      el.hidden = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
      if (opt.onClose) opt.onClose();
    }
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-close]')) close();
    });
    const api = { open, close, get isOpen() { return !el.hidden; } };
    return api;
  }
  function anyModalOpen() { return stack.length > 0; }

  /* ---------- 提示 ---------- */

  function toast(text, kind) {
    const box = $('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  function vibrate(ms) {
    if (!root.App || !root.App.store.vibrate) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 隨機可愛暱稱（形容詞＋小動物） ---------- */

  const ADJ = ['開心', '快手', '小小', '圓滾滾', '愛笑', '勇敢', '軟綿綿', '機靈', '陽光', '悠哉', '閃亮', '好奇'];
  const NOUN = ['水獺', '兔兔', '水豚', '企鵝', '柴柴', '海龜', '無尾熊', '貓咪', '海豹', '螃蟹', '椰子', '小魚'];
  function randomName() {
    return ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];
  }

  /* ---------- 角色選擇 ---------- */

  function charPicker(el, selected, onPick) {
    el.innerHTML = root.Art.ANIMALS.map(a =>
      '<button type="button" class="char-opt" role="radio" data-char="' + a.id + '" aria-checked="' + (a.id === selected) +
      '" aria-label="' + a.name + '">' + root.Art.animalSvg(a.id) + '<span>' + a.name + '</span></button>').join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('.char-opt');
      if (!b) return;
      $$('.char-opt', el).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      onPick(b.dataset.char);
    });
  }
  function setChar(el, id) {
    $$('.char-opt', el).forEach(x => x.setAttribute('aria-checked', String(x.dataset.char === id)));
  }

  /* ---------- 設定彈窗 ---------- */

  function buildSettings(store, onChange) {
    const body = $('#settings-body');
    const sw = (key, label, iconName, desc) =>
      '<label class="set-row"><span class="set-ico">' + root.Art.icon(iconName) + '</span>' +
      '<span class="set-text"><b>' + label + '</b>' + (desc ? '<small>' + desc + '</small>' : '') + '</span>' +
      '<input type="checkbox" class="switch" data-key="' + key + '"' + (store[key] ? ' checked' : '') + '></label>';
    const vol = (key, label) =>
      '<label class="set-row vol"><span class="set-text"><b>' + label + '</b></span>' +
      '<input type="range" min="0" max="1" step="0.05" data-key="' + key + '" value="' + store[key] + '" aria-label="' + label + '"></label>';
    body.innerHTML =
      '<h3 class="set-group">聲音</h3>' +
      sw('bgm', '背景音樂', 'music') + vol('bgmVol', '音樂音量') +
      sw('sfx', '音效', 'sound') + vol('sfxVol', '音效音量') +
      sw('voice', '喊數語音', 'voice', '翻牌時念出 1、2、3……13') +
      '<div class="set-row voice-row"><span class="set-text"><b>喊數聲音</b><small id="voice-note"></small></span>' +
      '<button type="button" class="btn3d sea small" id="voice-test">試聽</button></div>' +
      '<div class="seg small voice-seg" role="radiogroup" aria-label="喊數聲音">' +
      [['auto', '自動'], ['clip', '遊戲內建'], ['device', '裝置語音']].map(o =>
        '<button type="button" role="radio" data-voice="' + o[0] + '" aria-checked="' + (store.voiceMode === o[0]) + '">' + o[1] + '</button>').join('') +
      '</div>' +
      '<h3 class="set-group">手感與畫面</h3>' +
      sw('vibrate', '拍牌震動', 'feel', '支援的手機／平板才會震') +
      sw('reduceMotion', '減少動態', 'see', '關掉飛牌與晃動動畫') +
      sw('bigCall', '喊數字特大', 'see', '中間的喊數泡泡放大') +
      '<div class="set-actions"><button type="button" class="btn3d sand" id="set-reset">恢復預設</button>' +
      '<button type="button" class="btn3d sea" data-close>完成</button></div>';

    body.oninput = e => {
      const k = e.target.dataset.key;
      if (!k) return;
      store[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
      onChange(store);
    };
    const voiceNote = () => {
      const n = $('#voice-note');
      if (!n) return;
      const S = root.Sound;
      n.textContent = store.voiceMode === 'clip' ? '跟翻牌同時念出，每台裝置都一樣'
        : store.voiceMode === 'device' ? (S.hasDeviceVoice ? '用這台裝置的中文語音，較自然但可能慢半拍' : '這台裝置找不到中文語音，會改用遊戲內建')
        : (S.hasDeviceVoice ? '目前使用：裝置中文語音' : '目前使用：遊戲內建（這台裝置沒有中文語音）');
    };
    voiceNote();
    setTimeout(voiceNote, 800);   /* 有些瀏覽器的語音清單要晚一點才載入 */
    body.querySelector('.voice-seg').onclick = e => {
      const b = e.target.closest('[data-voice]');
      if (!b) return;
      store.voiceMode = b.dataset.voice;
      body.querySelectorAll('[data-voice]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      onChange(store);
      voiceNote();
      root.Sound.previewVoice();
    };
    $('#voice-test').onclick = () => root.Sound.previewVoice();
    $('#set-reset').onclick = () => {
      root.Store.resetSettings(store);
      buildSettings(store, onChange);
      onChange(store);
      toast('設定已恢復預設');
      const first = $('#settings-body .switch');
      if (first) first.focus();
    };
  }

  /* ---------- 聊天室（房間、對局左欄、窄版彈層共用同一份訊息） ---------- */

  const QUICK = ['加油！', '好緊張～', '手好快！', '再來一局', '哈哈哈', '等我一下'];
  const chat = {
    messages: [],
    enabled: false,
    canSend: true,
    onSend: null,
    unread: 0,
    set(list) { this.messages = list.slice(-80); this.render(); },
    add(m) { this.messages.push(m); if (this.messages.length > 80) this.messages.shift(); this.render(); },
    clear() { this.messages = []; this.unread = 0; this.render(); },
    mount() {
      $$('.chat').forEach(box => {
        box.innerHTML =
          '<ol class="chat-log" aria-live="polite"></ol>' +
          '<div class="chat-quick">' + QUICK.map(q => '<button type="button" class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
          '<form class="chat-form"><input maxlength="60" placeholder="輸入訊息…" aria-label="聊天訊息" autocomplete="off">' +
          '<button class="icon-btn send" type="submit" aria-label="送出">' + root.Art.icon('send') + '</button></form>';
        box.addEventListener('click', e => {
          const q = e.target.closest('[data-q]');
          if (q && this.onSend) this.onSend(q.dataset.q);
        });
        $('.chat-form', box).addEventListener('submit', e => {
          e.preventDefault();
          const input = $('input', box);
          const text = input.value.trim();
          if (text && this.onSend) this.onSend(text);
          input.value = '';
        });
      });
    },
    render() {
      const html = this.messages.map(m => m.system
        ? '<li class="sys">' + esc(m.text) + '</li>'
        : '<li><span class="who">' + (m.char ? root.Art.animalSvg(m.char) : '') + '<b>' + esc(m.name) +
          (m.spec ? '<i>觀戰</i>' : '') + '</b></span><span class="msg">' + esc(m.text) + '</span></li>').join('');
      $$('.chat-log').forEach(ol => {
        const nearBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
        ol.innerHTML = html || '<li class="sys">還沒有訊息，打聲招呼吧！</li>';
        if (nearBottom || true) ol.scrollTop = ol.scrollHeight;
      });
      $$('.chat-form input, .chat-form button, .chat-quick button').forEach(n => { n.disabled = !this.canSend; });
    }
  };

  /* ---------- 自製下拉選單（不用原生 <select>，外觀跟遊戲一致） ----------
   * 觸發鈕：<button class="dd-btn" data-dd="群組" data-key="唯一鍵" data-value="目前值">
   * 選項清單是一個全域浮層（#dd-pop），用 position:fixed 貼在按鈕旁邊，不會被卡片裁掉；
   * 畫面重繪（例如房間資料更新）後呼叫 dropdown.refresh()，開著的清單會跟上新的按鈕。
   * 鍵盤：↑↓ 移動、Enter／空白鍵 選取、Esc 關閉、Home／End；點外面也會關。
   */
  const dropdown = (() => {
    const groups = {};          /* name → { options:[{value,label,desc,cls}], onPick } */
    let pop = null, open = null, active = 0;

    function ensure() {
      if (pop) return pop;
      pop = document.createElement('ul');
      pop.id = 'dd-pop';
      pop.className = 'dd-pop';
      pop.setAttribute('role', 'listbox');
      pop.hidden = true;
      document.body.appendChild(pop);
      pop.addEventListener('pointerdown', e => e.preventDefault());       /* 不要讓按鈕先失焦 */
      pop.addEventListener('click', e => {
        const li = e.target.closest('[role=option]');
        if (li) pick(li.dataset.value);
      });
      document.addEventListener('pointerdown', e => {
        if (open && !pop.contains(e.target) && !e.target.closest('.dd-btn')) close(false);
      }, true);
      window.addEventListener('resize', () => { if (open) place(); });
      window.addEventListener('scroll', () => { if (open) place(); }, true);
      document.addEventListener('click', e => {
        const b = e.target.closest('.dd-btn');
        if (!b) return;
        if (open && open.key === b.dataset.key) close(true); else show(b);
      });
      document.addEventListener('keydown', onKey, true);
      return pop;
    }

    function define(name, options, onPick) { groups[name] = { options, onPick }; ensure(); }

    /** 按鈕的 HTML（給畫面組字串用） */
    function button(name, key, value, label) {
      const g = groups[name];
      const o = g.options.find(x => x.value === value) || g.options[0];
      return '<button type="button" class="dd-btn ' + (o.cls || '') + '" data-dd="' + name + '" data-key="' + esc(key) + '" data-value="' + esc(o.value) + '"' +
        ' aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(label || '') + '：' + esc(o.label) + '">' +
        (o.icon || '') + '<span class="dd-text">' + esc(o.label) + '</span>' +
        '<svg class="dd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    }

    function btnEl() { return open && document.querySelector('.dd-btn[data-key="' + CSS.escape(open.key) + '"]'); }

    function show(b) {
      ensure();
      const g = groups[b.dataset.dd];
      if (!g) return;
      open = { key: b.dataset.key, name: b.dataset.dd, value: b.dataset.value };
      active = Math.max(0, g.options.findIndex(o => o.value === open.value));
      pop.innerHTML = g.options.map((o, i) =>
        '<li role="option" id="dd-opt-' + i + '" data-value="' + esc(o.value) + '" class="' + (o.cls || '') + (i === active ? ' active' : '') + '" aria-selected="' + (o.value === open.value) + '">' +
        (o.icon || '') + '<span class="dd-opt-text"><b>' + esc(o.label) + '</b>' + (o.desc ? '<small>' + esc(o.desc) + '</small>' : '') + '</span>' +
        (o.value === open.value ? '<svg class="dd-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</li>').join('');
      pop.hidden = false;
      pop.setAttribute('aria-activedescendant', 'dd-opt-' + active);
      document.querySelectorAll('.dd-btn[aria-expanded="true"]').forEach(x => x.setAttribute('aria-expanded', 'false'));
      b.setAttribute('aria-expanded', 'true');
      place();
    }

    /** 貼在按鈕下方；下方放不下就翻到上方；左右不超出畫面 */
    function place() {
      const b = btnEl();
      if (!b) { close(false); return; }
      const r = b.getBoundingClientRect();
      const w = Math.min(innerWidth - 16, Math.max(r.width, 140));
      pop.style.width = w + 'px';
      const h = pop.offsetHeight;
      const below = innerHeight - r.bottom, above = r.top;
      const top = below >= h + 12 || below >= above ? r.bottom + 6 : r.top - h - 6;
      pop.style.top = Math.max(8, Math.min(top, innerHeight - h - 8)) + 'px';
      pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    }

    function setActive(i) {
      const items = pop.querySelectorAll('[role=option]');
      active = (i + items.length) % items.length;
      items.forEach((li, k) => li.classList.toggle('active', k === active));
      pop.setAttribute('aria-activedescendant', 'dd-opt-' + active);
      items[active].scrollIntoView({ block: 'nearest' });
    }

    function pick(value) {
      if (!open) return;
      const g = groups[open.name], key = open.key;
      close(true);
      if (value !== undefined && g.onPick) g.onPick(key, value);
    }

    function close(refocus) {
      if (!open) return;
      const b = btnEl();
      if (b) { b.setAttribute('aria-expanded', 'false'); if (refocus) b.focus(); }
      open = null;
      if (pop) pop.hidden = true;
    }

    function onKey(e) {
      const b = e.target.closest && e.target.closest('.dd-btn');
      if (!open) {
        if (b && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); show(b); }
        return;
      }
      const n = pop.querySelectorAll('[role=option]').length;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(pop.querySelectorAll('[role=option]')[active].dataset.value); }
      else if (e.key === 'Tab') close(false);
    }

    /** 畫面重繪後：開著的清單跟上新按鈕；按鈕不見了就關掉 */
    function refresh() {
      if (!open) return;
      const b = btnEl();
      if (!b) { close(false); return; }
      b.setAttribute('aria-expanded', 'true');
      place();
    }

    return { define, button, refresh, close, get isOpen() { return !!open; } };
  })();

  root.UI = { $, $$, esc, show, onShow, get current() { return current; }, modal, anyModalOpen, toast, vibrate, randomName, charPicker, setChar, buildSettings, chat, dropdown };
})(typeof self !== 'undefined' ? self : this);
