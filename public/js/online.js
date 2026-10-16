/* ===== online.js — 線上大廳、房間、觀戰、邀請連結、線上對局 ===== */
(function (root) {
  'use strict';

  const { $, $$, esc, toast, show } = root.UI;
  const Art = root.Art;
  const T = (k, p) => root.I18N.t(k, p);
  const paceName = k => (k ? T('pace.' + k) : '');
  const endName = k => T('end.' + (k === 'last' ? 'last' : 'first'));
  const diffName = k => (k ? T('diff.' + k) : '');
  const srv = text => root.UI.srvText(text);
  const pn = (name, ai) => root.UI.pname(name, ai);
  const you = () => T('you.paren');

  const S = {
    me: null,               /* { personId, name, char } */
    rooms: [],
    room: null,
    invite: null,           /* 網址帶進來的邀請 token */
    inviteInfo: null,
    table: null,
    tableRoomId: null,
    shownResultFor: null,
    chatSeq: -1,
    wasInGame: false,
    result: null,           /* 目前顯示的結算（換語言時重畫） */
    active: false
  };

  function init() {
    try { S.invite = new URLSearchParams(location.search).get('invite'); } catch (e) { S.invite = null; }

    root.Net.onStatus(renderConn);
    root.Net.on('welcome', m => {
      S.me = { personId: m.personId, name: m.name, char: m.char };
      if (S.invite && !S.inviteInfo) root.Net.send({ type: 'inviteInfo', invite: S.invite });
    });
    root.Net.on('lobby', m => { S.rooms = m.rooms || []; renderRooms(); });
    root.Net.on('room', m => onRoom(m.room));
    root.Net.on('inviteInfo', m => { S.inviteInfo = m; renderRooms(); });
    root.Net.on('error', m => toast(srv(m.text), 'bad'));
    root.Net.on('notice', m => toast(srv(m.text)));
    root.Net.on('kicked', m => { toast(srv(m.text), 'bad'); });
    root.Net.on('replaced', () => toast(T('toast.replaced'), 'bad'));

    $('#lobby-quick').onclick = () => { saveProfile(); root.Net.send({ type: 'quick' }); };
    $('#lobby-create').onclick = () => { saveProfile(); root.Net.send({ type: 'create', pace: 'normal' }); };
    $('#room-leave').onclick = () => leaveRoom();
    $('#room-list').addEventListener('click', e => {
      const b = e.target.closest('[data-join]');
      if (!b) return;
      saveProfile();
      if (b.dataset.invite) root.Net.send({ type: 'join', invite: b.dataset.invite, as: b.dataset.as });
      else root.Net.send({ type: 'join', roomId: b.dataset.join, as: b.dataset.as });
    });
    $('#screen-room').addEventListener('click', onRoomClick);
    /* 房主替電腦換難度：簡單的自製下拉選單（不用原生 <select>） */
    defineDropdown();
    $('#lobby-name').addEventListener('change', saveProfile);
  }

  function defineDropdown() {
    root.UI.dropdown.define('ai-diff', ['kid', 'easy', 'normal', 'hard'].map(k => ({ value: k, label: diffName(k), cls: 'lv-' + k })),
      (id, diff) => root.Net.send({ type: 'aiDiff', id, diff }));
  }

  /** 換語言：重畫大廳、房間、牌桌與結算的文字（不動對局狀態） */
  function relabel() {
    defineDropdown();
    root.UI.dropdown.close(false);
    renderConn(root.Net.status);
    renderRooms();
    if (S.room && root.UI.current === 'room') renderRoom(S.room);
    else if (S.room && $('#room-title')) $('#room-title').textContent = roomTitle(S.room);
    if (S.table) S.table.relabel();
    if (S.result && !$('#result').hidden) {
      const hadFocus = $('#result').contains(document.activeElement);
      paintResult();
      if (hadFocus) $('#res-room').focus({ preventScroll: true });
    }
  }

  function roomTitle(room) { return root.UI.roomName(room.name) + T('room.titleSep') + room.id; }

  function profile() {
    const st = root.App.store;
    return { name: st.nickname, char: st.char };
  }

  function saveProfile() {
    const st = root.App.store;
    const nm = $('#lobby-name').value.trim().slice(0, 10);
    st.nickname = nm || st.nickname || root.UI.randomName();
    $('#lobby-name').value = st.nickname;
    root.Store.save(st);
    root.Net.setProfile(profile());
    if (root.Net.connected) root.Net.send({ type: 'profile', name: st.nickname, char: st.char });
  }

  /* ---------- 大廳 ---------- */

  function enterLobby() {
    S.active = true;
    const st = root.App.store;
    if (!st.nickname) { st.nickname = root.UI.randomName(); root.Store.save(st); }
    $('#lobby-name').value = st.nickname;
    root.UI.setChar($('#lobby-chars'), st.char);
    show('lobby');
    renderRooms();
    root.Net.open(profile());
    renderConn(root.Net.status);
  }

  /** config.js 的設定錯誤訊息（中文）→ 目前語言 */
  function srvConfigError(d) {
    if (root.I18N.lang === 'zh-Hant') return d;
    if (/必須是 http\/https/.test(d)) return T('conn.cfgAbs');
    if (/頁面走 https/.test(d)) return T('conn.cfgMixed');
    return d;
  }

  let lastConn = [null, undefined];
  function renderConn(s, detail) {
    if (s === undefined) { s = lastConn[0]; detail = lastConn[1]; } else if (s !== lastConn[0] || detail !== undefined) lastConn = [s, detail];
    const el = $('#lobby-conn');
    if (!el) return;
    const map = {
      idle: ['', T('conn.idle')],
      connecting: ['wait', T('conn.connecting')],
      waking: ['wait', T('conn.waking') + (detail ? T('conn.wakingWaited', { n: detail }) : '')],
      open: ['ok', T('conn.open')],
      retrying: ['wait', T('conn.retrying')],
      offline: ['bad', T('conn.offline')],
      unset: ['bad', T('conn.unset') + (detail ? T('conn.unsetDetail', { d: srvConfigError(detail) }) : '')]
    };
    const m = map[s] || map.idle;
    el.className = 'conn-line ' + m[0];
    el.innerHTML = '<i class="dot"></i><span>' + esc(m[1]) + '</span>';
    const dis = s !== 'open';
    $('#lobby-quick').disabled = dis;
    $('#lobby-create').disabled = dis;

    const banner = $('#net-banner');
    if (banner) {
      const inGame = root.UI.current === 'game' && !root.Solo.active;
      banner.hidden = !(inGame && s !== 'open');
      banner.textContent = s === 'waking' ? T('conn.wakingShort') : T('conn.bannerLost');
    }
  }

  function renderRooms() {
    const ul = $('#room-list');
    if (!ul) return;
    let h = '';
    const inv = S.inviteInfo;
    if (S.invite) {
      if (!inv) h += '<li class="invite-card">' + T('invite.checking') + '</li>';
      else if (!inv.ok) h += '<li class="invite-card bad">' + esc(srv(inv.error)) + '</li>';
      else {
        const full = inv.playing || inv.seats >= inv.max;
        h += '<li class="invite-card"><div><b>' + T('invite.got') + '</b><span>' + esc(root.UI.roomName(inv.name)) + T('invite.seatsOpen') + inv.seats + '/' + inv.max + T('invite.sep') +
          (inv.playing ? T('room.playing') : T('room.waiting')) + T('invite.close') + '</span>' +
          (full ? '<small>' + T('invite.specOnly') + '</small>' : '') + '</div>' +
          '<div class="room-btns">' +
          '<button type="button" class="btn3d coral small" data-join="' + inv.id + '" data-invite="' + esc(S.invite) + '" data-as="player"' + (full ? ' disabled' : '') + '>' + T('room.join') + '</button>' +
          '<button type="button" class="btn3d sea small" data-join="' + inv.id + '" data-invite="' + esc(S.invite) + '" data-as="spectator">' + T('room.spectate') + '</button>' +
          '</div></li>';
      }
    }
    if (!S.rooms.length) {
      h += '<li class="empty">' + T('lobby.empty') + '</li>';
    } else {
      h += S.rooms.map(r => {
        const full = r.players >= r.max;
        return '<li class="room-row"><div class="room-meta"><b>' + esc(root.UI.roomName(r.name)) + '</b>' +
          '<span class="code">' + r.id + '</span>' +
          '<span class="pill ' + (r.playing ? 'playing' : 'waiting') + '">' + (r.playing ? T('room.playing') : T('room.waiting')) + '</span>' +
          '<small>' + T('room.meta', { players: r.players, max: r.max, specs: r.specs, pace: paceName(r.pace), end: endName(r.endMode) }) + '</small></div>' +
          '<div class="room-btns">' +
          '<button type="button" class="btn3d coral small" data-join="' + r.id + '" data-as="player"' + (r.playing || full ? ' disabled' : '') + '>' + (full ? T('room.full') : T('room.join')) + '</button>' +
          '<button type="button" class="btn3d sea small" data-join="' + r.id + '" data-as="spectator">' + T('room.spectate') + '</button></div></li>';
      }).join('');
    }
    ul.innerHTML = h;
  }

  /* ---------- 房間 ---------- */

  function onRoom(room) {
    const prev = S.room;
    S.room = room;
    if (!S.active) return;
    if (!room) {
      endTable();
      if (['room', 'game'].includes(root.UI.current)) {
        if (prev && root.UI.current === 'game' && $('#result').hidden === false) return;
        show('lobby');
      }
      root.UI.chat.clear();
      S.chatSeq = -1;
      renderRooms();
      return;
    }
    /* 拿到房間就把網址上的邀請清掉，免得重新整理又跳邀請 */
    if (S.invite) {
      S.invite = null; S.inviteInfo = null;
      try { const u = new URL(location.href); u.searchParams.delete('invite'); history.replaceState(null, '', u); } catch (e) { /* 忽略 */ }
    }
    if (room.chatSeq !== S.chatSeq) {
      const grew = S.chatSeq >= 0 && room.chatSeq > S.chatSeq;
      S.chatSeq = room.chatSeq;
      root.UI.chat.set(room.chat);
      if (grew) root.App.chatArrived(room.chat[room.chat.length - 1]);
    }
    root.UI.chat.canSend = true;

    if (room.game) {
      if (root.GameAnalytics && room.you.role === 'player') root.GameAnalytics.start({ mode: 'online', players: room.game.seats.length }, room.id + '|' + room.game.gameId);
      /* 新的一局開始：還停在上一局結算畫面的人也要自動回到牌桌 */
      $('#result').hidden = true;
      if (root.UI.current !== 'game') { show('game'); root.App.gameLayout(true); }
      renderGame(room);
      S.wasInGame = true;
    } else {
      if (S.wasInGame && room.lastGame && S.table) {
        /* 這局剛結束：留在牌桌上秀結算 */
        S.table.render(room.lastGame, { seatInfo: {} });
        showResult(room);
        S.wasInGame = false;
      } else if (root.UI.current === 'game' && !$('#result').hidden) {
        /* 結算畫面開著，等使用者按按鈕 */
      } else {
        endTable();
        if (root.UI.current !== 'room') show('room');
      }
      renderRoom(room);
    }
  }

  function renderRoom(room) {
    $('#room-title').textContent = roomTitle(room);
    const me = room.you;
    const iPlayer = me.role === 'player';
    const seatsFree = room.max - room.seats.length;
    $('#room-role').innerHTML =
      '<span class="pill ' + (iPlayer ? 'waiting' : 'spec') + '">' + (iPlayer ? T('room.youPlayer') : T('table.youSpec')) + '</span>' +
      (me.host ? '<span class="pill host">' + Art.icon('crown') + T('room.host') + '</span>' : '') +
      (iPlayer ? '<button type="button" class="link-btn" data-act="to-spec">' + T('room.toSpec') + '</button>'
        : (seatsFree > 0 ? '<button type="button" class="link-btn" data-act="to-player">' + T('room.toPlayer') + '</button>' : '<small>' + T('room.seatsFull') + '</small>'));

    let h = '';
    room.seats.forEach(s => {
      const isMe = s.id === me.id;
      const tags = [];
      const sn = pn(s.name, s.kind === 'ai');
      if (s.id === room.hostId) tags.push('<i class="tag host">' + T('room.host') + '</i>');
      if (s.kind === 'ai' && me.host) {
        /* 房主可以替每個電腦各自選難度 */
        tags.push(root.UI.dropdown.button('ai-diff', s.id, s.diff, T('room.diffOf', { name: esc(sn) })));
      } else if (s.kind === 'ai') tags.push('<i class="tag ai">' + T('flag.ai', { diff: diffName(s.diff) }) + '</i>');
      else if (!s.online) tags.push('<i class="tag off">' + T('flag.offline') + '</i>');
      else if (s.id === room.hostId) tags.push('<i class="tag ready">' + T('room.starter') + '</i>');
      else tags.push(s.ready ? '<i class="tag ready">' + T('room.ready') + '</i>' : '<i class="tag wait">' + T('room.notReady') + '</i>');
      let act = '';
      if (me.host && s.kind === 'ai') act = '<button type="button" class="icon-btn small" data-act="rm-ai" data-id="' + s.id + '" aria-label="' + T('room.remove', { name: esc(sn) }) + '">' + Art.icon('close') + '</button>';
      else if (me.host && !isMe) act = '<button type="button" class="icon-btn small" data-act="kick" data-id="' + s.id + '" aria-label="' + T('room.kick', { name: esc(sn) }) + '">' + Art.icon('kick') + '</button>';
      h += '<li class="seat-row' + (isMe ? ' me' : '') + '"><span class="mini">' + Art.animalSvg(s.char || 'otter') + '</span>' +
        '<b class="nm">' + esc(sn) + (isMe ? you() : '') + '</b>' + tags.join('') + act + '</li>';
    });
    for (let i = 0; i < seatsFree; i++) {
      h += '<li class="seat-row empty"><span class="mini ghost"></span><b class="nm">' + T('room.emptySeat') + '</b>' +
        (me.host ? '<button type="button" class="btn3d sand small" data-act="add-ai">' + Art.icon('robot') + T('room.addAi') + '</button>' : '') + '</li>';
    }
    $('#room-seats').innerHTML = h;
    root.UI.dropdown.refresh();

    /* 主要按鈕 */
    let a = '';
    const mySeat = room.seats.find(s => s.id === me.id);
    if (me.host && iPlayer) {
      const waiting = room.seats.filter(s => s.kind === 'human' && s.id !== me.id && !s.ready).length;
      const can = room.seats.length >= 2 && waiting === 0;
      a += '<button type="button" class="btn3d coral btn-wide" data-act="start"' + (can ? '' : ' disabled') + '>' + T('room.startGame') + '</button>' +
        '<small class="hint">' + (room.seats.length < 2 ? T('room.needTwo') : waiting ? T('room.waitOthers') : T('room.allReady')) + '</small>';
    } else if (iPlayer && mySeat) {
      a += '<button type="button" class="btn3d ' + (mySeat.ready ? 'sand' : 'coral') + ' btn-wide" data-act="ready">' + (mySeat.ready ? T('room.cancelReady') : T('room.ready')) + '</button>' +
        '<small class="hint">' + T('room.hostWillStart') + '</small>';
    } else if (me.host) {
      a += '<small class="hint">' + T('room.hostSpec') + '</small>';
    } else {
      a += '<small class="hint">' + T('room.specHint') + '</small>';
    }
    if (room.lastGame) {
      const w = room.lastGame.seats[room.lastGame.winner];
      const lz = room.lastGame.loser != null ? room.lastGame.seats[room.lastGame.loser] : null;
      a += '<p class="last-game">' + T('room.lastGame', { w: esc(w ? pn(w.name, !!w.ai) : '') }) + (lz ? T('room.lastGameLoser', { l: esc(pn(lz.name, !!lz.ai)) }) : '') + '</p>';
    }
    $('#room-actions').innerHTML = a;

    /* 房主設定 */
    const seg = (k, opts, cur) => '<div class="seg small" role="radiogroup">' + opts.map(o =>
      '<button type="button" role="radio" aria-checked="' + (String(o[0]) === String(cur)) + '" data-set="' + k + '" data-val="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    $('#room-host').innerHTML = me.host
      ? '<h4>' + T('room.settings') + '</h4>' +
        '<div class="set-line"><span>' + T('room.pace') + '</span>' + seg('pace', [['slow', paceName('slow')], ['normal', paceName('normal')], ['fast', paceName('fast')]], room.pace) + '</div>' +
        '<div class="set-line"><span>' + T('solo.endMode') + '</span>' + seg('endMode', [['first', endName('first')], ['last', T('end.lastShort')]], room.endMode) + '</div>'
      : '<p class="host-info">' + T('room.hostInfo', { pace: paceName(room.pace), end: endName(room.endMode) }) + '</p>';

    /* 邀請連結 */
    const link = room.invite.active ? inviteLink(room.invite.token) : '';
    $('#room-invite').innerHTML = '<h4>' + Art.icon('link') + T('invite.title') + '</h4>' +
      (room.invite.active
        ? '<div class="invite-row"><input readonly value="' + esc(link) + '" aria-label="' + T('invite.title') + '" id="invite-url">' +
          '<button type="button" class="btn3d sea small" data-act="copy">' + T('invite.copy') + '</button>' +
          (navigator.share ? '<button type="button" class="btn3d sea small" data-act="share">' + T('invite.share') + '</button>' : '') + '</div>' +
          '<small class="hint">' + T('invite.hint') + '</small>'
        : '<p class="hint">' + T('invite.revoked') + (me.host ? '' : T('invite.askHost')) + '</p>') +
      (me.host ? '<div class="invite-row"><button type="button" class="link-btn" data-act="regen">' + T('invite.regen') + '</button>' +
        (room.invite.active ? '<button type="button" class="link-btn danger" data-act="revoke">' + T('invite.revoke') + '</button>' : '') + '</div>' : '');

    $('#room-specs').innerHTML = '<h4>' + Art.icon('eye') + T('room.specSeats', { n: room.specs.length }) + '</h4>' +
      (room.specs.length ? '<ul class="spec-list">' + room.specs.map(s =>
        '<li><span class="mini">' + Art.animalSvg(s.char || 'otter') + '</span>' + esc(s.name) + (s.id === me.id ? you() : '') +
        (me.host && s.id !== me.id ? '<button type="button" class="icon-btn small" data-act="kick" data-id="' + s.id + '" aria-label="' + T('room.kick', { name: esc(s.name) }) + '">' + Art.icon('kick') + '</button>' : '') +
        '</li>').join('') + '</ul>' : '<p class="hint">' + T('room.noSpecs') + '</p>');
  }

  function inviteLink(tok) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('invite', tok);
    if (root.Config.source === 'query' && root.Config.serverUrl) u.searchParams.set('server', root.Config.serverUrl);
    return u.toString();
  }

  function onRoomClick(e) {
    const b = e.target.closest('[data-act],[data-set]');
    if (!b || !S.room) return;
    const act = b.dataset.act;
    if (b.dataset.set) {
      root.Net.send({ type: 'settings', [b.dataset.set]: b.dataset.val });
      return;
    }
    const mySeat = S.room.seats.find(s => s.id === S.room.you.id);
    switch (act) {
      case 'ready': root.Net.send({ type: 'ready', ready: !(mySeat && mySeat.ready) }); break;
      case 'start': root.Net.send({ type: 'start' }); break;
      case 'add-ai': root.Net.send({ type: 'addAI' }); break;
      case 'rm-ai': root.Net.send({ type: 'removeAI', id: b.dataset.id }); break;
      case 'kick': root.Net.send({ type: 'kick', personId: b.dataset.id }); break;
      case 'to-spec': root.Net.send({ type: 'switch', to: 'spectator' }); break;
      case 'to-player': root.Net.send({ type: 'switch', to: 'player' }); break;
      case 'regen': root.Net.send({ type: 'invite' }); break;
      case 'revoke': root.Net.send({ type: 'invite', revoke: true }); break;
      case 'copy': copyInvite(); break;
      case 'share': {
        const url = $('#invite-url').value;
        navigator.share({ title: T('app.name'), text: T('invite.shareText'), url }).catch(() => {});
        break;
      }
    }
  }

  function copyInvite() {
    const input = $('#invite-url');
    if (!input) return;
    const done = () => toast(T('toast.inviteCopied'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(done, () => { input.select(); document.execCommand('copy'); done(); });
    else { input.select(); document.execCommand('copy'); done(); }
  }

  function leaveRoom() {
    root.Net.send({ type: 'leave' });
    endTable();
    show('lobby');
  }

  /* ---------- 線上對局 ---------- */

  function renderGame(room) {
    if (!S.table || S.tableRoomId !== room.id) {
      endTable();
      S.table = root.Table.create($('#board'), $('#summary'), {
        myId: room.you.role === 'player' ? room.you.id : null,
        online: true,
        settings: () => root.App.store,
        onSlap: (revealId, rt) => {
          const ok = root.Net.send({ type: 'slap', revealId, rt, actionId: Math.random().toString(36).slice(2, 10) });
          if (!ok) toast(T('toast.slapLost'), 'bad');
        },
        onStart: () => root.Net.send({ type: 'deal' })
      });
      S.tableRoomId = room.id;
    }
    if (root.NetworkLatency) root.NetworkLatency.setActive(true);
    const seatInfo = {};
    room.seats.forEach(s => { if (s.kind === 'human') seatInfo[s.id] = { offline: !s.online, takeover: s.takeover || s.left }; });
    S.table.render(room.game, { seatInfo });
  }

  function showResult(room) {
    if (root.NetworkLatency) root.NetworkLatency.setActive(false);
    const v = room.lastGame;
    const myId = room.you.id;
    const mine = v.seats.findIndex(s => s.id === myId);
    let rec = null;
    if (mine >= 0) {
      if (root.GameAnalytics) root.GameAnalytics.end({ result: mine === v.winner ? 'win' : 'lose' });
      root.Store.record(root.App.store, 'online', mine === v.winner);
      if (v.stats) rec = root.Store.recordReaction(root.App.store, 'online', v.stats[mine]);
      root.Sound.sfx(mine === v.winner ? 'win' : 'lose');
    } else root.Sound.sfx('win');
    const box = $('#result');
    S.result = { v, myId, rec };
    paintResult();
    box.hidden = false;
    $('#res-room').focus({ preventScroll: true });
  }

  function paintResult() {
    if (!S.result) return;
    const box = $('#result');
    box.innerHTML = root.Table.resultHtml(S.result.v, S.result.myId, T('result.onlineStats', { flips: S.result.v.flips }), S.result.rec);
    $('#result-actions').innerHTML =
      '<button type="button" class="btn3d coral" id="res-room">' + T('result.backToRoom') + '</button>' +
      '<button type="button" class="btn3d sand" id="res-leave">' + T('room.leave') + '</button>';
    $('#res-room').onclick = () => { box.hidden = true; endTable(); if (S.room) { show('room'); renderRoom(S.room); } else show('lobby'); };
    $('#res-leave').onclick = () => { box.hidden = true; leaveRoom(); };
  }

  function endTable() {
    if (root.NetworkLatency) root.NetworkLatency.setActive(false);
    if (S.table) { S.table.destroy(); S.table = null; S.tableRoomId = null; }
  }

  function exit() {
    S.active = false;
    if (S.room) root.Net.send({ type: 'leave' });
    endTable();
    root.Net.close();
    S.room = null;
    root.UI.chat.clear();
    S.chatSeq = -1;
  }

  root.Online = {
    init, enterLobby, leaveRoom, exit, copyInvite, relabel,
    get room() { return S.room; },
    get active() { return S.active; },
    get table() { return S.table; },
    get hasInvite() { return !!S.invite; }
  };
})(typeof self !== 'undefined' ? self : this);
