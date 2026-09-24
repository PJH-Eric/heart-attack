/* ===== tests/verify.js — 規則核心與電腦的單元測試（node tests/verify.js） ===== */
'use strict';

const Rules = require('../public/js/rules.js');
const AI = require('../public/js/ai.js');
const RNG = require('../public/js/rng.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + (e && e.message)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 預期 ' + JSON.stringify(b) + '，實際 ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || '條件不成立'); }

const P = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '玩家' + i }));
const C = (s, r) => ({ s, r });

/** 做一個牌序完全指定的局，方便測特定情況 */
function rigged(hands, opt) {
  const st = Rules.create(P(hands.length), Object.assign({ seed: 'x', pace: 'normal' }, opt));
  st.seats.forEach((s, i) => { s.id = 'p' + i; s.hand = hands[i].map(x => C(x[0], x[1])); });
  return st;
}
/** 從目前狀態把時間推到下一次翻牌 */
function flipNext(st, now) {
  const at = Math.max(now, st.nextAt);
  Rules.tick(st, at);
  return at;
}

console.log('\n海島心臟病 規則測試');

console.log('\n[牌組與發牌]');
t('一副 52 張、不含鬼牌、沒有重複', () => {
  const d = Rules.newDeck();
  eq(d.length, 52);
  eq(new Set(d.map(c => c.s + c.r)).size, 52);
  ok(d.every(c => c.r >= 1 && c.r <= 13));
});
for (const n of [2, 3, 4]) {
  t(n + ' 人：依系統順序一人一張輪流發完 52 張', () => {
    const st = Rules.create(P(n), { seed: 'deal' + n });
    const counts = st.seats.map(s => s.hand.length);
    eq(counts.reduce((a, b) => a + b, 0), 52);
    const base = Math.floor(52 / n);
    counts.forEach((c, i) => eq(c, base + (i < 52 % n ? 1 : 0), '第 ' + i + ' 位'));
    ok(Rules.checkConservation(st));
  });
}
t('人數不在 2～4 人會拒絕', () => {
  let threw = 0;
  try { Rules.create(P(1)); } catch (e) { threw++; }
  try { Rules.create(P(5)); } catch (e) { threw++; }
  eq(threw, 2);
});
t('同一個 seed 得到同樣的座位順序與牌序；不同 seed 不同', () => {
  const a = Rules.create(P(4), { seed: 'same' }), b = Rules.create(P(4), { seed: 'same' }), c = Rules.create(P(4), { seed: 'other' });
  eq(JSON.stringify(a.seats), JSON.stringify(b.seats));
  ok(JSON.stringify(a.seats) !== JSON.stringify(c.seats));
});

console.log('\n[開始與翻牌]');
t('只有第一順位能按開始，其他人按了無效', () => {
  const st = Rules.create(P(3), { seed: 's1' });
  const first = st.seats[0].id, other = st.seats[1].id;
  eq(Rules.start(st, other, 0).ok, false);
  eq(st.phase, 'waitStart');
  eq(Rules.start(st, first, 0).ok, true);
  eq(st.phase, 'dealing');
});
t('自動依座位順序逐張翻牌，喊數 A→K 再回到 A', () => {
  /* 全部用不會命中的牌：第 k 張喊 k%13+1，出的牌故意錯開一點 */
  const st = rigged([[], []]);
  for (let k = 0; k < 30; k++) st.seats[k % 2].hand.push(C('S', ((k % 13) + 1) % 13 + 1));
  Rules.start(st, 'p0', 0);
  let now = 0;
  const calls = [], by = [];
  for (let k = 0; k < 28; k++) {
    now = flipNext(st, now);
    calls.push(st.reveal.call); by.push(st.reveal.by);
  }
  eq(calls.slice(0, 14).join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13,1');
  eq(by.slice(0, 6).join(','), '0,1,0,1,0,1');
  eq(st.phase, 'dealing');
});
t('點數與喊數不同時，每張牌間隔固定節奏', () => {
  const st = rigged([[['S', 5], ['S', 5]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 1000);
  Rules.tick(st, 1349); eq(st.flips, 0, '按下去先停一下');
  Rules.tick(st, 1350); eq(st.flips, 1);
  Rules.tick(st, 1350 + st.pace.flipMs - 1); eq(st.flips, 1);
  Rules.tick(st, 1350 + st.pace.flipMs); eq(st.flips, 2);
});

console.log('\n[拍牌與收牌]');
t('點數＝喊數：最後拍的人收整疊，放到手牌底部且照翻出順序', () => {
  /* p0 翻 5(喊A)、p1 翻 2(喊2) → 命中 */
  const st = rigged([[['S', 5], ['S', 9]], [['H', 2], ['H', 9]], [['D', 9], ['D', 9]]]);
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);
  now = flipNext(st, now);
  eq(st.reveal.card.r, 2); eq(st.reveal.call, 2);
  eq(st.phase, 'slapWindow');
  Rules.slap(st, 'p1', now + 100, st.reveal.id);
  Rules.slap(st, 'p0', now + 200, st.reveal.id);
  Rules.slap(st, 'p2', now + 300, st.reveal.id);  /* 全員拍完 → 立刻結算 */
  eq(st.phase, 'result');
  eq(st.lastResult.seat, 2); eq(st.lastResult.reason, 'last'); eq(st.lastResult.count, 2);
  const tail = st.seats[2].hand.slice(-2).map(c => c.s + c.r).join(',');
  eq(tail, 'S5,H2', '收牌照翻出順序放底部');
  eq(st.pile.length, 0);
  eq(st.seats.reduce((a, x) => a + x.hand.length, 0), 6, '牌數不變');
});
t('有人沒拍：從翻牌者往後數，最後一位沒拍的人收牌', () => {
  const st = rigged([[['S', 1], ['S', 9]], [['H', 9]], [['D', 9]], [['C', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  eq(st.reveal.match, true);
  Rules.slap(st, 'p2', now + 100, st.reveal.id);
  /* 沒拍：p0、p1、p3；翻牌者 p0 往後數 p0,p1,(p2),p3 → 最後一位是 p3 */
  Rules.tick(st, now + st.pace.windowMs);
  eq(st.lastResult.seat, 3); eq(st.lastResult.reason, 'miss');
});
t('點數不同卻拍：第一位誤拍者收牌，其他人再拍無效', () => {
  const st = rigged([[['S', 7], ['S', 9]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  const r = Rules.slap(st, 'p1', now + 50, st.reveal.id);
  eq(r.wrong, true);
  eq(st.lastResult.seat, 1); eq(st.lastResult.reason, 'wrong');
  eq(Rules.slap(st, 'p0', now + 60, st.reveal.id).ok, false);
  eq(st.seats[1].hand.length, 3);
});
t('還沒翻牌就拍：不算也不罰', () => {
  const st = rigged([[['S', 7]], [['H', 9]]]);
  eq(Rules.slap(st, 'p1', 0).ok, false);
  Rules.start(st, 'p0', 0);
  eq(Rules.slap(st, 'p1', 10).reason, 'no-card');
  eq(st.seats[1].hand.length, 1);
});
t('拍到上一張（revealId 過期）與重複拍會被拒絕', () => {
  const st = rigged([[['S', 3], ['S', 1]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);
  const oldId = st.reveal.id;
  now = flipNext(st, now);
  eq(Rules.slap(st, 'p0', now + 1, oldId).reason, 'stale');
  const st2 = rigged([[['S', 1], ['S', 9]], [['H', 9], ['H', 9]], [['D', 9]]]);
  Rules.start(st2, 'p0', 0);
  const n2 = flipNext(st2, 0);
  eq(Rules.slap(st2, 'p1', n2 + 1, st2.reveal.id).ok, true);
  eq(Rules.slap(st2, 'p1', n2 + 2, st2.reveal.id).reason, 'dup');
});
t('收牌後由收牌者啟動下一段，且從 A 重新喊', () => {
  const st = rigged([[['S', 1], ['S', 5], ['S', 5]], [['H', 9], ['H', 5]], [['D', 9], ['D', 5]]]);
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);
  Rules.slap(st, 'p0', now + 10, st.reveal.id);
  Rules.slap(st, 'p2', now + 20, st.reveal.id);
  Rules.slap(st, 'p1', now + 30, st.reveal.id);   /* p1 最後 */
  now += 30;
  Rules.tick(st, now + st.pace.resultMs);
  eq(st.phase, 'waitStart'); eq(st.starter, 1);
  eq(Rules.start(st, 'p0', now + 2000).ok, false, '別人不能代按');
  Rules.start(st, 'p1', now + 2000);
  now = flipNext(st, now + 2000);
  eq(st.reveal.by, 1, '從收牌者開始翻');
  eq(st.reveal.call, 1, '從 A 喊起');
});
t('線上：啟動者逾時由系統代按', () => {
  const st = rigged([[['S', 9]], [['H', 9]]], { autoStartMs: 8000, now: 0 });
  Rules.tick(st, 7999); eq(st.phase, 'waitStart');
  Rules.tick(st, 8000); eq(st.phase, 'dealing');
  eq(st.events.some(e => e.type === 'start' && e.auto), true);
});

console.log('\n[勝負]');
t('翻出最後一張且沒人誤拍 → 下一張翻牌前判定獲勝', () => {
  const st = rigged([[['S', 9]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  eq(st.seats[0].hand.length, 0);
  eq(st.phase, 'dealing', '誤拍時間還沒結束');
  Rules.tick(st, now + st.pace.flipMs);
  eq(st.phase, 'over'); eq(st.winner, 0);
});
t('最後一張命中時要先結算：沒拍到就收牌，贏不了', () => {
  const st = rigged([[['S', 1]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  Rules.slap(st, 'p1', now + 100, st.reveal.id);    /* p0 沒拍 → 收牌 */
  Rules.tick(st, now + st.pace.windowMs);
  Rules.tick(st, now + st.pace.windowMs + st.pace.resultMs);
  eq(st.phase, 'waitStart'); eq(st.seats[0].hand.length, 1);
});
t('最後一張命中、自己有拍、別人最慢 → 收完牌後自己 0 張獲勝', () => {
  const st = rigged([[['S', 1]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  Rules.slap(st, 'p0', now + 100, st.reveal.id);
  Rules.slap(st, 'p1', now + 200, st.reveal.id);
  Rules.tick(st, now + 200 + st.pace.resultMs);
  eq(st.phase, 'over'); eq(st.winner, 0);
});
t('手牌 0 張的人還是可以拍牌（誤拍就收牌、贏不了）', () => {
  const st = rigged([[['S', 9]], [['H', 4], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);         /* p0 出完 */
  eq(Rules.slap(st, 'p0', now + 50, st.reveal.id).wrong, true);
  eq(st.seats[0].hand.length, 1);
});

console.log('\n[結束方式：打到只剩一人有牌]');
t('出完的人得到名次並離場，其他人繼續打', () => {
  const st = rigged([[['S', 9]], [['H', 5], ['H', 9], ['H', 9]], [['D', 9], ['D', 9], ['D', 9]]], { endMode: 'last' });
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);             /* p0 出完最後一張 */
  now = flipNext(st, now + st.pace.flipMs);
  eq(st.phase, 'dealing', '沒有結束');
  eq(st.seats[0].out, 1, 'p0 第 1 名');
  eq(st.finished.join(','), '0');
  eq(st.events.some(e => e.type === 'out' && e.seat === 0 && e.place === 1), true);
  eq(st.reveal.by, 1, '下一張由還有牌的人翻');
});
t('離場的人不能拍，也不會被算成「沒拍到」而收牌', () => {
  /* p0 出完離場後，p1 翻出命中；p1、p2 都拍 → 應該立刻結算，最後拍的 p2 收牌 */
  const st = rigged([[['S', 9]], [['H', 2], ['H', 9]], [['D', 9], ['D', 9]]], { endMode: 'last' });
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);
  now = flipNext(st, now + st.pace.flipMs);      /* p0 離場；p1 翻 H2 喊 2 → 命中 */
  eq(st.reveal.match, true);
  eq(Rules.slap(st, 'p0', now + 10, st.reveal.id).reason, 'out');
  Rules.slap(st, 'p1', now + 20, st.reveal.id);
  Rules.slap(st, 'p2', now + 30, st.reveal.id);
  eq(st.phase, 'result', '場上兩人都拍了就結算');
  eq(st.lastResult.seat, 2);
  const st2 = rigged([[['S', 9]], [['H', 2], ['H', 9]], [['D', 9], ['D', 9]]], { endMode: 'last' });
  Rules.start(st2, 'p0', 0);
  let n2 = flipNext(st2, 0);
  n2 = flipNext(st2, n2 + st2.pace.flipMs);
  Rules.slap(st2, 'p1', n2 + 20, st2.reveal.id);
  Rules.tick(st2, n2 + st2.pace.windowMs);
  eq(st2.lastResult.seat, 2, '沒拍的是 p2（不是已離場的 p0）');
});
t('只剩一人有牌時結束：勝者＝第一個出完，輸家＝最後有牌的人，名次完整', () => {
  const st = rigged([[['S', 9]], [['H', 5]], [['D', 9], ['D', 9], ['D', 9]]], { endMode: 'last' });
  Rules.start(st, 'p0', 0);
  let now = flipNext(st, 0);
  now = flipNext(st, now + st.pace.flipMs);      /* p0 離場，p1 翻最後一張 */
  Rules.tick(st, now + st.pace.flipMs);
  eq(st.phase, 'over');
  eq(st.winner, 0); eq(st.loser, 2);
  eq(Rules.publicView(st, now).ranking.join(','), '0,1,2');
});
t('預設（有人出完就結束）的名次：勝者在前，其他人照剩餘張數', () => {
  const st = rigged([[['S', 9]], [['H', 5], ['H', 9], ['H', 9]], [['D', 9], ['D', 9]]]);
  Rules.start(st, 'p0', 0);
  const now = flipNext(st, 0);
  Rules.tick(st, now + st.pace.flipMs);
  eq(st.phase, 'over');
  eq(Rules.publicView(st, now).ranking.join(','), '0,2,1');
});
t('電腦互打（只剩一人模式）40 局都能打完、名次包含所有人', () => {
  for (let i = 0; i < 40; i++) {
    const n = 2 + (i % 3);
    const ps = ['kid', 'easy', 'normal', 'hard'].slice(0, n).map((l, k) => ({ id: 'a' + k, name: 'a' + k, ai: l }));
    const st = Rules.create(ps, { seed: 'L' + i, endMode: 'last' });
    const d = AI.createDriver('L' + i);
    let now = 0;
    while (st.phase !== 'over' && now < 40 * 60e3) {
      now += 20; Rules.tick(st, now);
      for (const a of d.actions(st, now)) a.type === 'start' ? Rules.start(st, a.id, now) : Rules.slap(st, a.id, now, a.revealId);
      Rules.tick(st, now);
      if (!Rules.checkConservation(st)) throw new Error('牌數不守恆');
    }
    eq(st.phase, 'over', '第 ' + i + ' 局');
    eq(st.finished.length, n - 1, '除了最後一人都有名次');
    eq(new Set(Rules.publicView(st, now).ranking).size, n);
  }
});

console.log('\n[公開資訊]');
t('publicView 不含未翻出的牌、seed，也不透露「這張該拍」', () => {
  const st = rigged([[['S', 1], ['S', 9]], [['H', 9], ['H', 9]]]);
  Rules.start(st, 'p0', 0);
  flipNext(st, 0);
  const v = Rules.publicView(st, 0);
  const text = JSON.stringify(v);
  ok(!('seed' in v)); ok(!/"hand"/.test(text));
  eq(v.phase, 'dealing', 'slapWindow 對外也是 dealing');
  eq(v.reveal.match, undefined);
  eq(v.seats[0].count, 1);
});

console.log('\n[電腦]');
t('電腦不會在點數不同時隨便拍（幼幼班完全不誤拍）', () => {
  const rng = RNG.create('k');
  for (let i = 0; i < 2000; i++) eq(AI.decide('kid', C('S', 5), 7, rng), null);
});
t('四段難度的平均反應時間：幼幼班 > 簡單 > 普通 > 困難', () => {
  const avg = lv => {
    const rng = RNG.create('r' + lv); let s = 0, n = 0;
    for (let i = 0; i < 3000; i++) { const d = AI.decide(lv, C('S', 7), 7, rng); if (d != null) { s += d; n++; } }
    return s / n;
  };
  const a = Rules.DIFFICULTY_LIST.map(avg);
  ok(a[0] > a[1] && a[1] > a[2] && a[2] > a[3], a.map(Math.round).join(' > '));
  ok(a[3] >= 280, '困難仍是人類做得到的反應時間');
});
t('誤拍率：簡單 > 普通 > 困難', () => {
  const rate = lv => {
    const rng = RNG.create('w' + lv); let n = 0;
    for (let i = 0; i < 20000; i++) if (AI.decide(lv, C('S', 8), 7, rng) != null) n++;
    return n / 20000;
  };
  const e = rate('easy'), nm = rate('normal'), h = rate('hard');
  ok(e > nm && nm > h, [e, nm, h].join(' > '));
});

function simulate(levels, seed, pace) {
  const ps = levels.map((l, i) => ({ id: 'a' + i, name: 'a' + i, ai: l }));
  const st = Rules.create(ps, { seed, pace: pace || 'normal' });
  const d = AI.createDriver(seed + 'x');
  let now = 0;
  while (st.phase !== 'over' && now < 30 * 60e3) {
    now += 20;
    Rules.tick(st, now);
    for (const a of d.actions(st, now)) a.type === 'start' ? Rules.start(st, a.id, now) : Rules.slap(st, a.id, now, a.revealId);
    Rules.tick(st, now);
    if (!Rules.checkConservation(st)) throw new Error('牌數不守恆 @' + now);
  }
  return { st, now };
}
t('電腦互打 80 局：每局都能打完、全程 52 張守恆', () => {
  for (let i = 0; i < 80; i++) {
    const n = 2 + (i % 3);
    const r = simulate(['kid', 'easy', 'normal', 'hard'].slice(0, n), 'g' + i);
    eq(r.st.phase, 'over', '第 ' + i + ' 局');
  }
});
t('困難電腦勝率明顯高於幼幼班（難度差異看得出來）', () => {
  const win = {};
  for (let i = 0; i < 80; i++) {
    const r = simulate(['kid', 'hard'], 'h' + i);
    const w = r.st.seats[r.st.winner].ai;
    win[w] = (win[w] || 0) + 1;
  }
  ok((win.hard || 0) > (win.kid || 0) * 2, JSON.stringify(win));
});

console.log('\n' + (fail ? '✘ ' : '✔ ') + '通過 ' + pass + ' 項，失敗 ' + fail + ' 項\n');
process.exit(fail ? 1 : 0);
