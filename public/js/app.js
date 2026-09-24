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

  function renderSoloSetup() {
    $('#solo-ai-n').textContent = store.aiCount;
    $('#solo-ai [data-step="-1"]').disabled = store.aiCount <= 1;
    $('#solo-ai [data-step="1"]').disabled = store.aiCount >= 3;
    $$('#solo-diff [data-diff]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.diff === store.difficulty)));
    $('#solo-diff-hint').textContent = DIFF_HINT[store.difficulty] + '（共 ' + (store.aiCount + 1) + ' 人，每人約 ' + Math.floor(52 / (store.aiCount + 1)) + ' 張）';
  }

  function startSolo() {
    const nm = $('#solo-name').value.trim().slice(0, 10) || store.nickname || root.UI.randomName();
    store.nickname = nm;
    root.Store.save(store);
    $('#result').hidden = true;
    show('game');
    gameLayout(false);
    root.Solo.start({ name: nm, char: store.char, aiCount: store.aiCount, difficulty: store.difficulty });
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

  /* ---------- 怎麼玩（靜態圖文） ---------- */

  function renderHelp() {
    const card = (s, r) => '<span class="help-card">' + Art.cardSvg({ s, r }, { fourColor: store.fourColor }) + '</span>';
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
        '<li>右上角齒輪可以開關音樂、音效、喊數語音，也能換成「四色牌」讓花色更好認。</li>' +
        '<li>線上房間以伺服器收到的先後判定誰先拍；網路比較慢的人可能比較吃虧。</li>' +
      '</ul></div>' +
      '<button type="button" class="btn3d coral btn-wide" id="help-go">我懂了，開始玩！</button>';
    $('#help-go').onclick = () => openSolo();
  }

  root.App = { store, openMenu, gameLayout, chatArrived, get settingsModal() { return settingsModal; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
