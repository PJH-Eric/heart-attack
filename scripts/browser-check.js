/* ===== scripts/browser-check.js — 無頭瀏覽器版面與流程檢查（node scripts/browser-check.js） =====
 *
 * 需要 Playwright（npm i -g playwright 或專案內安裝）；沒有就跳過，不算失敗。
 * 檢查：各尺寸（手機／平板／桌機 × 直橫向）有沒有水平溢出、主要按鈕是否在畫面內且夠大、
 * 設定彈窗（右上角 → Modal → Esc 關閉回到原焦點）、單機完整一局到結算、
 * 線上：建房 → 邀請連結加入 → 觀戰 → 開局 → 聊天。截圖存到 screenshots/。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let pw = null;
try { pw = require('playwright'); } catch (e) {
  try { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = null; }
}
if (!pw) { console.log('沒有安裝 Playwright，略過瀏覽器檢查。'); process.exit(0); }

const { createServer } = require('../server.js');
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
function ok(v, name) { if (v) { pass++; console.log('  ✔ ' + name); } else { fail++; console.log('  ✘ ' + name); } }

const SIZES = [
  ['手機直向', 390, 844, true], ['手機橫向', 844, 390, true],
  ['平板直向', 820, 1180, true], ['平板橫向', 1180, 820, true],
  ['桌機', 1440, 900, false]
];

async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const W = innerWidth, H = innerHeight;
    if (document.documentElement.scrollWidth > W + 1) out.push('水平溢出 ' + document.documentElement.scrollWidth + '>' + W);
    for (const sel of ['#btn-settings', '.slap-btn', '.start-btn:not([hidden])', '#btn-menu-fab', '#side-open', '#chat-fab']) {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push(sel + ' 太小 ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(sel + ' 超出畫面');
    }
    /* 拍牌鈕與設定鈕不能疊在一起 */
    const a = document.querySelector('#btn-settings'), seats = [...document.querySelectorAll('.seat')];
    if (a) {
      const r = a.getBoundingClientRect();
      for (const s of seats) {
        const q = s.querySelector('.avatar').getBoundingClientRect();
        if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) out.push('設定鈕蓋到座位');
      }
    }
    return out;
  });
}

async function solo(browser, base) {
  console.log('\n[單機：各尺寸版面]');
  for (const [name, w, h, touch] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(base);
    await page.screenshot({ path: path.join(OUT, name + '-首頁.png') });
    let probs = await layoutProblems(page);
    await page.click('#go-solo');
    probs = probs.concat(await layoutProblems(page));
    await page.click('#solo-start');
    await page.waitForTimeout(300);
    probs = probs.concat(await layoutProblems(page));
    await page.screenshot({ path: path.join(OUT, name + '-等待開始.png') });
    const sb = await page.$('.start-btn:not([hidden])');     /* 第一順位可能是電腦，電腦會自己按 */
    if (sb) await sb.click({ force: true });
    await page.waitForTimeout(3000);
    probs = probs.concat(await layoutProblems(page));
    await page.screenshot({ path: path.join(OUT, name + '-對局.png') });
    ok(!probs.length && !errs.length, name + '：版面正常' + (probs.length ? '（' + [...new Set(probs)].join('；') + '）' : '') + (errs.length ? ' JS 錯誤：' + errs.join('；') : ''));
    await page.close();
  }

  console.log('\n[單機：設定彈窗與完整一局]');
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  await page.goto(base);
  await page.click('#btn-settings');
  ok(await page.isVisible('#settings-modal'), '右上角設定 → 開啟 Modal');
  ok(await page.evaluate(() => document.activeElement && !!document.activeElement.closest('#settings-modal')), '焦點移進設定彈窗');
  await page.click('[data-key="bgm"]');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('heart-attack')).bgm === false), '關掉背景音樂立刻存起來');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('#settings-modal')), 'Esc 關閉設定');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-settings'), '關閉後焦點回到設定鈕');
  await page.reload();
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('heart-attack')).bgm === false), '重新整理後設定仍保留');

  /* 喊數語音：內建錄音要解得開，翻牌時真的有念 */
  await page.click('#btn-settings');
  await page.click('[data-voice="clip"]');
  await page.waitForFunction(() => Sound.clipsReady === 13, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => Sound.clipsReady === 13), '13 段內建喊數錄音（A～K）都能解碼');
  await page.click('#voice-test');
  await page.waitForTimeout(2000);
  ok(await page.evaluate(() => Sound.clipPlays >= 3), '「試聽」念出 A、二、三');
  await page.keyboard.press('Escape');
  await page.click('#go-solo');
  await page.click('#solo-start');
  const before = await page.evaluate(() => Sound.clipPlays);
  const sb0 = await page.$('.start-btn:not([hidden])');
  if (sb0) await sb0.click({ force: true });
  await page.waitForTimeout(3500);
  const flips = await page.evaluate(() => Solo._debug.state.flips);
  const plays = await page.evaluate(() => Sound.clipPlays) - before;
  ok(flips > 0 && plays >= flips - 1, '每翻一張牌就喊一次數字（翻 ' + flips + ' 張、喊 ' + plays + ' 次）');
  await page.evaluate(() => Solo.stop());
  await page.goto(base);

  await page.click('#go-help');
  ok((await page.textContent('#help-body')).includes('最慢的人收牌'), '說明頁有完整的文字教學');
  await page.click('#help-go');
  await page.click('#solo-diff [data-diff="kid"]');
  await page.click('#solo-start');
  /* 把牌調成每人 1 張，快速打到結算 */
  await page.evaluate(() => {
    const g = Solo._debug;
    g.state.seats.forEach((s, i) => { s.hand = [{ s: 'S', r: 9 + (i % 3) }]; });
    g.state.pile = [];
  });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  ok(await page.isVisible('#result'), '單機一局可以從開始打到結算');
  await page.screenshot({ path: path.join(OUT, '平板橫向-結算.png') });
  await page.click('#res-again');
  ok(await page.isHidden('#result') && await page.evaluate(() => Solo._debug.state.seats.reduce((a, s) => a + s.hand.length, 0) === 52), '「再來一局」重新發 52 張');
  await page.keyboard.press('Escape');
  ok(await page.isVisible('#menu-modal'), 'Esc 打開暫停選單');
  await page.screenshot({ path: path.join(OUT, '平板橫向-暫停.png') });
  await page.click('#m-home');
  ok(await page.isVisible('#screen-home'), '暫停選單可以回首頁');
  await page.close();
}

async function online(browser, base) {
  console.log('\n[線上：建房、邀請、觀戰、開局、聊天]');
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const ctxC = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
  const errs = [];
  for (const p of [A, B, C]) p.on('pageerror', e => errs.push(e.message));

  await A.goto(base);
  await A.click('#go-online');
  await A.waitForSelector('#lobby-conn.ok');
  ok(true, '大廳連上伺服器');
  await A.fill('#lobby-name', '房主阿明');
  await A.click('#lobby-create');
  await A.waitForSelector('#screen-room:not([hidden])');
  ok(true, '建立房間進入等待室');
  await A.click('[data-act="add-ai"]');
  await A.waitForFunction(() => document.querySelectorAll('.seat-row .tag.ai').length === 1);
  ok(true, '房主可以加電腦');
  const link = await A.inputValue('#invite-url');
  ok(/invite=/.test(link), '有邀請連結可以複製');
  await A.screenshot({ path: path.join(OUT, '線上-桌機-等待室.png') });

  await B.goto(link);
  await B.waitForSelector('.invite-card button[data-as="player"]');
  await B.screenshot({ path: path.join(OUT, '線上-手機-收到邀請.png') });
  await B.click('.invite-card button[data-as="player"]');
  await B.waitForSelector('#screen-room:not([hidden])');
  ok(!(await B.evaluate(() => location.search.includes('invite'))), '加入後網址上的邀請參數被清掉');
  await B.screenshot({ path: path.join(OUT, '線上-手機-等待室.png'), fullPage: true });

  await C.goto(link);
  await C.waitForSelector('.invite-card button[data-as="spectator"]');
  await C.click('.invite-card button[data-as="spectator"]');
  await C.waitForSelector('#screen-room:not([hidden])');
  ok((await C.textContent('#room-role')).includes('觀戰'), '用同一個連結選觀戰 → 觀戰者');

  await B.click('[data-act="ready"]');
  await A.waitForSelector('[data-act="start"]:not([disabled])');
  await A.click('[data-act="start"]');
  await A.waitForSelector('#screen-game:not([hidden])');
  await B.waitForSelector('#screen-game:not([hidden])');
  await C.waitForSelector('#screen-game:not([hidden])');
  ok(true, '開局後三個人都進到牌桌');
  ok(await C.isVisible('.spec-badge') && !(await C.isVisible('.slap-btn')), '觀戰者沒有拍牌鈕，顯示「你是觀戰者」');
  ok(await A.isVisible('.side-chat'), '桌機：聊天室在左欄');
  ok(await B.isVisible('#chat-fab'), '手機：左下角聊天入口');

  /* 啟動者按開始（可能是任何人或電腦） */
  for (const p of [A, B]) { const s = await p.$('.start-btn:not([hidden])'); if (s) await s.click({ force: true }); }
  await A.waitForTimeout(2500);
  await A.fill('.side-chat .chat-form input', '大家好！');
  await A.press('.side-chat .chat-form input', 'Enter');
  await B.waitForFunction(() => document.querySelector('#chat-unread') && !document.querySelector('#chat-unread').hidden, null, { timeout: 5000 });
  ok(true, '手機收到訊息時聊天入口顯示未讀數');
  await B.click('#chat-fab');
  ok((await B.textContent('#chat-pop')).includes('大家好！'), '手機打開聊天室看得到訊息');
  await B.screenshot({ path: path.join(OUT, '線上-手機-對局聊天.png') });
  await B.click('#chat-pop-close');
  await A.screenshot({ path: path.join(OUT, '線上-桌機-對局.png') });
  await C.screenshot({ path: path.join(OUT, '線上-平板-觀戰.png') });
  for (const p of [A, B, C]) {
    const probs = await layoutProblems(p);
    ok(!probs.length, '線上版面正常（' + p.viewportSize().width + '×' + p.viewportSize().height + '）' + (probs.length ? probs.join('；') : ''));
  }
  ok(!errs.length, '線上流程沒有 JS 錯誤' + (errs.length ? '：' + errs.join('；') : ''));
  await ctxA.close(); await ctxB.close(); await ctxC.close();
}

(async () => {
  console.log('\n海島心臟病 瀏覽器檢查');
  const app = createServer();
  app.start();
  await new Promise(r => app.server.listen(0, r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/';
  let browser;
  try {
    browser = await pw.chromium.launch();
    await solo(browser, base);
    await online(browser, base);
  } catch (e) { fail++; console.log('  ✘ 出錯：' + (e && e.stack)); }
  if (browser) await browser.close();
  app.stop(); app.server.close();
  console.log('\n' + (fail ? '✘ ' : '✔ ') + '通過 ' + pass + ' 項，失敗 ' + fail + ' 項（截圖在 screenshots/）\n');
  process.exit(fail ? 1 : 0);
})();
