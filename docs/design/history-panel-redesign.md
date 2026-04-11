# History Panel Redesign: Git-style Branch Visualisation

**Status:** Proposed
**Date:** 2026-04-10
**Addresses:** Undo tree visualisation quality, readability, touch interaction

---

## 1. Library Recommendation: @gitgraph/js

**Choice: `@gitgraph/js`** (UMD bundle via CDN)

### Why this library

| Criterion | @gitgraph/js | vis-network | D3.js | Mermaid |
|---|---|---|---|---|
| Git-like branch rendering | Native, purpose-built | Manual layout needed | Manual layout needed | Native but static |
| Vanilla JS, no framework | Yes (UMD bundle) | Yes | Yes | Yes |
| CDN availability | jsdelivr UMD bundle | Yes | Yes | Yes |
| Click events on nodes | Yes (commit.onMouseDown) | Yes | Yes | No (SVG is static) |
| Touch support | SVG-based, touch events work | Canvas-based, built-in | SVG, manual | No interaction |
| Bundle size | ~30 KB min | ~200 KB+ | ~90 KB+ | ~150 KB+ |
| Effort to integrate | Low — API maps directly to our model | High — need custom layout | High — build from scratch | N/A — no click support |
| Maintenance | Archived (July 2024) but stable | Active | Active | Active |

**Rationale:** @gitgraph/js is purpose-built for exactly this use case. The API concepts (branches, commits, branch points) map 1:1 to our undo tree model. Despite being archived, the library is stable and feature-complete for our needs. The UMD bundle works without npm.

The archival is acceptable because:
- We need a renderer, not an evolving framework
- The SVG output is standard; no browser API dependencies at risk
- Our use case is fixed (render a tree, handle clicks)

### CDN integration

```html
<script src="https://cdn.jsdelivr.net/npm/@gitgraph/js@1/lib/gitgraph.umd.min.js"></script>
```

---

## 2. Data Model Mapping

### Undo tree concepts to gitgraph concepts

| Undo Tree | @gitgraph/js | Notes |
|---|---|---|
| Root node (id: 0) | Initial commit on "main" branch | Always exists |
| Ancestor path (root to current) | "main" branch | The primary visual line |
| Current node (`undoCurrentId`) | HEAD marker | Visually highlighted commit |
| Node with >1 child | Branch point | First child stays on current branch; subsequent children start new branches |
| `actionLabel` | Commit subject | Displayed on the node |
| `timestamp` | Commit detail | Shown as secondary text |
| `branchLabel` | Branch name | Used if set; otherwise auto-generated ("branch-2", "branch-3", etc.) |

### Branch assignment algorithm

The adapter must walk the tree and assign each node to a named branch. The rule:

1. Start at root (id: 0). Assign to branch "main".
2. For any node with `childIds`, the child that lies on the ancestor path to `undoCurrentId` continues on the same branch. If no child is on the ancestor path, the first child continues.
3. All other children start new branches, named `branchLabel` if set, otherwise `"branch-{nodeId}"`.
4. Recurse depth-first.

This means the "main" visual line always traces root to current node, with side branches forking off to the right.

### Rendering order

gitgraph.js renders commits in the order they are added via API calls. We must therefore perform a **topological walk** of the tree, emitting commits in parent-before-child order. For each branch point, emit the main-path child first, then side branches.

Pseudocode:

```
function buildGraph(gitgraph):
    ancestorSet = getAncestorIds(undoCurrentId)
    branchMap = {}  // nodeId -> gitgraph branch object

    mainBranch = gitgraph.branch("main")
    branchMap[0] = mainBranch

    walk(0):
        node = undoTree[id]
        currentBranch = branchMap[id]

        commit on currentBranch:
            subject: node.actionLabel
            body: formatTime(node.timestamp)
            dotText: id == undoCurrentId ? "HEAD" : ""
            onClick: () => jumpToNode(id)

        // Partition children: main-path child vs side branches
        mainChild = childIds.find(c => ancestorSet.has(c))
                    ?? childIds[0]  // if current is above this subtree
        sideChildren = childIds.filter(c => c !== mainChild)

        // Side branches first (gitgraph renders them as offshoots)
        for each sideChild in sideChildren:
            name = undoTree[sideChild].branchLabel ?? "branch-" + sideChild
            newBranch = currentBranch.branch(name)
            branchMap[sideChild] = newBranch
            walk(sideChild)

        // Main-path child continues on same branch
        if mainChild:
            branchMap[mainChild] = currentBranch
            walk(mainChild)
```

---

## 3. Rendering Approach

### Container

Replace the contents of `#history-panel` with a container div that gitgraph renders into. The panel element itself stays the same.

```javascript
function renderHistoryPanel() {
    var panel = document.getElementById('history-panel');
    if (!panel) return;
    panel.innerHTML = '';

    var container = document.createElement('div');
    container.id = 'history-graph';
    panel.appendChild(container);

    var gitgraph = GitgraphJS.createGitgraph(container, {
        orientation: 'vertical-reverse',  // newest at bottom
        template: daakaaTemplate,          // custom template (see below)
    });

    buildGitgraph(gitgraph);
    scrollToHead(panel);
}
```

### Orientation

**`vertical-reverse`** — newest commits at the bottom, matching a natural timeline. The panel scrolls down to show the current state. This matches user expectation: "I'm at the bottom, older stuff is above."

Alternative: `vertical` (newest at top) if user feedback prefers it. This is a tuneable decision.

### Custom template

gitgraph.js supports custom templates to control:
- Commit dot size, colour, stroke
- Branch line colours and width
- Commit message font, size, position
- Spacing between commits and branches

Design intent (matching Daakaa's monochrome aesthetic):

| Parameter | Value | Rationale |
|---|---|---|
| Commit dot radius | 5px | Readable but compact |
| Commit dot colour (normal) | `#000` | Matches Daakaa's black/white palette |
| Commit dot colour (HEAD) | `var(--accent)` with black stroke | Distinct but in-palette |
| Branch line width | 2px | Clean |
| Branch colours | `["#000", "#888", "#bbb"]` | Monochrome, differentiable |
| Commit spacing Y | 28px | Enough for label + touch target (44px total with padding) |
| Branch spacing X | 16px | Compact for sidepanel width |
| Font | `var(--font)` | Consistent |
| Font size | 11px (desktop), 12.6px (mobile, per x1.143 scale) | Per existing typography rules |

### Re-rendering

`renderHistoryPanel()` is called on every undo/redo/commit/jump. The function destroys and recreates the graph each time. With up to 500 nodes, this must remain fast.

**Performance consideration:** gitgraph.js renders to SVG. 500 SVG elements with text labels is well within browser capability (<16ms). If profiling shows issues, we can:
- Debounce re-renders (coalesce rapid commits)
- Only re-render if the tree structure actually changed (compare undoNextId + undoCurrentId)

### Scroll to HEAD

After rendering, find the SVG element for the current commit and scroll it into view:

```javascript
function scrollToHead(panel) {
    // gitgraph.js adds data attributes or we can find by class
    var headDot = panel.querySelector('.gitgraph-head')
                  || panel.querySelector('[data-head="true"]');
    if (headDot) headDot.scrollIntoView({ block: 'nearest' });
}
```

The exact selector depends on how we mark HEAD in the template. If gitgraph.js does not natively support a HEAD marker class, we apply it post-render by finding the last-committed dot.

---

## 4. Touch Considerations

### Tap targets

Each commit node must have a minimum 44x44px touch target (Apple HIG). The commit spacing of 28px means we need additional padding/hit area. Options:
- Invisible rect overlay on each commit, 44px tall, full panel width
- CSS `pointer-events` on the commit group with padding

### Scroll

The history panel is already scrollable (`overflow-y: auto`). SVG inside a scrollable div works natively with touch scroll. No special handling needed.

### Pinch zoom

Disabled globally by existing iOS viewport fixes (`fb4ce8c`). The SVG scales with the panel width, which is correct.

### Tap vs drag disambiguation

SVG click/tap events fire only on stationary taps, not on scroll gestures. No custom disambiguation needed.

---

## 5. Integration Plan

### Files changed

| File | Change |
|---|---|
| `index.html` | Add `<script>` tag for gitgraph.js CDN |
| `js/undo.js` | Replace `renderHistoryPanel()` and `renderTreeNode()` with new gitgraph-based renderer. Remove `renderTreeNode()` and `countDescendants()`. |
| `style.css` | Remove `.history-node`, `.history-node-marker`, `.history-node-label`, `.history-node-time`, `.history-indent` rules. Add `.history-graph` container styles and gitgraph template overrides if needed. |

### Files NOT changed

- Undo tree data model (`undoTree`, `commitUndoNode`, `undo`, `redo`, `jumpToNode`, pruning) — all unchanged
- `saveUndoTree` / `loadUndoTree` — unchanged
- Sidepanel/bottom-panel responsive layout — unchanged (the panel container stays the same; only its contents change)

### New code (~80 lines estimated)

1. `buildGitgraph(gitgraph)` — the adapter function (tree walk + branch assignment + commit emission)
2. `daakaaTemplate` — gitgraph.js template configuration object
3. Updated `renderHistoryPanel()` — creates container, instantiates gitgraph, calls adapter, scrolls to HEAD

### CDN tag

```html
<script src="https://cdn.jsdelivr.net/npm/@gitgraph/js@1/lib/gitgraph.umd.min.js"></script>
```

Placed after `style.css` link, before app scripts. The `@1` pins to major version 1.x.

---

## 6. Fallback Plan

If @gitgraph/js proves unsuitable (rendering bugs, performance with 500 nodes, touch issues, or CDN UMD bundle not working correctly):

### Plan B: Custom SVG renderer

Build a minimal SVG renderer from scratch (~200 lines). This is feasible because:
- Our tree structure is simpler than full Git (no merges, only branches)
- We only need: vertical line per branch, dots for commits, horizontal lines for branch-offs, text labels, click handlers
- The branch assignment algorithm (section 2) is reusable regardless of renderer

The SVG renderer would:
1. Run the same tree walk and branch assignment
2. Calculate x/y positions (branch index * spacing, commit index * spacing)
3. Emit SVG `<line>`, `<circle>`, `<text>` elements
4. Attach click handlers to circles/text

This is more work but has zero dependencies and full control.

### Plan C: Improved HTML renderer

If SVG is overkill, improve the current HTML approach:
- Add a left-side "rail" column using CSS grid, with coloured vertical lines for branches
- Use CSS `::before` pseudo-elements for branch lines and dots
- This is essentially the current approach but with proper visual branch indication

---

## 7. Open Questions

1. **Orientation preference:** `vertical-reverse` (newest at bottom, like a timeline) or `vertical` (newest at top, like a log)? Current implementation renders top-to-bottom with root at top. Recommend keeping that convention unless user feedback says otherwise.

2. **Branch naming:** Auto-generated names like "branch-42" are not meaningful. Should we derive names from the first `actionLabel` on the branch (e.g., "Edit row 3 branch")? Or keep them as anonymous visual branches with no label?

3. **Branch colour cycling:** With Daakaa's monochrome palette, how many distinguishable grey tones can we use for branches? Three (`#000`, `#888`, `#bbb`) may not be enough if there are many concurrent branches. Consider using line style (dashed, dotted) as a secondary differentiator.

4. **Collapsed branches:** For trees with many nodes on side branches, should we collapse (hide) branches that are far from the current path? This would improve readability but adds complexity. Recommend deferring to a future iteration.

5. **gitgraph.js archival risk:** The library is archived as of July 2024. If a browser update breaks SVG rendering in a way that requires a library patch, we would need to fork. The fallback plan (section 6) mitigates this. Acceptable risk for now.

6. **UMD bundle verification:** The CDN UMD bundle for @gitgraph/js needs hands-on verification that `GitgraphJS.createGitgraph` is exposed globally. If not, we may need to self-host the bundle.
