/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Undo Tree ─────────────────────────────────────
var undoTree = {};
var undoCurrentId = null;
var undoNextId = 1;
var lastVisitedChild = {};
var MAX_UNDO_NODES = 500;

function captureSnapshot() {
  return JSON.stringify({
    cells: state.cells,
    rows: state.rows,
    headerPatterns: state.headerPatterns,
    headerOverrides: state.headerOverrides,
    cols: state.cols,
    groups: state.groups,
    pinnedCollapsed: state.pinnedCollapsed,
    otherCollapsed: state.otherCollapsed,
  });
}

function restoreSnapshot(snapshot) {
  var s = JSON.parse(snapshot);
  state.cells = s.cells;
  state.rows = s.rows;
  state.headerPatterns = s.headerPatterns;
  state.headerOverrides = s.headerOverrides;
  state.cols = s.cols;
  state.groups = s.groups || [];
  state.pinnedCollapsed = s.pinnedCollapsed || false;
  state.otherCollapsed = s.otherCollapsed || false;
  state.selectedRow = null;
  state.selectedGroup = null;
  $colCount.value = state.cols;
  renderPatternList();
  renderTable();
  saveState();
}

function saveUndoTree() {
  try {
    localStorage.setItem('daakaa-undo-tree', JSON.stringify({
      undoTree: undoTree,
      undoCurrentId: undoCurrentId,
      undoNextId: undoNextId,
      lastVisitedChild: lastVisitedChild,
    }));
  } catch (_) {}
}

function createRootNode() {
  var id = 0;
  undoTree = { [id]: {
    id: id,
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
  var node = {
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

var _lastCommitTime = 0;
var _lastCommitLabel = '';
function commitUndoNodeThrottled(actionLabel) {
  var now = Date.now();
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
  var current = undoTree[undoCurrentId];
  if (!current || current.parentId === null) return;
  lastVisitedChild[current.parentId] = undoCurrentId;
  undoCurrentId = current.parentId;
  restoreSnapshot(undoTree[undoCurrentId].snapshot);
  renderHistoryPanel();
  saveUndoTree();
}

function redo() {
  var current = undoTree[undoCurrentId];
  if (!current || current.childIds.length === 0) return;
  var nextId = lastVisitedChild[undoCurrentId]
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
    var ancestors = getAncestorIds(undoCurrentId);
    var oldestLeaf = null;
    var oldestTime = Infinity;

    for (var id in undoTree) {
      var node = undoTree[id];
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
  var set = new Set();
  var cur = id;
  while (cur !== null && undoTree[cur]) {
    set.add(cur);
    cur = undoTree[cur].parentId;
  }
  return set;
}

function removeNode(id) {
  var node = undoTree[id];
  if (!node) return;
  if (node.parentId !== null && undoTree[node.parentId]) {
    var parent = undoTree[node.parentId];
    parent.childIds = parent.childIds.filter(c => c !== id);
  }
  delete undoTree[id];
  delete lastVisitedChild[id];
}

// ── Undo Tree: history panel rendering ────────────
function renderHistoryPanel() {
  var panel = document.getElementById('history-panel');
  if (!panel) return;

  var pathSet = getAncestorIds(undoCurrentId);

  panel.innerHTML = renderTreeNode(0, pathSet);

  var currentEl = panel.querySelector('.history-node.current');
  if (currentEl) currentEl.scrollIntoView({ block: 'nearest' });

  panel.querySelectorAll('.history-node').forEach(el => {
    el.addEventListener('click', () => {
      jumpToNode(+el.dataset.nodeId);
    });
  });
}

function renderTreeNode(id, pathSet) {
  var node = undoTree[id];
  if (!node) return '';

  var isCurrent = id === undoCurrentId;
  var time = new Date(node.timestamp);
  var timeStr = String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
  var label = node.branchLabel || node.actionLabel;

  var html = `<div class="history-node${isCurrent ? ' current' : ''}" data-node-id="${id}">`;
  html += `<span class="history-node-marker"></span>`;
  html += `<span class="history-node-label">${esc(label)}</span>`;
  html += `<span class="history-node-time">${timeStr}</span>`;
  html += `</div>`;

  if (node.childIds.length > 0) {
    var onPathChildren = node.childIds.filter(cid => pathSet.has(cid));
    var offPathChildren = node.childIds.filter(cid => !pathSet.has(cid));

    for (var _i = 0; _i < onPathChildren.length; _i++) {
      html += renderTreeNode(onPathChildren[_i], pathSet);
    }

    if (offPathChildren.length > 0) {
      html += `<div class="history-indent">`;
      for (var _j = 0; _j < offPathChildren.length; _j++) {
        html += renderTreeNode(offPathChildren[_j], pathSet);
      }
      html += `</div>`;
    }
  }

  return html;
}

function countDescendants(id) {
  var node = undoTree[id];
  if (!node) return 0;
  var count = 1;
  for (var _i = 0; _i < node.childIds.length; _i++) count += countDescendants(node.childIds[_i]);
  return count;
}
