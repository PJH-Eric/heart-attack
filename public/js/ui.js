/* ===== ui.js — 共用介面零件：畫面切換、Modal、提示、設定彈窗、聊天室、暱稱 ===== */
(function (root) {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

  const T = (k, p) => root.I18N.t(k, p);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 畫面切換 ---------- */

  let current = 'home';
  const listeners = [];
  function show(name) {
    if (root.ServerOutage) root.ServerOutage.setScreen(name);
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
  const ADJ_EN = ['Happy', 'Speedy', 'Tiny', 'Round', 'Giggly', 'Brave', 'Fluffy', 'Clever', 'Sunny', 'Chill', 'Shiny', 'Curious'];
  const NOUN_EN = ['Otter', 'Bunny', 'Capy', 'Penguin', 'Shiba', 'Turtle', 'Koala', 'Kitty', 'Seal', 'Crab', 'Coconut', 'Fishy'];
  const ADJ_HANS = ['开心', '快手', '小小', '圆滚滚', '爱笑', '勇敢', '软绵绵', '机灵', '阳光', '悠哉', '闪亮', '好奇'];
  const NOUN_HANS = ['水獭', '兔兔', '水豚', '企鹅', '柴柴', '海龟', '无尾熊', '猫咪', '海豹', '螃蟹', '椰子', '小鱼'];
  function randomName() {
    const en = root.I18N.lang === 'en';
    const hans = root.I18N.lang === 'zh-Hans';
    const a = en ? ADJ_EN : hans ? ADJ_HANS : ADJ, n = en ? NOUN_EN : hans ? NOUN_HANS : NOUN;
    return a[Math.floor(Math.random() * a.length)] + (en ? ' ' : '') + n[Math.floor(Math.random() * n.length)];
  }

  /* ---------- 遊戲產生的名字／伺服器訊息翻譯（玩家輸入的暱稱不動） ---------- */

  /** 電腦玩家的名字（遊戲內部存中文：「水獺」「電腦水獺」）→ 目前語言；真人暱稱原樣回傳 */
  function pname(name, isAi) {
    name = String(name == null ? '' : name);
    if (root.I18N.lang === 'zh-Hant' || !isAi) return name;
    const m = /^電腦(.+)$/.exec(name);
    const base = m ? m[1] : name;
    const a = root.Art && root.Art.ANIMALS.find(x => x.name === base);
    return a ? (m ? T('ai.prefix') + ' ' : '') + T('animal.' + a.id) : name;
  }
  /** 伺服器訊息裡的名字：只翻「電腦＋動物」這種系統名字 */
  function sname(name) { return /^電腦.+$/.test(name) ? pname(name, true) : name; }
  /** 房間名稱：伺服器預設「某某的牌桌」 */
  function roomName(name) {
    const m = root.I18N.lang !== 'zh-Hant' && /^(.+)的牌桌$/.exec(String(name || ''));
    return m ? T('room.defaultName', { name: m[1] }) : name;
  }

  const SRV = [
    [/^這個房間已經關閉了$/, 'srv.gone'],
    [/^你被房主請出這個房間，晚點再來吧$/, 'srv.kickedBan'],
    [/^觀戰席已滿$/, 'srv.specFull'],
    [/^這個邀請連結已經被房主撤銷了$/, 'srv.inviteRevoked'],
    [/^邀請連結無效，或房間已經結束了$/, 'srv.inviteInvalid'],
    [/^現在不能切換準備$/, 'srv.noReadyNow'],
    [/^觀戰者不用準備$/, 'srv.specNoReady'],
    [/^你不在房間裡$/, 'srv.notInRoom'],
    [/^對局中不能換位子，等這局結束吧$/, 'srv.noSwitchInGame'],
    [/^座位已經滿了$/, 'srv.seatsFull'],
    [/^只有房主可以改房間設定$/, 'srv.hostSettings'],
    [/^對局中不能改設定$/, 'srv.noSettingsInGame'],
    [/^只有房主可以加電腦$/, 'srv.hostAddAi'],
    [/^對局中不能加電腦$/, 'srv.noAddAiInGame'],
    [/^只有房主可以調整電腦難度$/, 'srv.hostAiDiff'],
    [/^對局中不能調整電腦難度$/, 'srv.noAiDiffInGame'],
    [/^沒有這個難度$/, 'srv.noDiff'],
    [/^找不到這個電腦$/, 'srv.noAi'],
    [/^只有房主可以移除電腦$/, 'srv.hostRemoveAi'],
    [/^對局中不能移除電腦$/, 'srv.noRemoveAiInGame'],
    [/^只有房主可以請人離開$/, 'srv.hostKick'],
    [/^不能請自己離開$/, 'srv.noKickSelf'],
    [/^這個人已經不在房間裡$/, 'srv.notHere'],
    [/^只有房主可以管理邀請連結$/, 'srv.hostInvite'],
    [/^訊息是空的$/, 'srv.emptyMsg'],
    [/^講太快了，喘口氣再說$/, 'srv.chatRate'],
    [/^只有房主可以開局$/, 'srv.hostStart'],
    [/^已經在對局中了$/, 'srv.alreadyPlaying'],
    [/^至少要 2 個人（可以加電腦）才能開局$/, 'srv.needTwo'],
    [/^還在等 (.+) 按準備好$/, 'srv.waitReady', m => ({ names: m[1].split('、').map(sname).join(', ') })],
    [/^有玩家斷線中，等他回來或請他離開$/, 'srv.someoneOffline'],
    [/^現在沒有對局$/, 'srv.noGame'],
    [/^現在不是你按$/, 'srv.notYourStart'],
    [/^現在不能按$/, 'srv.cantPress'],
    [/^重複的拍牌$/, 'srv.dupSlap'],
    [/^做不到$/, 'srv.cannot'],
    [/^伺服器處理這個動作時出錯了$/, 'srv.serverError'],
    [/^這桌正在對局中，先幫你安排觀戰，下一局可以換上桌$/, 'srv.joinedAsSpecPlaying'],
    [/^座位已經滿了，先幫你安排觀戰$/, 'srv.joinedAsSpecFull'],
    [/^你被房主請出房間了$/, 'srv.kicked'],
    [/^(.+) 斷線了，(\d+) 秒內回來還能接著玩$/, 'srv.sysOffline', m => ({ p: sname(m[1]), n: m[2] })],
    [/^(.+) 開了這張牌桌$/, 'srv.sysCreated', m => ({ p: sname(m[1]) })],
    [/^(.+) 上桌了（邀請連結）$/, 'srv.sysSatInvite', m => ({ p: sname(m[1]) })],
    [/^(.+) 來觀戰（邀請連結）$/, 'srv.sysSpecInvite', m => ({ p: sname(m[1]) })],
    [/^(.+) 上桌了$/, 'srv.sysSat', m => ({ p: sname(m[1]) })],
    [/^(.+) 來觀戰$/, 'srv.sysSpec', m => ({ p: sname(m[1]) })],
    [/^(.+) 離開了$/, 'srv.sysLeft', m => ({ p: sname(m[1]) })],
    [/^(.+) 成為新房主$/, 'srv.sysNewHost', m => ({ p: sname(m[1]) })],
    [/^(.+) 改成觀戰$/, 'srv.sysToSpec', m => ({ p: sname(m[1]) })],
    [/^房主把結束方式改成「(.+)」$/, 'srv.sysEndMode', m => ({ mode: m[1] === '打到只剩一人有牌' ? T('end.last') : T('end.first') })],
    [/^(.+) 被房主請出房間$/, 'srv.sysKicked', m => ({ p: sname(m[1]) })],
    [/^房主撤銷了邀請連結$/, 'srv.sysRevoked'],
    [/^房主重發了新的邀請連結（舊連結失效）$/, 'srv.sysRegen'],
    [/^開局！系統排好座位順序，由 (.+) 先按開始$/, 'srv.sysStart', m => ({ p: sname(m[1]) })],
    [/^(.+) 斷線太久，先由電腦代打$/, 'srv.sysTakeover', m => ({ p: sname(m[1]) })],
    [/^(.+?) 第一個出完牌，獲勝！(?:(.+) 是最後有牌的人。)?按準備好可以再來一局$/, 'srv.sysOver', m => ({ w: sname(m[1]), l: m[2] ? T('srv.sysOverLoser', { l: sname(m[2]) }) : '' })]
  ];
  /** 伺服器回傳的中文訊息（錯誤、提示、系統聊天）→ 目前語言。中文原樣回傳；對不到的也原樣回傳。 */
  function srvText(text) {
    text = String(text == null ? '' : text);
    if (root.I18N.lang === 'zh-Hant') return text;
    for (const row of SRV) {
      const m = row[0].exec(text);
      if (m) return T(row[1], row[2] ? row[2](m) : undefined);
    }
    return text;
  }

  /* ---------- 角色選擇 ---------- */

  function charPicker(el, selected, onPick) {
    el.innerHTML = root.Art.ANIMALS.map(a =>
      '<button type="button" class="char-opt" role="radio" data-char="' + a.id + '" aria-checked="' + (a.id === selected) +
      '" aria-label="' + T('animal.' + a.id) + '">' + root.Art.animalSvg(a.id) + '<span>' + T('animal.' + a.id) + '</span></button>').join('');
    root.I18N.onChange(() => {
      $$('.char-opt', el).forEach(b => {
        const nm = T('animal.' + b.dataset.char);
        b.setAttribute('aria-label', nm);
        b.querySelector('span').textContent = nm;
        const svg = b.querySelector('svg');
        if (svg) svg.setAttribute('aria-label', nm);
      });
    });
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

  let settingsArgs = null;
  function buildSettings(store, onChange) {
    settingsArgs = [store, onChange];
    const body = $('#settings-body');
    const sw = (key, label, iconName, desc) =>
      '<label class="set-row"><span class="set-ico">' + root.Art.icon(iconName) + '</span>' +
      '<span class="set-text"><b>' + label + '</b>' + (desc ? '<small>' + desc + '</small>' : '') + '</span>' +
      '<input type="checkbox" class="switch" data-key="' + key + '"' + (store[key] ? ' checked' : '') + '></label>';
    const vol = (key, label) =>
      '<label class="set-row vol"><span class="set-text"><b>' + label + '</b></span>' +
      '<input type="range" min="0" max="1" step="0.05" data-key="' + key + '" value="' + store[key] + '" aria-label="' + label + '"></label>';
    body.innerHTML =
      '<h3 class="set-group">' + T('settings.sound') + '</h3>' +
      sw('bgm', T('settings.bgm'), 'music') + vol('bgmVol', T('settings.bgmVol')) +
      sw('sfx', T('settings.sfx'), 'sound') + vol('sfxVol', T('settings.sfxVol')) +
      sw('voice', T('settings.voice'), 'voice', T('settings.voiceDesc')) +
      '<div class="set-row voice-row"><span class="set-text"><b>' + T('settings.voiceMode') + '</b><small id="voice-note"></small></span>' +
      '<button type="button" class="btn3d sea small" id="voice-test">' + T('settings.voiceTest') + '</button></div>' +
      '<div class="seg small voice-seg" role="radiogroup" aria-label="' + T('settings.voiceMode') + '">' +
      [['auto', T('settings.voiceAuto')], ['clip', T('settings.voiceClip')], ['device', T('settings.voiceDevice')]].map(o =>
        '<button type="button" role="radio" data-voice="' + o[0] + '" aria-checked="' + (store.voiceMode === o[0]) + '">' + o[1] + '</button>').join('') +
      '</div>' +
      '<h3 class="set-group">' + T('settings.feel') + '</h3>' +
      sw('vibrate', T('settings.vibrate'), 'feel', T('settings.vibrateDesc')) +
      sw('reduceMotion', T('settings.reduceMotion'), 'see', T('settings.reduceMotionDesc')) +
      sw('bigCall', T('settings.bigCall'), 'see', T('settings.bigCallDesc')) +
      '<div class="set-actions"><button type="button" class="btn3d sand" id="set-reset">' + T('settings.reset') + '</button>' +
      '<button type="button" class="btn3d sea" data-close>' + T('settings.done') + '</button></div>';

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
      n.textContent = store.voiceMode === 'clip' ? T('settings.noteClip')
        : store.voiceMode === 'device' ? (S.hasDeviceVoice ? T('settings.noteDeviceOk') : T('settings.noteDeviceNone'))
        : (S.hasDeviceVoice ? T('settings.noteAutoDevice') : T('settings.noteAutoClip'));
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
      toast(T('toast.settingsReset'));
      const first = $('#settings-body .switch');
      if (first) first.focus();
    };
  }

  /* ---------- 聊天室（房間、對局左欄、窄版彈層共用同一份訊息） ---------- */

  const QUICK_KEYS = ['chat.q1', 'chat.q2', 'chat.q3', 'chat.q4', 'chat.q5', 'chat.q6'];
  const quickHtml = () => QUICK_KEYS.map(k => T(k)).map(q => '<button type="button" class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('');
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
          '<div class="chat-quick">' + quickHtml() + '</div>' +
          '<form class="chat-form"><input maxlength="60" data-i18n-attr="placeholder=chat.placeholder;aria-label=chat.inputLabel" placeholder="' + T('chat.placeholder') + '" aria-label="' + T('chat.inputLabel') + '" autocomplete="off">' +
          '<button class="icon-btn send" type="submit" data-i18n-attr="aria-label=chat.send" aria-label="' + T('chat.send') + '">' + root.Art.icon('send') + '</button></form>';
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
    relabel() {
      $$('.chat-quick').forEach(q => { q.innerHTML = quickHtml(); });
      root.I18N.apply(document);
      this.render();
    },
    render() {
      const html = this.messages.map(m => m.system
        ? '<li class="sys">' + esc(srvText(m.text)) + '</li>'
        : '<li><span class="who">' + (m.char ? root.Art.animalSvg(m.char) : '') + '<b>' + esc(m.name) +
          (m.spec ? '<i>' + T('chat.spec') + '</i>' : '') + '</b></span><span class="msg">' + esc(m.text) + '</span></li>').join('');
      $$('.chat-log').forEach(ol => {
        const nearBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
        ol.innerHTML = html || '<li class="sys">' + T('chat.empty') + '</li>';
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

  /* 切換語言：重畫設定彈窗與聊天室文字（不動對局狀態） */
  root.I18N.onChange(() => {
    if (settingsArgs && $('#settings-body')) {
      const had = document.activeElement && document.activeElement.closest && document.activeElement.closest('#settings-body');
      buildSettings(settingsArgs[0], settingsArgs[1]);
      if (had) { const b = $('#settings-body .switch'); if (b) b.focus(); }
    }
    chat.relabel();
  });

  root.UI = { pname, sname, roomName, srvText, $, $$, esc, show, onShow, get current() { return current; }, modal, anyModalOpen, toast, vibrate, randomName, charPicker, setChar, buildSettings, chat, dropdown };
})(typeof self !== 'undefined' ? self : this);
