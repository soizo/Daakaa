/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Group Summary Helpers ───────────────────────────
function getGroupMemberRows(groupId) {
  var groupIdSet = new Set(state.groups.map(g => g.id));
  if (groupId === '__pinned__') {
    return state.rows.map((r, i) => ({ row: r, idx: i })).filter(e => e.row.groupId === '__pinned__');
  }
  if (groupId === '__other__') {
    return state.rows.map((r, i) => ({ row: r, idx: i })).filter(e => {
      var gid = e.row.groupId;
      if (gid === '__pinned__') return false;
      if (gid != null && groupIdSet.has(gid)) return false;
      return true; // null, undefined, or orphaned → Other
    });
  }
  return state.rows.map((r, i) => ({ row: r, idx: i })).filter(e => e.row.groupId === groupId);
}

function countGroupRows(groupId) {
  return getGroupMemberRows(groupId).length;
}

function computeGroupSummary(groupId) {
  var members = getGroupMemberRows(groupId);
  var total = members.length;
  var counts = { '✓': 0, '×': 0, '〇': 0, '—': 0 };

  for (var _m = 0; _m < members.length; _m++) {
    var idx = members[_m].idx;
    for (var c = 0; c < state.cols; c++) {
      var val = getCellValue(idx, c);
      var arrowMatch = /^←(\d+)✓$/.exec(val);
      if (arrowMatch) {
        counts['✓'] += parseInt(arrowMatch[1], 10);
      } else if (val === '✓') {
        counts['✓'] += 1;
      } else if (val === '×') {
        counts['×'] += 1;
      } else if (val === '〇') {
        counts['〇'] += 1;
      } else if (val === '—') {
        counts['—'] += 1;
      }
    }
  }

  var parts = [`[${total} rows]`];
  for (var mark in counts) {
    if (counts[mark] > 0) parts.push(`${counts[mark]}${mark}`);
  }
  return parts.join(' ');
}

function getGroupCollapsed(groupId) {
  if (groupId === '__pinned__') return state.pinnedCollapsed;
  if (groupId === '__other__') return state.otherCollapsed;
  var group = state.groups.find(g => g.id === groupId);
  return group ? group.collapsed : false;
}

function toggleGroupCollapse(groupId) {
  if (groupId === '__pinned__') {
    state.pinnedCollapsed = !state.pinnedCollapsed;
  } else if (groupId === '__other__') {
    state.otherCollapsed = !state.otherCollapsed;
  } else {
    var group = state.groups.find(g => g.id === groupId);
    if (group) group.collapsed = !group.collapsed;
  }
  renderTable();
  saveState();
}

async function deleteGroupWithConfirm(groupId) {
  var group = state.groups.find(g => g.id === groupId);
  if (!group) return;

  // showConfirm returns true for first button ("Delete all"), false for second ("Keep rows")
  var deleteAll = await showConfirm('Delete group rows too?', 'Delete all', 'Keep rows');

  commitUndoNode('Delete group');

  if (deleteAll) {
    // "Delete all" — remove group and all its rows, re-key cells
    var rowIndicesToRemove = new Set();
    state.rows.forEach((row, i) => {
      if (row.groupId === groupId) rowIndicesToRemove.add(i);
    });
    // Build new rows and re-key cells
    var newRows = [];
    var newCells = {};
    var newIdx = 0;
    for (var i = 0; i < state.rows.length; i++) {
      if (rowIndicesToRemove.has(i)) continue;
      newRows.push(state.rows[i]);
      if (state.cells[i]) newCells[newIdx] = state.cells[i];
      newIdx++;
    }
    state.rows = newRows;
    state.cells = newCells;
    state.groups = state.groups.filter(g => g.id !== groupId);
    // If no named groups remain, clear stale groupIds
    if (state.groups.length === 0) {
      state.rows.forEach(row => { if (row.groupId != null) row.groupId = null; });
    }
  } else {
    // "Keep rows" — remove group, rows become orphans (Other or pinned if no groups remain)
    state.groups = state.groups.filter(g => g.id !== groupId);
    if (state.groups.length === 0) {
      state.rows.forEach(row => {
        if (row.groupId === groupId) row.groupId = null;
      });
    }
    // Otherwise, stale groupId naturally routes rows to Other via resolveDisplayRows
  }

  if (state.selectedGroup === groupId) state.selectedGroup = null;
  state.selectedRow = null;
  renderTable();
  saveState();
}

function deleteRow(idx) {
  state.rows.splice(idx, 1);
  var newCells = {};
  Object.keys(state.cells).forEach((key) => {
    var k = +key;
    if (k < idx) newCells[k] = state.cells[k];
    else if (k > idx) newCells[k - 1] = state.cells[k];
  });
  state.cells = newCells;
  if (state.selectedRow === idx) state.selectedRow = null;
  else if (state.selectedRow !== null && state.selectedRow > idx) state.selectedRow--;
  renderTable();
  saveState();
}

function moveRow(from, to) {
  var item = state.rows.splice(from, 1)[0];
  state.rows.splice(to, 0, item);

  var oldCells = {};
  for (var k in state.cells) oldCells[k] = { ...state.cells[k] };

  var n = state.rows.length;
  var indices = Array.from({ length: n + 1 }, (_, i) => i);
  var moved = indices.splice(from, 1)[0];
  indices.splice(to, 0, moved);

  var newCells = {};
  for (var newIdx = 0; newIdx < indices.length; newIdx++) {
    if (oldCells[indices[newIdx]]) newCells[newIdx] = oldCells[indices[newIdx]];
  }
  state.cells = newCells;
}
