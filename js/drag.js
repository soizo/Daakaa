/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Row Drag System ────────────────────────────────
var dragState = null;

// Determine which group section the pointer is currently over.
// Returns: null (pinned), group ID string (named group), or '__other__'.
function getGroupAtDisplayPosition(ev, tbody) {
  var allElements = Array.from(tbody.querySelectorAll('tr:not(.drag-hidden):not(.drag-gap)'));
  var currentGroup = null; // null = pinned area (before any group header)
  for (var _i = 0; _i < allElements.length; _i++) {
    var el = allElements[_i];
    if (el.classList.contains('group-header-row')) {
      var type = el.dataset.groupType;
      if (type === 'pinned') currentGroup = null;
      else if (type === 'other') currentGroup = '__other__';
      else currentGroup = el.dataset.groupId;
    }
    var rect = el.getBoundingClientRect();
    if (ev.clientY < rect.top + rect.height / 2) {
      return currentGroup;
    }
  }
  return currentGroup; // below everything = last section
}

function startRowDrag(tr, rowIdx, startY) {
  var tbody = $table.querySelector('tbody');

  var ghostTable = document.createElement('table');
  ghostTable.className = 'spreadsheet';
  ghostTable.style.position = 'fixed';
  ghostTable.style.zIndex = '50';
  ghostTable.style.pointerEvents = 'none';
  ghostTable.style.margin = '0';
  ghostTable.style.opacity = '0.85';
  ghostTable.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  ghostTable.style.background = '#fff';

  var colgroup = $table.querySelector('colgroup');
  if (colgroup) ghostTable.appendChild(colgroup.cloneNode(true));
  var ghostBody = document.createElement('tbody');
  ghostBody.appendChild(tr.cloneNode(true));
  ghostTable.appendChild(ghostBody);
  document.body.appendChild(ghostTable);

  var rect = tr.getBoundingClientRect();
  ghostTable.style.left = rect.left + 'px';
  ghostTable.style.top = (startY - rect.height / 2) + 'px';
  ghostTable.style.width = rect.width + 'px';

  tr.classList.add('drag-hidden');

  dragState = {
    tr: tr,
    rowIdx: rowIdx,
    ghostTable: ghostTable,
    offsetY: startY - rect.top,
    gapIdx: rowIdx,
    tbody: tbody,
    isGroupDrag: false,
    groupId: null,          // for group drag: the group being dragged
    targetGroup: null,      // for row drag: which group the drop target is in
    groupGapIdx: null,      // for group drag: target position in state.groups
    autoExpandTimer: null,  // timer for auto-expanding collapsed groups
    autoExpandedGroupId: null, // group that was auto-expanded during drag
  };
}

// Start a group header drag (reorder groups).
function startGroupDrag(tr, groupId, startY) {
  var tbody = $table.querySelector('tbody');

  var ghostTable = document.createElement('table');
  ghostTable.className = 'spreadsheet';
  ghostTable.style.position = 'fixed';
  ghostTable.style.zIndex = '50';
  ghostTable.style.pointerEvents = 'none';
  ghostTable.style.margin = '0';
  ghostTable.style.opacity = '0.85';
  ghostTable.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  ghostTable.style.background = '#fff';

  var colgroup = $table.querySelector('colgroup');
  if (colgroup) ghostTable.appendChild(colgroup.cloneNode(true));
  var ghostBody = document.createElement('tbody');
  ghostBody.appendChild(tr.cloneNode(true));
  ghostTable.appendChild(ghostBody);
  document.body.appendChild(ghostTable);

  var rect = tr.getBoundingClientRect();
  ghostTable.style.left = rect.left + 'px';
  ghostTable.style.top = (startY - rect.height / 2) + 'px';
  ghostTable.style.width = rect.width + 'px';

  tr.classList.add('drag-hidden');

  var groupIdx = state.groups.findIndex(g => g.id === groupId);

  dragState = {
    tr: tr,
    rowIdx: null,
    ghostTable: ghostTable,
    offsetY: startY - rect.top,
    gapIdx: null,
    tbody: tbody,
    isGroupDrag: true,
    groupId: groupId,
    groupIdx: groupIdx,
    targetGroup: null,
    groupGapIdx: groupIdx,
    autoExpandTimer: null,
    autoExpandedGroupId: null,
  };
}

function handleRowDragMove(ev) {
  if (!dragState) return;

  if (dragState.isGroupDrag) {
    handleGroupDragMove(ev);
    return;
  }

  var ghostTable = dragState.ghostTable;
  var offsetY = dragState.offsetY;
  var tbody = dragState.tbody;
  var rowIdx = dragState.rowIdx;

  ghostTable.style.top = (ev.clientY - offsetY) + 'px';

  var allRows = Array.from(tbody.querySelectorAll('tr[data-storage-row]:not(.drag-hidden):not(.drag-gap)'));
  var targetIdx = rowIdx;
  for (var _i = 0; _i < allRows.length; _i++) {
    var r = allRows[_i];
    var rr = r.getBoundingClientRect();
    var mid = rr.top + rr.height / 2;
    var ri = +r.dataset.storageRow;
    if (ev.clientY < mid) { targetIdx = ri; break; }
    targetIdx = ri + 1;
  }
  targetIdx = Math.max(0, Math.min(state.rows.length, targetIdx));

  // Determine which group section the target falls in.
  if (state.groups.length > 0) {
    dragState.targetGroup = getGroupAtDisplayPosition(ev, tbody);
  }

  // Auto-expand collapsed groups on drag hover (500ms dwell).
  if (state.groups.length > 0) {
    // Check if the pointer is directly over a collapsed group header.
    var hoveredHeader = Array.from(tbody.querySelectorAll('.group-header-row:not(.drag-hidden):not(.drag-gap)'))
      .find(el => {
        var rect = el.getBoundingClientRect();
        return ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      });
    var hoveredHeaderGroupId = hoveredHeader ? hoveredHeader.dataset.groupId : null;
    var isHeaderCollapsed = hoveredHeaderGroupId ? getGroupCollapsed(hoveredHeaderGroupId) : false;

    if (hoveredHeaderGroupId && isHeaderCollapsed && dragState.autoExpandedGroupId !== hoveredHeaderGroupId) {
      // Clear any existing timer for a different group
      if (dragState.autoExpandTimer) {
        clearTimeout(dragState.autoExpandTimer);
        dragState.autoExpandTimer = null;
      }
      // Set a new timer to auto-expand after 500ms
      var expandGroupId = hoveredHeaderGroupId;
      dragState.autoExpandTimer = setTimeout(() => {
        if (!dragState) return;
        // Expand the group
        if (expandGroupId === '__pinned__') {
          state.pinnedCollapsed = false;
        } else if (expandGroupId === '__other__') {
          state.otherCollapsed = false;
        } else {
          var g = state.groups.find(g => g.id === expandGroupId);
          if (g) g.collapsed = false;
        }
        dragState.autoExpandedGroupId = expandGroupId;
        // Re-render but preserve drag state: remove ghost, re-render, re-add ghost
        var ghost = dragState.ghostTable;
        var wasDragHidden = dragState.tr;
        if (ghost.parentNode) ghost.remove();
        wasDragHidden.classList.remove('drag-hidden');
        renderTable();
        // Re-find the dragged row's tr in the new DOM
        var newTbody = $table.querySelector('tbody');
        var newTr = newTbody.querySelector(`tr[data-storage-row="${dragState.rowIdx}"]`);
        if (newTr) newTr.classList.add('drag-hidden');
        dragState.tbody = newTbody;
        document.body.appendChild(ghost);
      }, 500);
    } else if (!hoveredHeaderGroupId || !isHeaderCollapsed) {
      if (dragState.autoExpandTimer) {
        clearTimeout(dragState.autoExpandTimer);
        dragState.autoExpandTimer = null;
      }
    }
  }

  if (targetIdx !== dragState.gapIdx) {
    dragState.gapIdx = targetIdx;
    updateDragGap(tbody, rowIdx, targetIdx);
  }

  // Highlight target group header during cross-group drag
  updateDragGroupHighlight(tbody, dragState.targetGroup);
}

function handleGroupDragMove(ev) {
  var ghostTable = dragState.ghostTable;
  var offsetY = dragState.offsetY;
  var tbody = dragState.tbody;
  var groupIdx = dragState.groupIdx;

  ghostTable.style.top = (ev.clientY - offsetY) + 'px';

  // Find target position among named group headers only.
  var groupHeaders = Array.from(tbody.querySelectorAll('.group-header-row[data-group-type="named"]:not(.drag-hidden):not(.drag-gap)'));
  var targetGroupGapIdx = groupIdx;

  for (var i = 0; i < groupHeaders.length; i++) {
    var rect = groupHeaders[i].getBoundingClientRect();
    var mid = rect.top + rect.height / 2;
    var gid = groupHeaders[i].dataset.groupId;
    var gIdx = state.groups.findIndex(g => g.id === gid);
    if (ev.clientY < mid) {
      targetGroupGapIdx = gIdx;
      break;
    }
    targetGroupGapIdx = gIdx + 1;
  }

  // Clamp: cannot go above 0 (before first group = after pinned) or beyond last group (before Other).
  targetGroupGapIdx = Math.max(0, Math.min(state.groups.length, targetGroupGapIdx));

  if (targetGroupGapIdx !== dragState.groupGapIdx) {
    dragState.groupGapIdx = targetGroupGapIdx;
    updateGroupDragGap(tbody, dragState.groupId, targetGroupGapIdx);
  }
}

// Highlight the target group header when dragging a row across groups.
function updateDragGroupHighlight(tbody, targetGroupId) {
  tbody.querySelectorAll('.group-header-row').forEach(el => {
    el.classList.remove('drag-target-group');
  });
  if (targetGroupId === null) {
    // Pinned section
    var pinnedHeader = tbody.querySelector('.group-header-row[data-group-type="pinned"]');
    if (pinnedHeader) pinnedHeader.classList.add('drag-target-group');
  } else if (targetGroupId === '__other__') {
    var otherHeader = tbody.querySelector('.group-header-row[data-group-type="other"]');
    if (otherHeader) otherHeader.classList.add('drag-target-group');
  } else if (targetGroupId) {
    var header = tbody.querySelector(`.group-header-row[data-group-id="${CSS.escape(targetGroupId)}"]`);
    if (header) header.classList.add('drag-target-group');
  }
}

function finishRowDrag() {
  if (!dragState) return;

  if (dragState.isGroupDrag) {
    finishGroupDrag();
    return;
  }

  var tr = dragState.tr;
  var rowIdx = dragState.rowIdx;
  var ghostTable = dragState.ghostTable;
  var gapIdx = dragState.gapIdx;
  var tbody = dragState.tbody;
  var targetGroup = dragState.targetGroup;
  var autoExpandTimer = dragState.autoExpandTimer;
  var autoExpandedGroupId = dragState.autoExpandedGroupId;

  // Clean up auto-expand timer
  if (autoExpandTimer) clearTimeout(autoExpandTimer);

  if (ghostTable.parentNode) ghostTable.remove();
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  tbody.querySelectorAll('.drag-target-group').forEach(el => el.classList.remove('drag-target-group'));
  tr.classList.remove('drag-hidden');

  // Re-collapse auto-expanded group if drop didn't land in it.
  // Map targetGroup (null for pinned) to the header group id format for comparison.
  if (autoExpandedGroupId) {
    var normalizedTarget = targetGroup === null ? '__pinned__' : targetGroup;
    if (normalizedTarget !== autoExpandedGroupId) {
      if (autoExpandedGroupId === '__pinned__') {
        state.pinnedCollapsed = true;
      } else if (autoExpandedGroupId === '__other__') {
        state.otherCollapsed = true;
      } else {
        var g = state.groups.find(g => g.id === autoExpandedGroupId);
        if (g) g.collapsed = true;
      }
    }
  }

  if (gapIdx !== null && gapIdx !== rowIdx && gapIdx !== rowIdx + 1) {
    commitUndoNode('Move row');
    var from = rowIdx;
    var to = gapIdx > from ? gapIdx - 1 : gapIdx;
    if (state.selectedRow === from) state.selectedRow = to;
    else if (state.selectedRow !== null) {
      if (from < state.selectedRow && to >= state.selectedRow) state.selectedRow--;
      else if (from > state.selectedRow && to <= state.selectedRow) state.selectedRow++;
    }
    moveRow(from, to);

    // Update groupId if the row crossed group boundaries.
    if (state.groups.length > 0 && targetGroup !== undefined) {
      if (targetGroup === null) {
        // Dropped in pinned section
        state.rows[to].groupId = null;
      } else if (targetGroup === '__other__') {
        // Dropped in Other section — leave groupId as-is (orphaned → Other)
        // If it was previously pinned (null), set a stale groupId so it goes to Other.
        if (state.rows[to].groupId == null) {
          state.rows[to].groupId = '__orphan__';
        }
      } else {
        // Dropped in a named group
        state.rows[to].groupId = targetGroup;
      }
    }

    renderTable();
    saveState();
  } else {
    // No position change — but still re-collapse if needed and re-render
    if (autoExpandedGroupId) {
      renderTable();
      saveState();
    }
  }
  dragState = null;
}

function finishGroupDrag() {
  var tr = dragState.tr;
  var ghostTable = dragState.ghostTable;
  var tbody = dragState.tbody;
  var groupId = dragState.groupId;
  var groupIdx = dragState.groupIdx;
  var groupGapIdx = dragState.groupGapIdx;
  var autoExpandTimer = dragState.autoExpandTimer;

  if (autoExpandTimer) clearTimeout(autoExpandTimer);

  if (ghostTable.parentNode) ghostTable.remove();
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  tr.classList.remove('drag-hidden');

  if (groupGapIdx !== null && groupGapIdx !== groupIdx && groupGapIdx !== groupIdx + 1) {
    commitUndoNode('Reorder group');
    var item = state.groups.splice(groupIdx, 1)[0];
    var insertAt = groupGapIdx > groupIdx ? groupGapIdx - 1 : groupGapIdx;
    state.groups.splice(insertAt, 0, item);
    renderTable();
    saveState();
  }
  dragState = null;
}

function updateDragGap(tbody, _dragIdx, gapIdx) {
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  var allRows = Array.from(tbody.querySelectorAll('tr[data-storage-row]'));
  var gapTr = document.createElement('tr');
  gapTr.classList.add('drag-gap');
  gapTr.innerHTML = `<td colspan="${state.cols + 1}" style="height:calc(var(--cell-h) * var(--zoom));border:none;background:var(--accent);"></td>`;

  var target = null;
  for (var _i = 0; _i < allRows.length; _i++) {
    var r = allRows[_i];
    if (+r.dataset.storageRow >= gapIdx && !r.classList.contains('drag-hidden')) { target = r; break; }
  }
  if (target) tbody.insertBefore(gapTr, target);
  else tbody.appendChild(gapTr);
}

// Gap indicator for group drag: appears only between group headers.
function updateGroupDragGap(tbody, dragGroupId, gapIdx) {
  tbody.querySelectorAll('.drag-gap').forEach((g) => g.remove());
  var gapTr = document.createElement('tr');
  gapTr.classList.add('drag-gap');
  gapTr.innerHTML = `<td colspan="${state.cols + 1}" style="height:calc(var(--cell-h) * var(--zoom) * 0.5);border:none;background:var(--accent);"></td>`;

  // Find the group header at gapIdx position to insert before.
  // Walk visible named group headers (excluding the dragged one) and find the
  // one at position gapIdx in the non-dragged ordering.
  var groupHeaders = Array.from(tbody.querySelectorAll('.group-header-row[data-group-type="named"]:not(.drag-hidden)'));
  var target = null;
  var count = 0;
  for (var _i = 0; _i < groupHeaders.length; _i++) {
    var gh = groupHeaders[_i];
    if (gh.dataset.groupId === dragGroupId) continue;
    if (count >= gapIdx) {
      target = gh;
      break;
    }
    count++;
  }

  // If gapIdx is at the end, insert after the last named group header's section.
  // Find the "other" header or end of tbody.
  if (target) {
    tbody.insertBefore(gapTr, target);
  } else {
    // Insert before Other header if it exists, else append
    var otherHeader = tbody.querySelector('.group-header-row[data-group-type="other"]');
    if (otherHeader) {
      tbody.insertBefore(gapTr, otherHeader);
    } else {
      // Insert before add-row-strip
      var addStrip = tbody.querySelector('.add-row-strip');
      if (addStrip) tbody.insertBefore(gapTr, addStrip);
      else tbody.appendChild(gapTr);
    }
  }
}
