/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Pattern Definitions ────────────────────────────
const PATTERNS = {
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

const PATTERN_NAMES = Object.keys(PATTERNS);

// ── State ──────────────────────────────────────────
const state = {
  cols: 7,
  headerPatterns: [
    { pattern: '曜日', start: 0, step: 1 },
  ],
  rows: [
    { name: 'Item 1', bold: false, underline: false },
    { name: 'Item 2', bold: false, underline: false },
    { name: 'Item 3', bold: false, underline: false },
  ],
  cells: {},
  headerOverrides: {},
  font: 'Sarasa UI CL',
  color: '#e0e0e0',
  colorTarget: 'header',
  zoom: 1,
  altCols: false,
  altRows: true,
  selectedRow: null,
  selection: null,
  selectedHeader: null, // {h, c} when a single header cell is selected for edit
  anchor: null,
  viewMode: false,
};

const CYCLE = ['✓', '×', '〇', '—', ''];

let hoveredCell = null;

// ── Input model detection (§2–3 of spec) ──────────
// Resolved once at boot. See decoupled-input-and-layout.md.
function detectTouchDevice() {
  // 1. URL param override — persists to localStorage.
  try {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('input');
    if (urlMode === 'touch' || urlMode === 'mouse') {
      localStorage.setItem('daakaa_input_mode', urlMode);
    } else if (urlMode === 'auto') {
      localStorage.removeItem('daakaa_input_mode');
    }
  } catch (_) {}

  // 2. localStorage manual override.
  try {
    const stored = localStorage.getItem('daakaa_input_mode');
    if (stored === 'touch') return true;
    if (stored === 'mouse') return false;
  } catch (_) {}

  // 3. UA Client Hints.
  if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;

  // 4. iPadOS masquerade (reports as Mac since iPadOS 13).
  if ((platform === 'MacIntel' || /Macintosh/.test(ua)) && maxTouch > 1) return true;

  // 5. Mobile/tablet UA string.
  if (/iPhone|iPad|iPod|Android|Mobile|Tablet|Silk|KFAPWI/i.test(ua)) return true;

  // 6. Touch capability fallback, but exclude desktop OSes to avoid
  //    classifying touch-screen laptops as touch.
  if (('ontouchstart' in window) && maxTouch > 0 && !/Windows NT|Macintosh|Linux x86/.test(ua)) {
    return true;
  }

  // 7. Default: mouse.
  return false;
}

const isTouchDevice = detectTouchDevice();

// Attach body classes once at boot; never removed.
document.body.classList.add(isTouchDevice ? 'input-touch' : 'input-mouse');

// ── Read-only helper (§7 of spec) ─────────────────
// Centralised guard for every content-editing entry point.
// View mode locks grid-data editing only — Style / Header Patterns
// / sidepanel config remain editable.
function isReadOnly() {
  return state.viewMode === true;
}

// Lock/unlock the Row Details panel's editable fields and the handful
// of toolbar buttons that mutate grid data. Style, Header Patterns, and
// other appearance/configuration controls remain editable per spec §7.
function applyViewModeLock() {
  const locked = isReadOnly();

  // Row Details form fields
  const rd = document.getElementById('row-details-body');
  if (rd) {
    rd.querySelectorAll('input, select, textarea, button').forEach((el) => {
      el.disabled = locked;
    });
  }

  // Grid-data toolbar buttons: add row and column count.
  // Header Patterns editor (incl. add-pattern) remains editable per
  // the resolved §9.1 decision — it is an appearance/configuration
  // control, not grid data.
  const toolbarIds = ['add-row-item', 'col-count'];
  toolbarIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });

  // History undo/redo buttons (touch only, but safe to set regardless)
  if ($btnUndo) $btnUndo.disabled = locked;
  if ($btnRedo) $btnRedo.disabled = locked;
}

// ── Undo Tree ─────────────────────────────────────
let undoTree = {};
let undoCurrentId = null;
let undoNextId = 1;
let lastVisitedChild = {};
const MAX_UNDO_NODES = 500;

function captureSnapshot() {
  return JSON.stringify({
    cells: state.cells,
    rows: state.rows,
    headerPatterns: state.headerPatterns,
    headerOverrides: state.headerOverrides,
    cols: state.cols,
  });
}

function restoreSnapshot(snapshot) {
  const s = JSON.parse(snapshot);
  state.cells = s.cells;
  state.rows = s.rows;
  state.headerPatterns = s.headerPatterns;
  state.headerOverrides = s.headerOverrides;
  state.cols = s.cols;
  state.selectedRow = null;
  $colCount.value = state.cols;
  renderPatternList();
  renderTable();
  saveState();
}

function saveUndoTree() {
  try {
    localStorage.setItem('daakaa-undo-tree', JSON.stringify({
      undoTree,
      undoCurrentId,
      undoNextId,
      lastVisitedChild,
    }));
  } catch (_) {}
}

function createRootNode() {
  const id = 0;
  undoTree = { [id]: {
    id,
    parentId: null,
    childIds: [],
    snapshot: captureSnapshot(),
    timestamp: Date.now(),
    actionLabel: 'Session start',
    branchLabel: null,
  }};
  undoCurrentId = id;
  undoNextId = 1;
  lastVisitedChild = {};
}

function commitUndoNode(actionLabel) {
  const node = {
    id: undoNextId++,
    parentId: undoCurrentId,
    childIds: [],
    snapshot: captureSnapshot(),
    timestamp: Date.now(),
    actionLabel: actionLabel || 'Edit',
    branchLabel: null,
  };
  undoTree[node.id] = node;
  undoTree[undoCurrentId].childIds.push(node.id);
  undoCurrentId = node.id;

  pruneTree();
  renderHistoryPanel();
  saveUndoTree();
  _lastModifiedAt = Date.now();
  updateLastSavedDisplay();
}

let _lastCommitTime = 0;
let _lastCommitLabel = '';
function commitUndoNodeThrottled(actionLabel) {
  const now = Date.now();
  if (now - _lastCommitTime > 500 || actionLabel !== _lastCommitLabel) {
    commitUndoNode(actionLabel);
    _lastCommitTime = now;
    _lastCommitLabel = actionLabel;
  } else {
    undoTree[undoCurrentId].snapshot = captureSnapshot();
    saveUndoTree();
  }
}

function undo() {
  const current = undoTree[undoCurrentId];
  if (!current || current.parentId === null) return;
  lastVisitedChild[current.parentId] = undoCurrentId;
  undoCurrentId = current.parentId;
  restoreSnapshot(undoTree[undoCurrentId].snapshot);
  renderHistoryPanel();
  saveUndoTree();
}

function redo() {
  const current = undoTree[undoCurrentId];
  if (!current || current.childIds.length === 0) return;
  const nextId = lastVisitedChild[undoCurrentId]
    || current.childIds[current.childIds.length - 1];
  if (!undoTree[nextId]) return;
  undoCurrentId = nextId;
  restoreSnapshot(undoTree[undoCurrentId].snapshot);
  renderHistoryPanel();
  saveUndoTree();
}

function jumpToNode(id) {
  if (!undoTree[id]) return;
  undoCurrentId = id;
  restoreSnapshot(undoTree[id].snapshot);
  renderHistoryPanel();
  saveUndoTree();
}

// ── Undo Tree: pruning ────────────────────────────
function pruneTree() {
  while (Object.keys(undoTree).length > MAX_UNDO_NODES) {
    const ancestors = getAncestorIds(undoCurrentId);
    let oldestLeaf = null;
    let oldestTime = Infinity;

    for (const id in undoTree) {
      const node = undoTree[id];
      if (node.childIds.length === 0 && !ancestors.has(+id) && +id !== undoCurrentId) {
        if (node.timestamp < oldestTime) {
          oldestTime = node.timestamp;
          oldestLeaf = +id;
        }
      }
    }

    if (oldestLeaf === null) break;
    removeNode(oldestLeaf);
  }
}

function getAncestorIds(id) {
  const set = new Set();
  let cur = id;
  while (cur !== null && undoTree[cur]) {
    set.add(cur);
    cur = undoTree[cur].parentId;
  }
  return set;
}

function removeNode(id) {
  const node = undoTree[id];
  if (!node) return;
  if (node.parentId !== null && undoTree[node.parentId]) {
    const parent = undoTree[node.parentId];
    parent.childIds = parent.childIds.filter(c => c !== id);
  }
  delete undoTree[id];
  delete lastVisitedChild[id];
}

// ── Undo Tree: history panel rendering ────────────
function renderHistoryPanel() {
  const panel = document.getElementById('history-panel');
  if (!panel) return;

  const pathSet = getAncestorIds(undoCurrentId);

  panel.innerHTML = renderTreeNode(0, pathSet);

  const currentEl = panel.querySelector('.history-node.current');
  if (currentEl) currentEl.scrollIntoView({ block: 'nearest' });

  panel.querySelectorAll('.history-node').forEach(el => {
    el.addEventListener('click', () => {
      jumpToNode(+el.dataset.nodeId);
    });
  });
}

function renderTreeNode(id, pathSet) {
  const node = undoTree[id];
  if (!node) return '';

  const isCurrent = id === undoCurrentId;
  const time = new Date(node.timestamp);
  const timeStr = String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
  const label = node.branchLabel || node.actionLabel;

  let html = `<div class="history-node${isCurrent ? ' current' : ''}" data-node-id="${id}">`;
  html += `<span class="history-node-marker"></span>`;
  html += `<span class="history-node-label">${esc(label)}</span>`;
  html += `<span class="history-node-time">${timeStr}</span>`;
  html += `</div>`;

  if (node.childIds.length > 0) {
    const onPathChildren = node.childIds.filter(cid => pathSet.has(cid));
    const offPathChildren = node.childIds.filter(cid => !pathSet.has(cid));

    for (const cid of onPathChildren) {
      html += renderTreeNode(cid, pathSet);
    }

    if (offPathChildren.length > 0) {
      html += `<div class="history-indent">`;
      for (const cid of offPathChildren) {
        html += renderTreeNode(cid, pathSet);
      }
      html += `</div>`;
    }
  }

  return html;
}

function countDescendants(id) {
  const node = undoTree[id];
  if (!node) return 0;
  let count = 1;
  for (const cid of node.childIds) count += countDescendants(cid);
  return count;
}

// ── DOM References ─────────────────────────────────
const $sidepanel = document.getElementById('sidepanel');
const $sidepanelToggle = document.getElementById('sidepanel-toggle');
const $table = document.getElementById('spreadsheet');
const $wrapper = document.getElementById('spreadsheet-wrapper');
const $colCount = document.getElementById('col-count');
const $fontFamily = document.getElementById('font-family');
const $themeColor = document.getElementById('theme-color');
const $colorTarget = document.getElementById('color-target');
const $patternList = document.getElementById('pattern-list');
const $addPattern = document.getElementById('add-pattern');
const $addRowItem = document.getElementById('add-row-item');
const $altColsToggle = document.getElementById('alt-cols-toggle');
const $altRowsToggle = document.getElementById('alt-rows-toggle');
const $btnImport = document.getElementById('btn-import');
const $btnExport = document.getElementById('btn-export');
const $btnProjExport = document.getElementById('btn-proj-export');
const $btnSave = document.getElementById('btn-save');
const $importFileInput = document.getElementById('import-file-input');
const $rowDetailsBody = document.getElementById('row-details-body');
const $btnUndo = document.getElementById('btn-undo');
const $btnRedo = document.getElementById('btn-redo');

// ── Bottom Mode (responsive) ──────────────────────
let isBottomMode = false;
const mql = window.matchMedia('(max-width: 768px)');
let _savedPanelStates = {}; // { tabId: boolean }

function updateLayoutMode() {
  const wasBottom = isBottomMode;
  isBottomMode = mql.matches;

  if (isBottomMode && !wasBottom) {
    // Entering bottom mode — preserve desktop width, clear inline width/height.
    // NOTE: Do NOT read offsetWidth here. By the time this runs, the
    // (max-width:768px) media query already forces width:100% !important, so
    // offsetWidth would return the viewport width and corrupt the saved
    // desktop width. _lastSidepanelWidth is maintained by the resize handler.
    $sidepanel.style.width = '';
    $sidepanel.style.minWidth = '';
    $sidepanel.style.height = _lastBottomPanelHeight + 'px';
    // Save current open states, then force all open
    document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
      _savedPanelStates[p.dataset.tabId] = p.open;
      p.open = true;
    });
    // Set active tab from first previously-open panel
    let activeTab = null;
    for (const [tabId, wasOpen] of Object.entries(_savedPanelStates)) {
      if (wasOpen && !activeTab) activeTab = tabId;
    }
    setActiveTab(activeTab || (isTouchDevice ? 'rows' : 'rows'));
  } else if (!isBottomMode && wasBottom) {
    // Leaving bottom mode — clear inline height from bottom-panel drag,
    // restore width/minWidth for desktop, and restore saved open states
    $sidepanel.style.height = '';
    if (!$sidepanel.classList.contains('collapsed')) {
      $sidepanel.style.width = _lastSidepanelWidth + 'px';
      $sidepanel.style.minWidth = _lastSidepanelWidth + 'px';
    }
    document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
      if (_savedPanelStates.hasOwnProperty(p.dataset.tabId)) {
        p.open = _savedPanelStates[p.dataset.tabId];
      }
      p.classList.remove('active-tab');
    });
  }
}

mql.addEventListener('change', updateLayoutMode);

function setActiveTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.bottom-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  // Update panels
  document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
    p.classList.toggle('active-tab', p.dataset.tabId === tabId);
    if (p.dataset.tabId === tabId) {
      p.open = true;  // Force open so content is visible
    }
  });
  // Expand sidepanel if collapsed
  if ($sidepanel.classList.contains('collapsed') && isBottomMode) {
    $sidepanel.classList.remove('collapsed');
    $sidepanel.style.height = _lastBottomPanelHeight + 'px';
  }
  // Task 3: auto-scroll history panel to current node when Hist tab opens.
  if (tabId === 'hist') {
    scrollHistoryToCurrentNode();
  }
}

// Find a today column index (0-based) if one exists in the current pattern.
// Returns the column index, or -1 if today is not in the pattern.
function findTodayColumnIndex() {
  const hpats = state.headerPatterns;
  for (let h = 0; h < hpats.length; h++) {
    if (!isCornerCellToday(h)) continue;
    const todayDate = new Date().getDate();
    const allVals = getPatternValues(hpats[h], state.cols);
    for (let c = 0; c < allVals.length; c++) {
      if (String(allVals[c]) === String(todayDate)) return c;
    }
  }
  return -1;
}

// Scroll the spreadsheet wrapper so today's column is visible (roughly centred).
function scrollToTodayColumn() {
  const colIdx = findTodayColumnIndex();
  if (colIdx < 0) return;
  // Find the corresponding <th> in the first header row.
  const th = $table.querySelector(`thead th[data-col="${colIdx}"]`);
  if (!th) return;
  // Centre the column horizontally within the wrapper.
  const thRect = th.getBoundingClientRect();
  const wrapRect = $wrapper.getBoundingClientRect();
  const thCentreRelative = (th.offsetLeft + th.offsetWidth / 2);
  const targetScrollLeft = thCentreRelative - (wrapRect.width / 2);
  $wrapper.scrollLeft = Math.max(0, targetScrollLeft);
}

// Scroll the history panel so the current node is visible.
function scrollHistoryToCurrentNode() {
  const panel = document.getElementById('history-panel');
  if (!panel) return;
  const currentEl = panel.querySelector('.history-node.current');
  if (currentEl) {
    // Use requestAnimationFrame to ensure layout is settled after tab switch.
    requestAnimationFrame(() => {
      currentEl.scrollIntoView({ block: 'nearest' });
    });
  }
}

let _lastBottomPanelHeight = 240;
let _lastSidepanelWidth = 280;

// ── Focus Gate ─────────────────────────────────────
// When the page regains focus, the first click only refocuses — no action.
// mousedown is NOT blocked so focus transfer and scroll targeting work normally.
let _pageFocused = document.hasFocus();
let _refocusClick = false; // true during the mousedown→click of a refocus sequence

window.addEventListener('blur', () => { _pageFocused = false; });
window.addEventListener('focus', () => { /* _pageFocused set in mousedown/keydown */ });

document.addEventListener('mousedown', () => {
  if (!_pageFocused) {
    _refocusClick = true;
    _pageFocused = true;
  }
}, true);

document.addEventListener('click', (e) => {
  if (_refocusClick) {
    _refocusClick = false;
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

document.addEventListener('touchstart', () => {
  if (!_pageFocused) {
    _refocusClick = true;
    _pageFocused = true;
  }
}, true);

document.addEventListener('touchend', (e) => {
  if (_refocusClick) {
    _refocusClick = false;
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

document.addEventListener('keydown', () => { _pageFocused = true; }, true);

// ── Pattern Helpers ────────────────────────────────
function getPatternValues(hp, count) {
  if (hp.pattern === '自訂') {
    return Array.from({ length: count }, (_, i) => hp.values?.[i % hp.values.length] || '');
  }
  if (hp.pattern === '映射') {
    const source = state.headerPatterns[hp.sourceIndex];
    if (!source || source.pattern === '映射') return Array.from({ length: count }, () => '');
    const sourceVals = getPatternValues(source, count);
    return sourceVals.map(v => hp.mappings?.[String(v)] ?? '');
  }
  const p = PATTERNS[hp.pattern];
  if (!p) return Array.from({ length: count }, () => '');
  if (p.generate) {
    return p.generate(hp.start, hp.step, count);
  }
  const vals = p.values;
  const result = [];
  let idx = ((hp.start % vals.length) + vals.length) % vals.length;
  for (let i = 0; i < count; i++) {
    result.push(vals[idx]);
    idx = ((idx + hp.step) % vals.length + vals.length) % vals.length;
  }
  return result;
}

function getHeaderCellValue(h, c) {
  const key = `${h}_${c}`;
  if (state.headerOverrides[key] !== undefined) {
    return state.headerOverrides[key];
  }
  const hp = state.headerPatterns[h];
  if (!hp) return '';
  const vals = getPatternValues(hp, c + 1);
  return vals[c] || '';
}

function getCornerCellValue(h) {
  const key = `corner_${h}`;
  if (state.headerOverrides[key] !== undefined) {
    return state.headerOverrides[key];
  }
  return state.headerPatterns[h]?.pattern || '';
}

// ── Detect pattern from header values ──────────────
function detectPatternFromValues(values) {
  if (!values || values.length === 0) return null;

  // Try each cyclic pattern
  for (const name of PATTERN_NAMES) {
    const p = PATTERNS[name];
    if (!p.values) continue;
    const first = values[0];
    const startIdx = p.values.indexOf(String(first));
    if (startIdx === -1) continue;

    // Determine step from first two values
    let step = 1;
    if (values.length >= 2) {
      const secondIdx = p.values.indexOf(String(values[1]));
      if (secondIdx !== -1) {
        step = ((secondIdx - startIdx) % p.values.length + p.values.length) % p.values.length;
        if (step === 0) step = p.values.length; // full cycle
      } else {
        continue; // second value doesn't match
      }
    }

    // Verify at least a few more values match
    let match = true;
    const checkCount = Math.min(values.length, 7);
    for (let i = 0; i < checkCount; i++) {
      const expectedIdx = ((startIdx + i * step) % p.values.length + p.values.length) % p.values.length;
      if (String(values[i]) !== p.values[expectedIdx]) {
        match = false;
        break;
      }
    }
    if (match) {
      return { pattern: name, start: startIdx, step };
    }
  }

  // Try numeric pattern
  const nums = values.map((v) => Number(v));
  if (nums.every((n) => !isNaN(n))) {
    const start = nums[0];
    const step = nums.length >= 2 ? nums[1] - nums[0] : 1;
    // Verify
    let match = true;
    for (let i = 0; i < Math.min(nums.length, 7); i++) {
      if (nums[i] !== start + i * step) { match = false; break; }
    }
    if (match) {
      return { pattern: '数字', start, step };
    }
  }

  return null;
}

// Detect what the corner cell represents (pattern name)
function detectCornerPattern(cornerVal) {
  // Check if corner value is a known pattern value (e.g. "Apr" → 英文月)
  for (const name of PATTERN_NAMES) {
    const p = PATTERNS[name];
    if (!p.values) continue;
    if (p.values.includes(String(cornerVal))) {
      return name;
    }
  }
  return null;
}

// ── Today detection for numeric header corner cells ─
function isCornerCellToday(h) {
  const hp = state.headerPatterns[h];
  if (!hp || hp.pattern !== '数字') return false;

  const cornerVal = getCornerCellValue(h);
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth(); // 0-indexed

  const engMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const engIdx = engMonths.indexOf(cornerVal);
  if (engIdx !== -1 && engIdx === todayMonth) {
    const vals = getPatternValues(hp, state.cols);
    return vals.includes(String(todayDate));
  }

  return false;
}

// ── Render Spreadsheet ─────────────────────────────
function renderTable() {
  const cols = state.cols;
  const rows = state.rows;
  const hpats = state.headerPatterns;

  let html = '';

  html += '<colgroup>';
  html += '<col style="width:auto; min-width:calc(80px * var(--zoom));">';
  for (let c = 0; c < cols; c++) {
    html += '<col style="width:auto; min-width:var(--cell-min-w);">';
  }
  html += '</colgroup>';

  html += '<thead>';
  for (let h = 0; h < hpats.length; h++) {
    html += `<tr data-header-row="${h}">`;
    const cornerVal = getCornerCellValue(h);
    const todayBold = isCornerCellToday(h) ? 'font-weight:700;' : '';
    html += `<th class="corner-cell" data-header-row="${h}" style="top:calc(${h} * var(--cell-h) * var(--zoom));${todayBold}">${esc(cornerVal)}</th>`;
    let todayCols = null;
    if (isCornerCellToday(h)) {
      const todayDate = new Date().getDate();
      const allVals = getPatternValues(hpats[h], cols);
      todayCols = new Set();
      allVals.forEach((v, i) => { if (String(v) === String(todayDate)) todayCols.add(i); });
    }
    for (let c = 0; c < cols; c++) {
      const val = getHeaderCellValue(h, c);
      const isTodayCol = todayCols && todayCols.has(c);
      const todayStyle = isTodayCol ? 'font-weight:700;' : '';
      html += `<th data-header-row="${h}" data-col="${c}" style="top:calc(${h} * var(--cell-h) * var(--zoom));${todayStyle}">${esc(val)}</th>`;
    }
    html += '</tr>';
  }
  html += '</thead>';

  html += '<tbody>';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isSelected = state.selectedRow === r;
    html += `<tr data-row="${r}">`;

    let leftStyle = '';
    if (row.bold) leftStyle += 'font-weight:700;';
    if (row.underline) leftStyle += 'text-decoration:underline;';
    if (isSelected) leftStyle += 'background:var(--accent);';

    html += `<td class="sticky-left" data-row="${r}" style="${leftStyle}">${esc(row.name)}</td>`;

    for (let c = 0; c < cols; c++) {
      const val = getCellValue(r, c);
      const hasArrow = val.includes('←') ? 'true' : 'false';
      html += `<td class="content-cell" data-row="${r}" data-col="${c}" data-value="${escAttr(val)}" data-has-arrow="${hasArrow}">${esc(val)}</td>`;
    }
    html += '</tr>';
  }
  html += `<tr class="add-row-strip"><td colspan="${cols + 1}" class="add-row-cell"></td></tr>`;
  html += '</tbody>';

  $table.innerHTML = html;
  bindTableEvents();
  updateRowDetailsPanel();
  updateSelectionVisual();
}

function updateSelectionVisual() {
  $table.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
  if (!state.selection) return;
  const { r1, c1, r2, c2 } = state.selection;
  $table.querySelectorAll('.content-cell').forEach(td => {
    const r = +td.dataset.row;
    const c = +td.dataset.col;
    if (r >= r1 && r <= r2 && c >= c1 && c <= c2) {
      td.classList.add('cell-selected');
    }
  });
}

function getCellValue(r, c) {
  return (state.cells[r] && state.cells[r][c]) || '';
}

function setCellValue(r, c, v) {
  if (!state.cells[r]) state.cells[r] = {};
  state.cells[r][c] = v;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── Table Event Binding ────────────────────────────
function bindTableEvents() {
  $table.querySelectorAll('.content-cell').forEach((td) => {
    td.addEventListener('click', (e) => {
      if (isModalOpen()) return;
      const r = +td.dataset.row;
      const c = +td.dataset.col;

      // Shift+click: extend selection, do NOT cycle
      if (e.shiftKey && state.anchor) {
        state.selection = {
          r1: Math.min(state.anchor.r, r),
          c1: Math.min(state.anchor.c, c),
          r2: Math.max(state.anchor.r, r),
          c2: Math.max(state.anchor.c, c),
        };
        updateSelectionVisual();
        return;
      }

      // Normal click: set anchor. On touch, also promote to a single-cell
      // selection so the Row Details cell editor sub-panel can render
      // (touch users have no inline edit path). On mouse, keep the
      // legacy behaviour — selection is only set via shift-click.
      state.anchor = { r, c };
      state.selectedHeader = null;
      if (isTouchDevice) {
        state.selection = { r1: r, c1: c, r2: r, c2: c };
      } else {
        state.selection = null;
      }
      updateSelectionVisual();

      if (!isReadOnly()) {
        const cur = getCellValue(r, c);

        // Arrow-prefixed value (←N✓): on mouse, inline edit the number instead
        // of cycling. On touch, inline edit is disabled — cycle through instead
        // (edits happen via Row Details / context menu long-press).
        const arrowMatch = !isTouchDevice && /^←(\d+)✓$/.exec(cur);
        if (arrowMatch) {
          // Prevent duplicate editors
          if (td.querySelector('input')) return;
          const oldNum = arrowMatch[1];
          td.classList.add('cell-editing');
          td.textContent = '';
          const input = document.createElement('input');
          input.type = 'number';
          input.value = oldNum;
          input.min = '0';
          td.appendChild(input);
          input.focus();
          input.select();

          commitUndoNode('Edit arrow count');
          const commit = () => {
            const n = input.value.replace(/\D/g, '') || '0';
            const next = `←${n}✓`;
            setCellValue(r, c, next);
            td.dataset.value = next;
            td.dataset.hasArrow = 'true';
            td.textContent = next;
            td.classList.remove('cell-editing');
            saveState();
          };
          const cancel = () => {
            td.textContent = cur;
            td.classList.remove('cell-editing');
          };
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          });
          input.addEventListener('blur', commit);
          updateSelectionVisual();
          return;
        }

        // Default cycle behaviour: ✓ × 〇 — (empty)
        const base = cur.includes('←') ? '' : cur;
        const idx = CYCLE.indexOf(base);
        const next = CYCLE[(idx + 1) % CYCLE.length];
        commitUndoNodeThrottled('Toggle cell');
        setCellValue(r, c, next);
        td.dataset.value = next;
        td.dataset.hasArrow = 'false';
        td.textContent = next;
        saveState();
      }
      updateSelectionVisual();
      updateRowDetailsPanel();
    });

    td.addEventListener('mouseenter', () => {
      hoveredCell = { r: +td.dataset.row, c: +td.dataset.col };
    });
    td.addEventListener('mouseleave', () => {
      hoveredCell = null;
    });

    td.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isReadOnly()) return;
      const r = +td.dataset.row;
      const c = +td.dataset.col;

      if (state.selection) {
        const { r1, c1, r2, c2 } = state.selection;
        const isMulti = (r2 - r1 + c2 - c1) > 0;
        const isInside = r >= r1 && r <= r2 && c >= c1 && c <= c2;
        if (isMulti && isInside) {
          showBatchContextMenu(e.clientX, e.clientY);
          return;
        }
      }

      showContentContextMenu(e.clientX, e.clientY, r, c);
    });
  });

  $table.querySelectorAll('thead th').forEach((th) => {
    th.addEventListener('click', () => {
      if (isModalOpen()) return;
      state.selection = null;
      state.anchor = null;
      // Corner cell: no per-cell override path — corner label field owns it.
      if (th.classList.contains('corner-cell')) {
        state.selectedHeader = null;
      } else if (th.dataset.headerRow !== undefined && th.dataset.col !== undefined) {
        state.selectedHeader = { h: +th.dataset.headerRow, c: +th.dataset.col };
      } else {
        state.selectedHeader = null;
      }
      updateSelectionVisual();
      updateRowDetailsPanel();
      renderSelectedHeaderField();
    });
    th.addEventListener('dblclick', () => {
      if (isReadOnly()) return;
      if (isTouchDevice) return;
      startHeaderCellEdit(th);
    });
  });

  const addRowCell = $table.querySelector('.add-row-cell');
  if (addRowCell) {
    addRowCell.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Add row');
      state.rows.push({ name: `Item ${state.rows.length + 1}`, bold: false, underline: false });
      renderTable();
      saveState();
    });
  }

  bindStickyLeftInteractions();
}

// ── Sticky-left: drag vs dblclick ──────────────────
function bindStickyLeftInteractions() {
  const tbody = $table.querySelector('tbody');
  if (!tbody) return;
  const trs = Array.from(tbody.querySelectorAll('tr[data-row]'));

  trs.forEach((tr) => {
    const leftCell = tr.querySelector('.sticky-left');
    if (!leftCell) return;
    const rowIdx = +tr.dataset.row;

    let mouseDownPos = null;
    let isDragging = false;
    const DRAG_THRESHOLD = 5;

    leftCell.addEventListener('mousedown', (e) => {
      if (isModalOpen()) return;
      if (e.button !== 0) return;
      if (isTouchDevice) return; // touch devices use the touchstart path below
      if (leftCell.classList.contains('cell-editing')) return;
      if (isReadOnly()) {
        // In view mode: allow normal row selection via click, no drag.
        state.anchor = { r: rowIdx, c: 0 };
        selectRow(rowIdx);
        return;
      }

      mouseDownPos = { x: e.clientX, y: e.clientY };
      isDragging = false;
      const wasShift = e.shiftKey;

      const onMove = (ev) => {
        if (!mouseDownPos) return;
        const dx = ev.clientX - mouseDownPos.x;
        const dy = ev.clientY - mouseDownPos.y;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD && !isDragging) {
          isDragging = true;
          startRowDrag(tr, rowIdx, mouseDownPos.y);
        }
        if (isDragging) {
          handleRowDragMove(ev);
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (isDragging) {
          finishRowDrag();
        } else if (wasShift && state.anchor) {
          const r1 = Math.min(state.anchor.r, rowIdx);
          const r2 = Math.max(state.anchor.r, rowIdx);
          state.selection = { r1, c1: 0, r2, c2: state.cols - 1 };
          updateSelectionVisual();
        } else {
          state.anchor = { r: rowIdx, c: 0 };
          selectRow(rowIdx);
        }
        mouseDownPos = null;
        isDragging = false;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    leftCell.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (isReadOnly()) return;
      if (isTouchDevice) return;
      startStickyLeftEdit(leftCell, rowIdx);
    });

    leftCell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isReadOnly()) return;
      if (state.selection) {
        const { r1, r2, c1, c2 } = state.selection;
        const isFullWidth = c1 === 0 && c2 === state.cols - 1;
        const isMulti = r2 > r1;
        if (isMulti && isFullWidth && rowIdx >= r1 && rowIdx <= r2) {
          showBatchContextMenu(e.clientX, e.clientY);
          return;
        }
      }
      showRowContextMenu(e.clientX, e.clientY, rowIdx);
    });

    // ── Touch path (sticky-left) ────────────────────
    // State machine per spec §6.2:
    //   t < 250 ms + movement  → scroll wins, cancel everything
    //   t >= 250 ms, still still → drag armed
    //     then movement > 6 px  → start row drag
    //     then release < 600 ms → context menu
    //   release before 250 ms, no movement → tap = select row
    let touchArmTimer = null;
    let touchCtxTimer = null;
    let touchStartXY = null;
    let touchArmed = false;     // drag armed after 250ms
    let touchDragging = false;  // drag actively started
    let touchContextShown = false;
    const TOUCH_ARM_MS = 250;
    const TOUCH_CTX_MS = 600;
    const TOUCH_MOVE_PX = 6;

    const clearTouchTimers = () => {
      if (touchArmTimer) { clearTimeout(touchArmTimer); touchArmTimer = null; }
      if (touchCtxTimer) { clearTimeout(touchCtxTimer); touchCtxTimer = null; }
    };

    leftCell.addEventListener('touchstart', (e) => {
      if (!isTouchDevice) return;
      // Multi-touch (e.g. pinch-zoom): cancel any armed long-press/drag and bail.
      if (e.touches.length > 1) {
        clearTouchTimers();
        touchStartXY = null;
        touchArmed = false;
        if (touchDragging) finishRowDrag();
        touchDragging = false;
        return;
      }
      if (isModalOpen()) return;
      const touch = e.touches[0];
      touchStartXY = { x: touch.clientX, y: touch.clientY };
      touchArmed = false;
      touchDragging = false;
      touchContextShown = false;

      if (!isReadOnly()) {
        touchArmTimer = setTimeout(() => {
          touchArmTimer = null;
          touchArmed = true;
        }, TOUCH_ARM_MS);

        touchCtxTimer = setTimeout(() => {
          touchCtxTimer = null;
          if (touchDragging) return;
          touchContextShown = true;
          showRowContextMenu(touch.clientX, touch.clientY, rowIdx);
        }, TOUCH_CTX_MS);
      }
    }, { passive: true });

    leftCell.addEventListener('touchmove', (e) => {
      if (!isTouchDevice) return;
      if (!touchStartXY) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartXY.x;
      const dy = touch.clientY - touchStartXY.y;
      const moved = Math.abs(dx) + Math.abs(dy);

      if (!touchArmed) {
        // Movement before arm → scroll wins, cancel all timers
        if (moved > TOUCH_MOVE_PX) {
          clearTouchTimers();
          touchStartXY = null;
        }
        return;
      }

      if (touchArmed && !touchDragging && moved > TOUCH_MOVE_PX) {
        // Start drag. Cancel context-menu timer.
        if (touchCtxTimer) { clearTimeout(touchCtxTimer); touchCtxTimer = null; }
        touchDragging = true;
        const tr = leftCell.closest('tr');
        startRowDrag(tr, rowIdx, touch.clientY);
      }

      if (touchDragging) {
        handleRowDragMove({ clientX: touch.clientX, clientY: touch.clientY });
        // Prevent native scroll while dragging a row.
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    leftCell.addEventListener('touchend', () => {
      if (!isTouchDevice) return;
      clearTouchTimers();
      if (touchDragging) {
        finishRowDrag();
      } else if (!touchContextShown && touchStartXY) {
        // Simple tap → select row (if arm never fired and no movement)
        selectRow(rowIdx);
      }
      touchStartXY = null;
      touchArmed = false;
      touchDragging = false;
      touchContextShown = false;
    }, { passive: true });

    leftCell.addEventListener('touchcancel', () => {
      clearTouchTimers();
      if (touchDragging) finishRowDrag();
      touchStartXY = null;
      touchArmed = false;
      touchDragging = false;
      touchContextShown = false;
    }, { passive: true });
  });
}

// ── Row selection ──────────────────────────────────
function selectRow(idx) {
  state.selectedRow = (state.selectedRow === idx) ? null : idx;
  // Per sidepanel-editing-coverage.md resolution #5, state.selectedRow and
  // state.selection may coexist. Do not clear state.selection here.
  state.anchor = null;
  $table.querySelectorAll('.sticky-left').forEach((td) => {
    const r = +td.dataset.row;
    td.style.background = r === state.selectedRow ? 'var(--accent)' : '#fff';
  });
  updateRowDetailsPanel();
  updateSelectionVisual();
}

// ── Row Details sidepanel ──────────────────────────
function buildCellEditorHTML() {
  // Renders the cell editor sub-panel markup for the current selection.
  // Returns '' when no content-cell selection exists.
  if (!state.selection) return '';
  const { r1, c1, r2, c2 } = state.selection;
  const single = (r1 === r2 && c1 === c2);
  const count = (r2 - r1 + 1) * (c2 - c1 + 1);
  const curVal = single ? getCellValue(r1, c1) : '';
  const arrowMatch = single ? /^←(\d+)✓$/.exec(curVal) : null;

  let body = '';
  if (arrowMatch) {
    const n = arrowMatch[1];
    body = `
      <div class="cell-editor-label">Arrow count</div>
      <div class="arrow-count-editor">
        <button class="btn btn-sm arrow-count-dec" title="Decrement">−</button>
        <input type="number" class="arrow-count-input" min="0" value="${esc(n)}">
        <button class="btn btn-sm arrow-count-inc" title="Increment">+</button>
      </div>
      <div class="btn-row" style="margin-top:6px;">
        <button class="btn btn-sm arrow-count-clear">Clear</button>
      </div>
    `;
  } else {
    const label = single
      ? 'Cell value'
      : `${count} cells selected`;
    const vals = ['✓', '×', '〇', '—', ''];
    const labels = { '✓': '✓', '×': '×', '〇': '〇', '—': '—', '': '∅' };
    const activeVal = single ? curVal : null;
    const btns = vals.map((v) => {
      const isActive = v === activeVal ? ' active' : '';
      return `<button class="cell-val-btn${isActive}" data-value="${escAttr(v)}">${esc(labels[v])}</button>`;
    }).join('');
    const customHint = (single && curVal && !vals.includes(curVal))
      ? `<div class="cell-editor-hint">Current: ${esc(curVal)}</div>`
      : '';
    body = `
      <div class="cell-editor-label">${esc(label)}</div>
      <div class="cell-value-buttons">${btns}</div>
      ${customHint}
    `;
  }

  return `<hr class="row-cell-separator"><div class="row-cell-editor">${body}</div>`;
}

function bindCellEditorEvents() {
  const editor = $rowDetailsBody.querySelector('.row-cell-editor');
  if (!editor) return;
  if (!state.selection) return;
  const { r1, c1, r2, c2 } = state.selection;

  const applyValueToSelection = (v) => {
    if (isReadOnly()) return;
    commitUndoNode('Set cell');
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        setCellValue(r, c, v);
      }
    }
    renderTable();
    saveState();
  };

  editor.querySelectorAll('.cell-val-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyValueToSelection(btn.dataset.value);
    });
  });

  const numInput = editor.querySelector('.arrow-count-input');
  const dec = editor.querySelector('.arrow-count-dec');
  const inc = editor.querySelector('.arrow-count-inc');
  const clearBtn = editor.querySelector('.arrow-count-clear');

  const writeArrow = (n) => {
    if (isReadOnly()) return;
    const clean = Math.max(0, parseInt(n, 10) || 0);
    setCellValue(r1, c1, `←${clean}✓`);
    renderTable();
    saveState();
  };

  if (numInput) {
    numInput.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit arrow count');
      writeArrow(numInput.value);
    });
  }
  if (dec) {
    dec.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Edit arrow count');
      const cur = parseInt((numInput && numInput.value) || '0', 10) || 0;
      writeArrow(Math.max(0, cur - 1));
    });
  }
  if (inc) {
    inc.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Edit arrow count');
      const cur = parseInt((numInput && numInput.value) || '0', 10) || 0;
      writeArrow(cur + 1);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Clear arrow count');
      // Resolution #4: clear destination = empty.
      setCellValue(r1, c1, '');
      renderTable();
      saveState();
    });
  }
}

function updateRowDetailsPanel() {
  const idx = state.selectedRow;
  const hasRow = (idx !== null && idx !== undefined && state.rows[idx]);
  const hasSel = !!state.selection;

  if (!hasRow && !hasSel) {
    const hint = isTouchDevice
      ? 'Tap a row label to select it. Press and hold to reorder. Long-press for more options.'
      : 'Double-click a row label to edit. Drag to reorder. Right-click for more options.';
    $rowDetailsBody.innerHTML = `<p class="row-details-info">${hint}</p>`;
    return;
  }

  if (!hasRow && hasSel) {
    // Scenario 2: cell selected, no row selected.
    $rowDetailsBody.innerHTML = `
      <p class="row-details-info">Tap a row label to see row details.</p>
      ${buildCellEditorHTML()}
    `;
    bindCellEditorEvents();
    applyViewModeLock();
    return;
  }

  const row = state.rows[idx];
  $rowDetailsBody.innerHTML = `
    <div class="row-details-selection">
      <div class="row-detail-name-row">
        <input class="row-detail-name-input" type="text" id="rd-name" value="${escAttr(row.name)}"
          style="font-weight:${row.bold ? '700' : '400'};text-decoration:${row.underline ? 'underline' : 'none'};">
      </div>
      <div class="row-detail-toggles">
        <button id="rd-bold" class="${row.bold ? 'active' : ''}" title="Bold"><b>B</b></button>
        <button id="rd-underline" class="${row.underline ? 'active' : ''}" title="Underline"><u>U</u></button>
      </div>
      ${hasSel ? buildCellEditorHTML() : ''}
      <div class="row-detail-actions" style="display:flex;align-items:center;gap:6px;margin-top:6px;">
        <span style="font-size:11px;">Move to</span>
        <input type="number" id="rd-move-target" min="1" max="${state.rows.length}" value="${idx + 1}"
          style="width:48px;height:22px;padding:0 4px;border:1px solid var(--border);font-family:var(--font);font-size:12px;">
        <button id="rd-move-btn" class="btn btn-sm">⏎</button>
        <span style="flex:1;"></span>
        <button id="rd-delete" class="btn btn-sm" style="color:#c0392b;">Delete</button>
      </div>
    </div>
  `;

  if (hasSel) bindCellEditorEvents();

  const nameInput = document.getElementById('rd-name');
  nameInput.addEventListener('input', () => {
    commitUndoNodeThrottled('Rename row');
    state.rows[idx].name = nameInput.value;
    const cell = $table.querySelector(`.sticky-left[data-row="${idx}"]`);
    if (cell && !cell.classList.contains('cell-editing')) {
      cell.textContent = nameInput.value;
    }
    saveState();
  });

  document.getElementById('rd-bold').addEventListener('click', () => {
    commitUndoNode('Toggle bold');
    state.rows[idx].bold = !state.rows[idx].bold;
    nameInput.style.fontWeight = state.rows[idx].bold ? '700' : '400';
    renderTable();
    saveState();
  });

  document.getElementById('rd-underline').addEventListener('click', () => {
    commitUndoNode('Toggle underline');
    state.rows[idx].underline = !state.rows[idx].underline;
    nameInput.style.textDecoration = state.rows[idx].underline ? 'underline' : 'none';
    renderTable();
    saveState();
  });

  document.getElementById('rd-move-btn').addEventListener('click', () => {
    const target = Math.max(1, Math.min(state.rows.length, +document.getElementById('rd-move-target').value || 1)) - 1;
    if (target !== idx) {
      commitUndoNode('Move row');
      state.selectedRow = target;
      moveRow(idx, target);
      renderTable();
      saveState();
    }
  });

  document.getElementById('rd-delete').addEventListener('click', () => {
    commitUndoNode('Delete row');
    deleteRow(idx);
  });

  // Re-apply view-mode lock since we just rebuilt the panel's inputs.
  applyViewModeLock();
}

// ── Inline Editing: Sticky-left cells ──────────────
function startStickyLeftEdit(cell, rowIdx) {
  if (cell.classList.contains('cell-editing')) return;
  commitUndoNode('Edit row name');
  const row = state.rows[rowIdx];
  const oldText = row.name;

  cell.classList.add('cell-editing');
  cell.innerHTML = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldText;
  input.style.fontWeight = row.bold ? '700' : '400';
  input.style.textDecoration = row.underline ? 'underline' : 'none';
  cell.appendChild(input);

  const toolbar = document.createElement('div');
  toolbar.className = 'cell-edit-toolbar';
  const cellRect = cell.getBoundingClientRect();
  toolbar.style.left = cellRect.left + 'px';
  toolbar.style.top = (cellRect.bottom + 2) + 'px';

  const btnBold = document.createElement('button');
  btnBold.innerHTML = '<b>B</b>';
  btnBold.title = 'Bold';
  if (row.bold) btnBold.classList.add('active');
  btnBold.addEventListener('mousedown', (e) => {
    e.preventDefault();
    commitUndoNode('Toggle format');
    row.bold = !row.bold;
    btnBold.classList.toggle('active', row.bold);
    input.style.fontWeight = row.bold ? '700' : '400';
    saveState();
  });

  const btnUnderline = document.createElement('button');
  btnUnderline.innerHTML = '<u>U</u>';
  btnUnderline.title = 'Underline';
  if (row.underline) btnUnderline.classList.add('active');
  btnUnderline.addEventListener('mousedown', (e) => {
    e.preventDefault();
    commitUndoNode('Toggle format');
    row.underline = !row.underline;
    btnUnderline.classList.toggle('active', row.underline);
    input.style.textDecoration = row.underline ? 'underline' : 'none';
    saveState();
  });

  toolbar.appendChild(btnBold);
  toolbar.appendChild(btnUnderline);
  document.body.appendChild(toolbar);

  input.focus();
  input.select();

  const commit = () => {
    const val = input.value;
    cell.classList.remove('cell-editing');
    cell.textContent = val;
    state.rows[rowIdx].name = val;

    let style = '';
    if (row.bold) style += 'font-weight:700;';
    if (row.underline) style += 'text-decoration:underline;';
    style += state.selectedRow === rowIdx ? 'background:var(--accent);' : 'background:#fff;';
    cell.setAttribute('style', style);

    if (toolbar.parentNode) toolbar.remove();
    saveState();
    updateRowDetailsPanel();
  };

  input.addEventListener('blur', () => setTimeout(commit, 100));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = oldText; input.blur(); }
  });
}

// ── Inline Editing: Header cells ───────────────────
function startHeaderCellEdit(cell) {
  if (cell.classList.contains('cell-editing')) return;
  commitUndoNode('Edit header');
  const oldText = cell.textContent;
  cell.classList.add('cell-editing');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldText;
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  const commit = () => {
    const val = input.value;
    cell.classList.remove('cell-editing');
    cell.textContent = val;
    applyHeaderCellEdit(cell, val);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = oldText; input.blur(); }
  });
}

function applyHeaderCellEdit(cell, val) {
  if (!state.headerOverrides) state.headerOverrides = {};

  if (cell.classList.contains('corner-cell')) {
    const h = +cell.dataset.headerRow;
    const key = `corner_${h}`;
    if (val === '' || val === state.headerPatterns[h]?.pattern) {
      delete state.headerOverrides[key];
    } else {
      state.headerOverrides[key] = val;
    }
    saveState();
    // Keep the sidepanel Corner label field in sync with inline dblclick edits.
    renderCornerLabelField();
    return;
  }

  const h = cell.dataset.headerRow;
  const c = cell.dataset.col;
  if (h !== undefined && c !== undefined) {
    const key = `${h}_${c}`;
    const hp = state.headerPatterns[+h];
    const patternVal = hp ? (getPatternValues(hp, +c + 1)[+c] || '') : '';
    if (val === '' || val === patternVal) {
      delete state.headerOverrides[key];
    } else {
      state.headerOverrides[key] = val;
    }
    saveState();
    // Keep the Selected header sub-panel in sync with inline dblclick edits.
    renderSelectedHeaderField();
  }
}

// ── Row Drag System ────────────────────────────────
let dragState = null;

function startRowDrag(tr, rowIdx, startY) {
  const tbody = $table.querySelector('tbody');

  const ghostTable = document.createElement('table');
  ghostTable.className = 'spreadsheet';
  ghostTable.style.position = 'fixed';
  ghostTable.style.zIndex = '50';
  ghostTable.style.pointerEvents = 'none';
  ghostTable.style.margin = '0';
  ghostTable.style.opacity = '0.85';
  ghostTable.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  ghostTable.style.background = '#fff';

  const colgroup = $table.querySelector('colgroup');
  if (colgroup) ghostTable.appendChild(colgroup.cloneNode(true));
  const ghostBody = document.createElement('tbody');
  ghostBody.appendChild(tr.cloneNode(true));
  ghostTable.appendChild(ghostBody);
  document.body.appendChild(ghostTable);

  const rect = tr.getBoundingClientRect();
  ghostTable.style.left = rect.left + 'px';
  ghostTable.style.top = (startY - rect.height / 2) + 'px';
  ghostTable.style.width = rect.width + 'px';

  tr.classList.add('drag-hidden');

  dragState = {
    tr,
    rowIdx,
    ghostTable,
    offsetY: startY - rect.top,
    gapIdx: rowIdx,
    tbody,
  };
}

function handleRowDragMove(ev) {
  if (!dragState) return;
  const { ghostTable, offsetY, tbody, rowIdx } = dragState;

  ghostTable.style.top = (ev.clientY - offsetY) + 'px';

  const allRows = Array.from(tbody.querySelectorAll('tr[data-row]:not(.drag-hidden):not(.drag-gap)'));
  let targetIdx = rowIdx;
  for (const r of allRows) {
    const rr = r.getBoundingClientRect();
    const mid = rr.top + rr.height / 2;
    const ri = +r.dataset.row;
    if (ev.clientY < mid) { targetIdx = ri; break; }
    targetIdx = ri + 1;
  }
  targetIdx = Math.max(0, Math.min(state.rows.length, targetIdx));

  if (targetIdx !== dragState.gapIdx) {
    dragState.gapIdx = targetIdx;
    updateDragGap(tbody, rowIdx, targetIdx);
  }
}

function finishRowDrag() {
  if (!dragState) return;
  const { tr, rowIdx, ghostTable, gapIdx, tbody } = dragState;

  if (ghostTable.parentNode) ghostTable.remove();
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  tr.classList.remove('drag-hidden');

  if (gapIdx !== null && gapIdx !== rowIdx && gapIdx !== rowIdx + 1) {
    commitUndoNode('Reorder row');
    const from = rowIdx;
    const to = gapIdx > from ? gapIdx - 1 : gapIdx;
    if (state.selectedRow === from) state.selectedRow = to;
    else if (state.selectedRow !== null) {
      if (from < state.selectedRow && to >= state.selectedRow) state.selectedRow--;
      else if (from > state.selectedRow && to <= state.selectedRow) state.selectedRow++;
    }
    moveRow(from, to);
    renderTable();
    saveState();
  }
  dragState = null;
}

function updateDragGap(tbody, _dragIdx, gapIdx) {
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  const allRows = Array.from(tbody.querySelectorAll('tr[data-row]'));
  const gapTr = document.createElement('tr');
  gapTr.classList.add('drag-gap');
  gapTr.innerHTML = `<td colspan="${state.cols + 1}" style="height:calc(var(--cell-h) * var(--zoom));border:none;background:var(--accent);"></td>`;

  let target = null;
  for (const r of allRows) {
    if (+r.dataset.row >= gapIdx && !r.classList.contains('drag-hidden')) { target = r; break; }
  }
  if (target) tbody.insertBefore(gapTr, target);
  else tbody.appendChild(gapTr);
}

function moveRow(from, to) {
  const [item] = state.rows.splice(from, 1);
  state.rows.splice(to, 0, item);

  const oldCells = {};
  for (const k in state.cells) oldCells[k] = { ...state.cells[k] };

  const n = state.rows.length;
  const indices = Array.from({ length: n + 1 }, (_, i) => i);
  const moved = indices.splice(from, 1)[0];
  indices.splice(to, 0, moved);

  const newCells = {};
  for (let newIdx = 0; newIdx < indices.length; newIdx++) {
    if (oldCells[indices[newIdx]]) newCells[newIdx] = oldCells[indices[newIdx]];
  }
  state.cells = newCells;
}

// ── Context Menus ──────────────────────────────────
let $contextMenu = null;

function hideContextMenu() {
  if ($contextMenu) { $contextMenu.remove(); $contextMenu = null; }
}

function isModalOpen() {
  if ($contextMenu) return true;
  const overlay = document.getElementById('confirm-overlay');
  if (overlay && overlay.style.display !== 'none') return true;
  return false;
}

function positionMenu(menu, _x, _y) {
  document.body.appendChild(menu);
  $contextMenu = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  setTimeout(() => {
    const dismissHandler = (e) => {
      if ($contextMenu && $contextMenu.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      hideContextMenu();
      document.removeEventListener('click', dismissHandler, true);
      document.removeEventListener('contextmenu', dismissHandler, true);
    };
    document.addEventListener('click', dismissHandler, true);
    document.addEventListener('contextmenu', dismissHandler, true);
  }, 0);
}

function batchSetSelection(valueFn) {
  if (!state.selection) return;
  commitUndoNode('Batch set');
  const { r1, c1, r2, c2 } = state.selection;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const val = typeof valueFn === 'function' ? valueFn(r, c) : valueFn;
      setCellValue(r, c, val);
    }
  }
  renderTable();
  saveState();
}

function showBatchContextMenu(x, y) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const items = [
    { label: 'Set all ✓', action: () => batchSetSelection('✓') },
    { label: 'Set all ×', action: () => batchSetSelection('×') },
    { label: 'Set all 〇', action: () => batchSetSelection('〇') },
    { label: 'Set all —', action: () => batchSetSelection('—') },
    { label: 'Clear all', action: () => batchSetSelection('') },
  ];

  items.forEach((item) => {
    if (item.label === 'sep') {
      const s = document.createElement('div'); s.className = 'context-menu-sep'; menu.appendChild(s); return;
    }
    const div = document.createElement('div');
    div.className = 'context-menu-item';
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(div);
  });

  positionMenu(menu, x, y);
}

function showContentContextMenu(x, y, row, col) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  let checkCount = 0;
  for (let c = 0; c <= col; c++) {
    const v = getCellValue(row, c);
    if (v === '✓' || v.includes('✓')) checkCount++;
  }

  [
    { label: `Set ←${checkCount}✓`, action: () => { commitUndoNode('Set cell'); setCellValue(row, col, `←${checkCount}✓`); renderTable(); saveState(); } },
    { label: 'sep' },
    { label: '✓', action: () => { commitUndoNode('Set cell'); setCellValue(row, col, '✓'); renderTable(); saveState(); } },
    { label: '×', action: () => { commitUndoNode('Set cell'); setCellValue(row, col, '×'); renderTable(); saveState(); } },
    { label: '〇', action: () => { commitUndoNode('Set cell'); setCellValue(row, col, '〇'); renderTable(); saveState(); } },
    { label: '—', action: () => { commitUndoNode('Set cell'); setCellValue(row, col, '—'); renderTable(); saveState(); } },
    { label: 'Clear', action: () => { commitUndoNode('Set cell'); setCellValue(row, col, ''); renderTable(); saveState(); } },
  ].forEach((item) => {
    if (item.label === 'sep') {
      const s = document.createElement('div'); s.className = 'context-menu-sep'; menu.appendChild(s); return;
    }
    const div = document.createElement('div');
    div.className = 'context-menu-item';
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(div);
  });

  positionMenu(menu, x, y);
}

function showRowContextMenu(x, y, rowIdx) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const moveDiv = document.createElement('div');
  moveDiv.className = 'context-menu-input-row';
  moveDiv.innerHTML = `<span>Move to row</span><input type="number" min="1" max="${state.rows.length}" value="${rowIdx + 1}" id="ctx-move-input"><button id="ctx-move-btn">⏎</button>`;
  menu.appendChild(moveDiv);

  const sep = document.createElement('div'); sep.className = 'context-menu-sep'; menu.appendChild(sep);

  const del = document.createElement('div');
  del.className = 'context-menu-item destructive';
  del.textContent = 'Delete row';
  del.addEventListener('click', () => { commitUndoNode('Delete row'); deleteRow(rowIdx); hideContextMenu(); });
  menu.appendChild(del);

  positionMenu(menu, x, y);

  const moveInput = document.getElementById('ctx-move-input');
  const moveBtn = document.getElementById('ctx-move-btn');
  const doMove = () => {
    const target = Math.max(1, Math.min(state.rows.length, +moveInput.value || 1)) - 1;
    if (target !== rowIdx) {
      commitUndoNode('Move row');
      if (state.selectedRow === rowIdx) state.selectedRow = target;
      moveRow(rowIdx, target);
      renderTable();
      saveState();
    }
    hideContextMenu();
  };
  moveBtn.addEventListener('click', (e) => { e.stopPropagation(); doMove(); });
  moveInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doMove(); });
  moveInput.addEventListener('click', (e) => e.stopPropagation());
  moveInput.focus();
  moveInput.select();
}

function deleteRow(idx) {
  state.rows.splice(idx, 1);
  const newCells = {};
  Object.keys(state.cells).forEach((key) => {
    const k = +key;
    if (k < idx) newCells[k] = state.cells[k];
    else if (k > idx) newCells[k - 1] = state.cells[k];
  });
  state.cells = newCells;
  if (state.selectedRow === idx) state.selectedRow = null;
  else if (state.selectedRow !== null && state.selectedRow > idx) state.selectedRow--;
  renderTable();
  saveState();
}

// Long-press for content cells (touch only; opens context menu, never inline edit).
// Disabled on non-touch devices and in view mode per spec §5 / §7.
let longPressTimer = null;
document.addEventListener('touchstart', (e) => {
  if (!isTouchDevice) return;
  // Multi-touch (e.g. pinch-zoom): cancel any armed long-press and bail.
  if (e.touches.length > 1) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    return;
  }
  if (isReadOnly()) return;
  const td = e.target.closest('.content-cell');
  if (!td) return;
  const touch = e.touches[0];
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    const r = +td.dataset.row;
    const c = +td.dataset.col;

    if (state.selection) {
      const { r1, c1, r2, c2 } = state.selection;
      const isMulti = (r2 - r1 + c2 - c1) > 0;
      const isInside = r >= r1 && r <= r2 && c >= c1 && c <= c2;
      if (isMulti && isInside) {
        showBatchContextMenu(touch.clientX, touch.clientY);
        return;
      }
    }

    showContentContextMenu(touch.clientX, touch.clientY, r, c);
  }, 500);
}, { passive: true });

document.addEventListener('touchend', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
document.addEventListener('touchmove', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });

// ── Sidebar: Corner label field (Option B — single field area at top of
//    Header Patterns panel). Renders one input per header row; in the
//    overwhelming single-header-row case this is a single input.
function renderCornerLabelField() {
  const host = document.getElementById('corner-label-field');
  if (!host) return;
  if (!state.headerOverrides) state.headerOverrides = {};

  const parts = state.headerPatterns.map((hp, h) => {
    const key = `corner_${h}`;
    const hasOverride = Object.prototype.hasOwnProperty.call(state.headerOverrides, key)
      && state.headerOverrides[key] !== undefined;
    const overrideVal = hasOverride ? state.headerOverrides[key] : '';
    const autoVal = hp?.pattern || '';
    const multi = state.headerPatterns.length > 1;
    const labelText = multi ? `Corner label ${h}` : 'Corner label';
    return `
      <div class="field corner-label-field" data-index="${h}">
        <span class="field-label">${esc(labelText)}</span>
        <input type="text" class="corner-label-input" data-index="${h}"
          value="${escAttr(overrideVal)}"
          placeholder="${escAttr(autoVal)}">
        <button class="btn btn-sm corner-label-clear" data-index="${h}"
          title="Clear override" style="${hasOverride ? '' : 'visibility:hidden;'}">×</button>
      </div>
    `;
  }).join('');
  host.innerHTML = parts;

  host.querySelectorAll('.corner-label-input').forEach((inp) => {
    const i = +inp.dataset.index;
    inp.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit corner label');
      if (!state.headerOverrides) state.headerOverrides = {};
      const key = `corner_${i}`;
      const val = inp.value;
      const autoVal = state.headerPatterns[i]?.pattern || '';
      if (val === '' || val === autoVal) {
        delete state.headerOverrides[key];
      } else {
        state.headerOverrides[key] = val;
      }
      // Toggle clear-button visibility without full re-render to avoid
      // clobbering the input's focus/caret position.
      const clearBtn = host.querySelector(`.corner-label-clear[data-index="${i}"]`);
      if (clearBtn) {
        const has = Object.prototype.hasOwnProperty.call(state.headerOverrides, key);
        clearBtn.style.visibility = has ? '' : 'hidden';
      }
      renderTable();
      saveState();
    });
  });

  host.querySelectorAll('.corner-label-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isReadOnly()) return;
      const i = +btn.dataset.index;
      commitUndoNode('Clear corner label');
      if (state.headerOverrides) delete state.headerOverrides[`corner_${i}`];
      renderCornerLabelField();
      renderTable();
      saveState();
    });
  });
}

// ── Sidebar: Selected header cell override (resolution #3).
//    Renders a "Selected header" sub-panel in the Header Patterns section
//    when a non-corner header cell is selected. Mirrors the corner label
//    field's input + clear pattern. Used by touch and mouse alike.
function renderSelectedHeaderField() {
  const host = document.getElementById('selected-header-field');
  if (!host) return;
  const sel = state.selectedHeader;
  if (!sel) { host.innerHTML = ''; return; }
  const { h, c } = sel;
  if (!state.headerPatterns[h]) { host.innerHTML = ''; return; }
  if (!state.headerOverrides) state.headerOverrides = {};
  const key = `${h}_${c}`;
  const hasOverride = Object.prototype.hasOwnProperty.call(state.headerOverrides, key)
    && state.headerOverrides[key] !== undefined;
  const overrideVal = hasOverride ? state.headerOverrides[key] : '';
  const hp = state.headerPatterns[h];
  const autoVal = hp ? (getPatternValues(hp, c + 1)[c] || '') : '';
  const labelText = `Header [${h}, ${c + 1}]`;

  host.innerHTML = `
    <div class="field selected-header-field">
      <span class="field-label">${esc(labelText)}</span>
      <input type="text" class="selected-header-input"
        value="${escAttr(overrideVal)}"
        placeholder="${escAttr(autoVal)}">
      <button class="btn btn-sm selected-header-clear"
        title="Clear override" style="${hasOverride ? '' : 'visibility:hidden;'}">×</button>
    </div>
  `;

  const inp = host.querySelector('.selected-header-input');
  const clearBtn = host.querySelector('.selected-header-clear');

  inp.addEventListener('input', () => {
    commitUndoNodeThrottled('Edit header cell');
    const val = inp.value;
    if (val === '' || val === autoVal) {
      delete state.headerOverrides[key];
    } else {
      state.headerOverrides[key] = val;
    }
    const has = Object.prototype.hasOwnProperty.call(state.headerOverrides, key);
    if (clearBtn) clearBtn.style.visibility = has ? '' : 'hidden';
    renderTable();
    saveState();
  });

  clearBtn.addEventListener('click', () => {
    if (isReadOnly()) return;
    commitUndoNode('Clear header cell');
    delete state.headerOverrides[key];
    renderSelectedHeaderField();
    renderTable();
    saveState();
  });
}

// ── Sidebar: Pattern List ──────────────────────────
function renderPatternList() {
  $patternList.innerHTML = '';
  state.headerPatterns.forEach((hp, i) => {
    const container = document.createElement('div');

    const div = document.createElement('div');
    div.className = 'pattern-item';

    let options = PATTERN_NAMES.map((name) =>
      `<option value="${esc(name)}"${hp.pattern === name ? ' selected' : ''}>${esc(name)}</option>`
    ).join('');
    options += `<option value="自訂"${hp.pattern === '自訂' ? ' selected' : ''}>自訂</option>`;
    options += `<option value="映射"${hp.pattern === '映射' ? ' selected' : ''}>映射</option>`;

    if (hp.pattern === '自訂') {
      const valCount = hp.values ? hp.values.length : 0;
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <button class="btn btn-sm pat-edit-values" data-index="${i}">Edit values (${valCount})</button>
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    } else if (hp.pattern === '映射') {
      // Build source dropdown: all non-映射 rows except current
      let sourceOptions = '';
      state.headerPatterns.forEach((shp, si) => {
        if (si === i || shp.pattern === '映射') return;
        sourceOptions += `<option value="${si}"${hp.sourceIndex === si ? ' selected' : ''}>#${si}: ${esc(shp.pattern)}</option>`;
      });
      const mapCount = hp.mappings ? Object.keys(hp.mappings).length : 0;
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <select data-index="${i}" class="pat-source" style="width:70px;flex:0 0 70px;">${sourceOptions}</select>
        <button class="btn btn-sm pat-edit-map" data-index="${i}">Edit map (${mapCount})</button>
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    } else {
      const stepDisplay = hp.step > 0 ? '+' + hp.step : String(hp.step);
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <input type="number" class="pat-start" data-index="${i}" value="${hp.start}" title="Start" style="width:40px;">
        <input type="text" class="pat-step" data-index="${i}" value="${stepDisplay}" title="Step" style="width:44px;">
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    }

    container.appendChild(div);
    $patternList.appendChild(container);
  });

  bindPatternEvents();
  renderCornerLabelField();
  renderSelectedHeaderField();
}

function bindPatternEvents() {
  // Pattern type select — handles type switching
  $patternList.querySelectorAll('.pat-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.index;
      const hp = state.headerPatterns[i];
      const oldType = hp.pattern;
      const newType = sel.value;
      const isStandard = (t) => t !== '自訂' && t !== '映射';

      if (oldType === newType) return;
      commitUndoNode('Change pattern');

      // Clean old type fields
      if (isStandard(oldType)) {
        delete hp.start; delete hp.step;
      } else if (oldType === '自訂') {
        delete hp.values;
      } else if (oldType === '映射') {
        delete hp.sourceIndex; delete hp.mappings;
      }

      // Set new type fields
      if (isStandard(newType)) {
        hp.start = 0; hp.step = 1;
      } else if (newType === '自訂') {
        hp.values = [''];
      } else if (newType === '映射') {
        hp.sourceIndex = 0; hp.mappings = {};
      }

      hp.pattern = newType;
      renderPatternList();
      renderTable();
      saveState();
    });
  });

  // Standard pattern controls
  $patternList.querySelectorAll('.pat-start').forEach((input) => {
    input.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit start');
      state.headerPatterns[+input.dataset.index].start = +input.value || 0;
      renderTable();
      saveState();
    });
  });

  $patternList.querySelectorAll('.pat-step').forEach((input) => {
    input.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit step');
      const raw = input.value.replace(/^\+/, '');
      const val = parseInt(raw, 10);
      state.headerPatterns[+input.dataset.index].step = isNaN(val) ? 1 : val;
      renderTable();
      saveState();
    });
    input.addEventListener('blur', () => {
      const hp = state.headerPatterns[+input.dataset.index];
      input.value = hp.step > 0 ? '+' + hp.step : String(hp.step);
    });
  });

  // 映射 source dropdown
  $patternList.querySelectorAll('.pat-source').forEach((sel) => {
    sel.addEventListener('change', () => {
      commitUndoNode('Change source');
      const i = +sel.dataset.index;
      state.headerPatterns[i].sourceIndex = +sel.value;
      renderTable();
      saveState();
    });
  });

  // 自訂 value editor toggle
  $patternList.querySelectorAll('.pat-edit-values').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.index;
      const container = btn.closest('.pattern-item').parentNode;
      const existing = container.querySelector('.pat-custom-editor');
      if (existing) { existing.remove(); return; }
      const editor = buildCustomEditor(i);
      container.appendChild(editor);
    });
  });

  // 映射 mapping editor toggle
  $patternList.querySelectorAll('.pat-edit-map').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.index;
      const container = btn.closest('.pattern-item').parentNode;
      const existing = container.querySelector('.pat-mapping-editor');
      if (existing) { existing.remove(); return; }
      const editor = buildMappingEditor(i);
      container.appendChild(editor);
    });
  });

  // Force-reinitialise per type
  $patternList.querySelectorAll('.pat-reset').forEach((btn) => {
    btn.addEventListener('click', () => {
      commitUndoNode('Reset pattern');
      const i = +btn.dataset.index;
      const hp = state.headerPatterns[i];
      if (hp.pattern === '自訂') {
        hp.values = [''];
      } else if (hp.pattern === '映射') {
        hp.sourceIndex = 0;
        hp.mappings = {};
      } else {
        hp.start = 0;
        hp.step = 1;
      }
      // Clear all overrides for this header row
      if (state.headerOverrides) {
        const prefix = `${i}_`;
        const cornerKey = `corner_${i}`;
        Object.keys(state.headerOverrides).forEach((key) => {
          if (key.startsWith(prefix) || key === cornerKey) delete state.headerOverrides[key];
        });
      }
      renderPatternList();
      renderTable();
      saveState();
    });
  });

  // Delete pattern row with cascade
  $patternList.querySelectorAll('.pat-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.index;
      if (state.headerPatterns.length <= 1) return;
      commitUndoNode('Delete pattern');
      state.headerPatterns.splice(i, 1);

      // Cascade: fix 映射 sourceIndex references
      state.headerPatterns.forEach((hp) => {
        if (hp.pattern !== '映射') return;
        if (hp.sourceIndex === i) {
          // Reset to first valid non-映射 row
          let found = 0;
          for (let j = 0; j < state.headerPatterns.length; j++) {
            if (state.headerPatterns[j].pattern !== '映射') { found = j; break; }
          }
          hp.sourceIndex = found;
        } else if (hp.sourceIndex > i) {
          hp.sourceIndex--;
        }
      });

      // Fix header overrides
      if (state.headerOverrides) {
        const newOv = {};
        Object.keys(state.headerOverrides).forEach((key) => {
          const m = key.match(/^(\d+)_(\d+)$/);
          const cm = key.match(/^corner_(\d+)$/);
          if (m) {
            const h = +m[1];
            if (h < i) newOv[key] = state.headerOverrides[key];
            else if (h > i) newOv[`${h - 1}_${m[2]}`] = state.headerOverrides[key];
          } else if (cm) {
            const h = +cm[1];
            if (h < i) newOv[key] = state.headerOverrides[key];
            else if (h > i) newOv[`corner_${h - 1}`] = state.headerOverrides[key];
          }
        });
        state.headerOverrides = newOv;
      }
      renderPatternList();
      renderTable();
      saveState();
    });
  });
}

// ── Sub-panel: 自訂 value editor ──────────────────────
function buildCustomEditor(patIndex) {
  const hp = state.headerPatterns[patIndex];
  if (!hp.values) hp.values = [''];
  const div = document.createElement('div');
  div.className = 'pat-custom-editor';

  function rebuild() {
    div.innerHTML = '';
    hp.values.forEach((val, vi) => {
      const row = document.createElement('div');
      row.className = 'pat-editor-row';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = val;
      inp.addEventListener('input', () => {
        commitUndoNodeThrottled('Edit value');
        hp.values[vi] = inp.value;
        renderTable();
        saveState();
      });
      row.appendChild(inp);

      const del = document.createElement('button');
      del.className = 'pattern-item-btn';
      del.textContent = '✕';
      del.disabled = hp.values.length <= 1;
      del.addEventListener('click', () => {
        commitUndoNode('Delete value');
        hp.values.splice(vi, 1);
        rebuild();
        updateEditorButton();
        renderTable();
        saveState();
      });
      row.appendChild(del);
      div.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm';
    addBtn.textContent = '+ Add value';
    addBtn.addEventListener('click', () => {
      commitUndoNode('Add value');
      hp.values.push('');
      rebuild();
      updateEditorButton();
      renderTable();
      saveState();
    });
    div.appendChild(addBtn);
  }

  function updateEditorButton() {
    const btn = div.parentNode?.querySelector('.pat-edit-values');
    if (btn) btn.textContent = `Edit values (${hp.values.length})`;
  }

  rebuild();
  return div;
}

// ── Sub-panel: 映射 mapping editor ────────────────────
function buildMappingEditor(patIndex) {
  const hp = state.headerPatterns[patIndex];
  if (!hp.mappings) hp.mappings = {};
  const div = document.createElement('div');
  div.className = 'pat-mapping-editor';

  function rebuild() {
    div.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'pat-editor-header';
    header.innerHTML = '<span>When</span><span style="margin-left:auto;margin-right:auto;">→</span><span>Show</span>';
    div.appendChild(header);

    const entries = Object.entries(hp.mappings);
    entries.forEach(([key, val]) => {
      const row = document.createElement('div');
      row.className = 'pat-editor-row';

      const keyInp = document.createElement('input');
      keyInp.type = 'text';
      keyInp.value = key;
      let originalKey = key;
      keyInp.addEventListener('focus', () => { originalKey = keyInp.value; });
      keyInp.addEventListener('blur', () => {
        const newKey = keyInp.value;
        if (newKey !== originalKey) {
          commitUndoNode('Edit mapping');
          delete hp.mappings[originalKey];
          if (newKey !== '') {
            hp.mappings[newKey] = val;
          }
          rebuild();
          updateEditorButton();
          renderTable();
          saveState();
        }
      });
      row.appendChild(keyInp);

      const arrow = document.createElement('span');
      arrow.className = 'pat-arrow';
      arrow.textContent = '→';
      row.appendChild(arrow);

      const valInp = document.createElement('input');
      valInp.type = 'text';
      valInp.value = val;
      valInp.addEventListener('input', () => {
        commitUndoNodeThrottled('Edit mapping');
        hp.mappings[key] = valInp.value;
        renderTable();
        saveState();
      });
      row.appendChild(valInp);

      const del = document.createElement('button');
      del.className = 'pattern-item-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        commitUndoNode('Delete mapping');
        delete hp.mappings[key];
        rebuild();
        updateEditorButton();
        renderTable();
        saveState();
      });
      row.appendChild(del);
      div.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm';
    addBtn.textContent = '+ Add mapping';
    addBtn.addEventListener('click', () => {
      commitUndoNode('Add mapping');
      hp.mappings[''] = '';
      rebuild();
      updateEditorButton();
      renderTable();
      saveState();
    });
    div.appendChild(addBtn);
  }

  function updateEditorButton() {
    const btn = div.parentNode?.querySelector('.pat-edit-map');
    if (btn) btn.textContent = `Edit map (${Object.keys(hp.mappings).length})`;
  }

  rebuild();
  return div;
}

// ── Zoom System ────────────────────────────────────
function setZoom(z) {
  state.zoom = Math.max(0.5, Math.min(3, +z.toFixed(2)));
  document.documentElement.style.setProperty('--zoom', state.zoom);
  saveState();
}

// Keyboard shortcuts (unified)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.selection = null;
    state.anchor = null;
    state.selectedHeader = null;
    updateSelectionVisual();
    updateRowDetailsPanel();
    renderSelectedHeaderField();
  }

  // Delete / Backspace — clear selected cells only (never delete rows via keyboard)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (isReadOnly()) return;
    e.preventDefault();

    if (state.selection) {
      const { r1, c1, r2, c2 } = state.selection;
      commitUndoNode('Clear cells');
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          setCellValue(r, c, '');
        }
      }
      renderTable();
      saveState();
    }
    return;
  }

  // Ctrl/Cmd shortcuts (undo, redo, zoom)
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (!isReadOnly()) undo(); }
    else if (e.key === 'z' && e.shiftKey) { e.preventDefault(); if (!isReadOnly()) redo(); }
    else if (e.key === 'y') { e.preventDefault(); if (!isReadOnly()) redo(); }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(state.zoom + 0.1); }
    else if (e.key === '-') { e.preventDefault(); setZoom(state.zoom - 0.1); }
    else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    return;
  }

  // Cell value keyboard shortcuts (edit mode only, no modifier keys)
  if (!state.viewMode && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const keyMap = {
      'v': '✓', 'V': '✓',
      'x': '×', 'X': '×',
      '-': '—',
      'o': '〇', 'O': '〇',
    };

    const val = keyMap[e.key];
    const isComma = e.key === ',';

    if (val || isComma) {
      e.preventDefault();

      if (state.selection) {
        const { r1, c1, r2, c2 } = state.selection;
        commitUndoNode('Set cells');
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            if (isComma) {
              let count = 0;
              for (let cc = 0; cc <= c; cc++) {
                const cv = getCellValue(r, cc);
                if (cv === '✓' || cv.includes('✓')) count++;
              }
              setCellValue(r, c, `←${count}✓`);
            } else {
              setCellValue(r, c, val);
            }
          }
        }
        renderTable();
        saveState();
      } else if (hoveredCell) {
        const { r, c } = hoveredCell;
        commitUndoNode('Set cell');
        if (isComma) {
          let count = 0;
          for (let cc = 0; cc <= c; cc++) {
            const cv = getCellValue(r, cc);
            if (cv === '✓' || cv.includes('✓')) count++;
          }
          setCellValue(r, c, `←${count}✓`);
        } else {
          setCellValue(r, c, val);
        }
        renderTable();
        saveState();
      }
    }
  }
});

// Cmd + scroll wheel (desktop)
$wrapper.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(state.zoom + delta);
  }
}, { passive: false });

// Pinch-to-zoom (touch) via gesturestart/gesturechange (Safari)
let gestureStartZoom = 1;
$wrapper.addEventListener('gesturestart', (e) => {
  e.preventDefault();
  gestureStartZoom = state.zoom;
});

$wrapper.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  setZoom(gestureStartZoom * e.scale);
});

$wrapper.addEventListener('gestureend', (e) => {
  e.preventDefault();
});

// Pinch-to-zoom fallback for non-Safari (pointer events)
let pinchTouches = [];
let pinchStartDist = 0;
let pinchStartZoom = 1;

$wrapper.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchTouches = Array.from(e.touches);
    const dx = pinchTouches[0].clientX - pinchTouches[1].clientX;
    const dy = pinchTouches[0].clientY - pinchTouches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartZoom = state.zoom;
  }
}, { passive: true });

$wrapper.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDist > 0) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const scale = dist / pinchStartDist;
    setZoom(pinchStartZoom * scale);
    e.preventDefault();
  }
}, { passive: false });

$wrapper.addEventListener('touchend', () => {
  pinchStartDist = 0;
});

// ── Sidebar Controls ───────────────────────────────
function bindSidepanelControls() {
  $colCount.addEventListener('input', () => {
    commitUndoNodeThrottled('Change columns');
    state.cols = Math.max(1, Math.min(366, +$colCount.value || 1));
    renderTable();
    saveState();
  });

  $fontFamily.addEventListener('input', () => {
    state.font = $fontFamily.value || 'Sarasa UI CL';
    applyStyles();
    saveState();
  });

  $themeColor.addEventListener('input', () => {
    state.color = $themeColor.value;
    applyStyles();
    saveState();
  });

  $colorTarget.addEventListener('change', () => {
    state.colorTarget = $colorTarget.value;
    applyStyles();
    saveState();
  });

  $addPattern.addEventListener('click', () => {
    commitUndoNode('Add pattern');
    state.headerPatterns.push({ pattern: '数字', start: 1, step: 1 });
    renderPatternList();
    renderTable();
    saveState();
  });

  $addRowItem.addEventListener('click', () => {
    commitUndoNode('Add row');
    state.rows.push({ name: `Item ${state.rows.length + 1}`, bold: false, underline: false });
    renderTable();
    saveState();
  });

  $altColsToggle.addEventListener('change', () => {
    state.altCols = $altColsToggle.checked;
    $table.classList.toggle('alt-cols', state.altCols);
    saveState();
  });

  $altRowsToggle.addEventListener('change', () => {
    state.altRows = $altRowsToggle.checked;
    $table.classList.toggle('alt-rows', state.altRows);
    saveState();
  });

  $btnImport.addEventListener('click', () => $importFileInput.click());
  $importFileInput.addEventListener('change', handleUnifiedImport);
  $btnExport.addEventListener('click', handleExport);
  $btnProjExport.addEventListener('click', handleProjectExport);
  $btnSave.addEventListener('click', () => { saveState(); });

  $btnUndo.addEventListener('click', () => { if (!isReadOnly()) undo(); });
  $btnRedo.addEventListener('click', () => { if (!isReadOnly()) redo(); });
}

// ── Style Application ──────────────────────────────
function applyStyles() {
  const root = document.documentElement;
  root.style.setProperty('--font', `"${state.font}", "Sarasa Gothic CL", "Noto Sans CJK SC", sans-serif`);

  // Accent colour
  root.style.setProperty('--accent', state.color);

  // Border: rgba(0,0,0,a) on white that visually matches the accent grey
  const r = parseInt(state.color.slice(1, 3), 16);
  const g = parseInt(state.color.slice(3, 5), 16);
  const b = parseInt(state.color.slice(5, 7), 16);
  const avg = (r + g + b) / 3;
  const borderOpacity = Math.max(0.02, 1 - avg / 255).toFixed(3);
  root.style.setProperty('--border', `rgba(0,0,0,${borderOpacity})`);

  // Text on accent: luminance-based
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty('--accent-text', luminance > 0.5 ? '#000' : '#fff');

  // 4-tier rollout: t2 (stripe), t3 (header), t3-solid (wrapper bg), t4 (UI hover).
  // t2 = accent at 0.18 opacity — light stripe wash.
  // t3 = accent at 0.65 opacity — header fill (semi-transparent).
  // t3-solid = t3 composited on white — opaque equivalent for wrapper padding.
  // t4 = accent at full opacity — button/UI hover state.
  root.style.setProperty('--t2', `rgba(${r},${g},${b},0.18)`);
  root.style.setProperty('--t3', `rgba(${r},${g},${b},0.65)`);
  const t3r = Math.round(r * 0.65 + 255 * 0.35);
  const t3g = Math.round(g * 0.65 + 255 * 0.35);
  const t3b = Math.round(b * 0.65 + 255 * 0.35);
  root.style.setProperty('--t3-solid', `rgb(${t3r},${t3g},${t3b})`);
  root.style.setProperty('--t4', state.color);

  document.getElementById('app').dataset.colorTarget = state.colorTarget;
}

// ── Confirm Dialog ─────────────────────────────────
function showConfirm(msg, yesLabel = 'Overwrite', noLabel = 'Cancel') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    overlay.style.display = '';

    const yes = document.getElementById('confirm-yes');
    const no = document.getElementById('confirm-no');
    yes.textContent = yesLabel;
    no.textContent = noLabel;

    const cleanup = () => { overlay.style.display = 'none'; yes.onclick = null; no.onclick = null; };
    yes.onclick = () => { cleanup(); resolve(true); };
    no.onclick = () => { cleanup(); resolve(false); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    }, { once: true });
  });
}

// ── Check if table has content ─────────────────────
function tableHasContent() {
  if (Object.keys(state.cells).length > 0) return true;
  for (const row of state.rows) {
    if (row.name && !row.name.match(/^Item \d+$/)) return true;
  }
  return false;
}

// ── Gzip compression helpers ───────────────────────
async function compressToGzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function decompressGzip(blob) {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ── Project Export (.daakaa) ───────────────────────
async function handleProjectExport() {
  const includeHistory = await showConfirm('Include undo history in export?', 'Yes', 'No');

  const project = {
    version: 1,
    timestamp: Date.now(),
    cols: state.cols,
    rows: state.rows,
    cells: state.cells,
    headerPatterns: state.headerPatterns,
    headerOverrides: state.headerOverrides,
    font: state.font,
    color: state.color,
    colorTarget: state.colorTarget,
    altCols: state.altCols,
    altRows: state.altRows,
    zoom: state.zoom,
  };

  if (includeHistory) {
    project.history = {
      undoTree,
      undoCurrentId,
      undoNextId,
      lastVisitedChild,
    };
  }

  const json = JSON.stringify(project);
  const blob = await compressToGzip(json);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'daakaa-project.daakaa.gz';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Unified Import (auto-detect file type) ─────────
async function handleUnifiedImport() {
  const file = $importFileInput.files[0];
  if (!file) return;
  $importFileInput.value = '';
  const name = file.name.toLowerCase();
  if (name.endsWith('.daakaa.gz') || name.endsWith('.daakaa.json') || name.endsWith('.json') || name.endsWith('.gz')) {
    await handleProjectImport(file);
  } else {
    await handleImport(file);
  }
}

// ── Project Import (.daakaa) ───────────────────────
async function handleProjectImport(file) {
  if (!file) return;

  if (tableHasContent()) {
    const ok = await showConfirm('The current project has data. Overwrite?');
    if (!ok) return;
  }

  // Support both .gz (compressed) and .json (legacy/uncompressed)
  let text;
  if (file.name.endsWith('.gz')) {
    text = await decompressGzip(file);
  } else {
    text = await file.text();
  }
  try {
    const project = JSON.parse(text);

    // Restore document state
    if (project.cols) state.cols = project.cols;
    if (project.rows) state.rows = project.rows;
    if (project.cells) state.cells = project.cells;
    if (project.headerPatterns) state.headerPatterns = project.headerPatterns;
    if (project.headerOverrides) state.headerOverrides = project.headerOverrides;

    // Restore settings
    if (project.font) state.font = project.font;
    if (project.color) state.color = project.color;
    if (project.colorTarget) state.colorTarget = project.colorTarget;
    if (typeof project.altCols === 'boolean') state.altCols = project.altCols;
    if (typeof project.altRows === 'boolean') state.altRows = project.altRows; else state.altRows = false;
    if (typeof project.zoom === 'number') state.zoom = project.zoom;

    // Restore history if present
    if (project.history) {
      undoTree = project.history.undoTree || {};
      undoCurrentId = project.history.undoCurrentId ?? 0;
      undoNextId = project.history.undoNextId ?? 1;
      lastVisitedChild = project.history.lastVisitedChild || {};
      if (!undoTree[undoCurrentId]) createRootNode();
    } else {
      createRootNode();
    }

    state.selectedRow = null;
    state.selection = null;
    state.anchor = null;

    // Sync UI
    syncSidepanelFromState();
    applyStyles();
    setZoom(state.zoom);
    renderPatternList();
    renderTable();
    renderHistoryPanel();
    saveState();
    saveUndoTree();

    showToast('Project imported.');
  } catch (err) {
    showToast('Import failed: ' + err.message);
  }
}

// ── XLSX Import ────────────────────────────────────
async function handleImport(file) {
  if (!file) return;

  if (tableHasContent()) {
    const ok = await showConfirm('The current table contains data. Overwrite with the imported file?');
    if (!ok) return;
  }

  const arrayBuf = await file.arrayBuffer();

  try {
    if (typeof XLSX === 'undefined') { showToast('XLSX library not loaded.'); return; }

    const data = new Uint8Array(arrayBuf);
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (!json || json.length < 2) { showToast('Empty or invalid spreadsheet.'); return; }

    // ── Read bold/underline via ExcelJS ──
    // ExcelJS properly exposes cell.font.bold and cell.font.underline
    let cellStyles = {}; // { "r_c": { bold, underline } }
    if (typeof ExcelJS !== 'undefined') {
      try {
        const exWb = new ExcelJS.Workbook();
        await exWb.xlsx.load(arrayBuf);
        const exWs = exWb.worksheets[0];
        if (exWs) {
          exWs.eachRow((row, rowNum) => {
            row.eachCell((cell, colNum) => {
              const font = cell.font;
              if (font && (font.bold || font.underline)) {
                cellStyles[`${rowNum}_${colNum}`] = {
                  bold: !!font.bold,
                  underline: !!font.underline,
                };
              }
            });
          });
        }
      } catch (exErr) {
        console.warn('ExcelJS style read failed, continuing without styles:', exErr);
      }
    }

    // ── Detect header rows ──
    const headerRows = [];
    let dataStartRow = 0;

    for (let r = 0; r < json.length; r++) {
      const row = json[r];
      if (!row || row.length <= 1) { dataStartRow = r; break; }

      const cornerVal = row[0];
      const values = row.slice(1).map((v) => v === null || v === undefined ? '' : v);

      const detected = detectPatternFromValues(values);
      const cornerPattern = detectCornerPattern(cornerVal);

      if (detected || cornerPattern) {
        headerRows.push({ row: r, cornerVal, values, detected, cornerPattern });
        dataStartRow = r + 1;
      } else {
        break;
      }
    }

    if (headerRows.length === 0) {
      headerRows.push({
        row: 0,
        cornerVal: json[0][0],
        values: json[0].slice(1),
        detected: null,
        cornerPattern: null,
      });
      dataStartRow = 1;
    }

    // ── Build header patterns ──
    const newPatterns = [];
    const newOverrides = {};
    const numCols = Math.max(...json.map((r) => r.length)) - 1;

    headerRows.forEach((hr, idx) => {
      // Determine the pattern for this header row
      let pat = null;

      if (hr.detected) {
        pat = hr.detected;
      } else if (hr.cornerPattern) {
        const valDetected = detectPatternFromValues(hr.values);
        if (valDetected) {
          pat = valDetected;
        } else {
          pat = { pattern: '数字', start: 0, step: 1 };
          hr.values.forEach((v, c) => {
            if (v !== '' && v !== undefined) {
              newOverrides[`${idx}_${c}`] = String(v);
            }
          });
        }
      } else {
        pat = { pattern: '数字', start: 0, step: 1 };
        hr.values.forEach((v, c) => {
          if (v !== '' && v !== undefined) {
            newOverrides[`${idx}_${c}`] = String(v);
          }
        });
      }

      newPatterns.push(pat);

      // Always preserve the corner cell text when it differs from the pattern name
      const cornerStr = (hr.cornerVal !== undefined && hr.cornerVal !== null) ? String(hr.cornerVal) : '';
      if (cornerStr !== '' && cornerStr !== pat.pattern) {
        newOverrides[`corner_${idx}`] = cornerStr;
      }
    });

    // ── Build data rows with bold/underline detection ──
    const dropped = [];
    const newRows = [];
    const newCells = {};

    for (let r = dataStartRow; r < json.length; r++) {
      const rowData = json[r];
      if (!rowData || rowData.length === 0) continue;
      const name = String(rowData[0] || `Item ${newRows.length + 1}`);

      // Look up bold/underline from ExcelJS style data
      // ExcelJS rows are 1-based, columns are 1-based
      const exRow = r + 1; // xlsx row (1-based)
      const exCol = 1;     // column A
      const style = cellStyles[`${exRow}_${exCol}`] || {};

      newRows.push({
        name,
        bold: !!style.bold,
        underline: !!style.underline,
      });

      const rowIdx = newRows.length - 1;
      for (let c = 1; c < rowData.length && c <= numCols; c++) {
        const val = rowData[c] === null || rowData[c] === undefined ? '' : String(rowData[c]);
        if (val === '' || CYCLE.includes(val) || /^←\d+✓$/.test(val)) {
          if (val !== '') {
            if (!newCells[rowIdx]) newCells[rowIdx] = {};
            newCells[rowIdx][c - 1] = val;
          }
        } else {
          dropped.push(`Row ${r + 1}, Col ${c + 1}: "${val}"`);
        }
      }
    }

    commitUndoNode('Import');
    state.cols = numCols || state.cols;
    state.rows = newRows.length > 0 ? newRows : state.rows;
    state.cells = newCells;
    state.headerPatterns = newPatterns.length > 0 ? newPatterns : state.headerPatterns;
    state.headerOverrides = newOverrides;
    state.selectedRow = null;
    state.selection = null;
    state.anchor = null;

    $colCount.value = state.cols;
    renderPatternList();
    renderTable();
    saveState();

    if (dropped.length > 0) {
      showToast(`Imported. Dropped ${dropped.length} non-conforming cell(s).`);
      console.log('Dropped cells:', dropped);
    } else {
      showToast('Imported successfully.');
    }
  } catch (err) {
    showToast('Import failed: ' + err.message);
    console.error(err);
  }
}

// ── XLSX Export (styled, via ExcelJS) ──────────────
async function handleExport() {
  if (typeof ExcelJS === 'undefined') { showToast('ExcelJS library not loaded.'); return; }

  const cols = state.cols;
  const rows = state.rows;
  const hpats = state.headerPatterns;
  const fontName = state.font || 'Sarasa UI CL';

  // Three-colour system: accent hex for fills
  const accentHex = state.color.replace('#', '').toUpperCase();
  const accentARGB = 'FF' + accentHex;

  // Compute accent-text colour (black or white) for xlsx font colour
  const ar = parseInt(accentHex.slice(0, 2), 16);
  const ag = parseInt(accentHex.slice(2, 4), 16);
  const ab = parseInt(accentHex.slice(4, 6), 16);
  const lum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  const accentTextARGB = lum > 0.5 ? 'FF000000' : 'FFFFFFFF';

  // Border: black at opacity matching accent on white
  const avg = (ar + ag + ab) / 3;
  const borderGrey = Math.round(avg);
  const borderARGB = 'FF' + [borderGrey, borderGrey, borderGrey].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

  const accentFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentARGB } };
  const thinBorder = { style: 'thin', color: { argb: borderARGB } };
  const thickBorder = { style: 'medium', color: { argb: 'FF000000' } };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daakaa');
  wb.properties = { defaultFont: { name: fontName, size: 11 } };

  const totalCols = cols + 1;

  // Write header rows
  hpats.forEach((_, h) => {
    const rowData = [getCornerCellValue(h)];
    for (let c = 0; c < cols; c++) rowData.push(getHeaderCellValue(h, c));
    const exRow = ws.addRow(rowData);
    exRow.height = 20;

    exRow.eachCell((cell, colNum) => {
      cell.font = { name: fontName, size: 11, bold: true, color: { argb: accentTextARGB } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = accentFill;

      const isLastHeaderRow = h === hpats.length - 1;
      const isFirstCol = colNum === 1;

      cell.border = {
        top: thinBorder,
        left: thinBorder,
        right: isFirstCol ? thickBorder : thinBorder,
        bottom: isLastHeaderRow ? thickBorder : thinBorder,
      };
    });
  });

  // Write data rows
  rows.forEach((row, r) => {
    const rowData = [row.name];
    for (let c = 0; c < cols; c++) rowData.push(getCellValue(r, c));
    const exRow = ws.addRow(rowData);
    exRow.height = 20;

    exRow.eachCell((cell, colNum) => {
      cell.font = {
        name: fontName,
        size: 11,
        bold: colNum === 1 ? row.bold : false,
        underline: colNum === 1 ? row.underline : false,
        color: { argb: 'FF000000' },
      };

      if (colNum === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          right: thickBorder,
          bottom: thinBorder,
        };
        // "all" mode: sticky-left gets accent
        if (state.colorTarget === 'all') {
          cell.fill = accentFill;
          cell.font.color = { argb: accentTextARGB };
        }
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          right: thinBorder,
          bottom: thinBorder,
        };

        // Indicator colours (exempt from three-colour constraint)
        const val = String(cell.value || '');
        if (val === '✓') cell.font.color = { argb: 'FF2D8A4E' };
        else if (val === '×') cell.font.color = { argb: 'FFC0392B' };
        else if (val === '〇') cell.font.color = { argb: 'FF2980B9' };
        else if (val === '—') cell.font.color = { argb: borderARGB };

        // Alternating column fill
        if (state.altCols && colNum % 2 === 0) {
          cell.fill = accentFill;
        }
      }
    });
  });

  // Column widths
  ws.getColumn(1).width = 14;
  for (let c = 2; c <= totalCols; c++) ws.getColumn(c).width = 6;

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'daakaa.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Toast ──────────────────────────────────────────
function showToast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => {
    div.classList.add('fade-out');
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ── Persistence ────────────────────────────────────
let _lastSavedAt = 0;
let _lastModifiedAt = 0;

function saveState() {
  try {
    const s = { ...state };
    delete s.selectedRow;
    delete s.selection;
    delete s.anchor;
    delete s.viewMode;
    localStorage.setItem('daakaa-state', JSON.stringify(s));
  } catch (_) {}
  saveUndoTree();
  _lastSavedAt = Date.now();
  updateLastSavedDisplay();
}

// Format elapsed time as a short relative string.
function formatRelativeTime(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  return hr + 'h ago';
}

function updateLastSavedDisplay() {
  const el = document.getElementById('last-saved-display');
  if (!el) return;
  const parts = [];
  if (_lastModifiedAt) parts.push('Modified ' + formatRelativeTime(_lastModifiedAt));
  if (_lastSavedAt) parts.push('Saved ' + formatRelativeTime(_lastSavedAt));
  el.textContent = parts.join(' · ');
}

// Periodically refresh the relative time display.
setInterval(updateLastSavedDisplay, 30000);

function loadState() {
  try {
    const raw = localStorage.getItem('daakaa-state');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.cols) state.cols = s.cols;
    if (s.headerPatterns) state.headerPatterns = s.headerPatterns;
    if (s.rows) state.rows = s.rows;
    if (s.cells) state.cells = s.cells;
    if (s.font) state.font = s.font;
    if (s.color) state.color = s.color;
    if (s.colorTarget) state.colorTarget = s.colorTarget;
    if (typeof s.zoom === 'number') state.zoom = s.zoom;
    if (typeof s.altCols === 'boolean') state.altCols = s.altCols;
    if (typeof s.altRows === 'boolean') state.altRows = s.altRows;
    if (s.headerOverrides) state.headerOverrides = s.headerOverrides;
    if (s.pattern && !s.headerPatterns) {
      state.headerPatterns = [{ pattern: s.pattern, start: s.patternStart || 0, step: s.patternStep || 1 }];
    }
  } catch (_) {}
}

function syncSidepanelFromState() {
  $colCount.value = state.cols;
  $fontFamily.value = state.font;
  $themeColor.value = state.color;
  $colorTarget.value = state.colorTarget;
  $altColsToggle.checked = state.altCols;
  $table.classList.toggle('alt-cols', state.altCols);
  if ($altRowsToggle) $altRowsToggle.checked = state.altRows;
  $table.classList.toggle('alt-rows', state.altRows);
}

// Deselect on clicking editor background
$wrapper.addEventListener('click', (e) => {
  if (isModalOpen()) return;
  if (e.target === e.currentTarget || e.target === $table) {
    state.selectedRow = null;
    state.selection = null;
    state.anchor = null;
    $table.querySelectorAll('.sticky-left').forEach((td) => { td.style.background = '#fff'; });
    updateRowDetailsPanel();
    updateSelectionVisual();
  }
});

// ── Init ───────────────────────────────────────────
function init() {
  loadState();
  syncSidepanelFromState();
  applyStyles();
  document.documentElement.style.setProperty('--zoom', state.zoom);
  renderPatternList();
  renderTable();
  bindSidepanelControls();
  // Restore undo tree from localStorage, or create fresh
  try {
    const raw = localStorage.getItem('daakaa-undo-tree');
    if (raw) {
      const saved = JSON.parse(raw);
      undoTree = saved.undoTree || {};
      undoCurrentId = saved.undoCurrentId ?? 0;
      undoNextId = saved.undoNextId ?? 1;
      lastVisitedChild = saved.lastVisitedChild || {};
      // Validate: current node must exist
      if (!undoTree[undoCurrentId]) {
        createRootNode();
      }
    } else {
      createRootNode();
    }
  } catch (_) {
    createRootNode();
  }
  renderHistoryPanel();

  // Initialise the timestamp from current time (state was just loaded/saved).
  _lastSavedAt = Date.now();
  updateLastSavedDisplay();

  // Task 3: auto-scroll history when the desktop <details> panel is toggled open.
  const $histDetails = document.querySelector('.panel[data-tab-id="hist"]');
  if ($histDetails) {
    $histDetails.addEventListener('toggle', () => {
      if ($histDetails.open) scrollHistoryToCurrentNode();
    });
  }

  // Combined sidepanel drag+click logic

  $sidepanelToggle.addEventListener('mousedown', (e) => {
    if (isBottomMode) return;
    if ($sidepanel.classList.contains('collapsed')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = $sidepanel.offsetWidth;
    let moved = false;

    const onMove = (ev) => {
      moved = true;
      const delta = startX - ev.clientX;
      const newW = Math.max(40, Math.min(500, startW + delta));
      if (newW <= 40) {
        $sidepanel.classList.add('collapsed');
        $sidepanel.style.width = '';
        $sidepanel.style.minWidth = '';
        $sidepanelToggle.textContent = '‹';
        $sidepanelToggle.style.cursor = 'pointer';
        _lastSidepanelWidth = startW;
      } else {
        $sidepanel.classList.remove('collapsed');
        $sidepanel.style.width = newW + 'px';
        $sidepanel.style.minWidth = newW + 'px';
        _lastSidepanelWidth = newW;
        $sidepanelToggle.textContent = '⋮';
        $sidepanelToggle.style.cursor = 'col-resize';
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) {
        const collapsed = $sidepanel.classList.toggle('collapsed');
        if (collapsed) {
          _lastSidepanelWidth = startW;
          $sidepanel.style.width = '';
          $sidepanel.style.minWidth = '';
          $sidepanelToggle.textContent = '‹';
          $sidepanelToggle.style.cursor = 'pointer';
        } else {
          $sidepanel.style.width = _lastSidepanelWidth + 'px';
          $sidepanel.style.minWidth = _lastSidepanelWidth + 'px';
          $sidepanelToggle.textContent = '⋮';
          $sidepanelToggle.style.cursor = 'col-resize';
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  $sidepanelToggle.addEventListener('click', () => {
    if (!$sidepanel.classList.contains('collapsed')) return;
    $sidepanel.classList.remove('collapsed');
    $sidepanel.style.width = _lastSidepanelWidth + 'px';
    $sidepanel.style.minWidth = _lastSidepanelWidth + 'px';
    $sidepanelToggle.textContent = '⋮';
    $sidepanelToggle.style.cursor = 'col-resize';
  });

  // View mode floating action buttons — wrapped in a container
  const $viewModeContainer = document.createElement('div');
  $viewModeContainer.className = 'view-mode-container';

  const $viewModeBtn = document.createElement('button');
  $viewModeBtn.id = 'view-mode-btn';
  $viewModeBtn.className = 'view-mode-btn';
  $viewModeBtn.textContent = '\u25A2'; // ▢ = edit mode (open)
  $viewModeBtn.title = 'Toggle view mode (mouse drag only)';

  const $fitBtn = document.createElement('button');
  $fitBtn.className = 'view-mode-btn';
  $fitBtn.textContent = '\u229E';
  $fitBtn.title = 'Reset zoom & scroll to today';

  $viewModeContainer.appendChild($viewModeBtn);
  $viewModeContainer.appendChild($fitBtn);
  document.getElementById('editor').appendChild($viewModeContainer);

  if (!$sidepanel.classList.contains('collapsed')) {
    $sidepanelToggle.style.cursor = 'col-resize';
  }

  $fitBtn.addEventListener('click', () => {
    setZoom(1);
    scrollToTodayColumn();
  });

  $viewModeBtn.addEventListener('click', () => {
    state.viewMode = !state.viewMode;
    $viewModeBtn.textContent = state.viewMode ? '\u25A3' : '\u25A2'; // ▣ locked / ▢ open
    $viewModeBtn.classList.toggle('active', state.viewMode);
    $wrapper.classList.toggle('view-mode', state.viewMode);
    applyViewModeLock();
  });

  // Touch devices default to view mode
  if (isTouchDevice) {
    state.viewMode = true;
    $viewModeBtn.textContent = '\u25A3';
    $viewModeBtn.classList.add('active');
    $wrapper.classList.add('view-mode');
    applyViewModeLock();
  }

  $wrapper.addEventListener('mousedown', (e) => {
    if (!state.viewMode) return;
    if (e.target.closest('.sticky-left') || e.target.closest('thead')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startScrollX = $wrapper.scrollLeft, startScrollY = $wrapper.scrollTop;
    const onMove = (ev) => {
      $wrapper.scrollLeft = startScrollX - (ev.clientX - startX);
      $wrapper.scrollTop = startScrollY - (ev.clientY - startY);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── Bottom panel: tab click handlers ──────────────
  document.querySelectorAll('.bottom-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      // Touch + bottom-panel mode: tabs can only switch sections, never collapse.
      // Tapping the already-active tab is a no-op; collapse is drag-only.
      if (isTouchDevice && isBottomMode) {
        if (btn.classList.contains('active')) return;
        setActiveTab(tabId);
        return;
      }
      if (btn.classList.contains('active') && isBottomMode) {
        // Clicking active tab = toggle collapse
        if ($sidepanel.classList.contains('collapsed')) {
          $sidepanel.classList.remove('collapsed');
          $sidepanel.style.height = _lastBottomPanelHeight + 'px';
        } else {
          _lastBottomPanelHeight = $sidepanel.offsetHeight;
          $sidepanel.classList.add('collapsed');
          $sidepanel.style.height = '';
        }
      } else {
        setActiveTab(tabId);
      }
    });
  });

  // ── Bottom panel: drag-to-resize ──────────────────
  const $bottomHandle = document.querySelector('.bottom-panel-handle');
  if ($bottomHandle) {
    $bottomHandle.addEventListener('pointerdown', (e) => {
      if (!isBottomMode) return;
      e.preventDefault();
      const startY = e.clientY;
      const startH = $sidepanel.offsetHeight;
      let moved = false;

      const onMove = (ev) => {
        moved = true;
        const delta = startY - ev.clientY; // dragging up = taller
        // Floor = tab bar height + handle height so tabs remain fully visible.
        // Touch: 40 + 20 = 60; mouse: 32 + 8 = 40; use computed values.
        const tabBarH = document.querySelector('.bottom-panel-tabs')?.offsetHeight || 32;
        const handleH = $bottomHandle.offsetHeight || 8;
        const minPanelH = tabBarH + handleH;
        const newH = Math.max(minPanelH, Math.min(window.innerHeight * 0.7, startH + delta));
        if (newH <= minPanelH) {
          $sidepanel.classList.add('collapsed');
          $sidepanel.style.height = '';
          _lastBottomPanelHeight = startH;
        } else {
          $sidepanel.classList.remove('collapsed');
          $sidepanel.style.height = newH + 'px';
        }
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!moved) {
          // Touch + bottom-panel: disable click-to-toggle. Drag-only.
          if (isTouchDevice && isBottomMode) return;
          // Click: toggle collapse
          if ($sidepanel.classList.contains('collapsed')) {
            $sidepanel.classList.remove('collapsed');
            $sidepanel.style.height = _lastBottomPanelHeight + 'px';
          } else {
            _lastBottomPanelHeight = $sidepanel.offsetHeight;
            $sidepanel.classList.add('collapsed');
            $sidepanel.style.height = '';
          }
        } else if (!$sidepanel.classList.contains('collapsed')) {
          _lastBottomPanelHeight = $sidepanel.offsetHeight;
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  // ── Bottom mode: initial layout detection ─────────
  updateLayoutMode();

  // Task 4: scroll to today's column on page load (after layout settles).
  requestAnimationFrame(() => { scrollToTodayColumn(); });

}

init();
