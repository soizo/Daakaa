# Undo Tree — Product Design Spec

**Status:** Draft
**Addresses requirement:** Replace linear undo/redo (50-deep) with a node-based undo tree (500-node) supporting branching and visual navigation.

---

## 1. Requirements Recap

| # | Requirement | Source |
|---|-------------|--------|
| R1 | Replace linear undoStack/redoStack with a tree data structure | User brief |
| R2 | Maximum 500 nodes (up from 50) | User brief |
| R3 | When undoing then making a new change, old redo path is preserved as a branch | User brief |
| R4 | Visual tree navigation UI | User brief |
| R5 | Must work on iPad | User brief |
| R6 | No animations/transitions | User brief |
| R7 | Compact, power-user feature — not the main UI | User brief |
| R8 | Must not interfere with main spreadsheet editing | User brief |

---

## 2. Data Model

### 2.1 Node Shape

```
UndoNode {
  id:          string       // crypto.randomUUID() — 36-char UUID
  parentId:    string|null  // null for root node
  childIds:    string[]     // ordered by creation time (oldest first)
  snapshot:    string       // JSON string from captureSnapshot()
  timestamp:   number       // Date.now()
  actionLabel: string       // human-readable, e.g. "Set cell ✓", "Delete row", "Add row"
  branchLabel: string|null  // optional user-assigned name for this branch point
}
```

### 2.2 Tree Container

```
UndoTree {
  nodes:       Map<string, UndoNode>  // id -> node
  rootId:      string                 // id of the initial node
  currentId:   string                 // id of the node representing current state
  maxNodes:    500                    // hard cap
}
```

### 2.3 Invariants

- `nodes.size <= maxNodes` at all times.
- `currentId` always points to a valid node in `nodes`.
- The root node has `parentId === null`.
- Every non-root node's `parentId` references a node that exists in `nodes` and that node's `childIds` includes this node.
- `childIds` is always sorted by `timestamp` ascending.

### 2.4 Memory Strategy — Delta Snapshots

The current `captureSnapshot()` serialises `{ cells, rows, headerPatterns, headerOverrides, cols }` as JSON. For a typical spreadsheet (20 rows, 30 cols), a full snapshot is roughly 2-5 KB. At 500 nodes with full snapshots, this is 1-2.5 MB — acceptable for in-memory use.

**Decision: keep full snapshots (no delta encoding) for v1.**

Rationale:
- 2.5 MB worst case is well within budget for a browser tab.
- Full snapshots make jump-to-any-node O(1) — no chain reconstruction needed.
- Delta encoding adds complexity, risk of corruption chains, and slower random access.
- If profiling later shows memory pressure (very large spreadsheets), delta encoding can be added behind the same interface by storing a full snapshot every N nodes and deltas in between.

### 2.5 Pruning (When Node Count Exceeds 500)

When a new node would exceed `maxNodes`:

1. Walk from the root. Find the oldest leaf node that is **not** an ancestor of `currentId`.
2. Remove it. Update its parent's `childIds`.
3. If the parent now has zero children and is also not an ancestor of `currentId`, remove it too (cascade up).
4. Repeat until `nodes.size < maxNodes`.

**Edge case:** If all 500 nodes form a single chain from root to current (no branches), prune the root: the second node becomes the new root with `parentId = null`.

**User communication of pruning:** No explicit notification. The pruned nodes simply disappear from the tree visualisation. The tree silently maintains the 500-node cap. Rationale: pruning is a background maintenance detail; surfacing it interrupts the user for no actionable reason.

---

## 3. Core Operations

### 3.1 pushUndo(actionLabel)

Called before any state-mutating action (same call sites as today).

1. Create a new `UndoNode` with `parentId = currentId`, snapshot of the **new** state (after mutation).
2. Append the new node's id to `currentNode.childIds`.
3. Set `currentId` to the new node's id.
4. If `nodes.size > maxNodes`, run pruning (section 2.5).

Wait — correction. The current system calls `pushUndo()` **before** mutation to capture the pre-mutation state. The new system must preserve the same semantics.

**Revised flow:**

The tree stores one node per state. The **root node** captures the initial state. Each subsequent node captures the state **before** the mutation that follows (same as current `pushUndo`). Actually, simpler: each node is a snapshot of the application state at a point in time. `currentId` always points to the node matching the current visible state.

**Revised pushUndo(actionLabel):**

1. Capture the current state as a snapshot.
2. Create a new `UndoNode` with that snapshot, `parentId = currentId`, `actionLabel`.
3. Append new node to current node's `childIds`.
4. Set `currentId = newNode.id`.
5. The caller then performs the mutation (which will be captured in the *next* `pushUndo` call).

Wait, this still doesn't work. Let me re-examine the current flow:

```js
// Current pattern:
pushUndo();          // saves current state to undoStack
doMutation();        // modifies state
renderTable();
saveState();
```

So `pushUndo()` saves a snapshot of the state **before** mutation. `undo()` then restores the most recently pushed snapshot, reverting the mutation.

**For the tree model, the cleanest approach:** Each node in the tree represents a **committed state** — the state of the spreadsheet after an action was performed. The root node is the initial state (before any user action).

**pushUndo(actionLabel):**

1. The current state (pre-mutation) is already represented by `currentId`. No need to re-capture.
2. The caller mutates state.
3. After mutation, call `commitState(actionLabel)`:
   - Capture the new (post-mutation) state.
   - Create node with this snapshot, `parentId = currentId`, `actionLabel`.
   - Append to parent's `childIds`.
   - `currentId = newNode.id`.
   - Prune if needed.

This changes the call-site pattern from `pushUndo(); doMutation();` to `doMutation(); commitState(label);`.

**However**, this requires changing ~40 call sites and their ordering. To minimise refactor risk:

**Pragmatic approach — keep `pushUndo()` semantics but reinterpret:**

```
pushUndo(actionLabel):
  // The snapshot saved is the pre-mutation state.
  // If currentNode already has this exact snapshot, skip (dedup).
  newSnapshot = captureSnapshot()
  if (currentNode.snapshot === newSnapshot) return  // no change yet
  create new UndoNode {
    snapshot: newSnapshot,
    parentId: currentId,
    actionLabel: actionLabel,
    ...
  }
  currentNode.childIds.push(newNode.id)
  currentId = newNode.id
  prune if needed
```

Actually this is overcomplicating it. Let me use the simplest correct model:

**Final approach:**

- Each node stores a snapshot.
- The root node stores the initial state.
- `pushUndo()` captures the current state (pre-mutation) into a **new child** of `currentId`, then advances `currentId` to that new child. The caller then mutates. The tree therefore stores every pre-mutation checkpoint, exactly like the linear stack.
- `undo()` sets `currentId = currentNode.parentId` and restores that node's snapshot.
- When the user undoes to node X and then calls `pushUndo()` again, the new node is added as another child of X, creating a branch. The old children (the redo path) remain.

**Wait — there is an off-by-one here.** In the current system:

```
State: A
pushUndo()    -> undoStack = [A]
mutate()      -> State: B
pushUndo()    -> undoStack = [A, B]
mutate()      -> State: C
undo()        -> State: B (restored from stack), redoStack = [C]
undo()        -> State: A (restored from stack), redoStack = [C, B]
```

For the tree:

```
root(A) -> node1(B) -> node2(C)
                         ^ currentId

undo(): currentId = node1, restore B
undo(): currentId = root, restore A
new pushUndo() from root(A): creates node3 as child of root
  root(A) -> node1(B) -> node2(C)
          \-> node3(?)
```

But `pushUndo()` is called **before** mutation, so node3 captures state A (same as root). That is redundant.

**The fundamental issue:** the linear model stores "the state I might want to go back to" (pre-mutation). The tree model stores "the state at this point." These align if we say: the node that `currentId` points to IS the current state, and `pushUndo()` simply records "I am about to leave this state."

**Cleanest resolution:**

The tree does NOT create a new node in `pushUndo()`. Instead:

- `pushUndo(actionLabel)` does nothing to the tree (the current state is already stored in `currentNode`).
- After mutation, a new "commit" is made: `commitState(actionLabel)` creates a new child node with the post-mutation snapshot.
- `undo()` = move `currentId` to parent, restore parent's snapshot.
- `redo(childIndex)` = move `currentId` to specified child, restore that child's snapshot.

This requires changing every call site from:
```js
pushUndo(); doMutation(); renderTable(); saveState();
```
to:
```js
doMutation(); renderTable(); saveState(); commitState('Set cell ✓');
```

**Call-site migration:** There are ~40 call sites. The refactor is mechanical — move the commit call after the mutation instead of before. This is the correct approach because it eliminates the semantic confusion entirely.

**For backward compatibility during migration**, a wrapper can be provided:

```js
function withUndo(actionLabel, fn) {
  fn();
  commitState(actionLabel);
}

// Usage:
withUndo('Set cell ✓', () => {
  setCellValue(row, col, '✓');
  renderTable();
  saveState();
});
```

### 3.2 commitState(actionLabel)

```
function commitState(actionLabel) {
  const snapshot = captureSnapshot();
  // Dedup: if snapshot === currentNode.snapshot, skip
  if (snapshot === tree.nodes.get(tree.currentId).snapshot) return;

  const node = {
    id: crypto.randomUUID(),
    parentId: tree.currentId,
    childIds: [],
    snapshot: snapshot,
    timestamp: Date.now(),
    actionLabel: actionLabel || 'Edit',
    branchLabel: null,
  };

  tree.nodes.get(tree.currentId).childIds.push(node.id);
  tree.nodes.set(node.id, node);
  tree.currentId = node.id;

  pruneIfNeeded();
  renderTreePanel();  // update the tree visualisation
}
```

### 3.3 commitStateThrottled(actionLabel)

Same as `pushUndoThrottled()` — wraps `commitState` with a 500ms debounce.

### 3.4 undo()

```
function undo() {
  const current = tree.nodes.get(tree.currentId);
  if (!current.parentId) return; // at root, nothing to undo
  tree.currentId = current.parentId;
  restoreSnapshot(tree.nodes.get(tree.currentId).snapshot);
  renderTreePanel();
}
```

### 3.5 redo()

```
function redo() {
  const current = tree.nodes.get(tree.currentId);
  if (current.childIds.length === 0) return;
  // Navigate to the most recently visited child (see section 5.2)
  const targetChild = getPreferredChild(current);
  tree.currentId = targetChild;
  restoreSnapshot(tree.nodes.get(tree.currentId).snapshot);
  renderTreePanel();
}
```

### 3.6 jumpToNode(nodeId)

```
function jumpToNode(nodeId) {
  if (!tree.nodes.has(nodeId)) return;
  tree.currentId = nodeId;
  restoreSnapshot(tree.nodes.get(tree.currentId).snapshot);
  renderTreePanel();
}
```

---

## 4. UI Design

### 4.1 Placement: Sidepanel Section

The tree visualisation lives as a new `<details>` section in the existing sidepanel, placed **between** "Row Details" and the bottom of the panel.

```html
<details class="panel" id="undo-tree-panel">
  <summary class="panel-header">History</summary>
  <div class="panel-body">
    <div id="undo-tree-viewport" class="undo-tree-viewport">
      <div id="undo-tree-canvas" class="undo-tree-canvas">
        <!-- tree nodes rendered here -->
      </div>
    </div>
  </div>
</details>
```

**Rationale for sidepanel placement:**
- Consistent with existing UI pattern (all config/tools live in the sidepanel).
- Collapsible via `<details>` — completely hidden when not needed.
- Does not steal focus from the spreadsheet.
- No floating overlays to manage z-index or dismiss behaviour.
- Works on iPad (no hover-dependent overlay triggers).

**R7 satisfied:** The `<details>` element is collapsed by default. Power users open it when needed.
**R8 satisfied:** The sidepanel is already a separate column; the tree section scrolls independently within it.

### 4.2 Viewport Dimensions

- **Width:** Full sidepanel width (280px desktop, 260px mobile, minus padding).
- **Height:** Fixed max-height of `240px` with `overflow-y: auto`. This shows approximately 10-12 nodes vertically.
- The viewport scrolls vertically. The tree canvas inside can grow arbitrarily tall.

### 4.3 Tree Layout: Vertical, Top-Down

The tree is rendered **vertically** — root at the top, branches growing downward. This is the natural reading direction and maps to chronological order (older states above, newer below).

```
    [root]
      |
    [node1]
      |
    [node2]-----+
      |          |
    [node3]   [node5]    <- branch
      |          |
    [node4]   [node6]
```

Each node is rendered as a small horizontal row. Branches are shown via indentation and connecting lines.

### 4.4 Node Rendering

Each node is a single line in the tree, structured as:

```
[connector] [marker] [label]                [time]
```

Concrete example:
```
  | ● Set cell ✓                           14:23
  | ○ Delete row                           14:22
  ├─● Add row                              14:21
  │ ○ Set cell ×                           14:20
  ○ Initial                                14:18
```

**Components:**

| Element | Description |
|---------|-------------|
| Connector | Vertical/branch lines using `│`, `├─`, `└─` characters (rendered via CSS borders, not text) |
| Marker | `●` (filled circle, 6px) = current node. `○` (hollow circle, 6px) = other nodes. Rendered as a CSS pseudo-element. |
| Label | `actionLabel` text, truncated to ~20 characters with ellipsis. If `branchLabel` is set, show that instead in **bold**. |
| Time | `HH:MM` format, right-aligned, muted colour (`var(--c-dim)`). |

**Colour coding:**

| Condition | Marker colour |
|-----------|--------------|
| Current node | `var(--c-accent)` (the theme colour) |
| Ancestor of current node (undo path) | `var(--c-text)` (default text colour) |
| Other nodes (branches not on current path) | `var(--c-dim)` (muted) |

No icons beyond the marker circle. No colour per action type. Keeps it minimal per R7.

### 4.5 Branch Rendering

When a node has multiple children, each child starts a visual branch:

```
  ○ Edit A
  ├── ○ Edit B (branch 1, older)
  │   └── ○ Edit C
  └── ● Edit D (branch 2, newer, current)
      └── ○ Edit E
```

- Branches are indented 16px per level.
- The maximum visible indent depth is capped at 4 levels (64px). Beyond that, the tree scrolls horizontally (rare edge case).
- CSS `border-left` is used for the vertical connector line, `border-bottom` + `border-left` for the `└─` turn.

### 4.6 Branch Collapsing

Branches that are **not on the path to the current node** are collapsed by default, showing only the branch point node with a collapse indicator:

```
  ○ Edit A
  ├── ○ Edit B  [+3]      <- collapsed branch, 3 hidden descendants
  └── ● Edit D             <- current path, expanded
      └── ○ Edit E
```

- `[+N]` badge shows the count of hidden descendants.
- Clicking the `[+N]` badge expands that branch.
- Clicking again collapses it.
- The current path from root to `currentId` is **always expanded** and cannot be collapsed.

This keeps the tree compact for the common case (one main path with a few old branches) per R7.

### 4.7 Auto-Scroll

When `currentId` changes (via undo, redo, commit, or jump), the viewport scrolls to keep the current node visible. The current node is positioned at roughly the vertical centre of the viewport.

No smooth scrolling animation per R6 — use `scrollIntoView({ block: 'center', behavior: 'instant' })`.

---

## 5. Interaction Model

### 5.1 Click to Jump

Clicking any node in the tree calls `jumpToNode(nodeId)`. The state is restored instantly. No preview-on-hover (hover is unreliable on iPad per R5, and instant jump is simpler per R7).

**Touch targets:** Each node row is at least 32px tall to satisfy iPad touch requirements (Apple HIG minimum 44pt, but 32px is acceptable given the dense utility nature — nodes are full-width rows so the horizontal target is generous).

Revised: make each node row **36px** tall to be closer to touch guidelines while staying compact.

### 5.2 Keyboard: Cmd+Z / Cmd+Shift+Z

| Shortcut | Action |
|----------|--------|
| Cmd+Z (Ctrl+Z) | `undo()` — move to parent node |
| Cmd+Shift+Z (Ctrl+Shift+Z) | `redo()` — move to preferred child |
| Cmd+Y (Ctrl+Y) | `redo()` — same as above |

**Preferred child selection for redo:**

When a node has multiple children (branches), redo must pick one. The rule:

1. If the user just undid from child X, redo goes back to X. (This preserves the linear undo/redo feel for simple back-and-forth.)
2. Otherwise, redo goes to the **most recently created** child (last element in `childIds`, since `childIds` is sorted by creation time).

To implement rule (1): maintain a `lastVisitedChild: Map<string, string>` that records, for each node, which child was last navigated to (set on every undo operation: `lastVisitedChild.set(parentId, childId)`).

```
function getPreferredChild(node) {
  if (lastVisitedChild.has(node.id)) {
    const childId = lastVisitedChild.get(node.id);
    if (node.childIds.includes(childId)) return childId;
  }
  // Fallback: most recently created child
  return node.childIds[node.childIds.length - 1];
}
```

### 5.3 Branch Labelling

Double-clicking a node in the tree opens an inline text input (same pattern as row-label editing in the existing UI) to set `branchLabel`. Pressing Enter confirms, Escape cancels.

- Labels are optional. If set, the label replaces `actionLabel` in the display (shown in bold).
- Maximum length: 30 characters.
- Use case: the user wants to mark a known-good state, e.g. "Before restructure".

On iPad (no double-click): long-press (500ms) triggers the label edit. This is detected via `pointerdown`/`pointerup` timing.

### 5.4 Context Menu (Right-Click / Long-Press)

Right-clicking a node (or long-press on iPad) shows a minimal context menu:

| Option | Action |
|--------|--------|
| Jump here | `jumpToNode(nodeId)` — same as click, but explicit |
| Label... | Opens inline label editor |
| Copy branch | Collapses/expands the branch rooted at this node |

Three items maximum. No delete option — pruning is automatic.

### 5.5 No Drag, No Multi-Select

Nodes cannot be dragged or reordered. The tree is immutable history. No multi-select.

---

## 6. Initialisation and Persistence

### 6.1 Tree Initialisation

On page load:

1. Load state from `localStorage` (existing `saveState`/`loadState` flow).
2. Create a root `UndoNode` with the loaded state as its snapshot, `actionLabel: 'Session start'`.
3. Set `currentId = rootId`.

The tree is **not persisted to localStorage**. It exists only for the duration of the browser session. Rationale: persisting 500 snapshots to localStorage would be slow and hit the 5-10 MB quota. The tree is an undo tool, not a version history archive.

### 6.2 On Page Unload

The tree is discarded. No cleanup needed.

---

## 7. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| **Undo at root** | `undo()` is a no-op. No error, no feedback. |
| **Redo at leaf** | `redo()` is a no-op. |
| **500 nodes reached, all on one path** | Prune root. New root = second node. |
| **Throttled commits (typing)** | `commitStateThrottled` coalesces rapid changes. If the user types in a cell for 3 seconds, one node is created (not 6). Label: 'Edit cell'. |
| **Empty state (fresh load)** | Tree has exactly one node (root). The tree panel shows a single `● Session start` entry. |
| **Snapshot dedup** | If `commitState` is called but the snapshot is identical to the current node, no new node is created. Prevents no-op pushes from cluttering the tree. |
| **Very wide tree (many branches)** | Horizontal scroll within the viewport if indentation exceeds viewport width. Maximum indent cap of 4 levels keeps this rare. |
| **iPad sidepanel collapsed** | On small screens, the sidepanel may be collapsed. The tree panel is inside the sidepanel, so it is hidden when the sidepanel is collapsed. The tree still functions — keyboard undo/redo works regardless. |

---

## 8. Acceptance Criteria

| # | Criterion | Traces to |
|---|-----------|-----------|
| AC1 | Undo (Cmd+Z) navigates to parent node and restores its state | R1 |
| AC2 | Redo (Cmd+Shift+Z) navigates to preferred child and restores its state | R1 |
| AC3 | After undo + new edit, old redo path is preserved as a visible branch in the tree | R3 |
| AC4 | Tree never exceeds 500 nodes | R2 |
| AC5 | Tree panel appears as a collapsible `<details>` section in the sidepanel | R4, R7 |
| AC6 | Clicking a node jumps to that state | R4 |
| AC7 | Current node is visually distinguished (filled marker, accent colour) | R4 |
| AC8 | Off-path branches are collapsed by default with a `[+N]` count | R7 |
| AC9 | Tree viewport is scrollable; current node auto-scrolls into view | R4 |
| AC10 | Each node displays action label and HH:MM timestamp | R4 |
| AC11 | All touch targets are at least 36px tall | R5 |
| AC12 | No CSS transitions or animations on tree elements | R6 |
| AC13 | Double-click (desktop) or long-press (iPad) allows labelling a node | R4 |
| AC14 | Tree is not persisted to localStorage; starts fresh each session | R2 (memory), R8 |
| AC15 | `commitStateThrottled` coalesces rapid edits into one node (500ms debounce) | R2 (node economy) |
| AC16 | Pruning removes oldest non-ancestor leaves first | R2 |

---

## 9. Migration Plan (Call-Site Refactor)

The existing ~40 call sites follow this pattern:

```js
pushUndo();
setCellValue(row, col, '✓');
renderTable();
saveState();
```

They must be refactored to:

```js
setCellValue(row, col, '✓');
renderTable();
saveState();
commitState('Set cell ✓');
```

Or, using the helper:

```js
withUndo('Set cell ✓', () => {
  setCellValue(row, col, '✓');
  renderTable();
  saveState();
});
```

**Recommendation:** Use the `withUndo` wrapper for all call sites. It is less error-prone (impossible to forget the commit) and makes the action label explicit.

For throttled sites (cell typing, dragging), use:

```js
withUndoThrottled('Edit cell', () => {
  setCellValue(row, col, value);
  renderTable();
  saveState();
});
```

The old `pushUndo`, `pushUndoThrottled`, `undo`, `redo`, `undoStack`, and `redoStack` are all deleted.

---

## 10. CSS Additions (Layout Intent)

```
.undo-tree-viewport {
  max-height: 240px;
  overflow-y: auto;
  overflow-x: auto;
  border: 1px solid var(--c-border);
  border-radius: 4px;
}

.undo-tree-node {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
}

.undo-tree-node:hover {
  background: var(--c-hover);
}

.undo-tree-node[data-current="true"] .undo-tree-marker {
  background: var(--c-accent);
}

.undo-tree-marker {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid var(--c-text);
  flex-shrink: 0;
  margin-right: 8px;
}

.undo-tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-tree-time {
  flex-shrink: 0;
  color: var(--c-dim);
  margin-left: 8px;
  font-variant-numeric: tabular-nums;
}

.undo-tree-branch-badge {
  font-size: 10px;
  color: var(--c-dim);
  margin-left: 4px;
  cursor: pointer;
}

.undo-tree-connector {
  border-left: 1.5px solid var(--c-border);
  /* width = 16px per indent level */
}
```

These are layout guidelines — exact variable names and values should match the existing `style.css` tokens.

---

## 11. Dependencies

| This feature depends on | Notes |
|--------------------------|-------|
| `captureSnapshot()` | Unchanged — still returns JSON string |
| `restoreSnapshot(s)` | Unchanged — still parses and applies |
| `saveState()` | Called after restore, same as today |
| `renderTable()` | Called after restore, same as today |
| Sidepanel HTML structure | New `<details>` section added |
| `style.css` custom properties | Must verify `--c-border`, `--c-dim`, `--c-hover`, `--c-accent` exist or define them |

| Depends on this feature | Notes |
|--------------------------|-------|
| Nothing — the undo tree is self-contained | All existing features call `withUndo()` instead of `pushUndo()` |

---

## 12. Out of Scope

- **Persistent undo history across sessions** — not in this iteration.
- **Visual diff between nodes** — not in this iteration.
- **Collaborative undo** — Daakaa is single-user.
- **Export/import of undo tree** — no use case identified.
- **Undo tree in view mode** — view mode has no editing, so no undo tree.
