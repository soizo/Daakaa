/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Pattern Definitions ────────────────────────────
var PATTERNS = {
  曜日: {
    values: ['㊐', '㊊', '㊋', '㊌', '㊍', '㊎', '㊏'],
    cyclic: true,
  },
  数字: {
    generate(start, step, count) {
      return Array.from({ length: count }, (_, i) => String(start + i * step));
    },
    cyclic: false,
  },
  農曆日: {
    values: [
      '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
      '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
      '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
    ],
    cyclic: true,
  },
  農曆月: {
    values: ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '臘月'],
    cyclic: true,
  },
  英文月: {
    values: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    cyclic: true,
  },
};

var PATTERN_NAMES = Object.keys(PATTERNS);

// ── Pattern Helpers ────────────────────────────────
function getPatternValues(hp, count) {
  if (hp.pattern === '自訂') {
    return Array.from({ length: count }, (_, i) => hp.values?.[i % hp.values.length] || '');
  }
  if (hp.pattern === '映射') {
    var source = state.headerPatterns[hp.sourceIndex];
    if (!source || source.pattern === '映射') return Array.from({ length: count }, () => '');
    var sourceVals = getPatternValues(source, count);
    return sourceVals.map(v => hp.mappings?.[String(v)] ?? '');
  }
  var p = PATTERNS[hp.pattern];
  if (!p) return Array.from({ length: count }, () => '');
  if (p.generate) {
    return p.generate(hp.start, hp.step, count);
  }
  var vals = p.values;
  var result = [];
  var idx = ((hp.start % vals.length) + vals.length) % vals.length;
  for (var i = 0; i < count; i++) {
    result.push(vals[idx]);
    idx = ((idx + hp.step) % vals.length + vals.length) % vals.length;
  }
  return result;
}

function getHeaderCellValue(h, c) {
  var key = `${h}_${c}`;
  if (state.headerOverrides[key] !== undefined) {
    return state.headerOverrides[key];
  }
  var hp = state.headerPatterns[h];
  if (!hp) return '';
  var vals = getPatternValues(hp, c + 1);
  return vals[c] || '';
}

function getCornerCellValue(h) {
  var key = `corner_${h}`;
  if (state.headerOverrides[key] !== undefined) {
    return state.headerOverrides[key];
  }
  return state.headerPatterns[h]?.pattern || '';
}

// ── Detect pattern from header values ──────────────
function detectPatternFromValues(values) {
  if (!values || values.length === 0) return null;

  // Try each cyclic pattern
  for (var _n = 0; _n < PATTERN_NAMES.length; _n++) {
    var name = PATTERN_NAMES[_n];
    var p = PATTERNS[name];
    if (!p.values) continue;
    var first = values[0];
    var startIdx = p.values.indexOf(String(first));
    if (startIdx === -1) continue;

    // Determine step from first two values
    var step = 1;
    if (values.length >= 2) {
      var secondIdx = p.values.indexOf(String(values[1]));
      if (secondIdx !== -1) {
        step = ((secondIdx - startIdx) % p.values.length + p.values.length) % p.values.length;
        if (step === 0) step = p.values.length; // full cycle
      } else {
        continue; // second value doesn't match
      }
    }

    // Verify at least a few more values match
    var match = true;
    var checkCount = Math.min(values.length, 7);
    for (var i = 0; i < checkCount; i++) {
      var expectedIdx = ((startIdx + i * step) % p.values.length + p.values.length) % p.values.length;
      if (String(values[i]) !== p.values[expectedIdx]) {
        match = false;
        break;
      }
    }
    if (match) {
      return { pattern: name, start: startIdx, step: step };
    }
  }

  // Try numeric pattern
  var nums = values.map((v) => Number(v));
  if (nums.every((n) => !isNaN(n))) {
    var start = nums[0];
    var step = nums.length >= 2 ? nums[1] - nums[0] : 1;
    // Verify
    var match = true;
    for (var i = 0; i < Math.min(nums.length, 7); i++) {
      if (nums[i] !== start + i * step) { match = false; break; }
    }
    if (match) {
      return { pattern: '数字', start: start, step: step };
    }
  }

  return null;
}

// Detect what the corner cell represents (pattern name)
function detectCornerPattern(cornerVal) {
  // Check if corner value is a known pattern value (e.g. "Apr" → 英文月)
  for (var _n = 0; _n < PATTERN_NAMES.length; _n++) {
    var name = PATTERN_NAMES[_n];
    var p = PATTERNS[name];
    if (!p.values) continue;
    if (p.values.includes(String(cornerVal))) {
      return name;
    }
  }
  return null;
}

// ── Today detection for numeric header corner cells ─
function isCornerCellToday(h) {
  var hp = state.headerPatterns[h];
  if (!hp || hp.pattern !== '数字') return false;

  var cornerVal = getCornerCellValue(h);
  var today = new Date();
  var todayDate = today.getDate();
  var todayMonth = today.getMonth(); // 0-indexed

  var engMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var engIdx = engMonths.indexOf(cornerVal);
  if (engIdx !== -1 && engIdx === todayMonth) {
    var vals = getPatternValues(hp, state.cols);
    return vals.includes(String(todayDate));
  }

  return false;
}
