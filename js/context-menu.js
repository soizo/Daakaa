/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Context Menus ──────────────────────────────────
var $contextMenu = null;

function hideContextMenu() {
  if ($contextMenu) { $contextMenu.remove(); $contextMenu = null; }
}

function isModalOpen() {
  if ($contextMenu) return true;
  var overlay = document.getElementById('confirm-overlay');
  if (overlay && overlay.style.display !== 'none') return true;
  return false;
}

function positionMenu(menu, _x, _y) {
  document.body.appendChild(menu);
  $contextMenu = menu;
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  setTimeout(() => {
    var dismissHandler = (e) => {
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
  var { r1, c1, r2, c2 } = state.selection;
  for (var r = r1; r <= r2; r++) {
    var sr = displayToStorageIndex(r);
    if (sr < 0) continue;
    for (var c = c1; c <= c2; c++) {
      var val = typeof valueFn === 'function' ? valueFn(sr, c) : valueFn;
      setCellValue(sr, c, val);
    }
  }
  renderTable();
  saveState();
}

function showBatchContextMenu(x, y) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var items = [
    { label: 'Set all ✓', action: () => batchSetSelection('✓') },
    { label: 'Set all ×', action: () => batchSetSelection('×') },
    { label: 'Set all 〇', action: () => batchSetSelection('〇') },
    { label: 'Set all —', action: () => batchSetSelection('—') },
    { label: 'Clear all', action: () => batchSetSelection('') },
  ];

  items.forEach((item) => {
    if (item.label === 'sep') {
      var s = document.createElement('div'); s.className = 'context-menu-sep'; menu.appendChild(s); return;
    }
    var div = document.createElement('div');
    div.className = 'context-menu-item';
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(div);
  });

  positionMenu(menu, x, y);
}

function showContentContextMenu(x, y, row, col) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var checkCount = 0;
  for (var c = 0; c <= col; c++) {
    var v = getCellValue(row, c);
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
      var s = document.createElement('div'); s.className = 'context-menu-sep'; menu.appendChild(s); return;
    }
    var div = document.createElement('div');
    div.className = 'context-menu-item';
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(div);
  });

  positionMenu(menu, x, y);
}

// ── Group Context Menu ──────────────────────────────
function showGroupContextMenu(x, y, groupId, groupType) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var isNamed = groupType === 'named';
  var isPinned = groupType === 'pinned';
  var isOther = groupType === 'other';

  // In view mode, only show Collapse/Expand
  if (isReadOnly()) {
    var collapsed = getGroupCollapsed(groupId);
    var toggleItem = document.createElement('div');
    toggleItem.className = 'context-menu-item';
    toggleItem.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleItem.addEventListener('click', () => {
      toggleGroupCollapse(groupId);
      hideContextMenu();
    });
    menu.appendChild(toggleItem);
    positionMenu(menu, x, y);
    return;
  }

  var items = [];

  if (isNamed) {
    items.push({
      label: 'Rename Group', action: () => {
        var tr = $table.querySelector(`.group-header-row[data-group-id="${CSS.escape(groupId)}"]`);
        if (tr) startGroupLabelInlineEdit(tr, groupId);
      }
    });
  }

  // Collapse/Expand (always)
  var collapsed = getGroupCollapsed(groupId);
  items.push({
    label: collapsed ? 'Expand' : 'Collapse',
    action: () => toggleGroupCollapse(groupId)
  });

  if (isNamed) {
    var groupIdx = state.groups.findIndex(g => g.id === groupId);
    if (groupIdx > 0) {
      items.push({
        label: 'Move Up', action: () => {
          commitUndoNode('Reorder group');
          var tmp = state.groups[groupIdx];
          state.groups[groupIdx] = state.groups[groupIdx - 1];
          state.groups[groupIdx - 1] = tmp;
          renderTable();
          saveState();
        }
      });
    }
    if (groupIdx >= 0 && groupIdx < state.groups.length - 1) {
      items.push({
        label: 'Move Down', action: () => {
          commitUndoNode('Reorder group');
          var tmp = state.groups[groupIdx];
          state.groups[groupIdx] = state.groups[groupIdx + 1];
          state.groups[groupIdx + 1] = tmp;
          renderTable();
          saveState();
        }
      });
    }

    items.push({ label: 'sep' });
    items.push({
      label: 'Delete Group', destructive: true, action: () => deleteGroupWithConfirm(groupId)
    });
  }

  items.forEach((item) => {
    if (item.label === 'sep') {
      var s = document.createElement('div'); s.className = 'context-menu-sep'; menu.appendChild(s); return;
    }
    var div = document.createElement('div');
    div.className = 'context-menu-item' + (item.destructive ? ' destructive' : '');
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(div);
  });

  positionMenu(menu, x, y);
}

function showRowContextMenu(x, y, rowIdx) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var moveDiv = document.createElement('div');
  moveDiv.className = 'context-menu-input-row';
  moveDiv.innerHTML = `<span>Move to row</span><input type="number" min="1" max="${state.rows.length}" value="${rowIdx + 1}" id="ctx-move-input"><button id="ctx-move-btn">⏎</button>`;
  menu.appendChild(moveDiv);

  // "Move to Group ▸" submenu
  var groupSub = document.createElement('div');
  groupSub.className = 'context-menu-has-sub';
  groupSub.textContent = 'Move to Group \u25B8';
  var subMenu = document.createElement('div');
  subMenu.className = 'context-menu-sub';

  // Existing groups
  state.groups.forEach((g) => {
    var item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = g.label;
    item.addEventListener('click', () => {
      commitUndoNode('Move row to group');
      state.rows[rowIdx].groupId = g.id;
      renderTable();
      saveState();
      hideContextMenu();
    });
    subMenu.appendChild(item);
  });

  if (state.groups.length > 0) {
    var subSep = document.createElement('div'); subSep.className = 'context-menu-sep'; subMenu.appendChild(subSep);
  }

  // "+ New Group..."
  var newGroupItem = document.createElement('div');
  newGroupItem.className = 'context-menu-item';
  newGroupItem.textContent = '+ New Group\u2026';
  newGroupItem.addEventListener('click', () => {
    hideContextMenu();
    var name = prompt('Group name:', 'New Group');
    if (!name) return;
    commitUndoNode('Create group');
    var newGroup = { id: 'g_' + Date.now(), label: name.trim() || 'New Group', collapsed: false };
    state.groups.push(newGroup);
    state.rows[rowIdx].groupId = newGroup.id;
    renderTable();
    saveState();
  });
  subMenu.appendChild(newGroupItem);

  // "Pinned"
  var pinnedItem = document.createElement('div');
  pinnedItem.className = 'context-menu-item';
  pinnedItem.textContent = 'Pinned';
  pinnedItem.addEventListener('click', () => {
    commitUndoNode('Move row to group');
    state.rows[rowIdx].groupId = '__pinned__';
    renderTable();
    saveState();
    hideContextMenu();
  });
  subMenu.appendChild(pinnedItem);

  // "Other"
  var otherItem = document.createElement('div');
  otherItem.className = 'context-menu-item';
  otherItem.textContent = 'Other';
  otherItem.addEventListener('click', () => {
    commitUndoNode('Move row to group');
    state.rows[rowIdx].groupId = null;
    renderTable();
    saveState();
    hideContextMenu();
  });
  subMenu.appendChild(otherItem);

  groupSub.appendChild(subMenu);
  menu.appendChild(groupSub);

  // "Create Group Above"
  var createAbove = document.createElement('div');
  createAbove.className = 'context-menu-item';
  createAbove.textContent = 'Create Group Above';
  createAbove.addEventListener('click', () => {
    hideContextMenu();
    var name = prompt('Group name:', 'New Group');
    if (!name) return;
    commitUndoNode('Create group');
    var newGroup = { id: 'g_' + Date.now(), label: name.trim() || 'New Group', collapsed: false };
    // Insert at beginning of state.groups (above current position)
    // Find which group this row is in, insert before it
    var currentGroupId = state.rows[rowIdx].groupId;
    var currentGroupIdx = state.groups.findIndex(g => g.id === currentGroupId);
    if (currentGroupIdx >= 0) {
      state.groups.splice(currentGroupIdx, 0, newGroup);
    } else {
      state.groups.unshift(newGroup);
    }
    state.rows[rowIdx].groupId = newGroup.id;
    renderTable();
    saveState();
  });
  menu.appendChild(createAbove);

  var sep = document.createElement('div'); sep.className = 'context-menu-sep'; menu.appendChild(sep);

  var del = document.createElement('div');
  del.className = 'context-menu-item destructive';
  del.textContent = 'Delete row';
  del.addEventListener('click', () => { commitUndoNode('Delete row'); deleteRow(rowIdx); hideContextMenu(); });
  menu.appendChild(del);

  positionMenu(menu, x, y);

  var moveInput = document.getElementById('ctx-move-input');
  var moveBtn = document.getElementById('ctx-move-btn');
  var doMove = () => {
    var target = Math.max(1, Math.min(state.rows.length, +moveInput.value || 1)) - 1;
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

// Long-press context menu on touch removed — sidepanel editing replaces it.
