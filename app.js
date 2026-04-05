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
  altCols: true,
  selectedRow: null,
};

const CYCLE = ['✓', '×', '〇', '—', ''];

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
const $btnImport = document.getElementById('btn-import');
const $btnExport = document.getElementById('btn-export');
const $fileInput = document.getElementById('xlsx-file-input');
const $rowDetailsBody = document.getElementById('row-details-body');

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

// ── Render Spreadsheet ─────────────────────────────
function renderTable() {
  const cols = state.cols;
  const rows = state.rows;
  const hpats = state.headerPatterns;

  let html = '';

  html += '<colgroup>';
  html += '<col style="width:auto; min-width:80px;">';
  for (let c = 0; c < cols; c++) {
    html += '<col style="width:auto; min-width:var(--cell-min-w);">';
  }
  html += '</colgroup>';

  html += '<thead>';
  for (let h = 0; h < hpats.length; h++) {
    html += `<tr data-header-row="${h}">`;
    const cornerVal = getCornerCellValue(h);
    html += `<th class="corner-cell" data-header-row="${h}" style="top:calc(${h} * var(--cell-h) * var(--zoom));">${esc(cornerVal)}</th>`;
    for (let c = 0; c < cols; c++) {
      const val = getHeaderCellValue(h, c);
      html += `<th data-header-row="${h}" data-col="${c}" style="top:calc(${h} * var(--cell-h) * var(--zoom));">${esc(val)}</th>`;
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
  html += '</tbody>';

  $table.innerHTML = html;
  bindTableEvents();
  updateRowDetailsPanel();
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
    td.addEventListener('click', () => {
      const r = +td.dataset.row;
      const c = +td.dataset.col;
      const cur = getCellValue(r, c);
      const base = cur.includes('←') ? '' : cur;
      const idx = CYCLE.indexOf(base);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      setCellValue(r, c, next);
      td.dataset.value = next;
      td.dataset.hasArrow = 'false';
      td.textContent = next;
      saveState();
    });

    td.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContentContextMenu(e.clientX, e.clientY, +td.dataset.row, +td.dataset.col);
    });
  });

  $table.querySelectorAll('thead th').forEach((th) => {
    th.addEventListener('dblclick', () => startHeaderCellEdit(th));
  });

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
      if (e.button !== 0) return;
      if (leftCell.classList.contains('cell-editing')) return;

      mouseDownPos = { x: e.clientX, y: e.clientY };
      isDragging = false;

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
        } else {
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
      startStickyLeftEdit(leftCell, rowIdx);
    });

    leftCell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showRowContextMenu(e.clientX, e.clientY, rowIdx);
    });

    // Touch: long-press for context menu
    let touchTimer = null;
    let touchMode = null;

    leftCell.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchMode = null;
      touchTimer = setTimeout(() => {
        touchTimer = null;
        touchMode = 'context';
        showRowContextMenu(touch.clientX, touch.clientY, rowIdx);
      }, 500);
    }, { passive: true });

    leftCell.addEventListener('touchmove', () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }, { passive: true });

    leftCell.addEventListener('touchend', () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      if (!touchMode) selectRow(rowIdx);
      touchMode = null;
    }, { passive: true });
  });
}

// ── Row selection ──────────────────────────────────
function selectRow(idx) {
  state.selectedRow = (state.selectedRow === idx) ? null : idx;
  $table.querySelectorAll('.sticky-left').forEach((td) => {
    const r = +td.dataset.row;
    td.style.background = r === state.selectedRow ? 'var(--accent)' : '#fff';
  });
  updateRowDetailsPanel();
}

// ── Row Details sidepanel ──────────────────────────
function updateRowDetailsPanel() {
  const idx = state.selectedRow;
  if (idx === null || idx === undefined || !state.rows[idx]) {
    $rowDetailsBody.innerHTML = '<p class="row-details-info">Double-click a row label to edit. Drag to reorder. Right-click for more options.</p>';
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

  const nameInput = document.getElementById('rd-name');
  nameInput.addEventListener('input', () => {
    state.rows[idx].name = nameInput.value;
    const cell = $table.querySelector(`.sticky-left[data-row="${idx}"]`);
    if (cell && !cell.classList.contains('cell-editing')) {
      cell.textContent = nameInput.value;
    }
    saveState();
  });

  document.getElementById('rd-bold').addEventListener('click', () => {
    state.rows[idx].bold = !state.rows[idx].bold;
    nameInput.style.fontWeight = state.rows[idx].bold ? '700' : '400';
    renderTable();
    saveState();
  });

  document.getElementById('rd-underline').addEventListener('click', () => {
    state.rows[idx].underline = !state.rows[idx].underline;
    nameInput.style.textDecoration = state.rows[idx].underline ? 'underline' : 'none';
    renderTable();
    saveState();
  });

  document.getElementById('rd-move-btn').addEventListener('click', () => {
    const target = Math.max(1, Math.min(state.rows.length, +document.getElementById('rd-move-target').value || 1)) - 1;
    if (target !== idx) {
      state.selectedRow = target;
      moveRow(idx, target);
      renderTable();
      saveState();
    }
  });

  document.getElementById('rd-delete').addEventListener('click', () => {
    deleteRow(idx);
  });
}

// ── Inline Editing: Sticky-left cells ──────────────
function startStickyLeftEdit(cell, rowIdx) {
  if (cell.classList.contains('cell-editing')) return;
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

function positionMenu(menu, x, y) {
  document.body.appendChild(menu);
  $contextMenu = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
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
    { label: `Set ←${checkCount}✓`, action: () => { setCellValue(row, col, `←${checkCount}✓`); renderTable(); saveState(); } },
    { label: 'sep' },
    { label: '✓', action: () => { setCellValue(row, col, '✓'); renderTable(); saveState(); } },
    { label: '×', action: () => { setCellValue(row, col, '×'); renderTable(); saveState(); } },
    { label: '〇', action: () => { setCellValue(row, col, '〇'); renderTable(); saveState(); } },
    { label: '—', action: () => { setCellValue(row, col, '—'); renderTable(); saveState(); } },
    { label: 'Clear', action: () => { setCellValue(row, col, ''); renderTable(); saveState(); } },
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
  del.addEventListener('click', () => { deleteRow(rowIdx); hideContextMenu(); });
  menu.appendChild(del);

  positionMenu(menu, x, y);

  const moveInput = document.getElementById('ctx-move-input');
  const moveBtn = document.getElementById('ctx-move-btn');
  const doMove = () => {
    const target = Math.max(1, Math.min(state.rows.length, +moveInput.value || 1)) - 1;
    if (target !== rowIdx) {
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

// Long-press for content cells (touch)
let longPressTimer = null;
document.addEventListener('touchstart', (e) => {
  const td = e.target.closest('.content-cell');
  if (!td) return;
  const touch = e.touches[0];
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    showContentContextMenu(touch.clientX, touch.clientY, +td.dataset.row, +td.dataset.col);
  }, 500);
}, { passive: true });

document.addEventListener('touchend', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
document.addEventListener('touchmove', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });

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
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">⟳</button>
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
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">⟳</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    } else {
      const stepDisplay = hp.step > 0 ? '+' + hp.step : String(hp.step);
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <input type="number" class="pat-start" data-index="${i}" value="${hp.start}" title="Start" style="width:40px;">
        <input type="text" class="pat-step" data-index="${i}" value="${stepDisplay}" title="Step" style="width:44px;">
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">⟳</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    }

    container.appendChild(div);
    $patternList.appendChild(container);
  });

  bindPatternEvents();
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
      state.headerPatterns[+input.dataset.index].start = +input.value || 0;
      renderTable();
      saveState();
    });
  });

  $patternList.querySelectorAll('.pat-step').forEach((input) => {
    input.addEventListener('input', () => {
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
        hp.mappings[key] = valInp.value;
        renderTable();
        saveState();
      });
      row.appendChild(valInp);

      const del = document.createElement('button');
      del.className = 'pattern-item-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
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

// Keyboard: Cmd +/- / 0
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(state.zoom + 0.1); }
  else if (e.key === '-') { e.preventDefault(); setZoom(state.zoom - 0.1); }
  else if (e.key === '0') { e.preventDefault(); setZoom(1); }
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
  $sidepanelToggle.addEventListener('click', () => {
    const collapsed = $sidepanel.classList.toggle('collapsed');
    $sidepanelToggle.textContent = collapsed ? '‹' : '›';
  });

  $colCount.addEventListener('input', () => {
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
    state.headerPatterns.push({ pattern: '数字', start: 1, step: 1 });
    renderPatternList();
    renderTable();
    saveState();
  });

  $addRowItem.addEventListener('click', () => {
    state.rows.push({ name: `Item ${state.rows.length + 1}`, bold: false, underline: false });
    renderTable();
    saveState();
  });

  $altColsToggle.addEventListener('change', () => {
    state.altCols = $altColsToggle.checked;
    $table.classList.toggle('alt-cols', state.altCols);
    saveState();
  });

  $btnImport.addEventListener('click', () => $fileInput.click());
  $fileInput.addEventListener('change', handleImport);
  $btnExport.addEventListener('click', handleExport);
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

  // 4-tier partial rollout: stripe fill (t2) and interaction state (t4).
  // t2 is the accent at 0.18 opacity — always a lighter wash than t4 on white.
  // t4 is the accent at full opacity — the unambiguous hover state.
  root.style.setProperty('--t2', `rgba(${r},${g},${b},0.18)`);
  root.style.setProperty('--t4', state.color);

  document.getElementById('app').dataset.colorTarget = state.colorTarget;
}

// ── Confirm Dialog ─────────────────────────────────
function showConfirm(msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    overlay.style.display = '';

    const yes = document.getElementById('confirm-yes');
    const no = document.getElementById('confirm-no');

    const cleanup = () => { overlay.style.display = 'none'; yes.onclick = null; no.onclick = null; };
    yes.onclick = () => { cleanup(); resolve(true); };
    no.onclick = () => { cleanup(); resolve(false); };
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

// ── XLSX Import ────────────────────────────────────
async function handleImport() {
  const file = $fileInput.files[0];
  if (!file) return;
  $fileInput.value = '';

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

    state.cols = numCols || state.cols;
    state.rows = newRows.length > 0 ? newRows : state.rows;
    state.cells = newCells;
    state.headerPatterns = newPatterns.length > 0 ? newPatterns : state.headerPatterns;
    state.headerOverrides = newOverrides;
    state.selectedRow = null;

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
function saveState() {
  try {
    const s = { ...state };
    delete s.selectedRow;
    localStorage.setItem('daakaa-state', JSON.stringify(s));
  } catch (_) {}
}

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
}

// Deselect on clicking editor background
$wrapper.addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target === $table) {
    state.selectedRow = null;
    $table.querySelectorAll('.sticky-left').forEach((td) => { td.style.background = '#fff'; });
    updateRowDetailsPanel();
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
}

init();
