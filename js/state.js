/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── State ──────────────────────────────────────────
var state = {
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
  groups: [],           // Array<{id, label, collapsed}>
  pinnedCollapsed: false,
  otherCollapsed: false,
  selectedGroup: null,  // string | null — group ID, "__pinned__", or "__other__"
};

var CYCLE = ['✓', '×', '〇', '—', ''];

var hoveredCell = null;

// ── Input model detection (§2–3 of spec) ──────────
// Resolved once at boot. See decoupled-input-and-layout.md.
function detectTouchDevice() {
  // 1. URL param override — persists to localStorage.
  try {
    var params = new URLSearchParams(window.location.search);
    var urlMode = params.get('input');
    if (urlMode === 'touch' || urlMode === 'mouse') {
      localStorage.setItem('daakaa_input_mode', urlMode);
    } else if (urlMode === 'auto') {
      localStorage.removeItem('daakaa_input_mode');
    }
  } catch (_) {}

  // 2. localStorage manual override.
  try {
    var stored = localStorage.getItem('daakaa_input_mode');
    if (stored === 'touch') return true;
    if (stored === 'mouse') return false;
  } catch (_) {}

  // 3. UA Client Hints.
  if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;

  var ua = navigator.userAgent || '';
  var platform = navigator.platform || '';
  var maxTouch = navigator.maxTouchPoints || 0;

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

var isTouchDevice = detectTouchDevice();

// Attach body classes once at boot; never removed.
document.body.classList.add(isTouchDevice ? 'input-touch' : 'input-mouse');

// ── Read-only helper (§7 of spec) ─────────────────
// Centralised guard for every content-editing entry point.
// View mode locks grid-data editing only — Style / Header Patterns
// / sidepanel config remain editable.
function isReadOnly() {
  return state.viewMode === true;
}

// ── Utility functions ──────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function getCellValue(r, c) {
  return (state.cells[r] && state.cells[r][c]) || '';
}

function setCellValue(r, c, v) {
  if (!state.cells[r]) state.cells[r] = {};
  state.cells[r][c] = v;
}

// ── DOM References ─────────────────────────────────
var $sidepanel = document.getElementById('sidepanel');
var $sidepanelToggle = document.getElementById('sidepanel-toggle');
var $table = document.getElementById('spreadsheet');
var $wrapper = document.getElementById('spreadsheet-wrapper');
var $colCount = document.getElementById('col-count');
var $fontFamily = document.getElementById('font-family');
var $themeColor = document.getElementById('theme-color');
var $colorTarget = document.getElementById('color-target');
var $patternList = document.getElementById('pattern-list');
var $addPattern = document.getElementById('add-pattern');
var $addRowItem = document.getElementById('add-row-item');
var $altColsToggle = document.getElementById('alt-cols-toggle');
var $altRowsToggle = document.getElementById('alt-rows-toggle');
var $btnImport = document.getElementById('btn-import');
var $btnExport = document.getElementById('btn-export');
var $btnProjExport = document.getElementById('btn-proj-export');
var $btnSave = document.getElementById('btn-save');
var $importFileInput = document.getElementById('import-file-input');
var $rowDetailsBody = document.getElementById('row-details-body');
var $btnUndo = document.getElementById('btn-undo');
var $btnRedo = document.getElementById('btn-redo');

// ── Bottom Mode (responsive) ──────────────────────
var isBottomMode = false;
var mql = window.matchMedia('(max-width: 768px)');
var _savedPanelStates = {}; // { tabId: boolean }
var _lastBottomPanelHeight = 240;
var _lastSidepanelWidth = 280;

// ── Focus Gate ─────────────────────────────────────
// When the page regains focus, the first click only refocuses — no action.
// mousedown is NOT blocked so focus transfer and scroll targeting work normally.
var _pageFocused = document.hasFocus();
var _refocusClick = false; // true during the mousedown→click of a refocus sequence

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
