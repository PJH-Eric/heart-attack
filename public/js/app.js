/* ===== app.js — 進入點：首頁、單機設定、說明頁、設定彈窗、選單、鍵盤、版面切換 ===== */
(function (root) {
  'use strict';

  const { $, $$, esc, show, toast } = root.UI;
  const Art = root.Art;
  const store = root.Store.load();
  let settingsModal = null, menuModal = null;
  let chatPopOpen = false, unread = 0;

  const DIFF_HINT = {
    kid: '電腦拍得很慢、翻牌也放慢，適合 3～5 歲小朋友',
    easy: '電腦反應慢一點，偶爾會看錯',
    normal: '跟一般休閒玩家差不多',
    hard: '電腦手很快，幾乎不出錯'
  };

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

    root.Sound.apply(store);
    applyVisual();

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
    $('#solo-diff').innerHTML = root.Rules.DIFFICULTY_LIST.map(k =>
      '<button type="button" role="radio" data-diff="' + k + '">' + root.Rules.DIFFICULTIES[k].name + '</button>').join('');
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

    renderStats();
    if (root.Online.hasInvite) root.Online.enterLobby();
    else show('home');
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
    $('#home-stats').textContent = play ? '這台裝置上玩過 ' + play + ' 局，贏了 ' + win + ' 局' : '';
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
    const names = root.Rules.DIFFICULTIES;
    $('#solo-ai-list').innerHTML = diffs.map((d, i) =>
      '<li><span class="ai-no">電腦 ' + (i + 1) + '</span><div class="seg small" role="radiogroup" aria-label="電腦 ' + (i + 1) + ' 的難度">' +
      DIFF_ORDER.map(k => '<button type="button" role="radio" data-ai="' + i + '" data-diff="' + k + '" aria-checked="' + (k === d) + '">' + names[k].name + '</button>').join('') +
      '</div></li>').join('');
    $('#solo-ai-n').textContent = store.aiCount;
    $('#solo-ai [data-step="-1"]').disabled = store.aiCount <= 1;
    $('#solo-ai [data-step="1"]').disabled = store.aiCount >= 3;
    $$('#solo-diff [data-diff]').forEach(b => b.setAttribute('aria-checked', String(same && b.dataset.diff === diffs[0])));
    $$('#solo-end [data-end]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.end === store.endMode)));
    $('#solo-end-hint').textContent = store.endMode === 'last'
      ? '出完的人依序拿名次、離開牌桌，其他人繼續打，直到只剩一個人手上有牌'
      : '只要有一個人把牌出完，這局就結束';
    const easiest = DIFF_ORDER.find(k => diffs.includes(k));
    $('#solo-diff-hint').textContent = (same ? DIFF_HINT[diffs[0]] : '混合難度：翻牌節奏跟著最簡單的電腦（' + names[easiest].name + '）') +
      '（共 ' + (store.aiCount + 1) + ' 人，每人約 ' + Math.floor(52 / (store.aiCount + 1)) + ' 張）';
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
      toast('數字跟喊的一樣就按「拍牌」或空白鍵！');
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
    const body = $('#menu-body');
    if (root.Solo.active) {
      $('#menu-title').textContent = auto ? '遊戲暫停了' : '暫停';
      body.innerHTML = (auto ? '<p class="hint">剛剛離開畫面，先幫你暫停</p>' : '') +
        '<button type="button" class="btn3d coral btn-wide" id="m-resume">繼續</button>' +
        '<button type="button" class="btn3d sand btn-wide" id="m-restart">重新開始</button>' +
        '<button type="button" class="btn3d sea btn-wide" id="m-home">回首頁</button>';
      $('#m-resume').onclick = () => menuModal.close();
      $('#m-restart').onclick = () => { menuModal.close(); $('#result').hidden = true; root.Solo.restart(); };
      $('#m-home').onclick = () => { root.Solo.stop(); menuModal.close(); show('home'); renderStats(); };
    } else {
      const room = root.Online.room;
      const isPlayer = room && room.you.role === 'player';
      $('#menu-title').textContent = '選單';
      body.innerHTML = '<p class="hint">線上對局不會暫停，其他人會繼續玩。</p>' +
        '<button type="button" class="btn3d coral btn-wide" id="m-resume">回到牌桌</button>' +
        (room && room.invite.active ? '<button type="button" class="btn3d sea btn-wide" id="m-copy">複製邀請連結</button>' : '') +
        '<button type="button" class="btn3d sand btn-wide" id="m-leave">離開房間</button>' +
        (isPlayer ? '<small class="hint">對局中離開，你的牌會交給電腦代打</small>' : '');
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
    menuModal.open(from);
  }

  /* ---------- 我的拍速 ---------- */

  const KIND_NAME = { kid: '幼幼班', easy: '簡單', normal: '普通', hard: '困難', mixed: '混合難度', online: '線上' };
  const sec = root.Table.sec;
  function speedTitle(avg) {
    if (avg == null) return '';
    if (avg < 350) return '閃電手';
    if (avg < 450) return '快手';
    if (avg < 600) return '靈巧';
    if (avg < 800) return '穩穩的';
    return '慢慢來';
  }

  /** 最近幾局的平均反應時間（單一數列長條圖：一個色相、細長條、圓角朝上、滑過顯示數值） */
  function speedChart(list, width) {
    const games = list.filter(g => g.avg != null).slice(-20);
    if (games.length < 2) return '<p class="hint">玩兩局以上就會出現最近的拍速變化。</p>';
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
      const tip = g.d + '・' + (KIND_NAME[g.kind] || '') + '・平均 ' + sec(g.avg) + '・拍對 ' + g.hits + ' 次';
      bars += '<g class="bar" tabindex="0" data-tip="' + esc(tip) + '"><rect x="' + (L + i * step) + '" y="' + T + '" width="' + step + '" height="' + (H - B - T) + '" class="hit"/>' +
        '<path d="' + d + '"/><title>' + esc(tip) + '</title></g>';
      if (g.avg === bestAvg && !bestLabel) bestLabel = '<text x="' + (x + bw / 2) + '" y="' + (top - 5) + '" class="lbl" text-anchor="middle">' + (g.avg / 1000).toFixed(2) + '</text>';
    });
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" class="speed-chart" role="img" aria-label="最近 ' + games.length + ' 局的平均反應時間">' +
      grid + '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="base"/>' + bars + bestLabel +
      '<text x="' + L + '" y="' + (H - 6) + '" class="ax">較早</text><text x="' + (W - R) + '" y="' + (H - 6) + '" class="ax" text-anchor="end">最近</text>' +
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
      body.innerHTML = '<div class="panel-card speed-empty"><p>還沒有拍速紀錄。</p><p class="hint">每一局都會記下你從「牌翻出來」到「按下拍牌」花了多久。</p>' +
        '<button type="button" class="btn3d coral btn-wide" id="speed-play">去玩一局</button></div>';
      $('#speed-play').onclick = () => openSolo();
      return;
    }
    const avg = r.hits ? Math.round(r.sum / r.hits) : null;
    const tries = r.hits + r.wrong + r.missed;
    const acc = tries ? Math.round(r.hits / tries * 100) : null;
    const kinds = ['kid', 'easy', 'normal', 'hard', 'mixed', 'online'].filter(k => r.byKind[k] && (r.byKind[k].hits || r.byKind[k].best != null));
    body.innerHTML =
      '<div class="speed-hero panel-card">' +
        '<div class="big"><small>最快一拍</small><b>' + (r.best == null ? '—' : (r.best / 1000).toFixed(2)) + '<i>秒</i></b></div>' +
        '<div><small>平均反應</small><b>' + (avg == null ? '—' : (avg / 1000).toFixed(2)) + '<i>秒</i></b>' + (avg != null ? '<span class="title-chip">' + speedTitle(avg) + '</span>' : '') + '</div>' +
        '<div><small>拍得準</small><b>' + (acc == null ? '—' : acc) + '<i>%</i></b><span class="sub">拍對 ' + r.hits + '・拍錯 ' + r.wrong + '・沒拍到 ' + r.missed + '</span></div>' +
        '<div><small>玩過</small><b>' + r.games + '<i>局</i></b></div>' +
      '</div>' +
      '<div class="panel-card"><h3 class="card-title">最近的平均反應時間（秒，越短越快）</h3>' + speedChart(r.history, chartWidth()) + '</div>' +
      (kinds.length ? '<div class="panel-card"><h3 class="card-title">各難度</h3><table class="speed-table wide"><thead><tr><th scope="col">模式</th><th scope="col">最快一拍</th><th scope="col">平均</th><th scope="col">單局最佳平均</th><th scope="col">拍對</th></tr></thead><tbody>' +
        kinds.map(k => { const x = r.byKind[k]; return '<tr><th scope="row">' + KIND_NAME[k] + '</th><td>' + sec(x.best) + '</td><td>' + sec(x.hits ? Math.round(x.sum / x.hits) : null) + '</td><td>' + sec(x.bestAvg) + '</td><td>' + x.hits + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '') +
      '<div class="panel-card"><h3 class="card-title">最近 ' + Math.min(10, r.history.length) + ' 局</h3><table class="speed-table wide"><thead><tr><th scope="col">日期</th><th scope="col">模式</th><th scope="col">平均</th><th scope="col">最快</th><th scope="col">對／錯／沒拍到</th></tr></thead><tbody>' +
        r.history.slice(-10).reverse().map(g => '<tr><th scope="row">' + g.d.slice(5).replace('-', '/') + '</th><td>' + (KIND_NAME[g.kind] || '') + '</td><td>' + sec(g.avg) + '</td><td>' + sec(g.best) + '</td><td>' + g.hits + '／' + g.wrong + '／' + g.missed + '</td></tr>').join('') +
        '</tbody></table>' +
        '<p class="hint">反應時間是在你這台裝置上量的：從牌出現在畫面上，到你按下拍牌。線上也一樣，不含網路延遲。</p>' +
        '<div class="speed-reset"><button type="button" class="link-btn danger" id="speed-clear">清除拍速紀錄</button></div></div>';

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
        toast('拍速紀錄已清除');
        return;
      }
      b.dataset.confirm = '1';
      b.textContent = '確定要清除嗎？再按一次';
      setTimeout(() => { if (document.contains(b)) { delete b.dataset.confirm; b.textContent = '清除拍速紀錄'; } }, 4000);
    };
  }

  /* ---------- 怎麼玩（靜態圖文） ---------- */

  function renderHelp() {
    const card = (s, r) => '<span class="help-card">' + Art.cardSvg({ s, r }) + '</span>';
    $('#help-body').innerHTML =
      '<ol class="help-steps">' +
      '<li><div class="help-pic">' + Art.cardBackSvg() + '</div><div><h3>1. 發牌</h3>' +
        '<p>一副 52 張撲克牌（沒有鬼牌），系統排好座位順序後，一人一張輪流發完。大家都看不到自己的牌，只知道剩幾張。</p></div></li>' +
      '<li><div class="help-pic call-demo"><span>喊</span><b>1</b></div><div><h3>2. 按開始</h3>' +
        '<p>第一順位的人按「開始」，系統就照順序自動幫每個人翻牌，同時喊 1、2、3……13，喊到 13 再回到 1。牌面的 A 算 1、J 算 11、Q 算 12、K 算 13。</p></div></li>' +
      '<li><div class="help-pic pair"><div class="call-demo small"><span>喊</span><b>11</b></div>' + card('H', 11) + '</div><div><h3>3. 數字一樣就拍！</h3>' +
        '<p>翻出來的點數跟喊的數字一樣（花色不重要），所有人趕快按「拍牌」（鍵盤按空白鍵，也可以直接點牌堆）。</p></div></li>' +
      '<li><div class="help-pic">' + Art.handIcon() + '</div><div><h3>4. 最慢的人收牌</h3>' +
        '<p>最後拍的人（或沒拍到的人）要把中間整疊牌收回去，放到自己的牌底下。</p></div></li>' +
      '<li><div class="help-pic pair"><div class="call-demo small"><span>喊</span><b>5</b></div>' + card('S', 6) + '</div><div><h3>5. 拍錯也要收</h3>' +
        '<p>數字不一樣卻拍下去，第一個拍錯的人收走整疊牌。還沒翻牌時按拍牌不算，也不會被罰。</p></div></li>' +
      '<li><div class="help-pic">' + Art.animalSvg('bunny') + '</div><div><h3>6. 收牌的人接著發</h3>' +
        '<p>收了牌的人按「自動發牌」，從自己開始、再從 1 重新喊起。誰先把手上的牌出完，誰就贏！</p></div></li>' +
      '</ol>' +
      '<div class="help-tips"><h3>小提醒</h3><ul>' +
        '<li>電腦有四種難度：幼幼班、簡單、普通、困難。幼幼班的翻牌也會放慢。</li>' +
        '<li>每一拍都會記下反應時間：拍牌泡泡會顯示秒數，結算有「拍速」排行，首頁「我的拍速」看得到你的紀錄。</li>' +
        '<li>結束方式有兩種：「有人出完就結束」，或「打到只剩一人有牌」—— 出完的人依序拿名次離開牌桌，最後還有牌的人就是最後一名。線上由房主決定。</li>' +
        '<li>右上角齒輪可以開關音樂、音效、喊數語音，也能把喊數字放大。</li>' +
        '<li>線上房間以伺服器收到的先後判定誰先拍；網路比較慢的人可能比較吃虧。</li>' +
      '</ul></div>' +
      '<button type="button" class="btn3d coral btn-wide" id="help-go">我懂了，開始玩！</button>';
    $('#help-go').onclick = () => openSolo();
  }

  root.App = { store, openMenu, gameLayout, chatArrived, get settingsModal() { return settingsModal; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
