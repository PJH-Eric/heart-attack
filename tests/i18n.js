/* ===== tests/i18n.js — 多語系字典完整性檢查（node tests/i18n.js） =====
 * 1. zh-Hant 與 en 的 key 集合完全相同
 * 2. 每個 key 的 {參數} 佔位符兩邊一致
 * 3. 原始碼（HTML、JS）用到的 key 都存在於字典
 * 4. 動態組出來的 key（diff.*、kind.* 等）每個選項都有
 * 5. 伺服器（lib/rooms.js、server.js）送出的中文訊息，前端都有對應的英文翻譯
 * 6. 英文字典不含中文字、中文字典的 srv.* 與伺服器原文一致
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '\n      ' + detail : '')); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 在假瀏覽器環境載入 i18n.js、locales.js（不需要 DOM） */
const sandbox = {};
sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/js/i18n.js'), sandbox);
vm.runInContext(read('public/js/locales.js'), sandbox);
const I18N = sandbox.I18N;

/* 取出字典：重新註冊到攔截用的物件 */
const dicts = {};
const spy = {};
spy.window = spy; spy.I18N = { register: (l, d) => { dicts[l] = d; } };
vm.createContext(spy);
vm.runInContext(read('public/js/locales.js'), spy);
const zh = dicts['zh-Hant'], en = dicts.en;

console.log('\n[字典]');
ok(!!zh && !!en, '兩種語系都有註冊');
const zk = Object.keys(zh).sort(), ek = Object.keys(en).sort();
const onlyZh = zk.filter(k => !(k in en)), onlyEn = ek.filter(k => !(k in zh));
ok(!onlyZh.length && !onlyEn.length, 'zh-Hant 與 en 的 key 集合完全相同（' + zk.length + ' 個）',
  '只在 zh：' + onlyZh.join(', ') + '｜只在 en：' + onlyEn.join(', '));

const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const badPh = zk.filter(k => k in en && ph(zh[k]) !== ph(en[k]));
ok(!badPh.length, '每個 key 的 {參數} 佔位符兩邊一致', badPh.map(k => k + ' zh=' + ph(zh[k]) + ' en=' + ph(en[k])).join('；'));

const empty = zk.filter(k => !String(zh[k]).trim() || !String(en[k] == null ? '' : en[k]).trim());
ok(!empty.length, '沒有空字串', empty.join(', '));
const cjkInEn = ek.filter(k => /[㐀-鿿]/.test(en[k]));
ok(!cjkInEn.length, '英文字典沒有混入中文字', cjkInEn.join(', '));
const untrans = ek.filter(k => en[k] === zh[k] && /[A-Za-z]/.test(en[k]) === false && !/^[\d\W]*$/.test(en[k]));
ok(!untrans.length, '英文值沒有直接照抄中文', untrans.join(', '));

console.log('\n[原始碼用到的 key]');
const srcFiles = ['public/index.html'].concat(fs.readdirSync(path.join(PUB, 'js'))
  .filter(f => f.endsWith('.js') && !/^(i18n|locales|voice-clips.*)\.js$/.test(f)).map(f => 'public/js/' + f));
const used = new Map();
const addUsed = (k, f) => { if (!used.has(k)) used.set(k, f); };
const prefixes = new Map();
for (const f of srcFiles) {
  const s = read(f);
  for (const m of s.matchAll(/\b(?:T|tr|I18N\.t|root\.I18N\.t)\(\s*'([A-Za-z0-9_.]+)'(?!\s*\+)/g)) addUsed(m[1], f);
  /* 三元運算式裡的第二個 key：T(cond ? 'a.b' : 'c.d', ...) */
  for (const m of s.matchAll(/\bT\([^()'"]*\?\s*'([A-Za-z0-9_.]+)'\s*:\s*(?:[^()'"]*\?\s*)?'([A-Za-z0-9_.]+)'/g)) { addUsed(m[1], f); addUsed(m[2], f); }
  for (const m of s.matchAll(/\b(?:T|tr)\(\s*'([A-Za-z0-9_.]+\.)'\s*\+/g)) prefixes.set(m[1], f);
  for (const m of s.matchAll(/data-i18n(?:-html|-title|-content)?="([^"]+)"/g)) addUsed(m[1], f);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach(p => { const k = (p.split('=')[1] || '').trim(); if (k) addUsed(k, f); });
  for (const m of s.matchAll(/'(srv\.[A-Za-z0-9]+)'/g)) addUsed(m[1], f);
  for (const m of s.matchAll(/'((?:chat\.q)\d)'/g)) addUsed(m[1], f);
}
const missing = [...used.keys()].filter(k => !(k in zh) || !(k in en));
ok(used.size > 100, '掃到 ' + used.size + ' 個原始碼用到的 key');
ok(!missing.length, '用到的 key 都存在於兩份字典', missing.map(k => k + '（' + used.get(k) + '）').join(', '));

const DYN = {
  'diff.': ['kid', 'easy', 'normal', 'hard'],
  'diffHint.': ['kid', 'easy', 'normal', 'hard'],
  'kind.': ['kid', 'easy', 'normal', 'hard', 'mixed', 'online'],
  'pace.': ['slow', 'normal', 'fast'],
  'end.': ['first', 'last'],
  'suit.': ['S', 'H', 'D', 'C'],
  'animal.': ['otter', 'bunny', 'capybara', 'penguin', 'shiba', 'turtle', 'koala', 'cat']
};
const dynMissing = [];
for (const [p, f] of prefixes) {
  if (!DYN[p]) { dynMissing.push(p + '（測試沒列出選項，請補 DYN）'); continue; }
  DYN[p].forEach(x => { if (!((p + x) in zh) || !((p + x) in en)) dynMissing.push(p + x); });
}
ok(!dynMissing.length, '動態 key 的每個選項都有翻譯（' + [...prefixes.keys()].join(' ') + '）', dynMissing.join(', '));
const art = read('public/js/art.js');
const animalIds = [...art.matchAll(/id: '(\w+)',\s+name:/g)].map(m => m[1]);
ok(animalIds.length === 8 && animalIds.every(a => ('animal.' + a) in zh), '角色清單與 animal.* 字典一致（' + animalIds.length + ' 個）');
for (let n = 1; n <= 6; n++) ok(('chat.q' + n) in zh && ('chat.q' + n) in en, '聊天快捷語 chat.q' + n);

console.log('\n[伺服器訊息翻譯]');
/* 載入 ui.js（只取 srvText／pname），在英文語系下比對 */
const uiBox = { Art: { ANIMALS: animalIds.map((id, i) => ({ id, name: zh['animal.' + id] })) } };
uiBox.self = uiBox; uiBox.window = uiBox;
uiBox.document = { querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} };
uiBox.I18N = I18N;
vm.createContext(uiBox);
try { vm.runInContext(read('public/js/ui.js'), uiBox); } catch (e) { ok(false, '載入 ui.js', String(e && e.message)); }
const UI = uiBox.UI;
ok(!!(UI && UI.srvText), 'UI.srvText 可用');
if (UI && UI.srvText) {
  const rooms = read('lib/rooms.js') + '\n' + read('server.js');
  const lits = new Set();
  for (const m of rooms.matchAll(/(?:err\(|note = |text: |res\.end\()\s*'([^'\n]*[㐀-鿿][^'\n]*)'(?!\s*\+)/g)) lits.add(m[1]);
  const skip = /^(找不到這個檔案)$/;
  const unmapped = [];
  I18N.setLang('en', { persist: false });
  for (const s of lits) {
    if (skip.test(s)) continue;
    if (UI.srvText(s) === s) unmapped.push(s);
  }
  ok(lits.size > 30, '從 lib/rooms.js、server.js 掃到 ' + lits.size + ' 句固定的中文訊息');
  ok(!unmapped.length, '每句伺服器訊息在英文語系都會被翻譯', unmapped.join(' ｜ '));

  /* 含變數的系統訊息：用範例代入，再比對翻譯結果 */
  const SAMPLES = {
    'srv.sysOffline': { p: 'Amy', n: 30 }, 'srv.sysCreated': { p: 'Amy' }, 'srv.sysSatInvite': { p: 'Amy' }, 'srv.sysSpecInvite': { p: 'Amy' },
    'srv.sysSat': { p: 'Amy' }, 'srv.sysSpec': { p: 'Amy' }, 'srv.sysLeft': { p: 'Amy' }, 'srv.sysNewHost': { p: 'Amy' }, 'srv.sysToSpec': { p: 'Amy' },
    'srv.sysEndMode': { mode: zh['end.last'] }, 'srv.sysKicked': { p: 'Amy' }, 'srv.sysStart': { p: 'Amy' }, 'srv.sysTakeover': { p: 'Amy' },
    'srv.sysOver': { w: 'Amy', l: '' }, 'srv.waitReady': { names: 'Amy、Bob' }
  };
  const bad = [];
  for (const key of zk.filter(k => /^srv\./.test(k))) {
    const params = SAMPLES[key];
    I18N.setLang('zh-Hant', { persist: false });
    const zhText = I18N.t(key, params);
    I18N.setLang('en', { persist: false });
    let want = I18N.t(key, key === 'srv.sysEndMode' ? { mode: en['end.last'] } : key === 'srv.waitReady' ? { names: 'Amy, Bob' } : params);
    if (key === 'srv.sysOver') want = I18N.t(key, { w: 'Amy', l: '' });
    if (key === 'srv.sysOverLoser') continue;
    const got = UI.srvText(zhText);
    if (got !== want) bad.push(key + '：期望「' + want + '」實際「' + got + '」');
  }
  ok(!bad.length, '每個 srv.* key 都對得上伺服器句型並翻成英文', bad.join(' ｜ '));
  I18N.setLang('zh-Hant', { persist: false });
  ok(UI.srvText('這個房間已經關閉了') === '這個房間已經關閉了', '中文語系原樣顯示伺服器訊息');
}

console.log('\n✔ 通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
process.exit(fail ? 1 : 0);
