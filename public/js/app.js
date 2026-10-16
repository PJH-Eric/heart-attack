/* ===== app.js — 進入點：首頁、單機設定、說明頁、設定彈窗、選單、鍵盤、版面切換 ===== */
(function (root) {
  'use strict';

  const { $, $$, esc, show, toast } = root.UI;
  const Art = root.Art;
  const store = root.Store.load();
  let settingsModal = null, menuModal = null;
  let chatPopOpen = false, unread = 0;

  const T = (k, p) => root.I18N.t(k, p);
  let menuAuto = false;

  function boot() {
    /* 圖示 */
    $('#btn-settings').innerHTML = Art.icon('gear');
    $$('.back-btn').forEach(b => { b.innerHTML = Art.icon('back'); });
    $('#btn-menu').innerHTML = Art.icon('pause');
    $('#btn-menu-fab').innerHTML = Art.icon('pause');
    $('#side-open').innerHTML = Art.icon('info');
    $('#side-close').innerHTML = Art.icon('close');
    $('#chat-fab').insertAdjacentHTML('afterbegin', Art.icon('chat'));
    $('#chat-pop-close').innerHTML = Art.icon('close');
    $$('#settings-modal [data-close].icon-btn, #menu-modal [data-close].icon-btn').forEach(b => { b.innerHTML = Art.icon('close'); });
    $('#hero').innerHTML = Art.heroSvg();
    $('#solo-ai [data-step="-1"]').innerHTML = Art.icon('minus');
    $('#solo-ai [data-step="1"]').innerHTML = Art.icon('plus');

    /* 語言切換鈕：放在設定鈕旁（設定鈕是全畫面共用的一顆，所以只需要一顆切換鈕） */
    root.I18N.mountToggle({ after: $('#btn-settings'), id: 'btn-lang' });

    root.Sound.apply(store);
    applyVisual();
    syncLobbyLink();

    /* 第一次點擊才能出聲（瀏覽器規定） */
    const unlock = () => { root.Sound.unlock(); document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true); };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', e => { if (e.target.closest('.btn3d, .icon-btn, .char-opt, .seg button')) root.Sound.sfx('click'); });

    /* 設定彈窗 */
    settingsModal = root.UI.modal($('#settings-modal'), {
      onOpen: () => { if (root.Solo.active && !root.Solo.paused) { root.Solo.pause(true, true); } },
      onClose: () => { if (root.Solo.active && root.Solo.paused && !menuModal.isOpen && $('#result').hidden) root.Solo.resume(); }
    });
    root.UI.buildSettings(store, s => { root.Store.save(s); root.Sound.apply(s); applyVisual(); if (root.Solo.active) root.Solo.redraw(); });
    $('#btn-settings').onclick = e => settingsModal.open(e.currentTarget);

    /* 選單（單機＝暫停；線上＝不會暫停整房） */
    menuModal = root.UI.modal($('#menu-modal'), {
      onClose: () => { if (root.Solo.active && root.Solo.paused && !settingsModal.isOpen) root.Solo.resume(); }
    });
    const menuClick = e => {
      setSide(false);
      if (root.Solo.active) root.Solo.pause(false, false, e.currentTarget);
      else openMenu(false, e.currentTarget);
    };
    $('#btn-menu').onclick = menuClick;
    $('#btn-menu-fab').onclick = menuClick;

    /* 首頁 */
    $('#go-solo').onclick = () => openSolo();
    $('#go-online').onclick = () => root.Online.enterLobby();
    $('#go-help').onclick = () => { renderHelp(); show('help'); };
    $('#go-speed').onclick = () => { show('speed'); renderSpeed(); };
    window.addEventListener('resize', () => { if (root.UI.current === 'speed') renderSpeed(); });
    $$('[data-back]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.back === 'home' && root.UI.current === 'lobby') root.Online.exit();
      show(b.dataset.back);
      if (b.dataset.back === 'home') renderStats();
    }));

    /* 單機設定 */
    root.UI.charPicker($('#solo-chars'), store.char, id => { store.char = id; root.Store.save(store); root.UI.setChar($('#lobby-chars'), id); });
    root.UI.charPicker($('#lobby-chars'), store.char, id => {
      store.char = id; root.Store.save(store); root.UI.setChar($('#solo-chars'), id);
      root.Net.setProfile({ name: store.nickname, char: id });
      if (root.Net.connected) root.Net.send({ type: 'profile', char: id });
    });
    $('#solo-ai').addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      store.aiCount = Math.min(3, Math.max(1, store.aiCount + Number(b.dataset.step)));
      root.Store.save(store);
      renderSoloSetup();
    });
    renderDiffButtons();
    $('#solo-diff').addEventListener('click', e => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      store.difficulty = b.dataset.diff;
      store.aiDiffs = [b.dataset.diff, b.dataset.diff, b.dataset.diff];     /* 全部一起設 */
      root.Store.save(store);
      renderSoloSetup();
    });
    /* 每個電腦各自選難度 */
    $('#solo-ai-list').addEventListener('click', e => {
      const b = e.target.closest('[data-ai][data-diff]');
      if (!b) return;
      const d = aiDiffs();
      d[Number(b.dataset.ai)] = b.dataset.diff;
      store.aiDiffs = d;
      root.Store.save(store);
      renderSoloSetup();
    });
    $('#solo-end').addEventListener('click', e => {
      const b = e.target.closest('[data-end]');
      if (!b) return;
      store.endMode = b.dataset.end;
      root.Store.save(store);
      renderSoloSetup();
    });
    $('#solo-start').onclick = startSolo;

    /* 對局畫面：左欄抽屜、聊天彈層 */
    $('#side-open').onclick = () => setSide(true);
    $('#side-close').onclick = () => setSide(false);
    $('#chat-fab').onclick = () => setChatPop(true);
    $('#chat-pop-close').onclick = () => setChatPop(false);

    root.UI.chat.mount();
    root.UI.chat.onSend = text => root.Net.send({ type: 'chat', text });
    root.Online.init();

    /* 鍵盤：空白鍵拍牌、Enter 開始、Esc 選單 */
    document.addEventListener('keydown', onKey);
    root.UI.onShow(name => {
      document.body.classList.toggle('in-game', name === 'game');
      if (name !== 'game') { setSide(false); setChatPop(false); }
    });
    window.addEventListener('resize', () => gameLayout());

    /* 切換語言：只重畫文字，不重置對局 */
    root.I18N.onChange(relabelAll);

    renderStats();
    if (root.Online.hasInvite) root.Online.enterLobby();
    else show('home');
  }

  function renderDiffButtons() {
    $('#solo-diff').innerHTML = root.Rules.DIFFICULTY_LIST.map(k =>
      '<button type="button" role="radio" data-diff="' + k + '">' + T('diff.' + k) + '</button>').join('');
  }

  /** 「回遊戲大廳」連結帶上目前語言（?lang=），跨來源也能同步 */
  function syncLobbyLink() {
    const a = $('#lobby-home-link');
    if (!a) return;
    if (!a.dataset.base) a.dataset.base = a.getAttribute('href');
    a.setAttribute('href', root.I18N.withLang(a.dataset.base));
  }

  function relabelAll() {
    syncLobbyLink();
    $('#hero').innerHTML = Art.heroSvg();
    renderDiffButtons();
    renderSoloSetup();
    renderStats();
    if (root.UI.current === 'help') renderHelp();
    if (root.UI.current === 'speed') renderSpeed();
    if (menuModal && menuModal.isOpen) buildMenu();
    if (root.Online) root.Online.relabel();
    if (root.Solo.active) root.Solo.relabel();
    renderUnread();
  }

  function applyVisual() {
    document.body.classList.toggle('reduce-motion', !!store.reduceMotion);
    document.body.classList.toggle('big-call', !!store.bigCall);
  }

  function onKey(e) {
    if (root.UI.current !== 'game' || root.UI.anyModalOpen()) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const table = root.Solo.active ? null : root.Online.table;
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (root.Solo.active) root.Solo.slap(); else if (table) table.trySlap();
    } else if (e.key === 'Enter') {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      if (root.Solo.active) root.Solo.pressStart();
      else if (table && table.view && table.view.phase === 'waitStart') root.Net.send({ type: 'deal' });
    } else if (e.key === 'Escape') {
      if (!$('#result').hidden) return;
      e.preventDefault();
      if (root.Solo.active) root.Solo.pause(false); else openMenu(false);
    }
  }

  /* ---------- 首頁 ---------- */

  function renderStats() {
    let play = 0, win = 0;
    for (const k in store.stats) { play += store.stats[k].play; win += store.stats[k].win; }
    $('#home-stats').textContent = play ? T('home.stats', { play, win }) : '';
  }

  /* ---------- 單機 ---------- */

  function openSolo() {
    $('#solo-name').value = store.nickname || '';
    root.UI.setChar($('#solo-chars'), store.char);
    renderSoloSetup();
    show('solo');
  }

  const DIFF_ORDER = ['kid', 'easy', 'normal', 'hard'];
  function aiDiffs() {
    const base = store.difficulty || 'normal';
    const d = Array.isArray(store.aiDiffs) ? store.aiDiffs.slice(0, 3) : [];
    while (d.length < 3) d.push(base);
    return d.map(x => DIFF_ORDER.includes(x) ? x : base);
  }

  function renderSoloSetup() {
    const diffs = aiDiffs().slice(0, store.aiCount);
    const same = diffs.every(x => x === diffs[0]);
    $('#solo-ai-list').innerHTML = diffs.map((d, i) =>
      '<li><span class="ai-no">' + T('solo.aiN', { n: i + 1 }) + '</span><div class="seg small" role="radiogroup" aria-label="' + T('solo.aiNDiff', { n: i + 1 }) + '">' +
      DIFF_ORDER.map(k => '<button type="button" role="radio" data-ai="' + i + '" data-diff="' + k + '" aria-checked="' + (k === d) + '">' + T('diff.' + k) + '</button>').join('') +
      '</div></li>').join('');
    $('#solo-ai-n').textContent = store.aiCount;
    $('#solo-ai [data-step="-1"]').disabled = store.aiCount <= 1;
    $('#solo-ai [data-step="1"]').disabled = store.aiCount >= 3;
    $$('#solo-diff [data-diff]').forEach(b => b.setAttribute('aria-checked', String(same && b.dataset.diff === diffs[0])));
    $$('#solo-end [data-end]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.end === store.endMode)));
    $('#solo-end-hint').textContent = store.endMode === 'last' ? T('solo.endHintLast') : T('solo.endHintFirst');
    const easiest = DIFF_ORDER.find(k => diffs.includes(k));
    $('#solo-diff-hint').textContent = (same ? T('diffHint.' + diffs[0]) : T('solo.mixedHint', { diff: T('diff.' + easiest) })) +
      T('solo.dealHint', { n: store.aiCount + 1, cards: Math.floor(52 / (store.aiCount + 1)) });
  }

  function startSolo() {
    const nm = $('#solo-name').value.trim().slice(0, 10) || store.nickname || root.UI.randomName();
    store.nickname = nm;
    root.Store.save(store);
    $('#result').hidden = true;
    show('game');
    gameLayout(false);
    root.Solo.start({ name: nm, char: store.char, aiCount: store.aiCount, aiDiffs: aiDiffs().slice(0, store.aiCount), endMode: store.endMode });
    if (!store.seenHelp) {
      store.seenHelp = true;
      root.Store.save(store);
      toast(T('toast.firstTip'));
    }
  }

  /* ---------- 對局版面 ---------- */

  function isWide() { return window.matchMedia('(min-width: 900px) and (min-height: 560px)').matches; }

  /** online：這局有沒有聊天室 */
  function gameLayout(online) {
    if (online != null) document.body.classList.toggle('online-game', !!online);
    const on = document.body.classList.contains('online-game');
    const side = $('[data-chat="game"]');
    side.hidden = !on;
    $('#chat-fab').hidden = !on || isWide();
    if (isWide()) { setChatPop(false); setSide(false); }
  }

  function setSide(open) {
    document.body.classList.toggle('side-open', !!open);
    const btn = $('#side-open');
    if (btn) btn.setAttribute('aria-expanded', String(!!open));
  }

  function setChatPop(open) {
    chatPopOpen = !!open;
    $('#chat-pop').hidden = !chatPopOpen;
    if (chatPopOpen) {
      unread = 0; renderUnread();
      const input = $('#chat-pop input'); if (input) input.focus();
      root.UI.chat.render();
    }
  }

  function chatArrived(m) {
    if (!m || m.system) return;
    root.Sound.sfx('chat');
    if (root.UI.current === 'game' && !isWide() && !chatPopOpen) { unread++; renderUnread(); }
  }
  function renderUnread() {
    const b = $('#chat-unread');
    b.hidden = unread === 0;
    b.textContent = unread > 9 ? '9+' : unread;
  }

  /* ---------- 選單 ---------- */

  function openMenu(auto, from) {
    if (!from) from = isWide() ? $('#btn-menu') : $('#btn-menu-fab');
    menuAuto = !!auto;
    buildMenu();
    menuModal.open(from);
  }

  function buildMenu() {
    const auto = menuAuto;
    const body = $('#menu-body');
    if (root.Solo.active) {
      $('#menu-title').textContent = auto ? T('menu.paused') : T('menu.pause');
      body.innerHTML = (auto ? '<p class="hint">' + T('menu.autoPaused') + '</p>' : '') +
        '<button type="button" class="btn3d coral btn-wide" id="m-resume">' + T('menu.resume') + '</button>' +
        '<button type="button" class="btn3d sand btn-wide" id="m-restart">' + T('menu.restart') + '</button>' +
        '<button type="button" class="btn3d sea btn-wide" id="m-home">' + T('nav.home') + '</button>';
      $('#m-resume').onclick = () => menuModal.close();
      $('#m-restart').onclick = () => { menuModal.close(); $('#result').hidden = true; root.Solo.restart(); };
      $('#m-home').onclick = () => { root.Solo.stop(); menuModal.close(); show('home'); renderStats(); };
    } else {
      const room = root.Online.room;
      const isPlayer = room && room.you.role === 'player';
      $('#menu-title').textContent = T('menu.menu');
      body.innerHTML = '<p class="hint">' + T('menu.onlineHint') + '</p>' +
        '<button type="button" class="btn3d coral btn-wide" id="m-resume">' + T('menu.backToTable') + '</button>' +
        (room && room.invite.active ? '<button type="button" class="btn3d sea btn-wide" id="m-copy">' + T('menu.copyInvite') + '</button>' : '') +
        '<button type="button" class="btn3d sand btn-wide" id="m-leave">' + T('room.leave') + '</button>' +
        (isPlayer ? '<small class="hint">' + T('menu.leaveWarn') + '</small>' : '');
      $('#m-resume').onclick = () => menuModal.close();
      const cp = $('#m-copy');
      if (cp) cp.onclick = () => {
        const tmp = document.createElement('input');
        tmp.id = 'invite-url'; tmp.style.position = 'fixed'; tmp.style.opacity = '0';
        const u = new URL(location.href); u.search = ''; u.searchParams.set('invite', room.invite.token);
        tmp.value = u.toString(); document.body.appendChild(tmp);
        root.Online.copyInvite(); tmp.remove();
      };
      $('#m-leave').onclick = () => { menuModal.close(); root.Online.leaveRoom(); };
    }
  }

  /* ---------- 我的拍速 ---------- */

  const kindName = k => (k ? T('kind.' + k) : '');
  const sec = root.Table.sec;
  function speedTitle(avg) {
    if (avg == null) return '';
    if (avg < 350) return T('speed.t1');
    if (avg < 450) return T('speed.t2');
    if (avg < 600) return T('speed.t3');
    if (avg < 800) return T('speed.t4');
    return T('speed.t5');
  }

  /** 最近幾局的平均反應時間（單一數列長條圖：一個色相、細長條、圓角朝上、滑過顯示數值） */
  function speedChart(list, width) {
    const games = list.filter(g => g.avg != null).slice(-20);
    if (games.length < 2) return '<p class="hint">' + T('speed.needTwo') + '</p>';
    /* 用實際寬度當 viewBox 寬，手機上座標軸的字才不會被縮到看不見 */
    const W = Math.max(280, Math.min(760, Math.round(width || 560))), H = W < 420 ? 180 : 220, L = 40, B = 26, T = 18, R = 8;
    const max = Math.max(1000, Math.ceil(Math.max(...games.map(g => g.avg)) / 250) * 250);
    const step = (W - L - R) / games.length;
    const bw = Math.max(6, Math.min(22, step - 4));
    const y = v => T + (H - T - B) * (1 - v / max);
    const bestAvg = Math.min(...games.map(g => g.avg));
    let grid = '';
    for (let v = 0; v <= max; v += max / 4) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + (v / 1000).toFixed(v % 1000 ? 2 : 1) + '</text>';
    }
    let bars = '', bestLabel = '';
    games.forEach((g, i) => {
      const x = L + i * step + (step - bw) / 2, top = y(g.avg), h = H - B - top;
      const r = Math.min(4, bw / 2, h);
      const d = 'M' + x + ' ' + (H - B) + 'V' + (top + r) + 'Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top +
        'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + 'V' + (H - B) + 'Z';
      const tip = T('speed.tip', { d: g.d, kind: kindName(g.kind), avg: sec(g.avg), hits: g.hits });
      bars += '<g class="bar" tabindex="0" data-tip="' + esc(tip) + '"><rect x="' + (L + i * step) + '" y="' + T + '" width="' + step + '" height="' + (H - B - T) + '" class="hit"/>' +
        '<path d="' + d + '"/><title>' + esc(tip) + '</title></g>';
      if (g.avg === bestAvg && !bestLabel) bestLabel = '<text x="' + (x + bw / 2) + '" y="' + (top - 5) + '" class="lbl" text-anchor="middle">' + (g.avg / 1000).toFixed(2) + '</text>';
    });
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" class="speed-chart" role="img" aria-label="' + T('speed.chartAria', { n: games.length }) + '">' +
      grid + '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="base"/>' + bars + bestLabel +
      '<text x="' + L + '" y="' + (H - 6) + '" class="ax">' + T('speed.earlier') + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" class="ax" text-anchor="end">' + T('speed.latest') + '</text>' +
      '</svg><div class="chart-tip" hidden></div></div>';
  }

  function chartWidth() {
    const page = $('#speed-body');
    const w = page.clientWidth || Math.min(820, window.innerWidth - 32);
    return w - 44;      /* 扣掉卡片左右內距與邊框 */
  }

  function renderSpeed() {
    const r = store.reaction || {};
    const body = $('#speed-body');
    if (!r.games) {
      body.innerHTML = '<div class="panel-card speed-empty"><p>' + T('speed.empty') + '</p><p class="hint">' + T('speed.emptyHint') + '</p>' +
        '<button type="button" class="btn3d coral btn-wide" id="speed-play">' + T('speed.playOne') + '</button></div>';
      $('#speed-play').onclick = () => openSolo();
      return;
    }
    const avg = r.hits ? Math.round(r.sum / r.hits) : null;
    const tries = r.hits + r.wrong + r.missed;
    const acc = tries ? Math.round(r.hits / tries * 100) : null;
    const kinds = ['kid', 'easy', 'normal', 'hard', 'mixed', 'online'].filter(k => r.byKind[k] && (r.byKind[k].hits || r.byKind[k].best != null));
    body.innerHTML =
      '<div class="speed-hero panel-card">' +
        '<div class="big"><small>' + T('speed.best') + '</small><b>' + (r.best == null ? '—' : (r.best / 1000).toFixed(2)) + '<i>' + T('unit.secShort') + '</i></b></div>' +
        '<div><small>' + T('speed.avgReact') + '</small><b>' + (avg == null ? '—' : (avg / 1000).toFixed(2)) + '<i>' + T('unit.secShort') + '</i></b>' + (avg != null ? '<span class="title-chip">' + speedTitle(avg) + '</span>' : '') + '</div>' +
        '<div><small>' + T('speed.accuracy') + '</small><b>' + (acc == null ? '—' : acc) + '<i>%</i></b><span class="sub">' + T('speed.counts', { hits: r.hits, wrong: r.wrong, missed: r.missed }) + '</span></div>' +
        '<div><small>' + T('speed.played') + '</small><b>' + r.games + '<i>' + T('unit.games') + '</i></b></div>' +
      '</div>' +
      '<div class="panel-card"><h3 class="card-title">' + T('speed.recentTitle') + '</h3>' + speedChart(r.history, chartWidth()) + '</div>' +
      (kinds.length ? '<div class="panel-card"><h3 class="card-title">' + T('speed.byLevel') + '</h3><table class="speed-table wide"><thead><tr><th scope="col">' + T('speed.mode') + '</th><th scope="col">' + T('speed.best') + '</th><th scope="col">' + T('speed.avg') + '</th><th scope="col">' + T('speed.bestAvg') + '</th><th scope="col">' + T('speed.hits') + '</th></tr></thead><tbody>' +
        kinds.map(k => { const x = r.byKind[k]; return '<tr><th scope="row">' + kindName(k) + '</th><td>' + sec(x.best) + '</td><td>' + sec(x.hits ? Math.round(x.sum / x.hits) : null) + '</td><td>' + sec(x.bestAvg) + '</td><td>' + x.hits + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '') +
      '<div class="panel-card"><h3 class="card-title">' + T('speed.lastN', { n: Math.min(10, r.history.length) }) + '</h3><table class="speed-table wide"><thead><tr><th scope="col">' + T('speed.date') + '</th><th scope="col">' + T('speed.mode') + '</th><th scope="col">' + T('speed.avg') + '</th><th scope="col">' + T('speed.fastest') + '</th><th scope="col">' + T('speed.rwm') + '</th></tr></thead><tbody>' +
        r.history.slice(-10).reverse().map(g => '<tr><th scope="row">' + g.d.slice(5).replace('-', '/') + '</th><td>' + kindName(g.kind) + '</td><td>' + sec(g.avg) + '</td><td>' + sec(g.best) + '</td><td>' + g.hits + '／' + g.wrong + '／' + g.missed + '</td></tr>').join('') +
        '</tbody></table>' +
        '<p class="hint">' + T('speed.note') + '</p>' +
        '<div class="speed-reset"><button type="button" class="link-btn danger" id="speed-clear">' + T('speed.clear') + '</button></div></div>';

    /* 長條滑過／點一下顯示數值（觸控也能看） */
    const wrap = body.querySelector('.chart-wrap');
    if (wrap) {
      const tip = wrap.querySelector('.chart-tip');
      const showTip = g => {
        const a = wrap.getBoundingClientRect(), b = g.getBoundingClientRect();
        tip.textContent = g.dataset.tip;
        tip.hidden = false;
        const left = Math.min(Math.max(8, b.left - a.left + b.width / 2 - tip.offsetWidth / 2), a.width - tip.offsetWidth - 8);
        tip.style.left = left + 'px';
      };
      wrap.querySelectorAll('.bar').forEach(g => {
        g.addEventListener('pointerenter', () => showTip(g));
        g.addEventListener('focus', () => showTip(g));
        g.addEventListener('click', () => showTip(g));
      });
      wrap.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    $('#speed-clear').onclick = e => {
      const b = e.currentTarget;
      if (b.dataset.confirm) {
        root.Store.clearReaction(store);
        renderSpeed();
        toast(T('toast.speedCleared'));
        return;
      }
      b.dataset.confirm = '1';
      b.textContent = T('speed.clearConfirm');
      setTimeout(() => { if (document.contains(b)) { delete b.dataset.confirm; b.textContent = T('speed.clear'); } }, 4000);
    };
  }

  /* ---------- 怎麼玩（靜態圖文） ---------- */

  function renderHelp() {
    const card = (s, r) => '<span class="help-card">' + Art.cardSvg({ s, r }) + '</span>';
    $('#help-body').innerHTML =
      '<ol class="help-steps">' +
      '<li><div class="help-pic">' + Art.cardBackSvg() + '</div><div><h3>' + T('help.s1t') + '</h3>' +
        '<p>' + T('help.s1') + '</p></div></li>' +
      '<li><div class="help-pic call-demo"><span>' + T('table.call') + '</span><b>1</b></div><div><h3>' + T('help.s2t') + '</h3>' +
        '<p>' + T('help.s2') + '</p></div></li>' +
      '<li><div class="help-pic pair"><div class="call-demo small"><span>' + T('table.call') + '</span><b>11</b></div>' + card('H', 11) + '</div><div><h3>' + T('help.s3t') + '</h3>' +
        '<p>' + T('help.s3') + '</p></div></li>' +
      '<li><div class="help-pic">' + Art.handIcon() + '</div><div><h3>' + T('help.s4t') + '</h3>' +
        '<p>' + T('help.s4') + '</p></div></li>' +
      '<li><div class="help-pic pair"><div class="call-demo small"><span>' + T('table.call') + '</span><b>5</b></div>' + card('S', 6) + '</div><div><h3>' + T('help.s5t') + '</h3>' +
        '<p>' + T('help.s5') + '</p></div></li>' +
      '<li><div class="help-pic">' + Art.animalSvg('bunny') + '</div><div><h3>' + T('help.s6t') + '</h3>' +
        '<p>' + T('help.s6') + '</p></div></li>' +
      '</ol>' +
      '<div class="help-tips"><h3>' + T('help.tips') + '</h3><ul>' +
        '<li>' + T('help.tip1') + '</li>' +
        '<li>' + T('help.tip2') + '</li>' +
        '<li>' + T('help.tip3') + '</li>' +
        '<li>' + T('help.tip4') + '</li>' +
        '<li>' + T('help.tip5') + '</li>' +
      '</ul></div>' +
      '<button type="button" class="btn3d coral btn-wide" id="help-go">' + T('help.go') + '</button>';
    $('#help-go').onclick = () => openSolo();
  }

  root.App = { store, openMenu, gameLayout, chatArrived, get settingsModal() { return settingsModal; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
