# Row Grouping

**Status:** Draft
**Date:** 2026-04-10
**Addresses:** Row organisation, collapsible sections, summary aggregation

---

## 1. Overview

Rows can be organised into **single-level, collapsible groups**. A group is a special header-only row type: it has a label and collapsed/expanded state, but no check-in cells. Groups provide visual structure and allow users to hide blocks of rows while retaining an at-a-glance summary.

### 1.1 Design Pillars

| Pillar | Implication |
|---|---|
| Single-level only | No nested groups. Keeps the model flat and the UI predictable. |
| Non-destructive defaults | A fresh sheet with no groups behaves exactly as today. Groups are opt-in. |
| Undo-compatible | Every grouping mutation flows through `commitUndoNode()` / snapshot. |
| View-mode aware | Structural edits (create/rename/delete/reorder group, move rows between groups) are blocked. Collapse/expand is always permitted. |
| iPad-compatible | All interactions must work with touch (long-press, tap, drag). |

---

## 2. Data Model

### 2.1 New State Fields

```
state.groups    : Array<Group>    // ordered list of named groups
state.pinnedCollapsed : Boolean   // whether the pinned section is collapsed (default: false)
```

### 2.2 Group Object

```
Group {
  id       : string   // unique, e.g. "g_" + incrementing counter or nanoid
  label    : string   // user-visible name
  collapsed: boolean  // true = rows hidden, summary shown
}
```

**Reserved group:** The "Other" group is **not** stored in `state.groups`. It is a virtual group rendered after all named groups. Its collapsed state is stored as:

```
state.otherCollapsed : Boolean  // default: false
```

Rationale: keeping "Other" virtual avoids ID conflicts, prevents accidental deletion, and simplifies ordering logic — `state.groups` contains only user-created groups.

### 2.3 Row Object Extension

Each row gains an optional `groupId` field:

```
Row {
  name     : string
  bold     : boolean
  underline: boolean
  groupId  : string | null   // null or absent = pinned (no group)
}
```

A row whose `groupId` matches no existing group ID is treated as ungrouped (falls to "Other"). This provides forward-compatible resilience if groups are deleted outside the normal flow.

### 2.4 Ordering Model

The **display order** is derived, not stored as a flat index:

1. **Pinned rows** — rows where `groupId` is `null` / absent, in their `state.rows` array order.
2. **Named groups** — in `state.groups` array order. Within each group, rows appear in `state.rows` array order (filtered to matching `groupId`).
3. **"Other" group** — rows whose `groupId` matches no existing group, in `state.rows` array order.

The `state.rows` array remains the single source of truth for intra-section ordering. When rendering, the display builds a **resolved row list** by walking the sections in the order above.

### 2.5 Cells Keying

**Critical change:** Today, `state.cells` is keyed by the row's positional index in `state.rows`. With grouping, the display order diverges from the storage order. Two approaches:

**Option A — Re-key cells by display index at render time (status quo pattern).**
`state.cells[r][c]` where `r` is the index in `state.rows`. Rendering maps display index to storage index. `moveRow()` already re-keys cells; this pattern extends naturally.

**Option B — Key cells by row ID.**
Each row gets a stable `id` field. `state.cells` becomes `{ [rowId]: { [colIndex]: value } }`. No re-keying on reorder. Breaking change to snapshot format.

**Decision: Option A (positional keying, no change).** The existing `moveRow()` cell-rekey pattern is proven. Adding row IDs is a larger refactor best deferred. The display-to-storage index mapping is the only new complexity.

### 2.6 Snapshot Integration

`captureSnapshot()` and `restoreSnapshot()` must include the new fields:

```js
// captureSnapshot additions:
groups: state.groups,
pinnedCollapsed: state.pinnedCollapsed,
otherCollapsed: state.otherCollapsed,

// restoreSnapshot additions:
state.groups = s.groups || [];
state.pinnedCollapsed = s.pinnedCollapsed || false;
state.otherCollapsed = s.otherCollapsed || false;
```

Backward compatibility: if `groups` is absent in a snapshot, default to `[]` (no groups — legacy behaviour).

### 2.7 Export/Import (.daakaa.gz)

The project export object gains:

```js
project.groups = state.groups;
project.pinnedCollapsed = state.pinnedCollapsed;
project.otherCollapsed = state.otherCollapsed;
```

On import, missing fields default to empty/false. The `version` field should be bumped to `2` so importers can detect the new schema, though version `1` files import cleanly (no groups = legacy).

---

## 3. Resolved Row List (Display Model)

A helper function builds the flat display list used by `renderTable()`:

```
resolveDisplayRows() → Array<DisplayEntry>
```

Each `DisplayEntry` is one of:

| type | fields | notes |
|---|---|---|
| `"pinned-header"` | `{ type, collapsed }` | Rendered only if there are pinned rows AND at least one named group exists. Acts as section header for the pinned area. |
| `"row"` | `{ type, storageIndex, row }` | A regular data row. `storageIndex` = index in `state.rows`. |
| `"group-header"` | `{ type, groupId, group }` | A named group's header. |
| `"other-header"` | `{ type, collapsed }` | The "Other" section header. Rendered only if there are ungrouped orphan rows. |

**Construction algorithm:**

```
let entries = []

pinnedRows = state.rows filtered where groupId is null/absent
if (pinnedRows.length > 0 AND state.groups.length > 0):
  entries.push({ type: "pinned-header", collapsed: state.pinnedCollapsed })
  if (!state.pinnedCollapsed):
    for each pinnedRow: entries.push({ type: "row", storageIndex, row })

for each group in state.groups:
  entries.push({ type: "group-header", groupId: group.id, group })
  if (!group.collapsed):
    groupRows = state.rows filtered where groupId === group.id
    for each groupRow: entries.push({ type: "row", storageIndex, row })

otherRows = state.rows filtered where groupId matches no existing group AND groupId is not null
if (otherRows.length > 0):
  entries.push({ type: "other-header", collapsed: state.otherCollapsed })
  if (!state.otherCollapsed):
    for each otherRow: entries.push({ type: "row", storageIndex, row })
```

**Edge case — no groups exist:** If `state.groups` is empty, no headers are rendered. All rows render in `state.rows` order — identical to current behaviour. The pinned-header and other-header only appear once at least one named group exists.

**Edge case — all rows are pinned:** If every row has `groupId: null` and no groups exist, the display is identical to today. If groups exist but happen to be empty, pinned header + pinned rows + empty group headers + empty Other section.

---

## 4. Rendering

### 4.1 Table Structure

`renderTable()` iterates `resolveDisplayRows()` instead of `state.rows` directly.

**Header rows** (`pinned-header`, `group-header`, `other-header`) render as `<tr>` elements with a distinct structure:

```html
<tr class="group-header-row" data-group-id="g_1" data-group-type="named">
  <td class="sticky-left group-header-label" colspan="1">
    <span class="group-toggle">▶</span>  <!-- ▶ collapsed, ▼ expanded -->
    <span class="group-label-text">Morning Routine</span>
  </td>
  <td class="group-summary-cell" data-col="0">...</td>
  <td class="group-summary-cell" data-col="1">...</td>
  ...
</tr>
```

The pinned-header uses `data-group-type="pinned"` and label "Pinned". The other-header uses `data-group-type="other"` and label "Other".

**Regular rows** render as today, with an additional `data-storage-row` attribute holding the `state.rows` index (the existing `data-row` attribute becomes the **display index** for selection/visual purposes, while `data-storage-row` maps back to the data layer).

### 4.2 Alt-Row Striping

Current CSS: `.spreadsheet.alt-rows tbody tr:nth-child(even) td.content-cell`.

With group headers interspersed, `nth-child(even)` would count header rows, breaking the alternation pattern. The requirement states: **alt-row striping skips group header rows.**

**Implementation:** Instead of CSS `nth-child`, assign a class during render:

```
let stripeCounter = 0;
for each entry in displayRows:
  if entry.type === "row":
    if (stripeCounter % 2 === 1): tr.classList.add("alt-stripe")
    stripeCounter++
  else:
    // group headers: do NOT increment stripeCounter
```

The CSS rule changes from `tr:nth-child(even)` to `tr.alt-stripe`:

```css
.spreadsheet.alt-rows tbody tr.alt-stripe td.content-cell {
  background: var(--t2);
}
```

**Stripe counter resets per section?** No — continuous striping across sections. This avoids visual jumps when collapsing/expanding.

### 4.3 Summary Cells (Collapsed Group Headers)

When a group is collapsed, each column cell in the header row shows a summary of the hidden rows' values in that column.

**Summary format per cell:**

```
{count}✓ {count}× {count}〇 {count}— [{totalRows} rows]
```

Only non-zero counts are shown. The `[N rows]` suffix is always shown.

Examples:
- 3 rows, column has ✓, ✓, blank → `2✓ [3]`
- 5 rows, column has ✓, ×, 〇, —, ✓ → `2✓ 1× 1〇 1— [5]`
- 4 rows, all blank → `[4]`

**Rules:**
- Arrow-prefixed values (e.g. `←3✓`) count as `✓` for summary purposes.
- Blank cells are not shown as a count (only the total row count implies them).
- When expanded, summary cells are empty (the header row shows no column data).

**Rendering:** Summary cells use the class `group-summary-cell`. They are non-interactive — clicking them toggles the group (same as clicking the header label). They do not participate in cell selection, cycling, or context menus.

### 4.4 Expanded Group Headers

When expanded, the group header row shows:
- The toggle indicator (▼)
- The group label
- Empty summary cells (or a subtle row count like `[3]` — defer exact treatment to Pictor)

### 4.5 Visual Treatment Notes (for Pictor)

Group header rows should be visually distinct from data rows. Suggestions for the art director:
- Slightly different background (e.g. a muted tint or the `--t2` tier)
- Label text slightly larger or bolder than row labels
- Summary text in a secondary colour / smaller size
- A clear expand/collapse affordance (▶/▼ or chevron)
- Group header rows should NOT receive alt-row striping
- Group header rows should NOT receive hover highlight on mouse

---

## 5. Interactions

### 5.1 Create Group

**Entry points:**
1. **Row Details panel** — new "Add to group..." section (see section 7).
2. **Row context menu** — new item: "Move to Group ▸" with sub-options (see below).
3. **Row context menu** — new item: "Create Group Above" — creates a new group immediately above the current row and moves the row into it.

**"Move to Group" sub-menu items:**
- Each existing group name
- Separator
- "+ New Group..." — prompts for a name, creates the group, moves the row into it
- "Pinned (no group)" — sets `groupId` to `null`

**New group defaults:**
- `id`: `"g_" + Date.now()` (sufficient uniqueness for a single-user app)
- `label`: user-provided (prompt with default "New Group")
- `collapsed`: `false`

**Undo label:** `"Create group"` / `"Move row to group"`

**View mode:** All creation actions are blocked.

### 5.2 Rename Group

**Entry points:**
1. **Double-click (mouse) / tap (touch) on group label text** — starts inline edit.
2. **Group context menu** — "Rename Group" (opens inline edit).
3. **Sidepanel** — when a group header is selected (see section 7).

**Constraints:**
- "Other" and "Pinned" labels cannot be renamed.
- Empty string is not allowed — revert to previous label.
- Maximum length: 50 characters (soft limit, enforced by `maxlength` on the input).

**Undo label:** `"Rename group"`

**View mode:** Blocked.

### 5.3 Delete Group

**Entry points:**
1. **Group context menu** — "Delete Group".
2. **Sidepanel** — when group header is selected, a "Delete Group" button appears.

**Prompt:** A confirm dialogue with two choices:
- **"Delete group and rows"** — removes the group and all rows whose `groupId` matches. Cells for those rows are also removed and remaining cells re-keyed.
- **"Keep rows"** — removes the group. All member rows have their `groupId` set to `null` (they become ungrouped / fall to "Other" if other named groups still exist, or become pinned if no groups remain).

**"Other" group** cannot be deleted.

**Edge case — deleting the last named group:** All rows with `groupId` referencing the deleted group become ungrouped. Since no named groups remain, the display reverts to the flat (no-header) view.

**Undo label:** `"Delete group"`

**View mode:** Blocked.

### 5.4 Collapse / Expand

**Entry points:**
1. **Click/tap the toggle indicator** (▶/▼) on any header row.
2. **Click/tap anywhere on the group header row** (label or summary cells).

**Behaviour:**
- Toggles the `collapsed` boolean on the group (or `state.pinnedCollapsed` / `state.otherCollapsed`).
- Re-renders the table.
- Does NOT commit an undo node (collapse state is ephemeral UI state, not data).

**View mode:** Permitted (read-only users can still collapse/expand to manage their view).

**Persistence:** Collapsed state IS saved to localStorage and included in snapshots/exports because it is part of the document's presentation state.

**Keyboard:** No keyboard shortcut in v1. Defer to future iteration.

### 5.5 Reorder Groups

**Entry points:**
- Drag the group header row (same drag system as row drag, but at the group level).

**Constraints:**
- Groups can only be reordered relative to other groups. A group cannot be dragged into the pinned area or below "Other".
- "Other" cannot be reordered (always last).
- "Pinned" section cannot be reordered (always first).

**Implementation:**
- When a drag starts on a group header row, the drag system enters **group drag mode**.
- The drag gap indicator appears only between group headers (not between individual rows).
- On drop, `state.groups` array is reordered. No cell re-keying needed (cells are keyed by `state.rows` index, which does not change).

**Undo label:** `"Reorder group"`

**View mode:** Blocked.

### 5.6 Reorder Rows (Within and Between Groups)

**Within a group:** Works as today — dragging a row within the same section reorders it in `state.rows` and re-keys cells. The row's `groupId` does not change.

**Between groups (including pinned ↔ group ↔ Other):**

When a row is dragged past a group header boundary:
1. The drag gap indicator crosses the boundary, appearing inside the target group.
2. On drop, the row's `groupId` is updated to the target group's ID (or `null` for pinned).
3. The row is repositioned in `state.rows` such that its position within the new group's rows is correct.
4. Cells are re-keyed as in the existing `moveRow()`.

**Visual feedback during cross-group drag:**
- The target group header row receives a subtle highlight (e.g. accent border) to indicate the row will join that group.
- If the target group is collapsed, it auto-expands during drag hover (after 500ms dwell) so the user can place the row precisely. It re-collapses if the drag leaves without dropping.

**Undo label:** `"Move row"`

**View mode:** Blocked.

### 5.7 Group Context Menu

Right-click (mouse) or long-press (touch) on a group header row opens a context menu:

| Item | Action | Condition |
|---|---|---|
| Rename Group | Start inline rename | Not "Other", not "Pinned" |
| Collapse / Expand | Toggle collapsed state | Always |
| Move Up | Swap with previous group in `state.groups` | Not first group, not "Other"/"Pinned" |
| Move Down | Swap with next group in `state.groups` | Not last named group, not "Other"/"Pinned" |
| — separator — | | |
| Delete Group | Show delete confirm | Not "Other", not "Pinned" |

**View mode:** Only "Collapse / Expand" is shown.

---

## 6. Sidepanel Changes

### 6.1 Row Details Panel — Row Selected

When a regular row is selected, the Row Details panel gains a **group assignment control**:

```
Group: [dropdown: Pinned | Group A | Group B | ... | Other]
```

- The dropdown shows all named groups plus "Pinned" (maps to `groupId: null`) and "Other" (maps to orphaning the row — set `groupId` to a sentinel or simply remove it from all groups).
- Changing the dropdown commits an undo node (`"Move row to group"`), updates `row.groupId`, and re-renders.

The existing "Move to row N" control continues to work but now operates within the resolved display order. The input's `max` value reflects the total display row count. Moving a row to a position inside a different group also changes its `groupId`.

### 6.2 Row Details Panel — Group Header Selected

When a group header row is clicked/tapped, `state.selectedRow` is set to a special value (see section 6.3), and the Row Details panel shows:

```
[Group label input]
[Row count: N rows]
[Collapse/Expand toggle button]
— separator —
[Delete Group button]
```

- Label input: editable for named groups, read-only for "Other"/"Pinned".
- Delete button: triggers the delete confirm (section 5.3).
- No bold/underline controls (those are row-level formatting).
- No cell editor (group headers have no cell data).

### 6.3 Selection Model Extension

Currently, `state.selectedRow` is an integer index into `state.rows`. With grouping, we need to also represent "a group header is selected".

**Approach:** Introduce `state.selectedGroup`:

```
state.selectedGroup : string | null   // group ID, or "__pinned__", or "__other__"
```

Invariant: at most one of `state.selectedRow` and `state.selectedGroup` is non-null at any time. Selecting a row clears `selectedGroup`; selecting a group header clears `selectedRow`.

`state.selectedGroup` is **not** included in snapshots (it is transient UI state, same as `selectedRow` which is already reset to `null` on restore).

### 6.4 Rows Tab (Bottom Panel, Mobile)

On the responsive bottom panel (<=768px), the "Rows" tab maps to Row Details. The same group assignment dropdown and group-header editing UI appear here, following the existing tab-based layout.

---

## 7. Integration Points

### 7.1 Undo System

| Operation | Undo label | Snapshot includes |
|---|---|---|
| Create group | `"Create group"` | `state.groups`, affected `row.groupId` |
| Rename group | `"Rename group"` | `state.groups` |
| Delete group (with rows) | `"Delete group"` | `state.groups`, `state.rows`, `state.cells` |
| Delete group (keep rows) | `"Delete group"` | `state.groups`, affected `row.groupId` |
| Move row to group | `"Move row to group"` | `state.rows`, `state.cells`, affected `row.groupId` |
| Reorder group | `"Reorder group"` | `state.groups` |
| Collapse/expand | *(no undo node)* | n/a |

All of these are captured automatically because `captureSnapshot()` serialises the full state including the new fields. No special per-operation handling is needed beyond ensuring the new fields are in the snapshot.

### 7.2 View Mode

| Operation | Permitted in view mode? |
|---|---|
| Collapse / expand | Yes |
| Create group | No |
| Rename group | No |
| Delete group | No |
| Reorder group | No |
| Move row between groups | No |
| Reorder rows | No |
| Group context menu | Only collapse/expand item shown |
| Group assignment dropdown | Disabled |

`applyViewModeLock()` must be extended to disable the group dropdown and hide destructive actions in the group header panel.

### 7.3 Drag-to-Reorder System

The existing drag system (`startRowDrag`, `handleRowDragMove`, `finishRowDrag`) needs the following changes:

1. **Detect drag source type:** Is the dragged `<tr>` a regular row or a group header? Check for `.group-header-row` class.

2. **Group header drag:** Enter group-drag mode. The gap indicator only appears between group headers. On finish, reorder `state.groups`. Do not touch `state.rows` or `state.cells`.

3. **Row drag with group awareness:** `handleRowDragMove` must compute not just the target display index but also the **target group**. When the pointer crosses a group header boundary, the target group changes. `finishRowDrag` must:
   - Update `row.groupId` if the target group differs from the source.
   - Reposition the row in `state.rows` to maintain correct intra-group ordering.
   - Re-key cells via the existing `moveRow()` logic.

4. **Drop zone restrictions:**
   - A group header cannot be dropped inside another group's row area.
   - A row cannot be dropped above the pinned-header (if it exists) — it can be dropped among pinned rows, which sets `groupId` to `null`.
   - Nothing can be dropped below the "Other" header's last row except additional rows joining "Other".

### 7.4 Export/Import

**Project export (.daakaa.gz):**
- `project.groups`, `project.pinnedCollapsed`, `project.otherCollapsed` added to the export object.
- `project.version` bumped to `2`.

**Project import:**
- If `project.groups` is present, restore it. Otherwise default to `[]`.
- If `project.version` is `1` (or absent), rows have no `groupId` — this is fine, they render as pinned (flat view).
- Row objects missing `groupId` are treated as pinned.

**XLSX export:**
- Group headers are exported as rows with the label in the first column and empty data cells (or summary text — TBD based on user feedback).
- A comment or note could indicate it is a group header, but this is lossy. Accept that XLSX round-trips may lose group structure.

**XLSX import:**
- No group detection from XLSX. All imported rows are ungrouped. The user manually organises them.

### 7.5 Header Patterns and Column Operations

- Adding/removing columns: group summary cells adapt automatically (they are computed from row data at render time, not stored).
- Header pattern changes: no interaction with grouping.
- Column reorder (if added in future): no interaction — groups are a row-level concept.

### 7.6 Keyboard Navigation

- Arrow keys navigate across visible (non-collapsed) rows. Collapsed rows are skipped.
- Group header rows are skipped by arrow key navigation (they are not data cells). Pressing Down from the last row before a group header jumps to the first row of the next group (or the next visible section).
- Tab/Shift+Tab: same skip behaviour.

### 7.7 Cell Selection

- Cell range selections (click-drag, Shift+click) cannot include group header rows. If a selection range spans a group header, the header is excluded — the selection covers only data rows above and below the header.
- Batch operations (batch context menu) apply only to selected data cells, never to summary cells.

### 7.8 localStorage Persistence

`saveState()` and `loadState()` must include `groups`, `pinnedCollapsed`, `otherCollapsed`. On load, missing fields default to their empty/false values.

---

## 8. Edge Cases

| Scenario | Expected behaviour |
|---|---|
| Empty group (0 rows) | Group header row is visible. Summary cells show `[0]`. Visually distinguished (perhaps dimmed label). |
| All rows pinned, no groups | Identical to current behaviour. No headers rendered. |
| Drag row from pinned to a group | Row's `groupId` set to group ID. Row repositioned in `state.rows`. |
| Drag last row out of a group | Group remains (becomes empty). |
| Delete all rows in a group via row-level delete | Group remains (becomes empty). User must explicitly delete the group. |
| Import v1 project (no groups) | All rows treated as pinned. No group headers rendered. |
| Import v2 project with groups into a v1 build | Groups field ignored. Rows render flat. `groupId` on rows is inert. Graceful degradation. |
| Undo past a group creation | Snapshot restores `state.groups` to pre-creation state. Rows that had `groupId` set are restored to their prior state (snapshot captures full row objects). |
| Collapse a group, then add a row to it via sidepanel | The group auto-expands to show the newly added row. |
| 0 columns | Summary cells have nothing to summarise. Group headers still render with just the label and `[N rows]`. |
| Very long group label | Truncated with ellipsis in the sticky-left column, same as long row labels. Full label visible in sidepanel. |
| "Other" group with 0 orphan rows | "Other" header is not rendered (it only appears when there are orphan rows). |

---

## 9. State Defaults and Migration

### 9.1 Default State (New Document)

```js
state.groups = [];
state.pinnedCollapsed = false;
state.otherCollapsed = false;
// rows have no groupId (treated as pinned)
```

### 9.2 Migration from Pre-Grouping State

When `loadState()` encounters a saved state without `groups`:
- `state.groups` defaults to `[]`.
- `state.pinnedCollapsed` defaults to `false`.
- `state.otherCollapsed` defaults to `false`.
- Existing rows have no `groupId` — they are pinned. No migration needed.

This is a zero-friction migration: existing documents open and behave identically.

---

## 10. Summary Cell Format Reference

| Mark | Display token | Counting rule |
|---|---|---|
| `✓` | `{n}✓` | Exact match `✓` OR arrow-prefixed `←N✓` (where N is added to the count, e.g. `←5✓` adds 5) |
| `×` | `{n}×` | Exact match `×` |
| `〇` | `{n}〇` | Exact match `〇` |
| `—` | `{n}—` | Exact match `—` |
| blank | *(not shown)* | Empty string or absent |
| other | *(not shown)* | Any unrecognised value (future-proofing) |

**Row count suffix:** Always shown as `[N]` where N is the total number of rows in the group (regardless of cell values).

**Full format:** `[N] {counts}` — e.g. `[5] 2✓ 1×`

**Empty column:** Just `[N]`.

**Font size:** Summary text should be rendered at a smaller size than regular cell content (e.g. 0.85em or 10px floor) to signal its secondary nature.

---

## 11. Open Questions and Trade-offs

### 11.1 Row IDs (Deferred)

The current design keeps positional cell keying. This works but means every row reorder triggers cell re-keying. A future migration to row-ID-based cell keying would eliminate this cost and simplify cross-group moves. Recommend deferring to a dedicated refactor.

### 11.2 Multi-Row Group Assignment

**Decision: Defer to v2.** Batch move-to-group via the batch context menu is a natural extension but not required for the initial release.

### 11.3 Group Colour / Icon

**Decision: Not planned.** No colour or icon support for groups.

### 11.4 Collapse All / Expand All

**Decision: Include in v1.** A convenience action to collapse or expand all groups at once. Location TBD (sidepanel or keyboard shortcut).

### 11.5 "Other" Group Visibility

When no named groups exist, "Other" never appears (the view is flat). When named groups exist but all rows are assigned to groups, "Other" has 0 rows and is hidden. Should "Other" appear with 0 rows to serve as a drop target? Current design says no (it only appears with orphan rows). Drag-to-ungrouped is handled by the "Pinned" area or the group dropdown in the sidepanel.

### 11.6 Pinned Section Semantics

The requirements state pinned rows "appear before the first group" and "CAN be collapsed/expanded as a section, and CAN be dragged into groups." This design treats pinned rows as simply "rows with no groupId." An alternative would be to model "Pinned" as a real group with a reserved ID. The current approach (virtual, like "Other") is simpler and avoids special-casing in the groups array. The pinned-header only renders when groups exist, so the concept is invisible to users who never create groups.

---

## 12. Implementation Priority

| Phase | Scope |
|---|---|
| **P0 — Core** | Data model changes, `resolveDisplayRows()`, render with group headers, collapse/expand, snapshot/undo integration, localStorage persistence |
| **P1 — CRUD** | Create group (context menu + sidepanel), rename group (inline + sidepanel), delete group (with confirm), group context menu |
| **P2 — Drag** | Row drag with cross-group awareness, group header drag to reorder, auto-expand on hover |
| **P3 — Polish** | Alt-row striping fix, summary cells, view mode lock, export/import, keyboard nav adjustments, collapse-all/expand-all |

Each phase should be independently shippable and testable.
