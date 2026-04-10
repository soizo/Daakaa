/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Keyboard shortcuts (unified) ───────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.selection = null;
    state.anchor = null;
    state.selectedHeader = null;
    state.selectedGroup = null;
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
      var { r1, c1, r2, c2 } = state.selection;
      commitUndoNode('Clear cells');
      for (var r = r1; r <= r2; r++) {
        var sr = displayToStorageIndex(r);
        if (sr < 0) continue;
        for (var c = c1; c <= c2; c++) {
          setCellValue(sr, c, '');
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

    var keyMap = {
      'v': '✓', 'V': '✓',
      'x': '×', 'X': '×',
      '-': '—',
      'o': '〇', 'O': '〇',
    };

    var val = keyMap[e.key];
    var isComma = e.key === ',';

    if (val || isComma) {
      e.preventDefault();

      if (state.selection) {
        var { r1, c1, r2, c2 } = state.selection;
        commitUndoNode('Set cells');
        for (var r = r1; r <= r2; r++) {
          var sr = displayToStorageIndex(r);
          if (sr < 0) continue;
          for (var c = c1; c <= c2; c++) {
            if (isComma) {
              var count = 0;
              for (var cc = 0; cc <= c; cc++) {
                var cv = getCellValue(sr, cc);
                if (cv === '✓' || cv.includes('✓')) count++;
              }
              setCellValue(sr, c, `←${count}✓`);
            } else {
              setCellValue(sr, c, val);
            }
          }
        }
        renderTable();
        saveState();
      } else if (hoveredCell) {
        var hr = hoveredCell.r;
        var hc = hoveredCell.c;
        commitUndoNode('Set cell');
        if (isComma) {
          var count = 0;
          for (var cc = 0; cc <= hc; cc++) {
            var cv = getCellValue(hr, cc);
            if (cv === '✓' || cv.includes('✓')) count++;
          }
          setCellValue(hr, hc, `←${count}✓`);
        } else {
          setCellValue(hr, hc, val);
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
    var delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(state.zoom + delta);
  }
}, { passive: false });

// Pinch-to-zoom (touch) via gesturestart/gesturechange (Safari)
var gestureStartZoom = 1;
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
var pinchTouches = [];
var pinchStartDist = 0;
var pinchStartZoom = 1;

$wrapper.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchTouches = Array.from(e.touches);
    var dx = pinchTouches[0].clientX - pinchTouches[1].clientX;
    var dy = pinchTouches[0].clientY - pinchTouches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartZoom = state.zoom;
  }
}, { passive: true });

$wrapper.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDist > 0) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.hypot(dx, dy);
    var scale = dist / pinchStartDist;
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
    var newRow = { name: `Item ${state.rows.length + 1}`, bold: false, underline: false };
    // When groups exist, inherit groupId from the selected row
    if (state.groups.length > 0 && state.selectedRow !== null && state.rows[state.selectedRow]) {
      var selGid = state.rows[state.selectedRow].groupId;
      if (selGid != null && state.groups.some(g => g.id === selGid)) {
        newRow.groupId = selGid;
      }
    }
    state.rows.push(newRow);
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

  // Collapse-all / Expand-all
  var $collapseAll = document.getElementById('btn-collapse-all');
  var $expandAll = document.getElementById('btn-expand-all');
  if ($collapseAll) {
    $collapseAll.addEventListener('click', () => {
      state.groups.forEach(g => g.collapsed = true);
      state.pinnedCollapsed = true;
      state.otherCollapsed = true;
      renderTable();
      saveState();
    });
  }
  if ($expandAll) {
    $expandAll.addEventListener('click', () => {
      state.groups.forEach(g => g.collapsed = false);
      state.pinnedCollapsed = false;
      state.otherCollapsed = false;
      renderTable();
      saveState();
    });
  }

  $btnUndo.addEventListener('click', () => { if (!isReadOnly()) undo(); });
  $btnRedo.addEventListener('click', () => { if (!isReadOnly()) redo(); });
}

// Deselect on clicking editor background
$wrapper.addEventListener('click', (e) => {
  if (isModalOpen()) return;
  if (e.target === e.currentTarget || e.target === $table) {
    state.selectedRow = null;
    state.selectedGroup = null;
    state.selection = null;
    state.anchor = null;
    $table.querySelectorAll('.sticky-left').forEach((td) => { td.style.background = '#fff'; });
    updateRowDetailsPanel();
    updateSelectionVisual();
  }
});

// ── Media query listener ───────────────────────────
mql.addEventListener('change', updateLayoutMode);

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
    var raw = localStorage.getItem('daakaa-undo-tree');
    if (raw) {
      var saved = JSON.parse(raw);
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
  var $histDetails = document.querySelector('.panel[data-tab-id="hist"]');
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
    var startX = e.clientX;
    var startW = $sidepanel.offsetWidth;
    var moved = false;

    var onMove = (ev) => {
      moved = true;
      var delta = startX - ev.clientX;
      var newW = Math.max(40, Math.min(500, startW + delta));
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

    var onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) {
        var collapsed = $sidepanel.classList.toggle('collapsed');
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
  var $viewModeContainer = document.createElement('div');
  $viewModeContainer.className = 'view-mode-container';

  var $viewModeBtn = document.createElement('button');
  $viewModeBtn.id = 'view-mode-btn';
  $viewModeBtn.className = 'view-mode-btn';
  $viewModeBtn.textContent = '\u25A2'; // ▢ = edit mode (open)
  $viewModeBtn.title = 'Toggle view mode (mouse drag only)';

  var $fitBtn = document.createElement('button');
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
    var startX = e.clientX, startY = e.clientY;
    var startScrollX = $wrapper.scrollLeft, startScrollY = $wrapper.scrollTop;
    var onMove = (ev) => {
      $wrapper.scrollLeft = startScrollX - (ev.clientX - startX);
      $wrapper.scrollTop = startScrollY - (ev.clientY - startY);
    };
    var onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── Bottom panel: tab click handlers ──────────────
  document.querySelectorAll('.bottom-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      var tabId = btn.dataset.tab;
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
  var $bottomHandle = document.querySelector('.bottom-panel-handle');
  if ($bottomHandle) {
    $bottomHandle.addEventListener('pointerdown', (e) => {
      if (!isBottomMode) return;
      e.preventDefault();
      var startY = e.clientY;
      var startH = $sidepanel.offsetHeight;
      var moved = false;

      var onMove = (ev) => {
        moved = true;
        var delta = startY - ev.clientY; // dragging up = taller
        var tabBarH = document.querySelector('.bottom-panel-tabs')?.offsetHeight || 32;
        var handleH = $bottomHandle.offsetHeight || 8;
        var minPanelH = tabBarH + handleH;
        var newH = Math.max(minPanelH, Math.min(window.innerHeight * 0.7, startH + delta));
        if (newH <= minPanelH) {
          $sidepanel.classList.add('collapsed');
          $sidepanel.style.height = '';
          _lastBottomPanelHeight = startH;
        } else {
          $sidepanel.classList.remove('collapsed');
          $sidepanel.style.height = newH + 'px';
        }
      };

      var onUp = () => {
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
