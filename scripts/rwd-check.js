/* ===== scripts/rwd-check.js — 全畫面 RWD 檢查（node scripts/rwd-check.js） =====
 *
 * 需要 Playwright；沒有就略過。
 * 12 種尺寸（手機／平板／桌機 × 直橫向，含小手機與矮桌機）× 所有畫面與狀態：
 *   首頁、單機設定、說明、設定彈窗、牌桌（2／3／4 人：等待開始、翻牌中、收牌橫幅、自己出完）、
 *   暫停選單、結算、線上大廳（含房間列表與邀請）、等待室（房主／玩家）、線上牌桌（玩家／觀戰）、聊天彈層
 * 自動檢查：水平溢出、超出畫面、重要元件互相重疊、按鈕太小、字太小、按鈕文字被截斷。
 * 截圖存到 screenshots/rwd/。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let pw = null;
try { pw = require('playwright'); } catch (e) {
  try { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = null; }
}
if (!pw) { console.log('沒有安裝 Playwright，略過 RWD 檢查。'); process.exit(0); }

const { createServer } = require('../server.js');
const OUT = path.join(__dirname, '..', 'screenshots', 'rwd');
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = process.argv.includes('--shots');     /* 加 --shots 才存全部截圖（預設只存有問題的） */
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const VIEWPORTS = [
  ['小手機直', 360, 640, true], ['手機直', 390, 844, true], ['大手機直', 430, 932, true],
  ['小手機橫', 640, 360, true], ['手機橫', 844, 390, true],
  ['平板直', 768, 1024, true], ['大平板直', 1024, 1366, true],
  ['平板橫', 1024, 768, true], ['大平板橫', 1180, 820, true],
  ['筆電', 1280, 720, false], ['桌機', 1440, 900, false], ['大桌機', 1920, 1080, false]
];

/* 在頁面裡跑的檢查 */
function audit(opts) {
  const W = innerWidth, H = innerHeight;
  const out = [];
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    for (let n = el; n; n = n.parentElement) if (n.hidden) return false;
    return true;
  };
  if (document.documentElement.scrollWidth > W + 1) out.push('水平溢出 ' + document.documentElement.scrollWidth + '>' + W);
  /* 彈窗、結算卡要完整在畫面內，內容太長就要能在裡面捲 */
  for (const sel of ['.modal:not([hidden]) .modal-card', '.result:not([hidden]) .result-card']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > H + 1 || r.top < -1) out.push('彈窗超出畫面（捲不到）：' + sel);
    const body = el.querySelector('.modal-body') || el;
    const cs = getComputedStyle(body);
    if (body.scrollHeight > body.clientHeight + 2 && !/(auto|scroll)/.test(cs.overflowY)) out.push('內容太長但不能捲：' + sel);
  }

  const scope = document.querySelector('.modal:not([hidden])') || document.querySelector('.result:not([hidden])') ||
    document.querySelector('.screen:not([hidden])');
  /* 按鈕大小與文字截斷 */
  for (const b of scope.querySelectorAll('button, input, [role=radio]')) {
    if (!vis(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.right <= 0 || r.left >= W) continue;        /* 在收起的抽屜裡 */
    const min = b.classList.contains('chip') ? 38 : 40;
    if ((r.width < min || r.height < min) && b.type !== 'range' && !b.classList.contains('switch')) out.push('太小：' + label(b) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    if (b.tagName === 'BUTTON' && b.scrollWidth > b.clientWidth + 2) out.push('文字被截斷：' + label(b));
  }
  /* 字太小 */
  const small = new Set();
  for (const el of scope.querySelectorAll('span, b, small, p, li, i, label, h2, h3, h4, strong')) {
    if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11.5) small.add((el.className || el.tagName) + ' ' + fs.toFixed(1) + 'px');
  }
  if (small.size) out.push('字太小：' + [...small].slice(0, 4).join('、'));

  /* 固定版面（牌桌）：重要元件要在畫面內且不能互相重疊 */
  if (opts.game) {
    const pick = (sel, name) => [...document.querySelectorAll(sel)].filter(vis).map((el, i) => ({ el, name: name + (i ? i : ''), r: el.getBoundingClientRect() }));
    const items = [].concat(
      pick('.board .seat .avatar', '頭像'), pick('.board .seat .seat-tag', '名牌'),
      pick('.board .call', '喊數'), pick('.board .pile', '牌堆'), pick('.board .pile-info', '牌堆張數'),
      pick('.board .slap-btn', '拍牌鈕'), pick('.board .start-btn', '開始鈕'), pick('.board .spec-badge', '觀戰標示'), pick('.board .out-badge', '名次標示'),
      pick('.board .wait-text', '提示文字'), pick('.board .banner', '橫幅'),
      pick('#btn-settings', '設定鈕'), pick('#lobby-home-link', '回大廳'), pick('#btn-menu-fab', '選單鈕'), pick('#side-open', '資訊鈕'), pick('#chat-fab', '聊天鈕'),
      pick('.side:not(.drawer-closed)', '左欄')
    ).filter(x => !(x.name.startsWith('左欄') && x.r.right <= 0));
    for (const it of items) {
      const r = it.r;
      if (it.name === '提示文字' && !it.el.textContent.trim()) continue;
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push('超出畫面：' + it.name);
    }
    const allow = (a, b) => {
      const n = [a.name, b.name].sort().join('+');
      /* 這些本來就疊在一起或同一組 */
      if (/^頭像\d*\+名牌\d*$/.test(n) && a.el.closest('.seat') === b.el.closest('.seat')) return true;
      if (n.startsWith('牌堆+牌堆張數') || n === '橫幅+牌堆' || n === '牌堆+橫幅') return true;
      /* 開始鈕、提示、橫幅本來就疊在空的牌堆上 */
      if (/^(牌堆|牌堆張數|開始鈕|提示文字|橫幅)\+(牌堆|牌堆張數|開始鈕|提示文字|橫幅)$/.test(n) && !/開始鈕\+提示文字|提示文字\+開始鈕|橫幅\+開始鈕|開始鈕\+橫幅|提示文字\+橫幅|橫幅\+提示文字/.test(n)) return true;
      if (a.el.closest('.center') && b.el.closest('.center') && (a.name === '橫幅' || b.name === '橫幅') && (a.name.startsWith('牌堆') || b.name.startsWith('牌堆'))) return true;
      return false;
    };
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.name === '提示文字' && !a.el.textContent.trim()) continue;
      if (b.name === '提示文字' && !b.el.textContent.trim()) continue;
      if (allow(a, b)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 3 && iy > 3) out.push('重疊：' + a.name + '×' + b.name);
    }
    /* 牌要夠大才看得清楚 */
    const card = document.querySelector('.board .pile');
    if (card && vis(card)) {
      const cw = parseFloat(getComputedStyle(document.querySelector('.board')).getPropertyValue('--card')) || card.getBoundingClientRect().width / 1.25;
      if (cw < 70) out.push('牌太小 ' + Math.round(cw) + 'px');
    }
  } else {
    /* 捲動版面：內容不能超出寬度 */
    for (const el of scope.querySelectorAll('.panel-card, .btn3d, .modal-card, .result-card, input')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= 0) continue;                       /* 收起的抽屜 */
      if (r.left < -1 || r.right > W + 1) out.push('超出寬度：' + label(el));
    }
    for (const fixed of ['#btn-settings', '#lobby-home-link']) {
      const fe = document.querySelector(fixed);
      if (!vis(fe)) continue;
      const g = fe.getBoundingClientRect();
      for (const el of scope.querySelectorAll('.btn3d, .icon-btn, h1, h2, .hero, .home-tag, input, .panel-card > *:first-child')) {
        if (!vis(el) || el === fe || el.closest('.modal')) continue;
        const r = el.getBoundingClientRect();
        const ix = Math.min(r.right, g.right) - Math.max(r.left, g.left), iy = Math.min(r.bottom, g.bottom) - Math.max(r.top, g.top);
        if (ix > 2 && iy > 2 && !document.querySelector('.modal:not([hidden])')) out.push(fixed + ' 蓋到：' + label(el));
      }
    }
    if (document.body.dataset.screen === 'home' && !vis(document.querySelector('#lobby-home-link'))) out.push('首頁沒有回遊戲大廳');
    if (document.body.dataset.screen !== 'home' && vis(document.querySelector('#lobby-home-link'))) out.push('非首頁也出現回遊戲大廳');
  }
  return [...new Set(out)];

  function label(el) {
    return (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName) +
      (el.textContent ? '「' + el.textContent.trim().slice(0, 8) + '」' : '');
  }
}

async function freezeSolo(page) {
  await page.evaluate(() => { const g = Solo._debug; g.paused = true; });
}

async function soloGame(page, base, n, stateName) {
  await page.goto(base);
  await page.evaluate(n => {
    const s = JSON.parse(localStorage.getItem('heart-attack') || '{}');
    Object.assign(s, { aiCount: n - 1, difficulty: 'hard', endMode: 'last', bgm: false, sfx: false, nickname: '圓滾滾小水豚' });
    localStorage.setItem('heart-attack', JSON.stringify(s));
  }, n);
  await page.reload();
  await page.click('#go-solo');
  await page.click('#solo-start');
  if (stateName === 'wait') {
    await page.evaluate(() => { const g = Solo._debug; g.state.starter = g.state.seats.findIndex(s => s.id === 'me'); Solo.redraw(); });
    await freezeSolo(page);
    return;
  }
  /* 讓電腦先開始、跑幾張 */
  await page.evaluate(() => { const g = Solo._debug; g.state.starter = g.state.seats.findIndex(s => s.id !== 'me'); Solo.redraw(); });
  await page.waitForFunction(() => Solo._debug.state.flips >= 3 && Solo._debug.state.phase === 'dealing', null, { timeout: 15000 }).catch(() => {});
  if (stateName === 'deal') { await freezeSolo(page); await page.waitForTimeout(400); return; }
  if (stateName === 'banner') {
    /* 自己誤拍 → 收牌橫幅 */
    await page.waitForFunction(() => { const s = Solo._debug.state; return s.phase === 'dealing' && s.reveal && s.reveal.card.r !== s.reveal.call; }, null, { timeout: 15000 }).catch(() => {});
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await freezeSolo(page);
    await page.waitForTimeout(700);
    return;
  }
  if (stateName === 'out') {
    await page.evaluate(() => {
      const g = Solo._debug, st = g.state, me = st.seats.findIndex(s => s.id === 'me');
      const mine = st.seats[me].hand.splice(0);
      const others = st.seats.map((s, i) => i).filter(i => i !== me);
      mine.forEach((c, k) => st.seats[others[k % others.length]].hand.push(c));
      st.seats[me].out = 1; st.finished = [me];
      Solo.redraw();
    });
    await freezeSolo(page);
    return;
  }
  if (stateName === 'result') {
    await page.evaluate(() => { const st = Solo._debug.state; st.seats.forEach(s => { s.hand = [{ s: 'S', r: 9 }]; s.out = 0; }); st.pile = []; st.endMode = 'first'; st.phase = 'dealing'; st.nextAt = 0; });
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  }
}

(async () => {
  console.log('\n海島心臟病 RWD 檢查（' + VIEWPORTS.length + ' 種尺寸）');
  const app = createServer();
  app.start();
  await new Promise(r => app.server.listen(0, r));
  const port = app.server.address().port;
  const base = 'http://127.0.0.1:' + port + '/';

  /* 先開幾間房，大廳才有東西看 */
  const bots = [];
  for (const [nm, max, mode] of [['軟綿綿小兔的超級好玩牌桌', 4, 'last'], ['快手柴柴', 2, 'first'], ['陽光企鵝', 3, 'first']]) {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    await new Promise(r => { ws.onopen = r; });
    ws.send(JSON.stringify({ type: 'hello', key: 'rwd-bot-' + nm, name: nm.slice(0, 4), char: 'bunny' }));
    ws.send(JSON.stringify({ type: 'create', name: nm, max, endMode: mode }));
    bots.push(ws);
  }
  await new Promise(r => setTimeout(r, 300));

  const browser = await pw.chromium.launch();
  const report = {};
  let problems = 0;
  const note = (vp, screen, list) => {
    if (!list.length) return;
    problems += list.length;
    (report[screen] = report[screen] || []).push(vp + '：' + list.join('；'));
  };

  for (const [vpName, w, h, touch] of VIEWPORTS.filter(v => !ONLY.length || ONLY.includes(v[0]))) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 900 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const shot = async (name, list) => {
      if (SHOTS || list.length) await page.screenshot({ path: path.join(OUT, name + '-' + vpName + '.png') });
    };
    const check = async (name, game) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(450);                 /* 等彈出動畫播完再量 */
      const list = await page.evaluate(audit, { game: !!game });
      note(vpName, name, list);
      await shot(name, list);
    };

    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('heart-attack', JSON.stringify({ bgm: false, sfx: false, char: 'capybara', nickname: '圓滾滾小水豚' })));
    await page.reload();
    await check('首頁');
    await page.click('#btn-settings');
    await check('設定彈窗');
    await page.keyboard.press('Escape');
    await page.click('#go-solo');
    await check('單機設定');
    await page.goto(base);
    await page.click('#go-help');
    await check('說明');
    await page.goto(base);
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('heart-attack'));
      const h = Array.from({ length: 20 }, (_, i) => ({ d: '2026-09-' + String(10 + i).padStart(2, '0'), kind: ['kid', 'easy', 'normal', 'hard', 'online'][i % 5], avg: 420 + (i * 37) % 300, best: 300 + (i * 23) % 120, hits: 8, wrong: 1, missed: 2 }));
      const byKind = {}; for (const k of ['kid', 'easy', 'normal', 'hard', 'online']) byKind[k] = { best: 320, hits: 32, sum: 32 * 520, bestAvg: 430 };
      d.reaction = { best: 300, hits: 160, sum: 160 * 520, wrong: 20, missed: 40, games: 20, byKind, history: h };
      localStorage.setItem('heart-attack', JSON.stringify(d));
    });
    await page.reload();
    await page.click('#go-speed');
    await check('我的拍速');

    for (const n of [2, 3, 4]) {
      await soloGame(page, base, n, 'wait');
      await check('牌桌' + n + '人-等待開始', true);
      await soloGame(page, base, n, 'deal');
      await check('牌桌' + n + '人-翻牌中', true);
    }
    await soloGame(page, base, 4, 'banner');
    await check('牌桌4人-收牌橫幅', true);
    await soloGame(page, base, 3, 'out');
    await check('牌桌3人-自己出完', true);
    await page.evaluate(() => App.openMenu(false));
    await check('暫停選單');
    await page.keyboard.press('Escape');
    await soloGame(page, base, 4, 'result');
    await check('結算');

    /* 線上 */
    await page.goto(base);
    await page.click('#go-online');
    await page.waitForSelector('#lobby-conn.ok');
    await check('大廳');
    await page.click('#lobby-create');
    await page.waitForSelector('#screen-room:not([hidden])');
    await page.click('[data-act="add-ai"]'); await page.waitForTimeout(150);
    await page.click('[data-act="add-ai"]'); await page.waitForTimeout(150);
    await check('等待室-房主');
    const link = await page.inputValue('#invite-url');
    const guestCtx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
    const guest = await guestCtx.newPage();
    await guest.goto(link);
    await guest.waitForSelector('.invite-card button[data-as="player"]');
    await guest.evaluate(() => window.scrollTo(0, 0)); await guest.waitForTimeout(400);
    const inviteList = await guest.evaluate(audit, { game: false });
    note(vpName, '大廳-收到邀請', inviteList);
    if (SHOTS || inviteList.length) await guest.screenshot({ path: path.join(OUT, '大廳-收到邀請-' + vpName + '.png') });
    await guest.click('.invite-card button[data-as="player"]');
    await guest.waitForSelector('#screen-room:not([hidden])');
    await guest.evaluate(() => window.scrollTo(0, 0)); await guest.waitForTimeout(400);
    const gl = await guest.evaluate(audit, { game: false });
    note(vpName, '等待室-玩家', gl);
    if (SHOTS || gl.length) await guest.screenshot({ path: path.join(OUT, '等待室-玩家-' + vpName + '.png') });
    await guest.click('[data-act="ready"]');
    await page.waitForSelector('[data-act="start"]:not([disabled])');
    await page.click('[data-act="start"]');
    await page.waitForSelector('#screen-game:not([hidden])');
    await page.waitForTimeout(2500);
    await check('線上牌桌-房主', true);
    if (await page.isVisible('#chat-fab')) {
      await page.click('#chat-fab');
      await check('線上聊天彈層', false);
      await page.click('#chat-pop-close');
    }
    await guest.evaluate(() => Online.leaveRoom());
    await guest.goto(link);
    await guest.waitForSelector('.invite-card button[data-as="spectator"]');
    await guest.click('.invite-card button[data-as="spectator"]');
    await guest.waitForSelector('#screen-game:not([hidden])');
    await guest.waitForTimeout(800);
    await guest.evaluate(() => window.scrollTo(0, 0)); await guest.waitForTimeout(400);
    const sl = await guest.evaluate(audit, { game: true });
    note(vpName, '線上牌桌-觀戰', sl);
    if (SHOTS || sl.length) await guest.screenshot({ path: path.join(OUT, '線上牌桌-觀戰-' + vpName + '.png') });
    await guestCtx.close();
    if (errs.length) note(vpName, 'JS 錯誤', errs.slice(0, 3));
    await ctx.close();
    process.stdout.write('  · ' + vpName + ' ' + w + '×' + h + ' 完成\n');
  }

  await browser.close();
  bots.forEach(b => b.close());
  app.stop(); app.server.close();
  for (const k in report) {
    console.log('\n[' + k + ']');
    for (const line of report[k]) console.log('  ✘ ' + line);
  }
  console.log('\n' + (problems ? '✘ 發現 ' + problems + ' 個問題' : '✔ 所有尺寸、所有畫面都沒有問題') + '（截圖在 screenshots/rwd/）\n');
  process.exit(problems ? 1 : 0);
})();
