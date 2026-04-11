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

// ── Undo Tree: history panel rendering (@gitgraph/js) ──

var daakaaTemplate = (typeof GitgraphJS !== 'undefined') ? GitgraphJS.templateExtend(
  GitgraphJS.TemplateName.Metro,
  {
    colors: [
      "#000000",
      "#5a7a8c",
      "#7a6e5a",
      "#4a7a5a",
      "#7a5a6e",
      "#6e7a4a",
      "#5a6e7a",
      "#7a5a4a",
    ],
    branch: {
      lineWidth: 2,
      spacing: 18,
    },
    commit: {
      spacing: 32,
      dot: {
        size: 4,
        strokeWidth: 1.5,
        strokeColor: "#000",
      },
      message: {
        font: "11px 'Sarasa UI CL', 'Sarasa Gothic CL', sans-serif",
        color: "#000",
        displayAuthor: false,
        displayHash: false,
      },
    },
  }
) : null;

// Enlarge commit spacing for touch tap targets
if (daakaaTemplate && typeof isTouchDevice !== 'undefined' && isTouchDevice) {
  daakaaTemplate.commit.spacing = 44;
  daakaaTemplate.commit.dot.size = 5;
}

function renderHistoryPanel() {
  var panel = document.getElementById('history-panel');
  if (!panel) return;
  panel.innerHTML = '';

  if (typeof GitgraphJS === 'undefined' || !daakaaTemplate) {
    panel.textContent = 'History visualisation unavailable.';
    return;
  }

  var graphContainer = document.createElement('div');
  graphContainer.className = 'history-graph';
  panel.appendChild(graphContainer);

  var gitgraph = GitgraphJS.createGitgraph(graphContainer, {
    orientation: 'vertical',
    template: daakaaTemplate,
  });

  buildGitgraph(gitgraph);

  setTimeout(function() {
    var headEl = panel.querySelector('.history-head-marker');
    if (headEl) headEl.scrollIntoView({ block: 'nearest' });
  }, 50);
}

function buildGitgraph(gitgraph) {
  if (!undoTree[0]) return;

  var ancestorSet = getAncestorIds(undoCurrentId);
  var mainBranch = gitgraph.branch('main');

  function walk(id, currentBranch) {
    var node = undoTree[id];
    if (!node) return;

    var isHead = (id === undoCurrentId);
    var time = new Date(node.timestamp);
    var timeStr = String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');

    var commitOpts = {
      subject: node.actionLabel || 'Edit',
      body: timeStr,
      onMouseDown: function() { jumpToNode(id); },
    };

    if (isHead) {
      commitOpts.style = {
        dot: {
          size: 6,
          color: '#ffffff',
          strokeWidth: 2,
          strokeColor: '#000000',
        },
        message: {
          font: "bold 11px 'Sarasa UI CL', 'Sarasa Gothic CL', sans-serif",
          color: '#000000',
        },
      };
    }

    currentBranch.commit(commitOpts);

    if (node.childIds.length === 0) return;

    var mainChild = null;
    for (var i = 0; i < node.childIds.length; i++) {
      if (ancestorSet.has(node.childIds[i])) {
        mainChild = node.childIds[i];
        break;
      }
    }
    if (mainChild === null) mainChild = node.childIds[node.childIds.length - 1];

    var sideChildren = node.childIds.filter(function(c) { return c !== mainChild; });

    for (var s = 0; s < sideChildren.length; s++) {
      var sideId = sideChildren[s];
      var sideNode = undoTree[sideId];
      var branchName = (sideNode && sideNode.branchLabel)
        ? sideNode.branchLabel
        : (sideNode ? sideNode.actionLabel : 'branch-' + sideId);
      var sideBranch = currentBranch.branch(branchName);
      walk(sideId, sideBranch);
    }

    walk(mainChild, currentBranch);
  }

  walk(0, mainBranch);
}
