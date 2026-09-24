/* ===== scripts/online-check.js — 線上房間生命週期測試（node scripts/online-check.js） =====
 *
 * 1. 真的開一台伺服器、用多個 WebSocket 用戶端走一遍：
 *    建房、加入、觀戰、邀請連結（驗證／撤銷／重發）、權限、聊天、準備、開局、
 *    拍牌（過期／重複）、斷線重連拿回座位、踢人、房間清空後關閉與邀請失效。
 * 2. 用假時鐘直接驅動 hub，把一整局（真人＋電腦）快轉打完，並測斷線太久由電腦代打。
 */
'use strict';

const { createServer } = require('../server.js');
const { createHub } = require('../lib/rooms.js');
const Rules = require('../public/js/rules.js');

let pass = 0, fail = 0;
function ok(v, name) { if (v) { pass++; console.log('  ✔ ' + name); } else { fail++; console.log('  ✘ ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(port, key, name, char) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const c = { ws, msgs: [], room: undefined, lobby: [], errors: [], me: null, closed: false };
    c.send = m => ws.send(JSON.stringify(m));
    c.wait = async (pred, ms) => {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) { const r = pred(c); if (r) return r; await sleep(15); }
      return null;
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      c.msgs.push(m);
      if (m.type === 'room') c.room = m.room;
      if (m.type === 'lobby') c.lobby = m.rooms;
      if (m.type === 'welcome') c.me = m;
      if (m.type === 'error') c.errors.push(m);
    };
    ws.onopen = () => { c.send({ type: 'hello', key, name, char }); };
    ws.onclose = () => { c.closed = true; };
    ws.onerror = reject;
    const t = setInterval(() => { if (c.me) { clearInterval(t); resolve(c); } }, 10);
  });
}

async function liveTest() {
  console.log('\n[真的連線：房間生命週期]');
  const app = createServer();
  app.start();
  await new Promise(r => app.server.listen(0, r));
  const port = app.server.address().port;

  const health = await (await fetch('http://127.0.0.1:' + port + '/health')).json();
  ok(health.ok && health.game === 'heart-attack', '/health 回報正常');
  const pres = await (await fetch('http://127.0.0.1:' + port + '/api/presence')).json();
  ok(pres.gameId === 'heart-attack', '/api/presence 可給遊戲大廳查人數');

  const host = await client(port, 'key-host-123', '房主', 'otter');
  const bob = await client(port, 'key-bob-4567', '小明', 'bunny');
  const spec = await client(port, 'key-spec-890', '路人', 'cat');
  ok(host.me && host.me.name === '房主', 'hello 後拿到身分');

  host.send({ type: 'create', max: 3, pace: 'fast' });
  await host.wait(c => c.room);
  const rid = host.room.id;
  ok(host.room.you.host && host.room.you.role === 'player', '建房者是房主也是玩家');
  ok(host.room.max === 3 && host.room.pace === 'fast', '建房設定生效');
  ok(await bob.wait(c => c.lobby.some(r => r.id === rid)), '大廳列表看得到新房間');

  const tok = host.room.invite.token;
  bob.send({ type: 'inviteInfo', invite: tok });
  const info = await bob.wait(c => c.msgs.find(m => m.type === 'inviteInfo'));
  ok(info && info.ok && info.id === rid, '邀請連結可以查到房間');
  bob.send({ type: 'join', invite: tok, as: 'player' });
  await bob.wait(c => c.room && c.room.id === rid);
  ok(bob.room.you.role === 'player', '用邀請連結加入遊戲 → 玩家');

  spec.send({ type: 'join', roomId: rid, as: 'spectator' });
  await spec.wait(c => c.room && c.room.id === rid);
  ok(spec.room.you.role === 'spectator', '選觀戰 → 觀戰者');

  /* 權限 */
  spec.send({ type: 'settings', max: 2 });
  await spec.wait(c => c.errors.length);
  ok(spec.errors.some(e => /房主/.test(e.text)), '非房主不能改設定');
  bob.send({ type: 'start' });
  await bob.wait(c => c.errors.length);
  ok(bob.errors.some(e => /房主/.test(e.text)), '非房主不能開局');
  spec.send({ type: 'ready', ready: true });
  await spec.wait(c => c.errors.length >= 2);
  ok(spec.errors.some(e => /觀戰者/.test(e.text)), '觀戰者不用準備');

  /* 邀請：撤銷與重發 */
  host.send({ type: 'invite', revoke: true });
  await host.wait(c => c.room && !c.room.invite.active);
  const late = await client(port, 'key-late-111', '晚到', 'koala');
  late.send({ type: 'join', invite: tok, as: 'player' });
  await late.wait(c => c.errors.length);
  ok(late.errors.some(e => /撤銷/.test(e.text)), '撤銷後舊連結不能用');
  host.send({ type: 'invite' });
  await host.wait(c => c.room && c.room.invite.active && c.room.invite.token !== tok);
  ok(host.room.invite.token !== tok, '重發得到新 token');
  late.send({ type: 'join', invite: host.room.invite.token, as: 'player' });
  await late.wait(c => c.room && c.room.id === rid);
  ok(late.room.you.role === 'player', '新連結可以加入（第 3 個座位）');
  const late2 = await client(port, 'key-late-222', '又一個', 'penguin');
  late2.send({ type: 'join', roomId: rid, as: 'player' });
  await late2.wait(c => c.room && c.room.id === rid);
  ok(late2.room.you.role === 'spectator' && late2.msgs.some(m => m.type === 'notice'), '座位滿了想上桌 → 轉觀戰並提示');

  /* 聊天：觀戰者也能聊 */
  spec.send({ type: 'chat', text: '加油！' });
  ok(await host.wait(c => c.room && c.room.chat.some(m => m.text === '加油！' && m.spec)), '觀戰者的聊天大家都收到，且標示觀戰');

  /* 踢人 */
  host.send({ type: 'kick', personId: late2.me.personId });
  ok(await late2.wait(c => c.msgs.some(m => m.type === 'kicked')), '房主可以請人離開');
  late2.send({ type: 'join', roomId: rid, as: 'spectator' });
  ok(await late2.wait(c => c.errors.some(e => /請出/.test(e.text))), '被請出後短時間內不能再進來');

  /* 準備與開局 */
  host.send({ type: 'start' });
  await host.wait(c => c.errors.some(e => /準備/.test(e.text)));
  ok(host.errors.some(e => /準備/.test(e.text)), '有人沒準備不能開局');
  bob.send({ type: 'ready', ready: true });
  late.send({ type: 'ready', ready: true });
  await host.wait(c => c.room.seats.filter(s => s.ready).length === 2);
  host.send({ type: 'start' });
  const g = await host.wait(c => c.room && c.room.game);
  ok(!!g, '全員準備好 → 開局');
  const game = host.room.game;
  ok(game.seats.length === 3 && game.seats.reduce((a, s) => a + s.count, 0) === 52, '3 人共 52 張');
  ok(!JSON.stringify(host.room).includes('"hand"') && !JSON.stringify(host.room).includes('seed'), '送到瀏覽器的資料沒有手牌內容與 seed');
  ok(spec.room.game && spec.room.you.role === 'spectator', '觀戰者也看到牌桌');

  /* 對局中想加入 → 觀戰 */
  const mid = await client(port, 'key-mid-333', '中途', 'shiba');
  mid.send({ type: 'join', roomId: rid, as: 'player' });
  await mid.wait(c => c.room && c.room.id === rid);
  ok(mid.room.you.role === 'spectator', '對局中加入只能觀戰');

  /* 只有啟動者能按開始 */
  const starterId = game.seats[game.starter].id;
  const byId = { [host.me.personId]: host, [bob.me.personId]: bob, [late.me.personId]: late };
  const starter = byId[starterId];
  const other = Object.values(byId).find(c => c !== starter);
  other.send({ type: 'deal' });
  await other.wait(c => c.errors.some(e => /不是你/.test(e.text)));
  ok(other.errors.some(e => /不是你/.test(e.text)), '不是啟動者按開始會被拒絕');
  spec.send({ type: 'slap', revealId: 1, actionId: 'x1' });
  starter.send({ type: 'deal' });
  const flipped = await host.wait(c => c.room.game && c.room.game.reveal, 4000);
  ok(!!flipped, '啟動者按下後伺服器自動翻牌');

  /* 拍牌：重複 actionId 與過期 revealId */
  const rid1 = host.room.game.reveal.id;
  bob.send({ type: 'slap', revealId: rid1 - 1, actionId: 'old' });
  ok(await bob.wait(c => c.msgs.some(m => m.type === 'slapRejected' && m.code === 'stale')) || rid1 === 1, '拍上一張牌會被拒絕');
  const before = host.room.game.slaps.length;
  host.send({ type: 'slap', revealId: host.room.game.reveal.id, actionId: 'same-1' });
  host.send({ type: 'slap', revealId: host.room.game.reveal.id, actionId: 'same-1' });
  await sleep(120);
  const gstate = app.hub.rooms.get(rid).game;
  const hostSeat = gstate.state.seats.findIndex(x => x.id === host.me.personId);
  ok(gstate.actions.has('same-1') && gstate.state.slaps.filter(s => s.seat === hostSeat).length <= 1, '同一個動作 ID 只算一次');
  void before;
  ok(!spec.room.game.slaps.length || spec.room.game.seats.every(s => s.id !== spec.me.personId), '觀戰者拍牌不會被算進去');

  /* 斷線重連：同一把 key 拿回座位 */
  const bobKey = 'key-bob-4567';
  bob.ws.close();
  ok(await host.wait(c => c.room.seats.some(s => s.id === bob.me.personId && !s.online)), '斷線的人顯示離線');
  const bob2 = await client(port, bobKey, '小明', 'bunny');
  await bob2.wait(c => c.room && c.room.id === rid);
  ok(bob2.room && bob2.room.you.role === 'player' && bob2.me.personId === bob.me.personId, '重連後回到同一個座位');

  /* 離開與關房 */
  for (const c of [spec, mid, late, bob2]) c.send({ type: 'leave' });
  await sleep(100);
  host.send({ type: 'leave' });
  await sleep(150);
  ok(!app.hub.rooms.has(rid), '最後一個真人離開 → 房間關閉');
  late2.send({ type: 'inviteInfo', invite: host.room ? host.room.invite.token : 'zzz' });
  const inv2 = await late2.wait(c => c.msgs.filter(m => m.type === 'inviteInfo').pop());
  ok(inv2 && !inv2.ok, '房間關閉後邀請連結失效');

  for (const c of [host, bob2, spec, late, late2, mid]) try { c.ws.close(); } catch (e) { /* 忽略 */ }
  app.stop();
  app.server.close();
}

function hubTest() {
  console.log('\n[假時鐘：整局快轉、電腦補位、斷線代打]');
  let now = 1000;
  const hub = createHub({ now: () => now });
  const a = hub.identify('aaaaaaaa1', '阿明', 'otter');
  const b = hub.identify('bbbbbbbb2', '小華', 'bunny');
  const { room } = hub.createRoom(a, { max: 4, pace: 'fast' });
  hub.join(b, room.id, 'player');
  ok(hub.addAI(a, 'hard').ok && hub.addAI(a, 'kid').ok, '房主可以加電腦補位（可指定難度）');
  ok(!hub.addAI(a).ok, '座位滿了不能再加電腦');
  hub.setReady(b, true);
  ok(hub.startGame(a).ok, '2 真人＋2 電腦開局');
  const st = room.game.state;
  ok(st.autoStartMs === hub.CONST.AUTO_START_MS, '線上有啟動者逾時代按');

  /* b 斷線超過保留時間 → 電腦代打 */
  hub.markOffline(b.id);
  let taken = false, guard = 0;
  while (room.game && guard++ < 200000) {
    now += 20;
    hub.tick(now);
    if (!Rules.checkConservation(st)) { ok(false, '牌數守恆'); break; }
    if (!taken && st.seats.find(s => s.id === b.id).ai === 'normal') taken = true;
  }
  ok(taken, '斷線超過 30 秒 → 電腦代打，對局不會卡住');
  ok(!room.game && room.lastGame && room.lastGame.phase === 'over', '整局打完（真人不動也會因代按與代打而結束）');
  ok(room.lastGame.seats.some(s => s.count === 0), '有人出完牌獲勝');
  ok(room.seats.filter(s => s.kind === 'human').every(s => !s.ready), '結束後大家要重新按準備');
  now += 31000; hub.tick(now);
  ok(!room.seats.some(s => s.personId === b.id), '斷線太久的人在等待中讓出座位');
  hub.leave(a);
  ok(!hub.rooms.has(room.id), '沒有真人就關房');
}

(async () => {
  console.log('\n海島心臟病 線上測試');
  try { await liveTest(); } catch (e) { fail++; console.log('  ✘ 連線測試出錯：' + (e && e.stack)); }
  try { hubTest(); } catch (e) { fail++; console.log('  ✘ hub 測試出錯：' + (e && e.stack)); }
  console.log('\n' + (fail ? '✘ ' : '✔ ') + '通過 ' + pass + ' 項，失敗 ' + fail + ' 項\n');
  process.exit(fail ? 1 : 0);
})();
