/* ===== art.js — 全手繪 SVG 美術（撲克牌、牌背、八隻海島動物、圖示） =====
 *
 * 不用 emoji、不用圖片檔：系統字型會改變 emoji 長相，SVG 在每台裝置都一樣清楚。
 * 撲克牌採「大字角標」：角落的點數特別大，小朋友一眼就認得出來；
 * 花色除了顏色也靠形狀區分，設定裡還能切換四色牌（方塊藍、梅花綠）。
 */
(function (root) {
  'use strict';

  let uid = 0;
  const nextId = p => (p || 'g') + (++uid);

  /* ---------- 花色 ---------- */

  /* 都畫在 100×100 的方格裡 */
  const SUIT_PATHS = {
    H: '<path d="M50 90C22 68 5 51 5 31A22.5 22.5 0 0 1 50 19.5 22.5 22.5 0 0 1 95 31C95 51 78 68 50 90Z"/>',
    D: '<path d="M50 4 86 50 50 96 14 50Z"/>',
    S: '<path d="M50 5C31 29 7 43 7 62a20 20 0 0 0 37 10.5C42 83 37 90 29 95h42c-8-5-13-12-15-22.5A20 20 0 0 0 93 62C93 43 69 29 50 5Z"/>',
    C: '<circle cx="50" cy="28" r="19.5"/><circle cx="27.5" cy="58" r="19.5"/><circle cx="72.5" cy="58" r="19.5"/>' +
       '<path d="M40 44h20v14H40z"/><path d="M45 62c0 15-5 26-15 33h40c-10-7-15-18-15-33z"/>'
  };

  function suitColor(s, fourColor) {
    if (s === 'H') return '#D8263F';
    if (s === 'D') return fourColor ? '#1F6FD1' : '#D8263F';
    if (s === 'C') return fourColor ? '#16804A' : '#23233A';
    return '#23233A';
  }

  /** 一個花色，中心在 (cx, cy)，寬 size；flip 會上下顛倒（牌的下半部） */
  function suit(s, cx, cy, size, color, flip) {
    const k = size / 100;
    const t = 'translate(' + (cx - size / 2) + ',' + (cy - size / 2) + ') scale(' + k + ')' +
      (flip ? ' rotate(180 50 50)' : '');
    return '<g transform="' + t + '" fill="' + color + '">' + SUIT_PATHS[s] + '</g>';
  }

  function suitIcon(s, fourColor) {
    return '<svg viewBox="0 0 100 100" class="suit-icon" aria-hidden="true">' +
      suit(s, 50, 50, 100, suitColor(s, fourColor)) + '</svg>';
  }

  /* ---------- 撲克牌 ---------- */

  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_ZH = { S: '黑桃', H: '紅心', D: '方塊', C: '梅花' };

  /* 2～10 的點子位置（牌面 250×350，中間區 x 80～170、y 88～262） */
  const L = 88, C = 125, R = 162;
  const T = 92, B = 258, M = 175;
  const Q1 = 147, Q3 = 203;              /* 四列時的中間兩列 */
  const PIPS = {
    2: [[C, T], [C, B]],
    3: [[C, T], [C, M], [C, B]],
    4: [[L, T], [R, T], [L, B], [R, B]],
    5: [[L, T], [R, T], [C, M], [L, B], [R, B]],
    6: [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]],
    7: [[L, T], [R, T], [C, 133], [L, M], [R, M], [L, B], [R, B]],
    8: [[L, T], [R, T], [C, 133], [L, M], [R, M], [C, 217], [L, B], [R, B]],
    9: [[L, T], [R, T], [L, Q1], [R, Q1], [C, M], [L, Q3], [R, Q3], [L, B], [R, B]],
    10: [[L, T], [R, T], [C, 119], [L, Q1], [R, Q1], [L, Q3], [R, Q3], [C, 231], [L, B], [R, B]]
  };

  function crown(cx, cy, w, color) {
    const h = w * 0.62, x = cx - w / 2, y = cy - h / 2;
    return '<path d="M' + x + ' ' + (y + h) + 'L' + x + ' ' + (y + h * 0.25) + 'L' + (x + w * 0.27) + ' ' + (y + h * 0.58) +
      'L' + cx + ' ' + y + 'L' + (x + w * 0.73) + ' ' + (y + h * 0.58) + 'L' + (x + w) + ' ' + (y + h * 0.25) +
      'L' + (x + w) + ' ' + (y + h) + 'Z" fill="' + color + '" stroke="#8A5A10" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="' + x + '" cy="' + (y + h * 0.2) + '" r="5" fill="' + color + '" stroke="#8A5A10" stroke-width="2"/>' +
      '<circle cx="' + cx + '" cy="' + (y - 3) + '" r="6" fill="' + color + '" stroke="#8A5A10" stroke-width="2"/>' +
      '<circle cx="' + (x + w) + '" cy="' + (y + h * 0.2) + '" r="5" fill="' + color + '" stroke="#8A5A10" stroke-width="2"/>';
  }

  /**
   * 一張牌的 SVG。
   * @param {{s:string,r:number}} card
   * @param {{fourColor?:boolean, cls?:string}} opt
   */
  function cardSvg(card, opt) {
    opt = opt || {};
    const col = suitColor(card.s, opt.fourColor);
    const rank = RANKS[card.r - 1];
    const gid = nextId('cf');
    const wide = rank === '10';
    const idxText = (x, y, anchor, rot) =>
      '<g' + (rot ? ' transform="rotate(180 125 175)"' : '') + '>' +
      '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" class="card-rank" fill="' + col + '" ' +
      'font-size="' + (wide ? 56 : 66) + '"' + (wide ? ' letter-spacing="-4"' : '') + '>' + rank + '</text>' +
      suit(card.s, anchor === 'middle' ? x : x + (wide ? 30 : 22), y + 34, 40, col) + '</g>';

    let center = '';
    if (card.r === 1) {
      center = suit(card.s, 125, 178, card.s === 'S' ? 130 : 112, col);
    } else if (card.r <= 10) {
      center = PIPS[card.r].map(p => suit(card.s, p[0], p[1], 42, col, p[1] > M + 1)).join('');
    } else {
      const face = { 11: '#6CC3E0', 12: '#F59BB5', 13: '#F8C74A' }[card.r];
      const fg = nextId('fg');
      center =
        '<defs><linearGradient id="' + fg + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="' + face + '"/></linearGradient></defs>' +
        '<rect x="66" y="78" width="118" height="194" rx="16" fill="url(#' + fg + ')" stroke="' + col + '" stroke-width="4"/>' +
        crown(125, 122, 64, '#FFD54A') +
        '<text x="125" y="232" text-anchor="middle" class="card-rank" font-size="92" fill="' + col + '">' + rank + '</text>' +
        suit(card.s, 125, 254, 26, col);
    }

    return '<svg viewBox="0 0 250 350" class="card-svg ' + (opt.cls || '') + '" role="img" aria-label="' +
      SUIT_ZH[card.s] + ' ' + rank + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F3EEE4"/></linearGradient></defs>' +
      '<rect x="3" y="3" width="244" height="344" rx="22" fill="url(#' + gid + ')" stroke="#CFC6B6" stroke-width="3"/>' +
      idxText(38, 70, 'middle', false) +
      idxText(38, 70, 'middle', true) +
      center + '</svg>';
  }

  function hibiscus(cx, cy, r, color, center) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += '<ellipse cx="' + cx + '" cy="' + (cy - r * 0.55) + '" rx="' + (r * 0.42) + '" ry="' + (r * 0.6) +
        '" fill="' + color + '" transform="rotate(' + (i * 72) + ' ' + cx + ' ' + cy + ')"/>';
    }
    return out + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.22) + '" fill="' + (center || '#FFE08A') + '"/>';
  }

  function cardBackSvg(cls) {
    const g = nextId('cb'), p = nextId('cp');
    return '<svg viewBox="0 0 250 350" class="card-svg back ' + (cls || '') + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3F7FD6"/><stop offset="1" stop-color="#1F4E9E"/></linearGradient>' +
      '<pattern id="' + p + '" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<path d="M0 14h28M14 0v28" stroke="rgba(255,255,255,.18)" stroke-width="2"/></pattern></defs>' +
      '<rect x="3" y="3" width="244" height="344" rx="22" fill="#fff" stroke="#CFC6B6" stroke-width="3"/>' +
      '<rect x="16" y="16" width="218" height="318" rx="14" fill="url(#' + g + ')"/>' +
      '<rect x="16" y="16" width="218" height="318" rx="14" fill="url(#' + p + ')"/>' +
      '<rect x="26" y="26" width="198" height="298" rx="10" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/>' +
      hibiscus(125, 175, 58, 'rgba(255,255,255,.92)', '#FFD35C') +
      hibiscus(62, 72, 20, 'rgba(255,255,255,.5)') + hibiscus(188, 278, 20, 'rgba(255,255,255,.5)') +
      '</svg>';
  }

  /* ---------- 八隻海島動物（頭像＋花襯衫肩膀，漸層做立體） ---------- */

  const ANIMALS = [
    { id: 'otter',    name: '水獺', base: '#9A7358', dark: '#6B4A34', light: '#F3E2CC', shirt: '#4FB3E8', ears: 'low',    muzzle: 'wide', whisker: true },
    { id: 'bunny',    name: '兔兔', base: '#FBF3EF', dark: '#E2CFC8', light: '#FFFFFF', shirt: '#F58FB0', ears: 'long',   muzzle: 'small', flower: true },
    { id: 'capybara', name: '水豚', base: '#C0915E', dark: '#936639', light: '#D9B386', shirt: '#7BCB6E', ears: 'tiny',   muzzle: 'capy', leaf: true },
    { id: 'penguin',  name: '企鵝', base: '#334262', dark: '#1F2A42', light: '#FFFFFF', shirt: '#FFB547', ears: 'none',   muzzle: 'beak', hat: true },
    { id: 'shiba',    name: '柴柴', base: '#EE9F4E', dark: '#C9772B', light: '#FFF6EA', shirt: '#6FC9C4', ears: 'point',  muzzle: 'dog' },
    { id: 'turtle',   name: '海龜', base: '#83C986', dark: '#4F9A5A', light: '#D8F1CF', shirt: '#F77F6B', ears: 'none',   muzzle: 'small', spots: true, glasses: true },
    { id: 'koala',    name: '無尾熊', base: '#A9B2BF', dark: '#7F8896', light: '#F1F3F6', shirt: '#B48CF0', ears: 'fluffy', muzzle: 'koala' },
    { id: 'cat',      name: '貓咪', base: '#F4D59C', dark: '#E0A456', light: '#FFF8EA', shirt: '#5C8FE8', ears: 'point',  muzzle: 'small', stripes: true }
  ];
  const ANIMAL_MAP = {};
  ANIMALS.forEach(a => { ANIMAL_MAP[a.id] = a; });

  function ears(a, g) {
    const f = 'url(#' + g + ')';
    switch (a.ears) {
      case 'round':
        return '<circle cx="30" cy="30" r="11" fill="' + a.dark + '"/><circle cx="90" cy="30" r="11" fill="' + a.dark + '"/>' +
          '<circle cx="30" cy="31" r="5.5" fill="' + a.light + '" opacity=".7"/><circle cx="90" cy="31" r="5.5" fill="' + a.light + '" opacity=".7"/>';
      case 'long':
        return '<ellipse cx="43" cy="26" rx="10.5" ry="24" fill="' + f + '" transform="rotate(-10 43 26)"/>' +
          '<ellipse cx="79" cy="26" rx="10.5" ry="24" fill="' + f + '" transform="rotate(12 79 26)"/>' +
          '<ellipse cx="43" cy="27" rx="5" ry="17" fill="#F7B6C6" transform="rotate(-10 43 27)"/>' +
          '<ellipse cx="79" cy="27" rx="5" ry="17" fill="#F7B6C6" transform="rotate(12 79 27)"/>';
      case 'low':
        return '<ellipse cx="25" cy="48" rx="7" ry="6" fill="' + a.dark + '"/><ellipse cx="95" cy="48" rx="7" ry="6" fill="' + a.dark + '"/>';
      case 'tiny':
        return '<ellipse cx="33" cy="30" rx="7" ry="6" fill="' + a.dark + '"/><ellipse cx="87" cy="30" rx="7" ry="6" fill="' + a.dark + '"/>';
      case 'point':
        return '<path d="M22 44 28 12 50 30Z" fill="' + a.dark + '" stroke="' + a.dark + '" stroke-width="4" stroke-linejoin="round"/>' +
          '<path d="M98 44 92 12 70 30Z" fill="' + a.dark + '" stroke="' + a.dark + '" stroke-width="4" stroke-linejoin="round"/>' +
          '<path d="M29 36 31 20 43 31Z" fill="#F7B6C6"/><path d="M91 36 89 20 77 31Z" fill="#F7B6C6"/>';
      case 'fluffy':
        return '<circle cx="24" cy="36" r="19" fill="' + a.base + '"/><circle cx="96" cy="36" r="19" fill="' + a.base + '"/>' +
          '<circle cx="25" cy="37" r="11" fill="' + a.light + '"/><circle cx="95" cy="37" r="11" fill="' + a.light + '"/>';
      default: return '';
    }
  }

  function muzzle(a) {
    const eyeY = 54;
    const eyes =
      '<ellipse cx="45" cy="' + eyeY + '" rx="5" ry="6.2" fill="#2A2230"/><ellipse cx="75" cy="' + eyeY + '" rx="5" ry="6.2" fill="#2A2230"/>' +
      '<circle cx="46.8" cy="' + (eyeY - 2.4) + '" r="1.9" fill="#fff"/><circle cx="76.8" cy="' + (eyeY - 2.4) + '" r="1.9" fill="#fff"/>';
    const cheeks = '<ellipse cx="34" cy="68" rx="7" ry="4.5" fill="#FF8FA3" opacity=".55"/><ellipse cx="86" cy="68" rx="7" ry="4.5" fill="#FF8FA3" opacity=".55"/>';
    const smile = '<path d="M53 74q7 7 14 0" stroke="#2A2230" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    switch (a.muzzle) {
      case 'wide':
        return '<path d="M24 66c0-12 14-20 36-20s36 8 36 20-14 26-36 26-36-14-36-26Z" fill="' + a.light + '" opacity=".9"/>' +
          eyes + cheeks + '<ellipse cx="60" cy="72" rx="20" ry="14" fill="' + a.light + '"/>' +
          '<ellipse cx="60" cy="66" rx="6" ry="4.2" fill="#3A2A22"/>' + smile +
          (a.whisker ? '<g stroke="#6B4A34" stroke-width="1.6" stroke-linecap="round"><path d="M44 70 28 67M44 74 28 76M76 70l16-3M76 74l16 2"/></g>' : '');
      case 'capy':
        return eyes + cheeks + '<rect x="40" y="60" width="40" height="28" rx="14" fill="' + a.light + '"/>' +
          '<ellipse cx="53" cy="68" rx="2.6" ry="3.4" fill="#4A3526"/><ellipse cx="67" cy="68" rx="2.6" ry="3.4" fill="#4A3526"/>' +
          '<path d="M54 79q6 5 12 0" stroke="#4A3526" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      case 'beak':
        return '<path d="M26 64C26 44 40 34 60 34s34 10 34 30-16 30-34 30-34-10-34-30Z" fill="' + a.light + '"/>' +
          eyes + cheeks + '<path d="M50 66h20l-10 10z" fill="#FFA928" stroke="#E07F10" stroke-width="2" stroke-linejoin="round"/>';
      case 'dog':
        return '<path d="M30 70c4-14 16-18 30-18s26 4 30 18c-4 14-16 20-30 20s-26-6-30-20Z" fill="' + a.light + '"/>' +
          eyes + cheeks + '<ellipse cx="60" cy="67" rx="6" ry="4.4" fill="#2A2230"/>' + smile;
      case 'koala':
        return eyes + cheeks + '<ellipse cx="60" cy="67" rx="9" ry="11" fill="#3B3F4A"/>' +
          '<ellipse cx="57" cy="62" rx="3" ry="2" fill="#fff" opacity=".4"/>' + smile.replace('74', '80').replace('q7 7 14 0', 'q7 5 14 0');
      default:
        return eyes + cheeks + '<ellipse cx="60" cy="66" rx="4" ry="3" fill="#E87A8E"/>' + smile;
    }
  }

  function extras(a) {
    let out = '';
    if (a.spots) out += '<g fill="' + a.dark + '" opacity=".45"><circle cx="40" cy="30" r="5"/><circle cx="82" cy="34" r="4"/><circle cx="62" cy="24" r="3.5"/></g>';
    if (a.stripes) out += '<g stroke="' + a.dark + '" stroke-width="4" stroke-linecap="round"><path d="M52 24v9M60 22v11M68 24v9"/></g>';
    if (a.flower) out += hibiscus(84, 26, 13, '#FF6F91', '#FFE08A');
    if (a.leaf) out += '<path d="M62 22c8-12 22-12 26-8-6 2-12 8-26 8Z" fill="#5DBB63"/><path d="M62 22c8-4 16-7 24-8" stroke="#3E8E44" stroke-width="1.5" fill="none"/>';
    if (a.hat) {
      out += '<ellipse cx="60" cy="30" rx="44" ry="9" fill="#E8C57A" stroke="#B98F3E" stroke-width="2"/>' +
        '<path d="M36 30c0-16 10-22 24-22s24 6 24 22Z" fill="#F3D48E" stroke="#B98F3E" stroke-width="2"/>' +
        '<rect x="36" y="23" width="48" height="6" fill="#4FB3E8"/>' + hibiscus(78, 24, 8, '#FF6F91');
    }
    if (a.glasses) {
      out += '<g><rect x="33" y="46" width="22" height="15" rx="7" fill="#2A2230" opacity=".9"/>' +
        '<rect x="65" y="46" width="22" height="15" rx="7" fill="#2A2230" opacity=".9"/>' +
        '<path d="M55 52h10" stroke="#2A2230" stroke-width="3"/>' +
        '<path d="M37 50l6-2M69 50l6-2" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/></g>';
    }
    return out;
  }

  /** 動物頭像。mood：'happy'（預設）｜'shock'（收牌時） */
  function animalSvg(id, opt) {
    opt = opt || {};
    const a = ANIMAL_MAP[id] || ANIMALS[0];
    const g = nextId('ah'), s = nextId('as');
    const headShape = a.muzzle === 'capy'
      ? '<rect x="22" y="26" width="76" height="70" rx="32" fill="url(#' + g + ')"/>'
      : '<ellipse cx="60" cy="60" rx="38" ry="35" fill="url(#' + g + ')"/>';
    let face = muzzle(a);
    if (opt.mood === 'shock') {
      face = face.replace(/<path d="M5[34] [^"]*"[^>]*\/>/, '') +
        '<ellipse cx="60" cy="80" rx="5" ry="6.5" fill="#2A2230"/>';
    }
    return '<svg viewBox="0 0 120 120" class="animal ' + (opt.cls || '') + '" role="img" aria-label="' + a.name + '">' +
      '<defs><radialGradient id="' + g + '" cx="0.38" cy="0.32" r="0.8">' +
      '<stop offset="0" stop-color="' + a.light + '" stop-opacity=".55"/><stop offset=".45" stop-color="' + a.base + '"/>' +
      '<stop offset="1" stop-color="' + a.dark + '"/></radialGradient>' +
      '<linearGradient id="' + s + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a.shirt + '"/>' +
      '<stop offset="1" stop-color="' + shade(a.shirt) + '"/></linearGradient></defs>' +
      /* 花襯衫肩膀 */
      '<path d="M14 120c2-22 20-32 46-32s44 10 46 32Z" fill="url(#' + s + ')"/>' +
      '<path d="M50 90l10 14 10-14" fill="#fff" opacity=".85"/>' +
      hibiscus(30, 108, 7, 'rgba(255,255,255,.75)') + hibiscus(92, 110, 6, 'rgba(255,255,255,.75)') +
      ears(a, g) + headShape + extras(a) + face +
      '</svg>';
  }

  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.round(c * 0.72));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(c => c.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- 圖示 ---------- */

  function handIcon() {
    return '<svg viewBox="0 0 100 100" class="hand-icon" aria-hidden="true">' +
      '<g fill="#FFF7EE" stroke="#C4453E" stroke-width="3" stroke-linejoin="round">' +
      '<rect x="24" y="44" width="50" height="46" rx="20"/>' +
      '<rect x="27" y="14" width="11" height="42" rx="5.5"/>' +
      '<rect x="40" y="8" width="11" height="46" rx="5.5"/>' +
      '<rect x="53" y="10" width="11" height="44" rx="5.5"/>' +
      '<rect x="66" y="20" width="10" height="36" rx="5"/>' +
      '<rect x="6" y="46" width="10" height="30" rx="5" transform="rotate(-38 11 61)"/>' +
      '</g><path d="M34 64q14 8 30 0" stroke="#E7A79E" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  }

  function stackIcon() {
    return '<svg viewBox="0 0 24 24" class="stack-icon" aria-hidden="true">' +
      '<rect x="6" y="3" width="13" height="17" rx="2.5" fill="#2F5FB3" stroke="#fff" stroke-width="1.4" transform="rotate(10 12 12)"/>' +
      '<rect x="4" y="4" width="13" height="17" rx="2.5" fill="#3F7FD6" stroke="#fff" stroke-width="1.4"/>' +
      '<circle cx="10.5" cy="12.5" r="3" fill="#fff" opacity=".85"/></svg>';
  }

  function icon(name) {
    const w = inner => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    switch (name) {
      case 'gear': return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.4 3.5a8.4 8.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a8.2 8.2 0 0 0-2-1.2L15.6 3h-3.9l-.4 2.6a8.2 8.2 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a8.4 8.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a8.2 8.2 0 0 0 2 1.2l.4 2.6h3.9l.4-2.6a8.2 8.2 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z"/></svg>';
      case 'close': return w('<path d="M6 6l12 12M18 6 6 18"/>');
      case 'back': return w('<path d="M15 5l-7 7 7 7"/>');
      case 'pause': return w('<path d="M9 5v14M15 5v14"/>');
      case 'chat': return w('<path d="M4 5h16v11H9l-5 4z"/>');
      case 'info': return w('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>');
      case 'link': return w('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
      case 'send': return w('<path d="M4 12 20 4l-5 16-3-7z"/>');
      case 'robot': return w('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>');
      case 'eye': return w('<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>');
      case 'sound': return w('<path d="M5 9.5h3l4.5-3.5v12L8 14.5H5z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/>');
      case 'music': return w('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>');
      case 'voice': return w('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>');
      case 'feel': return w('<path d="M12 4.5v15M7.5 8v8M16.5 8v8M3.5 10.5v3M20.5 10.5v3"/>');
      case 'see': return w('<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>');
      case 'crown': return w('<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>');
      case 'plus': return w('<path d="M12 5v14M5 12h14"/>');
      case 'minus': return w('<path d="M5 12h14"/>');
      case 'kick': return w('<path d="M6 6l12 12M18 6 6 18"/>');
      case 'play': return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      default: return '';
    }
  }

  /** 把一段完整的 <svg> 放進另一張 SVG 的指定位置（巢狀 svg 要給 x/y/寬高，不能靠 CSS） */
  function nest(svg, x, y, w, h, rot) {
    const inner = svg.replace(/^<svg([^>]*)>/, (m, attrs) =>
      '<svg' + attrs.replace(/\sclass="[^"]*"/, '') + ' x="0" y="0" width="' + w + '" height="' + h + '">');
    return '<g transform="translate(' + x + ',' + y + ')' + (rot ? ' rotate(' + rot + ' ' + (w / 2) + ' ' + (h / 2) + ')' : '') + '">' + inner + '</g>';
  }

  /** 首頁主視覺：海島牌桌、三隻動物與一張翻開的 7 */
  function heroSvg() {
    return '<svg viewBox="0 0 360 220" class="hero-svg" aria-label="海島牌桌上，水獺、兔兔和企鵝正準備拍牌">' +
      '<ellipse cx="180" cy="176" rx="160" ry="40" fill="#4CC3C8" stroke="#B9824D" stroke-width="10"/>' +
      '<ellipse cx="180" cy="172" rx="132" ry="26" fill="#7FDCD8" opacity=".7"/>' +
      nest(animalSvg('otter'), 14, 58, 108, 108) +
      nest(animalSvg('bunny'), 238, 58, 108, 108) +
      nest(animalSvg('penguin'), 128, 10, 104, 104) +
      nest(cardBackSvg(), 138, 118, 58, 81, -10) +
      nest(cardSvg({ s: 'H', r: 7 }), 168, 110, 62, 87, 7) +
      '</svg>';
  }

  root.Art = {
    ANIMALS, ANIMAL_MAP, RANKS, SUIT_ZH,
    cardSvg, cardBackSvg, suitIcon, nest, suitColor, animalSvg, handIcon, stackIcon, icon, heroSvg, hibiscus
  };
})(typeof self !== 'undefined' ? self : this);
