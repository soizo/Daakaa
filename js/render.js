/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Resolved Row List (Display Model) ──────────────
function resolveDisplayRows() {
  var rows = state.rows;
  var groups = state.groups;

  // No groups: return all rows flat, identical to legacy behaviour.
  if (groups.length === 0) {
    return rows.map((row, i) => ({ type: 'row', storageIndex: i, row: row }));
  }

  var groupIdSet = new Set(groups.map(g => g.id));
  var entries = [];

  // 1. Pinned rows: groupId === '__pinned__' (explicit only)
  var pinnedRows = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].groupId === '__pinned__') pinnedRows.push(i);
  }
  if (pinnedRows.length > 0) {
    entries.push({ type: 'pinned-header', collapsed: state.pinnedCollapsed });
    if (!state.pinnedCollapsed) {
      for (var _p = 0; _p < pinnedRows.length; _p++) {
        var si = pinnedRows[_p];
        entries.push({ type: 'row', storageIndex: si, row: rows[si] });
      }
    }
  }

  // 2. Named groups in order.
  for (var _g = 0; _g < groups.length; _g++) {
    var group = groups[_g];
    entries.push({ type: 'group-header', groupId: group.id, group: group });
    if (!group.collapsed) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].groupId === group.id) {
          entries.push({ type: 'row', storageIndex: i, row: rows[i] });
        }
      }
    }
  }

  // 3. Other: groupId is null, undefined, or matches no existing group
  var otherRows = [];
  for (var i = 0; i < rows.length; i++) {
    var gid = rows[i].groupId;
    if (gid === '__pinned__') continue; // already in pinned
    if (gid != null && groupIdSet.has(gid)) continue; // in a named group
    otherRows.push(i); // null, undefined, or orphaned → Other
  }
  if (otherRows.length > 0) {
    entries.push({ type: 'other-header', collapsed: state.otherCollapsed });
    if (!state.otherCollapsed) {
      for (var _o = 0; _o < otherRows.length; _o++) {
        var si = otherRows[_o];
        entries.push({ type: 'row', storageIndex: si, row: rows[si] });
      }
    }
  }

  return entries;
}

// Map a display index (from data-row attribute) to storage index (state.rows index).
// Returns -1 if no matching data row exists for that display index.
function displayToStorageIndex(displayIdx) {
  var displayRows = resolveDisplayRows();
  var di = 0;
  for (var _i = 0; _i < displayRows.length; _i++) {
    var entry = displayRows[_i];
    if (entry.type !== 'row') continue;
    if (di === displayIdx) return entry.storageIndex;
    di++;
  }
  return -1;
}

// ── Render Spreadsheet ─────────────────────────────
function renderTable() {
  var cols = state.cols;
  var rows = state.rows;
  var hpats = state.headerPatterns;

  var html = '';

  html += '<colgroup>';
  html += '<col style="width:auto; min-width:calc(80px * var(--zoom));">';
  for (var c = 0; c < cols; c++) {
    html += '<col style="width:auto; min-width:var(--cell-min-w);">';
  }
  html += '</colgroup>';

  html += '<thead>';
  for (var h = 0; h < hpats.length; h++) {
    html += `<tr data-header-row="${h}">`;
    var cornerVal = getCornerCellValue(h);
    var todayBold = isCornerCellToday(h) ? 'font-weight:700;' : '';
    html += `<th class="corner-cell" data-header-row="${h}" style="top:calc(${h} * var(--cell-h) * var(--zoom));${todayBold}">${esc(cornerVal)}</th>`;
    var todayCols = null;
    if (isCornerCellToday(h)) {
      var todayDate = new Date().getDate();
      var allVals = getPatternValues(hpats[h], cols);
      todayCols = new Set();
      allVals.forEach((v, i) => { if (String(v) === String(todayDate)) todayCols.add(i); });
    }
    for (var c = 0; c < cols; c++) {
      var val = getHeaderCellValue(h, c);
      var isTodayCol = todayCols && todayCols.has(c);
      var todayStyle = isTodayCol ? 'font-weight:700;' : '';
      html += `<th data-header-row="${h}" data-col="${c}" style="top:calc(${h} * var(--cell-h) * var(--zoom));${todayStyle}">${esc(val)}</th>`;
    }
    html += '</tr>';
  }
  html += '</thead>';

  html += '<tbody>';
  var displayRows = resolveDisplayRows();
  var displayIdx = 0;
  var stripeCounter = 0;
  for (var di = 0; di < displayRows.length; di++) {
    var entry = displayRows[di];

    if (entry.type === 'pinned-header' || entry.type === 'group-header' || entry.type === 'other-header') {
      // Group header row
      var groupId, groupType, label, collapsed;
      if (entry.type === 'pinned-header') {
        groupId = '__pinned__'; groupType = 'pinned'; label = 'Pinned'; collapsed = entry.collapsed;
      } else if (entry.type === 'other-header') {
        groupId = '__other__'; groupType = 'other'; label = 'Other'; collapsed = entry.collapsed;
      } else {
        groupId = entry.groupId; groupType = 'named'; label = entry.group.label; collapsed = entry.group.collapsed;
      }

      // Determine member row count for this group
      var memberCount = countGroupRows(groupId);
      var trClasses = ['group-header-row'];
      if (memberCount === 0) trClasses.push('group-empty');
      if (state.selectedGroup === groupId) trClasses.push('group-header-selected');

      var toggleChar = collapsed ? '\u25B8' : '\u25BE';

      html += `<tr class="${trClasses.join(' ')}" data-group-id="${escAttr(groupId)}" data-group-type="${groupType}"${collapsed ? ' data-collapsed="true"' : ''}>`;
      var summaryText = collapsed ? computeGroupSummary(groupId) : '[' + countGroupRows(groupId) + ' rows]';
      html += `<td class="sticky-left group-header-label" colspan="${cols + 1}">`;
      html += `<span class="group-toggle">${toggleChar}</span>`;
      html += `<span class="group-label-text">${esc(label)}</span>`;
      html += `<span class="group-summary-text">${esc(summaryText)}</span>`;
      html += `</td>`;
      html += '</tr>';
      continue;
    }

    // Regular data row
    var r = entry.storageIndex;
    var row = entry.row;
    var isSelected = state.selectedRow === r;
    var stripeClass = (stripeCounter % 2 === 1) ? ' class="alt-stripe"' : '';
    stripeCounter++;
    html += `<tr data-row="${displayIdx}" data-storage-row="${r}"${stripeClass}>`;

    var leftStyle = '';
    if (row.bold) leftStyle += 'font-weight:700;';
    if (row.underline) leftStyle += 'text-decoration:underline;';
    if (isSelected) leftStyle += 'background:var(--accent);';

    html += `<td class="sticky-left" data-row="${displayIdx}" data-storage-row="${r}" style="${leftStyle}">${esc(row.name)}</td>`;

    for (var c = 0; c < cols; c++) {
      var val = getCellValue(r, c);
      var hasArrow = val.includes('←') ? 'true' : 'false';
      html += `<td class="content-cell" data-row="${displayIdx}" data-storage-row="${r}" data-col="${c}" data-value="${escAttr(val)}" data-has-arrow="${hasArrow}">${esc(val)}</td>`;
    }
    html += '</tr>';
    displayIdx++;
  }
  html += `<tr class="add-row-strip"><td colspan="${cols + 1}" class="add-row-cell"></td></tr>`;
  html += '</tbody>';

  $table.innerHTML = html;
  bindTableEvents();
  updateRowDetailsPanel();
  updateSelectionVisual();

  // Show/hide collapse-all/expand-all buttons based on whether groups exist
  var $groupActions = document.getElementById('group-actions');
  if ($groupActions) {
    $groupActions.style.display = state.groups.length > 0 ? '' : 'none';
  }
}

function updateSelectionVisual() {
  $table.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
  if (!state.selection) return;
  var { r1, c1, r2, c2 } = state.selection;
  $table.querySelectorAll('.content-cell').forEach(td => {
    var r = +td.dataset.row;
    var c = +td.dataset.col;
    if (r >= r1 && r <= r2 && c >= c1 && c <= c2) {
      td.classList.add('cell-selected');
    }
  });
}

// ── Table Event Binding ────────────────────────────
function bindTableEvents() {
  $table.querySelectorAll('.content-cell').forEach((td) => {
    td.addEventListener('click', (e) => {
      if (isModalOpen()) return;
      var sr = +td.dataset.storageRow; // storage index for data operations
      var r = +td.dataset.row;         // display index for selection
      var c = +td.dataset.col;

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
      state.anchor = { r: r, c: c };
      state.selectedHeader = null;
      state.selectedGroup = null;
      if (isTouchDevice) {
        state.selection = { r1: r, c1: c, r2: r, c2: c };
      } else {
        state.selection = null;
      }
      updateSelectionVisual();

      if (!isReadOnly()) {
        var cur = getCellValue(sr, c);

        // Arrow-prefixed value (←N✓): on mouse, inline edit the number instead
        // of cycling. On touch, inline edit is disabled — cycle through instead
        // (edits happen via Row Details / context menu long-press).
        var arrowMatch = !isTouchDevice && /^←(\d+)✓$/.exec(cur);
        if (arrowMatch) {
          // Prevent duplicate editors
          if (td.querySelector('input')) return;
          var oldNum = arrowMatch[1];
          td.classList.add('cell-editing');
          td.textContent = '';
          var input = document.createElement('input');
          input.type = 'number';
          input.value = oldNum;
          input.min = '0';
          td.appendChild(input);
          input.focus();
          input.select();

          commitUndoNode('Edit arrow count');
          var commit = () => {
            var n = input.value.replace(/\D/g, '') || '0';
            var next = `←${n}✓`;
            setCellValue(sr, c, next);
            td.dataset.value = next;
            td.dataset.hasArrow = 'true';
            td.textContent = next;
            td.classList.remove('cell-editing');
            saveState();
          };
          var cancel = () => {
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
        var base = cur.includes('←') ? '' : cur;
        var idx = CYCLE.indexOf(base);
        var next = CYCLE[(idx + 1) % CYCLE.length];
        commitUndoNodeThrottled('Toggle cell');
        setCellValue(sr, c, next);
        td.dataset.value = next;
        td.dataset.hasArrow = 'false';
        td.textContent = next;
        saveState();
      }
      updateSelectionVisual();
      updateRowDetailsPanel();
    });

    td.addEventListener('mouseenter', () => {
      hoveredCell = { r: +td.dataset.storageRow, c: +td.dataset.col };
    });
    td.addEventListener('mouseleave', () => {
      hoveredCell = null;
    });

    td.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isReadOnly()) return;
      var sr = +td.dataset.storageRow;
      var r = +td.dataset.row;
      var c = +td.dataset.col;

      if (state.selection) {
        var { r1, c1, r2, c2 } = state.selection;
        var isMulti = (r2 - r1 + c2 - c1) > 0;
        var isInside = r >= r1 && r <= r2 && c >= c1 && c <= c2;
        if (isMulti && isInside) {
          showBatchContextMenu(e.clientX, e.clientY);
          return;
        }
      }

      showContentContextMenu(e.clientX, e.clientY, sr, c);
    });
  });

  // Group header row: click/drag/context interactions
  $table.querySelectorAll('.group-header-row').forEach((tr) => {
    var groupId = tr.dataset.groupId;
    var groupType = tr.dataset.groupType;
    var isNamed = groupType === 'named';

    // ── Mouse: drag-to-reorder (named groups only) + click-to-toggle ──
    var gMouseDownPos = null;
    var gIsDragging = false;
    var G_DRAG_THRESHOLD = 5;

    var labelCell = tr.querySelector('.group-header-label');

    if (labelCell) {
      labelCell.addEventListener('mousedown', (e) => {
        if (isModalOpen()) return;
        if (e.button !== 0) return;
        if (isTouchDevice) return;

        if (!isNamed || isReadOnly()) {
          // Non-draggable: just let click fire normally
          return;
        }

        gMouseDownPos = { x: e.clientX, y: e.clientY };
        gIsDragging = false;

        var onMove = (ev) => {
          if (!gMouseDownPos) return;
          var dx = ev.clientX - gMouseDownPos.x;
          var dy = ev.clientY - gMouseDownPos.y;
          if (Math.abs(dx) + Math.abs(dy) > G_DRAG_THRESHOLD && !gIsDragging) {
            gIsDragging = true;
            startGroupDrag(tr, groupId, gMouseDownPos.y);
          }
          if (gIsDragging) {
            handleRowDragMove(ev);
          }
        };

        var onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (gIsDragging) {
            finishRowDrag();
          }
          // If not dragging, the click event will fire naturally and handle toggle/select
          gMouseDownPos = null;
          gIsDragging = false;
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    tr.addEventListener('click', (e) => {
      // If a drag just finished, don't toggle
      if (gIsDragging) return;
      // Toggle collapse
      if (groupId === '__pinned__') {
        state.pinnedCollapsed = !state.pinnedCollapsed;
      } else if (groupId === '__other__') {
        state.otherCollapsed = !state.otherCollapsed;
      } else {
        var group = state.groups.find(g => g.id === groupId);
        if (group) group.collapsed = !group.collapsed;
      }
      // Select group
      state.selectedGroup = groupId;
      state.selectedRow = null;
      state.selection = null;
      state.anchor = null;
      // No undo node — collapse is ephemeral UI state.
      renderTable();
      saveState();
    });

    // Double-click: inline rename (mouse only, named groups only)
    tr.addEventListener('dblclick', (e) => {
      if (isReadOnly()) return;
      if (isTouchDevice) return;
      if (groupType !== 'named') return;
      e.stopPropagation();
      startGroupLabelInlineEdit(tr, groupId);
    });

    // Context menu (mouse)
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGroupContextMenu(e.clientX, e.clientY, groupId, groupType);
    });

    // ── Touch: drag to reorder (named groups only) ──
    var gTouchArmTimer = null;
    var gTouchStart = null;
    var gTouchArmed = false;
    var gTouchDragging = false;
    var G_TOUCH_ARM_MS = 250;
    var G_TOUCH_MOVE_PX = 6;

    var clearGTouchTimers = () => {
      if (gTouchArmTimer) { clearTimeout(gTouchArmTimer); gTouchArmTimer = null; }
    };

    tr.addEventListener('touchstart', (e) => {
      if (!isTouchDevice) return;
      if (e.touches.length > 1) {
        clearGTouchTimers();
        gTouchStart = null;
        gTouchArmed = false;
        if (gTouchDragging) finishRowDrag();
        gTouchDragging = false;
        return;
      }
      if (isModalOpen()) return;
      var touch = e.touches[0];
      gTouchStart = { x: touch.clientX, y: touch.clientY };
      gTouchArmed = false;
      gTouchDragging = false;

      if (!isReadOnly() && isNamed) {
        gTouchArmTimer = setTimeout(() => {
          gTouchArmTimer = null;
          gTouchArmed = true;
        }, G_TOUCH_ARM_MS);
      }
    }, { passive: true });

    tr.addEventListener('touchmove', (e) => {
      if (!isTouchDevice) return;
      if (!gTouchStart) return;
      var touch = e.touches[0];
      var dx = touch.clientX - gTouchStart.x;
      var dy = touch.clientY - gTouchStart.y;
      var moved = Math.abs(dx) + Math.abs(dy);

      if (!gTouchArmed) {
        if (moved > G_TOUCH_MOVE_PX) {
          clearGTouchTimers();
          gTouchStart = null;
        }
        return;
      }

      if (gTouchArmed && !gTouchDragging && moved > G_TOUCH_MOVE_PX) {
        gTouchDragging = true;
        startGroupDrag(tr, groupId, touch.clientY);
      }

      if (gTouchDragging) {
        handleRowDragMove({ clientX: touch.clientX, clientY: touch.clientY });
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    tr.addEventListener('touchend', () => {
      if (!isTouchDevice) return;
      clearGTouchTimers();
      if (gTouchDragging) {
        finishRowDrag();
      }
      gTouchStart = null;
      gTouchArmed = false;
      gTouchDragging = false;
    }, { passive: true });

    tr.addEventListener('touchcancel', () => {
      clearGTouchTimers();
      if (gTouchDragging) finishRowDrag();
      gTouchStart = null;
      gTouchArmed = false;
      gTouchDragging = false;
    }, { passive: true });
  });

  $table.querySelectorAll('thead th').forEach((th) => {
    th.addEventListener('click', () => {
      if (isModalOpen()) return;
      state.selection = null;
      state.anchor = null;
      state.selectedGroup = null;
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

  var addRowCell = $table.querySelector('.add-row-cell');
  if (addRowCell) {
    addRowCell.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Add row');
      var newRow = { name: `Item ${state.rows.length + 1}`, bold: false, underline: false };
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
  }

  bindStickyLeftInteractions();
}

// ── Sticky-left: drag vs dblclick ──────────────────
function bindStickyLeftInteractions() {
  var tbody = $table.querySelector('tbody');
  if (!tbody) return;
  var trs = Array.from(tbody.querySelectorAll('tr[data-row]'));

  trs.forEach((tr) => {
    var leftCell = tr.querySelector('.sticky-left');
    if (!leftCell) return;
    var rowIdx = +tr.dataset.storageRow;  // storage index for data operations
    var displayIdx = +tr.dataset.row;      // display index for selection visuals

    var mouseDownPos = null;
    var isDragging = false;
    var DRAG_THRESHOLD = 5;

    leftCell.addEventListener('mousedown', (e) => {
      if (isModalOpen()) return;
      if (e.button !== 0) return;
      if (isTouchDevice) return; // touch devices use the touchstart path below
      if (leftCell.classList.contains('cell-editing')) return;
      if (isReadOnly()) {
        // In view mode: allow normal row selection via click, no drag.
        state.anchor = { r: displayIdx, c: 0 };
        selectRow(rowIdx);
        return;
      }

      mouseDownPos = { x: e.clientX, y: e.clientY };
      isDragging = false;
      var wasShift = e.shiftKey;

      var onMove = (ev) => {
        if (!mouseDownPos) return;
        var dx = ev.clientX - mouseDownPos.x;
        var dy = ev.clientY - mouseDownPos.y;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD && !isDragging) {
          isDragging = true;
          startRowDrag(tr, rowIdx, mouseDownPos.y);
        }
        if (isDragging) {
          handleRowDragMove(ev);
        }
      };

      var onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (isDragging) {
          finishRowDrag();
        } else if (wasShift && state.anchor) {
          var r1 = Math.min(state.anchor.r, displayIdx);
          var r2 = Math.max(state.anchor.r, displayIdx);
          state.selection = { r1: r1, c1: 0, r2: r2, c2: state.cols - 1 };
          updateSelectionVisual();
        } else {
          state.anchor = { r: displayIdx, c: 0 };
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
        var { r1, r2, c1, c2 } = state.selection;
        var isFullWidth = c1 === 0 && c2 === state.cols - 1;
        var isMulti = r2 > r1;
        if (isMulti && isFullWidth && displayIdx >= r1 && displayIdx <= r2) {
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
    var touchArmTimer = null;
    var touchStartXY = null;
    var touchArmed = false;     // drag armed after 250ms
    var touchDragging = false;
    var TOUCH_ARM_MS = 250;
    var TOUCH_MOVE_PX = 6;

    var clearTouchTimers = () => {
      if (touchArmTimer) { clearTimeout(touchArmTimer); touchArmTimer = null; }
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
      var touch = e.touches[0];
      touchStartXY = { x: touch.clientX, y: touch.clientY };
      touchArmed = false;
      touchDragging = false;

      if (!isReadOnly()) {
        touchArmTimer = setTimeout(() => {
          touchArmTimer = null;
          touchArmed = true;
        }, TOUCH_ARM_MS);
      }
    }, { passive: true });

    leftCell.addEventListener('touchmove', (e) => {
      if (!isTouchDevice) return;
      if (!touchStartXY) return;
      var touch = e.touches[0];
      var dx = touch.clientX - touchStartXY.x;
      var dy = touch.clientY - touchStartXY.y;
      var moved = Math.abs(dx) + Math.abs(dy);

      if (!touchArmed) {
        // Movement before arm → scroll wins, cancel all timers
        if (moved > TOUCH_MOVE_PX) {
          clearTouchTimers();
          touchStartXY = null;
        }
        return;
      }

      if (touchArmed && !touchDragging && moved > TOUCH_MOVE_PX) {
        touchDragging = true;
        var tr = leftCell.closest('tr');
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
      } else if (touchStartXY) {
        // Simple tap → select row
        selectRow(rowIdx);
      }
      touchStartXY = null;
      touchArmed = false;
      touchDragging = false;
    }, { passive: true });

    leftCell.addEventListener('touchcancel', () => {
      clearTouchTimers();
      if (touchDragging) finishRowDrag();
      touchStartXY = null;
      touchArmed = false;
      touchDragging = false;
    }, { passive: true });
  });
}

// ── Row selection ──────────────────────────────────
function selectRow(idx) {
  state.selectedRow = (state.selectedRow === idx) ? null : idx;
  state.selectedGroup = null;
  // Per sidepanel-editing-coverage.md resolution #5, state.selectedRow and
  // state.selection may coexist. Do not clear state.selection here.
  state.anchor = null;
  $table.querySelectorAll('.sticky-left').forEach((td) => {
    if (td.dataset.storageRow === undefined) return; // skip group header sticky-left cells
    var r = +td.dataset.storageRow;
    td.style.background = r === state.selectedRow ? 'var(--accent)' : '#fff';
  });
  updateRowDetailsPanel();
  updateSelectionVisual();
}

// ── Inline Editing: Sticky-left cells ──────────────
function startStickyLeftEdit(cell, rowIdx) {
  if (cell.classList.contains('cell-editing')) return;
  commitUndoNode('Edit row name');
  var row = state.rows[rowIdx];
  var oldText = row.name;

  cell.classList.add('cell-editing');
  cell.innerHTML = '';

  var input = document.createElement('input');
  input.type = 'text';
  input.value = oldText;
  input.style.fontWeight = row.bold ? '700' : '400';
  input.style.textDecoration = row.underline ? 'underline' : 'none';
  cell.appendChild(input);

  var toolbar = document.createElement('div');
  toolbar.className = 'cell-edit-toolbar';
  var cellRect = cell.getBoundingClientRect();
  toolbar.style.left = cellRect.left + 'px';
  toolbar.style.top = (cellRect.bottom + 2) + 'px';

  var btnBold = document.createElement('button');
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

  var btnUnderline = document.createElement('button');
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

  var commit = () => {
    var val = input.value;
    cell.classList.remove('cell-editing');
    cell.textContent = val;
    state.rows[rowIdx].name = val;

    var style = '';
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
  var oldText = cell.textContent;
  cell.classList.add('cell-editing');
  var input = document.createElement('input');
  input.type = 'text';
  input.value = oldText;
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  var commit = () => {
    var val = input.value;
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
    var h = +cell.dataset.headerRow;
    var key = `corner_${h}`;
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

  var h = cell.dataset.headerRow;
  var c = cell.dataset.col;
  if (h !== undefined && c !== undefined) {
    var key = `${h}_${c}`;
    var hp = state.headerPatterns[+h];
    var patternVal = hp ? (getPatternValues(hp, +c + 1)[+c] || '') : '';
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

// Lock/unlock the Row Details panel's editable fields and the handful
// of toolbar buttons that mutate grid data. Style, Header Patterns, and
// other appearance/configuration controls remain editable per spec §7.
function applyViewModeLock() {
  var locked = isReadOnly();

  // Row Details form fields
  var rd = document.getElementById('row-details-body');
  if (rd) {
    rd.querySelectorAll('input, select, textarea, button').forEach((el) => {
      // Collapse/expand toggle remains always permitted
      if (el.id === 'rd-group-toggle') return;
      el.disabled = locked;
    });
  }

  // Grid-data toolbar buttons: add row and column count.
  // Header Patterns editor (incl. add-pattern) remains editable per
  // the resolved §9.1 decision — it is an appearance/configuration
  // control, not grid data.
  var toolbarIds = ['add-row-item', 'col-count'];
  toolbarIds.forEach((id) => {
    var el = document.getElementById(id);
    if (el) el.disabled = locked;
  });

  // History undo/redo buttons (touch only, but safe to set regardless)
  if ($btnUndo) $btnUndo.disabled = locked;
  if ($btnRedo) $btnRedo.disabled = locked;
}
