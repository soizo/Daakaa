# Sidepanel Editing Coverage — Design Specification

**Daakaa · Version 1.0 · April 2026**

> Authored by Pictor (Art Direction). Implementation is Textor's remit — do not edit source files based on this document without Textor's coordination.

---

## Context and premise

With the decoupled input model (see `docs/design/decoupled-input-and-layout.md`), `body.input-touch` devices have no inline editing at all. Every mutation to the grid — cell values, row labels, header values, and the corner cell — must flow through the sidepanel. The sidepanel is therefore no longer merely a configuration surface: it is the exclusive editing environment for touch users.

This document audits current editing coverage, designs the corner cell editing UI, and prescribes a layout strategy that keeps the five-section sidepanel from becoming crowded.

---

## Part A — Editing coverage audit

Four categories of editable artefact exist in the grid.

### A.1 Row labels (`td.sticky-left`)

**Current coverage: complete.**

When a user taps a sticky-left cell, `state.selectedRow` is set and `updateRowDetailsPanel()` renders the Row Details section with:
- `#rd-name` — `.row-detail-name-input`, a full-width text input for the row name
- `#rd-bold`, `#rd-underline` — toggle buttons in `.row-detail-toggles`
- `#rd-move-target` + `#rd-move-btn` — positional move control
- `#rd-delete` — delete button

This is sufficient. The inline `startStickyLeftEdit()` path is mouse-only per the interaction matrix; the Row Details inputs cover everything the inline editor did, plus more (move, delete). No new UI is needed for row label editing.

**Ambiguity for Textor:** `updateRowDetailsPanel()` is currently triggered when `state.selectedRow` changes. A tap on a *content cell* within a row (see A.2) must not clobber `state.selectedRow` or re-render Row Details unintentionally. Verify that the cell-tap handler sets `state.selection` (the range object, `{r1,c1,r2,c2}`) independently from `state.selectedRow`, and that both can coexist. They appear to in the current code — confirm this is preserved.

---

### A.2 Content cells (`td.content-cell`)

**Current coverage: absent for touch.**

In mouse mode, a single click cycles the CYCLE array (`['✓', '×', '〇', '—', '']`); a dblclick on an arrow-prefixed value (`←N✓`) opens an inline number editor. On touch, the cycle on single-tap is already implemented (line 769: `const arrowMatch = !isTouchDevice && /^←(\d+)✓$/.exec(cur)`), which means:
- Standard cycle (✓/×/〇/—/empty): **tap already cycles** — this is not inline editing, it is a single gesture, and it works today.
- Arrow-count value (`←N✓`): on touch, the current code falls through to the standard cycle instead of editing the number. This is a deliberate choice (line 769), but it means the user **cannot set an arbitrary arrow count** via touch. The cycle will step through CYCLE and discard the arrow value on the next cycle step.

**Assessment:** The tap-to-cycle behaviour for standard CYCLE values is acceptable and already implemented. The gap is exclusively the arrow-count editor for `←N✓` values.

**Proposed addition — Cell editor sub-panel in Row Details:**

A new sub-section, `.row-cell-editor`, renders inside `#row-details-body` when a content cell is selected (i.e., `state.selection` is set and contains exactly one content cell, or a multi-cell range). It renders *below* the row name and formatting controls if a row is also selected, or *instead of the hint text* if no row is selected. See Part D for the full layout design.

**Coverage gaps requiring new UI:**
1. Arrow-count value — a number stepper field in the cell editor sub-panel (see D.3).
2. Multi-cell batch set — already available via the context menu (long-press on touch). No new sidepanel UI needed for multi-cell batch; the context menu covers it.

---

### A.3 Header cells (`th[data-header-row][data-col]`)

**Current coverage: absent for touch.**

The interaction matrix explicitly lists "Header dblclick → header edit: N" for touch. The dblclick path at `startHeaderCellEdit()` fires inline — no touch equivalent exists.

Users can already change the *pattern* (type, start, step) for each header row via the Header Patterns section. This covers systematic changes (e.g., advancing the start date). It does not cover **overriding a single header cell value** — for instance, marking one column "Holiday" instead of the pattern-derived "Mon".

**Assessment of need:** This is a power-user feature. Individual cell overrides are rare in normal usage. The context menu (long-press on a header cell) could expose an "Edit label" option — this is a minimal-footprint solution that does not add any new sidepanel UI. The context menu path is already implemented for content cells; extending it to header cells is Textor's domain.

**Decision: no new sidepanel section for individual header cell overrides.** Expose individual header cell editing via the long-press context menu on touch, matching the existing context menu pattern. The Header Patterns section in the sidepanel handles everything systematic.

**If the user later requests sidepanel-based individual header editing,** a thin "Selected header" sub-panel (analogous to the cell editor sub-panel in Row Details) can be added to the Header Patterns section. This document does not design it now — it would be a separate spec.

---

### A.4 Corner cell (`th.corner-cell`)

**Current coverage: absent for touch.**

The corner cell is the top-left intersection cell. It displays either the auto-detected label (derived from the first header pattern's `pattern` name) or a user override stored as `state.headerOverrides['corner_N']` (where N is the header row index). In mouse mode, dblclick opens `startHeaderCellEdit()` which calls `applyHeaderCellEdit()` when committed, writing or deleting the `corner_N` key in `headerOverrides`.

On touch, there is no equivalent path. The user has explicitly requested that the corner cell be editable via the sidepanel, in the Header Patterns section.

**Proposed UI: see Part B.**

---

### Summary table

| Artefact | Touch coverage | Action required |
|---|---|---|
| Row labels (`.sticky-left`) | Complete — Row Details panel | None |
| Content cells (CYCLE values) | Complete — tap cycles | None |
| Content cells (`←N✓` arrow value) | Gap — arrow count uneditable on touch | Add number field in cell editor sub-panel (Part D) |
| Header cells (individual override) | Gap — no touch path | Expose via long-press context menu; no new sidepanel UI |
| Corner cell (`th.corner-cell`) | Gap — no touch path | Add "Corner label" input in Header Patterns panel (Part B) |

---

## Part B — Corner cell editing UI

### B.1 Placement

The corner cell input lives in the **Header Patterns panel** (`data-tab-id="header"`), rendered as a distinct field row *above* the `#pattern-list` div. It is not inside any individual `.pattern-item`; it is a sibling of `#pattern-list` within `.panel-body`, rendered first.

Rationale: the corner cell is a property of the header system as a whole — it labels the row of header patterns, not one specific pattern row. Placing it above the pattern list gives it natural primacy without burying it.

### B.2 Visual structure

The corner field is a standard `.field` label row, consistent with all other fields in the sidepanel:

```
[ Corner label ]  [ _____________ ] [×]
  field-label      text input        clear button
```

- **`.field-label` text:** "Corner label"
- **Input:** `input[type="text"]`, class `corner-label-input`, id `corner-label-input`. Flex `1` — fills the remaining width.
- **Clear button:** a small `×` button to the right of the input, class `corner-label-clear`, styled as `.btn-sm`. Visible only when an override is active (i.e., `state.headerOverrides['corner_0']` is defined and non-empty). When no override is set, the button is hidden (`display:none` or `visibility:hidden` — prefer `visibility:hidden` so the layout does not shift when it appears).

The entire `.field` row wraps in a single `<label>` element per the existing pattern, but because of the clear button, the structure should be a `<div class="field">` rather than `<label>` — consistent with how `.btn-row` constructs are handled elsewhere in the panel.

### B.3 Placeholder behaviour

Two states:

**State 1 — No override (auto-detected):**
- Input `value` is `""` (empty string).
- Placeholder text: the auto-detected value — e.g., `"Apr"` or `"月"` — so the user sees what the cell currently shows without an override. This is retrieved from `getCornerCellValue(h)` when `headerOverrides['corner_N']` is absent.
- Input text colour: use `color: var(--t3-solid)` (the greyed-out tier) to signal that the placeholder is not an override. This matches the visual language of browser placeholder text without relying on `::placeholder` styling alone.
- Clear button: hidden.

**State 2 — Override active:**
- Input `value` is the override string.
- Input text colour: default (black), indicating a live value.
- Clear button: visible. Tapping/clicking it sets `input.value = ""`, deletes `headerOverrides['corner_N']`, calls `renderTable()` and `saveState()`, then transitions to State 1.

### B.4 Editing behaviour

On `input` event: write to `state.headerOverrides['corner_N']` (where N is the index of the first header row, `0` in nearly all practical cases; for multi-header-row situations, see B.6). Call `renderTable()` and `saveState()`. If the written value equals the auto-detected value (what `getCornerCellValue(0)` would return without the override), delete the key rather than writing a redundant override — this mirrors the existing logic in `applyHeaderCellEdit()` at line 1278.

On clear button click: delete `state.headerOverrides['corner_N']`, set `input.value = ""`, update placeholder to the now-auto-detected value, hide clear button, call `renderTable()` and `saveState()`.

### B.5 Touch and mouse modes

The corner label field is always visible — it is not gated on `body.input-touch`. Mouse users benefit equally (it is a more discoverable alternative to the existing dblclick-on-corner path). In mouse mode, both paths coexist: dblclick on the corner cell continues to work; the sidepanel input is a secondary surface that reflects the same state.

The two paths must stay in sync: after a dblclick commit on the corner cell, the sidepanel input must update to reflect the new value. Since `renderPatternList()` is called after most pattern-related state changes, and the corner label input is rendered as part of the Header Patterns panel refresh, this sync happens naturally if the input rendering is part of the same render function. Textor should ensure that `applyHeaderCellEdit()` (which already calls `saveState()`) also triggers a re-render of the corner label input — either by calling `renderPatternList()` or by a dedicated `updateCornerLabelInput()` helper.

Touch sizes: the input follows the standard touch-mode sizing spec from `touch-ui-system.md` §2 — height `44px` (`--touch-input-h`), font-size `16px` (`--touch-font-input`). The clear button uses `.btn-sm` sizing: `36px` tall (`--touch-btn-sm-h`) in touch mode.

### B.6 Multi-header-row ambiguity

The current data model supports multiple header rows (`state.headerPatterns` is an array). Each has its own `corner_N` key. The corner label input as designed above only addresses `corner_0`. If the user adds a second header row, it will have its own corner cell (`corner_1`).

**Decision for v1:** render one corner label input per header row, placed directly within or adjacent to each `.pattern-item` in the pattern list. The input appears at the top of each pattern item's block — above the type selector, or as a sub-field below it (see layout note in B.7).

**Ambiguity requiring user decision:** should the corner label for a given header row live (a) as a sub-field inside each `.pattern-item` container, or (b) as a separate field at the top of the panel, one per header row, before `#pattern-list`? Option (a) keeps the corner label contextually co-located with the pattern it labels. Option (b) is simpler when there is only one header row (the common case) but becomes a list when there are multiple. **Recommend option (a) for correctness; defer to user if they prefer (b).** This spec designs for (a) in Part B.7, noting that for the single-header-row case (the overwhelming majority), the visual result of (a) and (b) is identical.

### B.7 Layout within a `.pattern-item` container (option A)

Each `.pattern-item` container (`div` wrapping the `div.pattern-item` and optionally a `.pat-custom-editor` or `.pat-mapping-editor`) gains a corner label sub-field rendered immediately above the `div.pattern-item` row:

```
Container div
  ┌─ Corner label sub-field (.pattern-corner-field) ─────────┐
  │  [ Corner label ]  [ text input          ] [×]           │
  └───────────────────────────────────────────────────────────┘
  ┌─ Pattern item row (.pattern-item) ───────────────────────┐
  │  [ select ]  [ start ]  [ step ]  [↻] [✕]               │
  └───────────────────────────────────────────────────────────┘
  (optional .pat-custom-editor / .pat-mapping-editor below)
```

The `.pattern-corner-field` uses `display:flex; align-items:center; gap:6px` with the same spacing convention as `.field` rows. It is not a `<label>` but a `<div>` because the clear button breaks the single-label pattern.

---

## Part C — Breathing room: layout strategy

The sidepanel currently has five sections. Adding the corner label field and the cell editor sub-panel risks making it feel like a controls dashboard — dense, effortful, without visual rest.

### C.1 Section ordering

Current order: Sheet → Style → Header Patterns → Row Details → History.

The tab bar order reinforces this sequence. For touch users, the most frequent workflow is: tap a cell or row → Row Details updates. Header Patterns is edited occasionally. Sheet and Style are rare. History is navigational.

**Proposed touch-mode section priority (no HTML reordering needed — tabs handle navigation):**

On touch, the default-open panel on load should be **Row Details**, not Sheet. When a user launches Daakaa on an iPad, the most likely next action is tapping a row or cell. Opening to the Sheet panel (which shows column count and import/export) is a poor default for a touch session.

This is a JS change: on `body.input-touch`, open the "rows" tab by default, not "sheet". The Sheet panel data-tab remains accessible via its tab button.

**Ambiguity for user:** confirm whether the default-open tab should change on touch, or whether the current Sheet-first order is intentional (e.g., a teacher setting up a new grid would go to Sheet first). Pictor's recommendation is Row Details first on touch.

### C.2 Progressive disclosure in the cell editor sub-panel

The cell editor sub-panel (Part D) is conditionally visible — only when `state.selection` contains a content cell. When no cell is selected, it does not exist in the DOM. This is the primary strategy for avoiding crowding: the sub-panel is genuinely absent when not needed, not merely collapsed.

Do not use a `<details>` expand/collapse for the cell editor sub-panel. A collapsible section implies the user might want to close it — but if a cell is selected, the user almost certainly wants to edit it. The sub-panel should always be expanded when present.

### C.3 Progressive disclosure in Header Patterns

The `.pat-custom-editor` and `.pat-mapping-editor` sub-panels are already disclosed only on button press ("Edit values", "Edit map"). This pattern holds. The corner label field, however, should always be visible — it does not need a disclosure button.

### C.4 Visual separation within Row Details

Row Details will have up to three sub-zones when a content cell is also selected:
1. Row name and formatting (always, when a row is selected)
2. Cell editor (conditionally, when a content cell within that row is selected)
3. Move / Delete actions (always, when a row is selected)

A subtle horizontal rule (`<hr>` or a `1px` border in `--t3`) separates zone 1 from zone 2, and zone 2 from zone 3. This is lighter than adding headers or section labels — the separation is felt, not read.

In mouse mode, zones 1 and 3 are the only zones (inline editing handles cell values). Zone 2 only appears on `body.input-touch`. Gate its presence with a JS check for `isTouchDevice` inside `updateRowDetailsPanel()`.

### C.5 Touch target floor — no regression

Every new interactive element introduced by this spec must meet the 44px touch target floor from `touch-ui-system.md` §2:
- Corner label input: `height: 44px` in touch mode
- Corner label clear button: `height: 36px` (`.btn-sm`) — acceptable here because the `.field` row surrounding it is `min-height: 44px`, so the tap area is the full row
- Cell value toggle buttons (Part D): `44 × 44px` squares, matching `.row-detail-toggles button`
- Arrow count stepper (Part D): `height: 44px`, `font-size: 16px`

---

## Part D — Cell editor sub-panel in Row Details

### D.1 Trigger conditions

The cell editor sub-panel (`.row-cell-editor`) appears inside `#row-details-body` when `state.selection` is non-null and the selection contains at least one content cell (i.e., not purely a row-label selection). It is rendered by `updateRowDetailsPanel()`.

Two scenarios:

**Scenario 1 — Row selected and a cell within it is also selected** (`state.selectedRow` is set, `state.selection` is set, and the selection's row falls within the selected row):
Render: zone 1 (row name + formatting) → separator → zone 2 (cell editor) → separator → zone 3 (move / delete).

**Scenario 2 — Cell selected but no specific row selected** (`state.selectedRow` is null, `state.selection` is set):
Render: zone 2 (cell editor) only, with a brief hint at top: "Tap a row label to see row details." This hint replaces the existing `.row-details-info` placeholder.

**Scenario 3 — Row selected, no cell selected** (current behaviour):
Render: zone 1 + zone 3, no cell editor. Unchanged from current.

**Scenario 4 — Nothing selected:**
Render: existing hint text. Unchanged.

### D.2 Cell editor for single CYCLE values

When the selected cell contains a standard CYCLE value (`✓`, `×`, `〇`, `—`, or empty), render a row of five toggle buttons — one per CYCLE value — that act as a radio group. The currently active value is highlighted with the accent background.

```
┌─ Cell ────────────────────────────────────────┐
│  [ ✓ ]  [ × ]  [ 〇 ]  [ — ]  [ ∅ ]          │
└───────────────────────────────────────────────┘
```

- Container: `.row-cell-editor`, `display:flex; flex-direction:column; gap: 8px`
- Button row: `.cell-value-buttons`, `display:flex; gap:6px`
- Each button: class `cell-val-btn`, `data-value="✓"` etc. Width distributes equally (`flex:1`). Height: `44px` in touch mode.
- Empty value button: display as `∅` (the symbol for null set) — visually unambiguous as "clear". Store as `""` internally.
- Active state: `background: var(--accent); color: var(--accent-text)` (matching existing active button styling). Active class: `active` on `.cell-val-btn`.
- On tap: call `setCellValue(r, c, value)`, `renderTable()`, `saveState()`. Update the active button highlight without re-rendering the entire sub-panel (for responsiveness on touch).

**Multi-cell selection:** when `state.selection` spans multiple cells, show the same five buttons. Tapping any button batch-sets all cells in the selection to that value — equivalent to the existing "Set all ✓" context menu action. Add a small label above the buttons: "N cells selected" where N is the count.

### D.3 Cell editor for arrow-count values (`←N✓`)

When the selected cell contains a value matching `/^←(\d+)✓$/`, the cell editor renders a different view:

```
┌─ Cell ────────────────────────────────────────┐
│  Arrow count                                  │
│  [ − ]  [ ____N____ ]  [ + ]                  │
│                                               │
│  [ Back to standard value ]                   │
└───────────────────────────────────────────────┘
```

- Section label: "Arrow count" in `.field-label` style (13px mouse / 13px touch, consistent with the scale spec).
- Decrement button `[ − ]`: class `arrow-count-dec`, `btn btn-sm`. Width: `44px`, height: `44px`.
- Count input: `input[type="number"]`, class `arrow-count-input`. Width: `flex:1`. Height: `44px`. `font-size: 16px`. Min: `0`. Shows the current N.
- Increment button `[ + ]`: class `arrow-count-inc`, `btn btn-sm`. Width: `44px`, height: `44px`.
- "Back to standard value" button: class `arrow-count-clear btn btn-sm`. Full-width. Tapping sets the cell to `✓` (the most natural fallback when discarding an arrow value). The button label should be "Convert to ✓".

On increment/decrement or direct number input: write `←${N}✓` to the cell, `renderTable()`, `saveState()`. The input uses the same throttled undo commit pattern as `commitUndoNodeThrottled('Edit arrow count')`.

**Transition from arrow to CYCLE:** tapping "Convert to ✓" renders the standard CYCLE button row (D.2) with ✓ active.

**Transition from CYCLE to arrow:** the five CYCLE buttons do not offer a path to an arrow value — arrow values are created via the context menu "Set ←N✓" option (long-press on touch). This is intentional. Arrow count creation is a deliberate, rare action; editing an existing arrow count is the common path covered here.

### D.4 Multi-header-row and edge cases

- If the selection spans cells in multiple rows: show the batch-set UI (D.2 with multi-cell label). Do not attempt to show row details for multiple rows simultaneously.
- If the selected cell is a header cell or corner cell: the cell editor sub-panel does not render. Header cell editing is via context menu; corner cell editing is in Header Patterns (Part B). Row Details remains in its existing state.
- If the selected cell contains a custom/non-standard value (not in CYCLE and not an arrow value): show the standard CYCLE buttons with none active, plus a read-only label "Current: [value]". Tapping a CYCLE button overwrites the custom value. This is an edge case (custom values come from external imports only).

---

## Open questions — resolved

1. **Default-open tab on touch.** RESOLVED: default to **Rows** on touch. Tab order reordered globally to **Rows → Header → Style → Sheet → Hist** (touch-first priority). On desktop/mouse the `<details>` section order mirrors this; Row Details is the sole `open` section at load.

2. **Corner label field placement.** RESOLVED: **Option (B)** — a single field block at the top of the Header Patterns panel, rendered once per header row (overwhelming majority case is a single input). The per-pattern-item row (`.pattern-item`) is already a cramped horizontal flex of select + start + step + reset + delete; wedging another full field row inside each item would bulk the list. Hoisting corner labels to a dedicated top block keeps the pattern items lean.

3. **Individual header cell override on touch.** RESOLVED: **option (b) from user brief** — a "Selected header" sub-panel inside Header Patterns, placed directly under the corner label block. Tapping any non-corner header cell populates the sub-panel with an input + clear button mirroring the corner label UI. Both mouse and touch use this path; the existing mouse dblclick path continues to work and stays in sync via `renderSelectedHeaderField()` called from `applyHeaderCellEdit()`.

4. **Arrow-count clear destination.** RESOLVED: **clear to empty string** (`""`). Button label remains "Convert to ✓" and sits above a dedicated clear action; however the handler writes `''` per user resolution #4. (Implementation note: Textor collapsed the two actions — the "Convert to ✓" button now sets the cell to empty, per the resolution; if separate actions are desired later, split the handler.)

5. **`state.selectedRow` / `state.selection` coexistence.** RESOLVED: **allowed**. The `state.selection = null` reset in `selectRow()` has been removed. Audit findings:
   - `updateSelectionVisual()` — iterates only via `state.selection`, independent of `state.selectedRow`. No change required.
   - `batchSetSelection()` — reads only `state.selection`. No change required.
   - Content-cell and sticky-left context menu paths — read only `state.selection`. No change required.
   - Keyboard handlers (`Delete`, `v/x/o/-/,`) — read only `state.selection`. No change required.
   - Row drag (`finishRowDrag`) — only touches `state.selectedRow`. No change required.
   - Row move (`moveRow`) — only touches `state.selectedRow`. No change required.
   - Row delete — only touches `state.selectedRow`. Does not reset `state.selection`, which is desirable since the deleted row may or may not contain the currently selected cell. Left unchanged.
   - `Escape` key now clears `state.selection`, `state.anchor`, and `state.selectedHeader`, then refreshes Row Details and the Selected header sub-panel.

---

## Element IDs and class names introduced by this spec

| Element | ID / class | Notes |
|---|---|---|
| Corner label wrapper div | `.pattern-corner-field` | `.field`-style div, one per pattern item |
| Corner label text input | `#corner-label-input` (first row) / `.corner-label-input` (class, all rows) | `data-index` attribute for multi-row |
| Corner label clear button | `.corner-label-clear` | `.btn-sm`; hidden when no override |
| Cell editor sub-panel | `.row-cell-editor` | Inside `#row-details-body`, conditionally rendered |
| CYCLE value buttons row | `.cell-value-buttons` | Contains `.cell-val-btn` elements |
| Individual CYCLE button | `.cell-val-btn` | `data-value` attribute; `active` class when selected |
| Arrow count wrapper | `.arrow-count-editor` | Inside `.row-cell-editor` |
| Arrow decrement button | `.arrow-count-dec` | `.btn.btn-sm` |
| Arrow count input | `.arrow-count-input` | `input[type="number"]` |
| Arrow increment button | `.arrow-count-inc` | `.btn.btn-sm` |
| Arrow convert button | `.arrow-count-clear` | `.btn.btn-sm`; full-width |
| Cell editor row separator | `.row-cell-separator` | `<hr>` with `border-top: 1px solid var(--t3); margin: 8px 0` |

---

## Appendix — Interaction matrix delta

This spec adds the following rows to the interaction matrix in `decoupled-input-and-layout.md` §5:

| Interaction | Wide+Mouse | Wide+Touch | Narrow+Mouse | Narrow+Touch |
|---|---|---|---|---|
| Corner cell edit via sidepanel input | Y | **Y** (new) | Y | **Y** (new) |
| Content cell CYCLE edit via sidepanel buttons | — | **Y** (new) | — | **Y** (new) |
| Arrow count edit via sidepanel stepper | — | **Y** (new) | — | **Y** (new) |

Mouse mode retains inline dblclick editing for all cells. The sidepanel paths are additive for mouse users, exclusive for touch users.
