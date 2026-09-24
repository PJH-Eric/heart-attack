/* ===== table.js — 牌桌畫面（單機與線上共用） =====
 *
 * 只吃 Rules.publicView() 產生的公開狀態，所以單機與線上長得一模一樣，
 * 也保證畫面上不會出現玩家不該知道的資訊（沒翻的牌、seed）。
 *
 * 拍牌鈕不管這張「該不該拍」都長得一樣 —— 判斷是玩家自己的事。
 */
(function (root) {
  'use strict';

  const { $, $$, esc } = root.UI;
  const Art = root.Art;
  const SEAT_COLORS = ['#FF6F61', '#3FA9F5', '#6DBE45', '#A57CF0'];
  const DIFF_NAME = { kid: '幼幼班', easy: '簡單', normal: '普通', hard: '困難' };

  function positions(n) {
    if (n === 2) return ['top'];
    if (n === 3) return ['left', 'right'];
    return ['left', 'top', 'right'];
  }

  function rankText(r) { return Art.RANKS[r - 1]; }
  /** 喊數一律用數字 1～13（牌面上仍是 A、J、Q、K） */
  function callText(n) { return String(n); }
  function cardText(c) { return Art.SUIT_ZH[c.s] + rankText(c.r); }

  /**
   * @param {HTMLElement} board
   * @param {HTMLElement} summary
   * @param {{ myId:string|null, onSlap:(revealId:number)=>void, onStart:()=>void, settings:()=>object, online?:boolean }} opt
   */
  function create(board, summary, opt) {
    let view = null;
    let lastSeq = -1;
    let order = [];           /* 畫面上的座位順序（seat index） */
    let mySeat = -1;
    let pileCards = [];       /* 本段翻出來、還在牌堆上的牌（只留最後 4 張畫出來） */
    let slappedReveal = 0;    /* 我已經拍過的那張牌 */
    let log = [];
    let waitBase = null;      /* { left, at } 自動發牌倒數 */
    let seatInfo = {};        /* 線上：{ [id]: { offline, takeover } } */
    let flyToken = 0;

    const S = () => opt.settings() || {};

    function build(v) {
      const n = v.seats.length;
      mySeat = v.seats.findIndex(s => s.id === opt.myId);
      const base = mySeat >= 0 ? mySeat : 0;
      order = [];
      for (let k = 1; k < n; k++) order.push((base + k) % n);
      const pos = positions(n);

      board.className = 'board n' + n + (mySeat < 0 ? ' spectating' : '');
      board.innerHTML =
        '<div class="opps">' + order.map((si, k) => seatHtml(v, si, 'pos-' + pos[k])).join('') + '</div>' +
        '<div class="center">' +
          '<div class="call" aria-live="off"><span class="call-label">喊</span><b class="call-num">A</b></div>' +
          '<div class="pile-wrap">' +
            '<div class="pile" aria-label="牌堆">' +
              '<div class="pile-under"></div><div class="pile-cards"></div><div class="slap-marks"></div>' +
            '</div>' +
            '<div class="pile-info"><span class="stack">' + Art.stackIcon() + '</span>牌堆 <b class="pile-n">0</b> 張</div>' +
          '</div>' +
          '<div class="banner" hidden></div>' +
        '</div>' +
        '<div class="me-area">' +
          seatHtml(v, base, 'me') +
          '<div class="me-actions">' +
            '<button type="button" class="btn3d coral start-btn" hidden>開始</button>' +
            '<div class="wait-text" aria-live="polite"></div>' +
          '</div>' +
          (mySeat >= 0
            ? '<button type="button" class="slap-btn" aria-label="拍牌（空白鍵）" aria-keyshortcuts="Space">' +
              Art.handIcon() + '<span>拍牌</span></button>'
            : '<div class="spec-badge">' + Art.icon('eye') + '<span>你是觀戰者</span></div>') +
        '</div>';

      const slapBtn = $('.slap-btn', board);
      if (slapBtn) {
        slapBtn.addEventListener('pointerdown', e => { e.preventDefault(); trySlap(); });
        slapBtn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); trySlap(); } });
      }
      const pile = $('.pile', board);
      pile.addEventListener('pointerdown', e => { if (mySeat >= 0) { e.preventDefault(); trySlap(); } });
      $('.start-btn', board).addEventListener('click', () => opt.onStart());
    }

    function seatHtml(v, si, cls) {
      const s = v.seats[si];
      const me = si === mySeat;
      return '<div class="seat ' + cls + '" data-seat="' + si + '" style="--seat:' + SEAT_COLORS[si % 4] + '">' +
        '<div class="avatar">' + Art.animalSvg(s.char || 'otter') + '</div>' +
        '<div class="seat-tag"><b class="name">' + esc(me ? s.name + '（你）' : s.name) + '</b>' +
        '<span class="count">' + Art.stackIcon() + '<b>' + s.count + '</b></span></div>' +
        '<span class="seat-flag"></span>' +
        '<div class="bubble" hidden></div>' +
        '</div>';
    }

    function seatEl(si) { return $('.seat[data-seat="' + si + '"]', board); }

    function name(si) {
      if (!view || !view.seats[si]) return '';
      return si === mySeat ? '你' : view.seats[si].name;
    }

    /* ---------- 拍牌 ---------- */

    function trySlap() {
      if (!view || mySeat < 0) return;
      if (view.phase !== 'dealing' || !view.reveal) return;           /* 還沒翻牌：不算也不罰 */
      if (slappedReveal === view.reveal.id) return;
      slappedReveal = view.reveal.id;
      const btn = $('.slap-btn', board);
      if (btn) { btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed'); }
      root.UI.vibrate(35);
      opt.onSlap(view.reveal.id);
    }

    /* ---------- 繪製 ---------- */

    function render(v, extra) {
      extra = extra || {};
      seatInfo = extra.seatInfo || {};
      const fresh = !view || view.seats.length !== v.seats.length || lastSeq < 0 ||
        v.seats.some((s, i) => !view.seats[i] || view.seats[i].id !== s.id);
      if (fresh) {
        view = v;
        build(v);
        pileCards = v.reveal && v.pileCount > 0 ? [Object.assign({ rot: 0 }, v.reveal.card)] : [];
        log = [];
        lastSeq = v.eventSeq;      /* 剛進來的舊事件不補播動畫 */
        drawPile(false);
      }
      const prev = view;
      view = v;

      if (v.waitLeft != null) waitBase = { left: v.waitLeft, at: performance.now() };
      else waitBase = null;

      /* 新事件 → 動畫與音效 */
      const events = (v.events || []).filter(e => e.seq > lastSeq);
      lastSeq = Math.max(lastSeq, v.eventSeq);
      for (const e of events) play(e, v, prev);

      if (v.pileCount === 0 && pileCards.length && !events.some(e => e.type === 'collect')) {
        pileCards = [];
        drawPile(false);
      }
      updateStatic(v);
    }

    function play(e, v) {
      const motion = !S().reduceMotion;
      if (e.type === 'flip') {
        pileCards.push({ s: e.card.s, r: e.card.r, rot: Math.round((Math.random() * 2 - 1) * 9), from: e.seat });
        if (pileCards.length > 4) pileCards.shift();
        drawPile(motion);
        clearMarks();
        root.Sound.sfx('flip');
        root.Sound.call(e.call);
        addLog(name(e.seat) + ' 翻出 ' + cardText(e.card) + '（喊 ' + callText(e.call) + '）');
        pulse('.call-num');
      } else if (e.type === 'slap') {
        mark(e.seat, e.order, e.wrong);
        root.Sound.sfx('slap');
        if (e.wrong) root.Sound.sfx('wrong');
        bubble(e.seat, e.wrong ? '拍錯了！' : '拍！' + e.order, e.wrong ? 'bad' : '');
        if (e.seat === mySeat && !e.wrong) root.UI.vibrate(20);
      } else if (e.type === 'collect') {
        const who = name(e.seat);
        const txt = e.reason === 'wrong' ? who + ' 拍錯了，收走 ' + e.count + ' 張'
          : e.reason === 'miss' ? who + ' 沒拍到，收走 ' + e.count + ' 張'
          : who + ' 最後拍，收走 ' + e.count + ' 張';
        banner(txt, e.seat === mySeat ? 'bad' : '');
        addLog(txt);
        flyToSeat(e.seat, motion);
        root.Sound.sfx('collect');
        bubble(e.seat, '收牌', 'bad');
        if (e.seat === mySeat) root.UI.vibrate([60, 40, 60]);
        const el = seatEl(e.seat);
        if (el && motion) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
      } else if (e.type === 'start') {
        hideBanner();
        clearMarks();
        root.Sound.sfx('start');
        addLog((e.auto ? '時間到，系統幫 ' + name(e.seat) + ' ' : name(e.seat) + ' ') + (e.segment === 1 ? '按下開始' : '按下自動發牌') + '，從 1 喊起');
      } else if (e.type === 'win') {
        addLog(name(e.seat) + ' 把牌出完了！');
      }
    }

    function updateStatic(v) {
      const n = v.seats.length;
      for (let i = 0; i < n; i++) {
        const el = seatEl(i);
        if (!el) continue;
        const s = v.seats[i];
        $('.count b', el).textContent = s.count;
        const info = seatInfo[s.id] || {};
        const flag = info.offline ? '離線' : info.takeover ? '電腦代打' : s.ai ? '電腦・' + (DIFF_NAME[s.ai] || '') : '';
        const f = $('.seat-flag', el);
        f.textContent = flag;
        f.hidden = !flag;
        el.classList.toggle('offline', !!info.offline);
        el.classList.toggle('is-turn', v.phase === 'dealing' && nextFlipper(v) === i);
        el.classList.toggle('is-starter', v.phase === 'waitStart' && v.starter === i);
        el.classList.toggle('is-empty', s.count === 0);
        el.classList.toggle('winner', v.phase === 'over' && v.winner === i);
      }

      /* 喊數泡泡：顯示「這張牌」喊的數字；還沒翻就顯示下一張要喊的 */
      const call = $('.call', board);
      call.classList.toggle('big', !!S().bigCall);
      const num = $('.call-num', board);
      if (v.reveal && v.phase === 'dealing') {
        num.textContent = callText(v.reveal.call);
        call.classList.remove('idle');
      } else if (v.phase === 'result' && v.reveal) {
        num.textContent = callText(v.reveal.call);
      } else {
        num.textContent = '1';
        call.classList.add('idle');
      }
      $('.call-label', board).textContent = v.phase === 'waitStart' || !v.reveal ? '準備喊' : '喊';

      $('.pile-n', board).textContent = v.pileCount;
      drawUnder(v.pileCount);

      /* 啟動鈕：只有本段啟動者看得到 */
      const startBtn = $('.start-btn', board);
      const iStart = v.phase === 'waitStart' && v.starter === mySeat && mySeat >= 0;
      startBtn.hidden = !iStart;
      startBtn.textContent = v.segment === 0 ? '開始' : '自動發牌';
      const wait = $('.wait-text', board);
      if (v.phase === 'waitStart' && !iStart) {
        wait.textContent = '等 ' + name(v.starter) + ' 按' + (v.segment === 0 ? '開始' : '自動發牌') + '…';
      } else if (iStart) {
        wait.textContent = v.segment === 0 ? '你是第一順位，按開始！' : '你收了牌，換你按自動發牌';
      } else wait.textContent = '';
      tickCountdown();

      const slapBtn = $('.slap-btn', board);
      if (slapBtn) {
        slapBtn.classList.toggle('idle', !(v.phase === 'dealing' && v.reveal));
        slapBtn.classList.toggle('done', !!(v.reveal && slappedReveal === v.reveal.id && v.phase === 'dealing'));
      }

      renderSummary(v);
    }

    function nextFlipper(v) {
      const n = v.seats.length;
      for (let k = 0; k < n; k++) {
        const i = (v.turn + k) % n;
        if (v.seats[i].count > 0) return i;
      }
      return -1;
    }

    /** 自動發牌倒數（線上才有） */
    function tickCountdown() {
      if (!view || !waitBase || view.phase !== 'waitStart') return;
      const left = Math.max(0, waitBase.left - (performance.now() - waitBase.at));
      const wait = $('.wait-text', board);
      if (!wait) return;
      const sec = Math.ceil(left / 1000);
      if (sec <= 5) {
        const base = wait.textContent.replace(/（\d+ 秒後自動發牌）$/, '');
        wait.textContent = base + '（' + sec + ' 秒後自動發牌）';
      }
    }

    function drawUnder(count) {
      const under = $('.pile-under', board);
      const shown = Math.max(0, Math.min(3, count - pileCards.length));
      if (under.childElementCount === shown) return;
      let h = '';
      for (let i = 0; i < shown; i++) h += '<div class="pc under" style="--r:' + (i * 7 - 7) + 'deg">' + Art.cardBackSvg() + '</div>';
      under.innerHTML = h;
    }

    function drawPile(animateLast) {
      const box = $('.pile-cards', board);
      if (!box) return;
      const four = !!S().fourColor;
      box.innerHTML = pileCards.map((c, i) => {
        const last = i === pileCards.length - 1;
        return '<div class="pc' + (last ? ' top' : '') + (last && animateLast ? ' deal from-' + fromDir(c.from) : '') +
          '" style="--r:' + c.rot + 'deg">' + Art.cardSvg(c, { fourColor: four }) + '</div>';
      }).join('');
    }

    function fromDir(si) {
      if (si == null) return 'top';
      if (si === mySeat || (mySeat < 0 && si === 0)) return 'bottom';
      const k = order.indexOf(si);
      const pos = positions(view.seats.length)[k];
      return pos || 'top';
    }

    function flyToSeat(si, motion) {
      const box = $('.pile-cards', board);
      const target = seatEl(si);
      if (!box || !target || !motion) { pileCards = []; drawPile(false); return; }
      const a = box.getBoundingClientRect(), b = target.getBoundingClientRect();
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      const nodes = $$('.pc', $('.pile', board));
      nodes.forEach((n, i) => {
        n.style.transition = 'transform .55s cubic-bezier(.5,-0.2,.6,1) ' + (i * 0.03) + 's, opacity .55s ' + (i * 0.03) + 's';
        n.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.3) rotate(40deg)';
        n.style.opacity = '0.2';
      });
      const token = ++flyToken;
      pileCards = [];
      setTimeout(() => {
        if (token === flyToken && pileCards.length === 0) drawPile(false);
      }, 700);
    }

    function mark(si, orderNo, wrong) {
      const box = $('.slap-marks', board);
      if (!box) return;
      const m = document.createElement('div');
      m.className = 'slap-mark' + (wrong ? ' wrong' : '');
      m.style.setProperty('--seat', SEAT_COLORS[si % 4]);
      const ang = [-24, 18, -8, 28][(orderNo - 1) % 4];
      const off = [[-18, -10], [16, -4], [-6, 14], [20, 16]][(orderNo - 1) % 4];
      m.style.setProperty('--r', ang + 'deg');
      m.style.left = 'calc(50% + ' + off[0] + '%)';
      m.style.top = 'calc(50% + ' + off[1] + '%)';
      m.innerHTML = Art.handIcon() + '<b>' + orderNo + '</b>';
      box.appendChild(m);
    }
    function clearMarks() { const b = $('.slap-marks', board); if (b) b.innerHTML = ''; $$('.bubble', board).forEach(x => { x.hidden = true; }); }

    function bubble(si, text, kind) {
      const el = seatEl(si);
      if (!el) return;
      const b = $('.bubble', el);
      b.textContent = text;
      b.className = 'bubble ' + (kind || '');
      b.hidden = false;
    }

    function banner(text, kind) {
      const b = $('.banner', board);
      b.textContent = text;
      b.className = 'banner ' + (kind || '');
      b.hidden = false;
    }
    function hideBanner() { const b = $('.banner', board); if (b) b.hidden = true; }

    function pulse(sel) {
      const el = $(sel, board);
      if (!el || S().reduceMotion) return;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }

    function addLog(text) {
      log.push(text);
      if (log.length > 30) log.shift();
    }

    /* ---------- 左側操作摘要 ---------- */

    function renderSummary(v) {
      if (!summary) return;
      let status;
      if (v.phase === 'over') status = name(v.winner) + ' 獲勝！';
      else if (v.phase === 'waitStart') status = v.starter === mySeat ? '換你按' + (v.segment === 0 ? '開始' : '自動發牌') : '等 ' + name(v.starter) + ' 啟動';
      else if (v.phase === 'result') status = '收牌中…';
      else status = '翻牌中，數字一樣就拍！';

      const n = v.seats.length;
      const nf = nextFlipper(v);
      const rows = [];
      for (let k = 0; k < n; k++) {
        const i = k;
        const s = v.seats[i];
        const tags = [];
        if (v.phase === 'dealing' && nf === i) tags.push('<i class="tag turn">下一張</i>');
        if (v.phase === 'waitStart' && v.starter === i) tags.push('<i class="tag start">啟動者</i>');
        rows.push('<li class="' + (i === mySeat ? 'me' : '') + '" style="--seat:' + SEAT_COLORS[i % 4] + '">' +
          '<span class="mini">' + Art.animalSvg(s.char || 'otter') + '</span>' +
          '<span class="nm">' + esc(i === mySeat ? s.name + '（你）' : s.name) + '</span>' + tags.join('') +
          '<b class="ct">' + s.count + '</b></li>');
      }
      const role = opt.online ? (mySeat >= 0 ? '' : '<p class="role">你是觀戰者，只能看、可以聊天</p>') : '';
      summary.innerHTML =
        '<div class="sum-status">' + esc(status) + '</div>' + role +
        '<div class="sum-grid">' +
          '<div><small>下一張喊</small><b>' + (v.phase === 'dealing' ? callText(v.nextCall) : '1') + '</b></div>' +
          '<div><small>牌堆</small><b>' + v.pileCount + '<i>張</i></b></div>' +
          '<div><small>已翻</small><b>' + v.flips + '<i>張</i></b></div>' +
        '</div>' +
        '<h4>翻牌順序</h4><ol class="sum-seats">' + rows.join('') + '</ol>' +
        '<h4>最近發生</h4><ol class="sum-log">' +
          (log.length ? log.slice(-6).reverse().map(t => '<li>' + esc(t) + '</li>').join('') : '<li class="dim">還沒開始</li>') +
        '</ol>' +
        '<p class="sum-keys">空白鍵＝拍牌　Enter＝開始／自動發牌</p>';
    }

    function destroy() { board.innerHTML = ''; if (summary) summary.innerHTML = ''; view = null; lastSeq = -1; }

    return {
      render, trySlap, destroy, tickCountdown,
      get mySeat() { return mySeat; },
      get view() { return view; },
      redrawCards() { drawPile(false); }
    };
  }

  /** 結算畫面（勝利者大頭貼＋名次＋這局統計） */
  function resultHtml(v, myId, stats) {
    const winner = v.seats[v.winner];
    const me = v.seats.findIndex(s => s.id === myId);
    const rank = v.seats.map((s, i) => ({ s, i })).sort((a, b) => a.s.count - b.s.count);
    const title = me < 0 ? winner.name + ' 獲勝！' : me === v.winner ? '你贏了！' : winner.name + ' 先出完了';
    return '<div class="result-card">' +
      '<div class="result-hero">' + Art.animalSvg(winner.char || 'otter', { cls: 'bounce' }) + '</div>' +
      '<h2 id="result-title">' + esc(title) + '</h2>' +
      '<ol class="rank-list">' + rank.map((r, k) =>
        '<li class="' + (r.i === me ? 'me' : '') + '"><span class="no">' + (k + 1) + '</span>' +
        '<span class="mini">' + Art.animalSvg(r.s.char || 'otter') + '</span>' +
        '<span class="nm">' + esc(r.s.name) + (r.i === me ? '（你）' : '') + '</span>' +
        '<b>剩 ' + r.s.count + ' 張</b></li>').join('') + '</ol>' +
      (stats ? '<p class="result-stats">' + esc(stats) + '</p>' : '') +
      '<div class="result-actions" id="result-actions"></div></div>';
  }

  root.Table = { create, resultHtml, SEAT_COLORS, DIFF_NAME };
})(typeof self !== 'undefined' ? self : this);
