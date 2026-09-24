/* ===== solo.js — 單機對電腦 =====
 * 規則全交給 Rules，電腦全交給 AI.createDriver；這裡只負責「可暫停的遊戲時鐘」與畫面串接。
 */
(function (root) {
  'use strict';

  const { $ } = root.UI;
  let game = null;

  function start(cfg) {
    stop();
    const Art = root.Art;
    const others = Art.ANIMALS.filter(a => a.id !== cfg.char);
    /* 電腦的角色隨機挑，不跟玩家撞 */
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const players = [{ id: 'me', name: cfg.name, char: cfg.char }];
    for (let i = 0; i < cfg.aiCount; i++) {
      players.push({ id: 'ai' + i, name: others[i].name, char: others[i].id, ai: cfg.difficulty });
    }
    const seed = root.RNG.newSeed();
    const pace = root.Rules.DIFFICULTIES[cfg.difficulty].pace;
    const state = root.Rules.create(players, { seed: seed, pace: pace, autoStartMs: null, now: 0, endMode: cfg.endMode });
    const driver = root.AI.createDriver(seed + '-ai');

    game = {
      cfg, state, driver,
      clock: 0, last: performance.now(), paused: false, raf: 0, timer: 0, ended: false,
      table: root.Table.create($('#board'), $('#summary'), {
        myId: 'me',
        settings: () => root.App.store,
        onSlap: revealId => { if (game && !game.paused) { root.Rules.slap(game.state, 'me', game.clock, revealId); draw(); } },
        onStart: () => pressStart()
      })
    };
    root.UI.chat.enabled = false;
    draw();
    loop();
    /* 背景分頁 rAF 會停，另外補一個慢速計時器，讓回來時時間照算（但會自動暫停） */
    game.timer = setInterval(() => { if (game && !game.paused && document.hidden) pause(true); }, 500);
  }

  function loop() {
    if (!game) return;
    const now = performance.now();
    const dt = Math.min(100, now - game.last);   /* 卡頓時不要一口氣快轉 */
    game.last = now;
    if (!game.paused && !game.ended) {
      game.clock += dt;
      step();
    }
    game.table.tickCountdown();
    game.raf = requestAnimationFrame(loop);
  }

  function step() {
    const g = game, R = root.Rules;
    let changed = R.tick(g.state, g.clock);
    for (const a of g.driver.actions(g.state, g.clock)) {
      const r = a.type === 'start' ? R.start(g.state, a.id, g.clock) : R.slap(g.state, a.id, g.clock, a.revealId);
      if (r.ok) changed = true;
    }
    if (changed) R.tick(g.state, g.clock);
    if (changed || g.state.version !== g.drawn) draw();
  }

  function draw() {
    if (!game) return;
    const v = root.Rules.publicView(game.state, game.clock);
    game.drawn = game.state.version;
    game.table.render(v);
    if (v.phase === 'over' && !game.ended) {
      game.ended = true;
      setTimeout(() => showResult(v), 900);
    }
  }

  function pressStart() {
    if (!game || game.paused) return;
    const r = root.Rules.start(game.state, 'me', game.clock);
    if (r.ok) draw();
  }

  function slap() { if (game) game.table.trySlap(); }

  function showResult(v) {
    if (!game) return;
    const win = v.winner === game.table.mySeat;
    root.Store.record(root.App.store, game.cfg.difficulty, win);
    root.Sound.sfx(win ? 'win' : 'lose');
    const st = root.App.store.stats[game.cfg.difficulty] || { play: 0, win: 0 };
    const diffName = root.Rules.DIFFICULTIES[game.cfg.difficulty].name;
    const box = $('#result');
    box.innerHTML = root.Table.resultHtml(v, 'me',
      '這局一共翻了 ' + v.flips + ' 張牌｜' + diffName + '：玩了 ' + st.play + ' 局、贏 ' + st.win + ' 局');
    $('#result-actions').innerHTML =
      '<button type="button" class="btn3d coral" id="res-again">再來一局</button>' +
      '<button type="button" class="btn3d sand" id="res-home">回首頁</button>';
    box.hidden = false;
    $('#res-again').onclick = () => { box.hidden = true; start(game.cfg); };
    $('#res-home').onclick = () => { box.hidden = true; stop(); root.UI.show('home'); };
    $('#res-again').focus();
  }

  /** silent：只停時鐘不開選單（例如打開設定彈窗時） */
  function pause(auto, silent, from) {
    if (!game || game.ended || game.paused) return;
    game.paused = true;
    if (!silent) root.App.openMenu(auto, from);
  }
  function resume() {
    if (!game) return;
    game.paused = false;
    game.last = performance.now();
  }

  function stop() {
    if (!game) return;
    cancelAnimationFrame(game.raf);
    clearInterval(game.timer);
    game.table.destroy();
    game = null;
  }

  root.Solo = {
    start, stop, pause, resume, slap, pressStart,
    get active() { return !!game; },
    get paused() { return !!(game && game.paused); },
    restart() { if (game) { const c = game.cfg; start(c); } },
    redraw() { if (game) { game.table.redrawCards(); draw(); } },
    /* 給自動化版面測試用：直接拿到規則狀態 */
    get _debug() { return game; }
  };
})(typeof self !== 'undefined' ? self : this);
