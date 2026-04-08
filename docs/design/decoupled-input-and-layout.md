# Decoupled Input Model and Viewport Layout

Status: Design spec, ready for implementation
Author: Fabius
Date: 2026-04-06
Implementer: Textor

## 1. Background and goal

Daakaa currently treats `@media (max-width: 768px)` (and `matchMedia` in JS) as a single switch that conflates two orthogonal concerns:

- **Where the side/bottom panel sits** (right sidepanel vs bottom drawer).
- **Which interaction model is in use** (mouse/keyboard with dblclick, hover, drag-select, shortcuts vs touch with long-press, no hover, no inline edit).

This breaks two real situations:

- **iPad in landscape** (>768 px): currently treated as desktop, so users get dblclick-to-edit and hover affordances on a touchscreen with no mouse.
- **Resized desktop window** (<768 px): currently treated as mobile, losing keyboard shortcuts and inline edit on a real keyboard.

This spec decouples the two dimensions and introduces touch-mode row drag-to-reorder, a strict view-mode lockdown, and an `alt rows` style toggle.

## 2. The two dimensions

| Dimension | Detection | Determines | State variable |
|---|---|---|---|
| **A. Input model** | UA-based (`navigator.userAgentData` / `navigator.userAgent` / `ontouchstart`) | Interaction model: dblclick, hover, drag-select, shortcuts vs panel-only edit, drag-reorder, long-press | `isTouchDevice` (immutable for the session) |
| **B. Viewport width** | `matchMedia('(max-width: 768px)')` (existing) | Panel position only: right sidepanel vs bottom drawer | `isBottomMode` (existing, reactive) |

The four combinations are all valid first-class states:

| | Wide viewport | Narrow viewport |
|---|---|---|
| **Mouse/keyboard** | Desktop (current default) | Resized desktop window |
| **Touch** | iPad landscape, large Android tablet | Phone (current "mobile") |

## 3. Detection logic (Dimension A)

### 3.1 Algorithm

Resolved **once at startup**, in this order, first match wins:

1. **Manual override.** If `localStorage.daakaa_input_mode` is `'touch'` or `'mouse'`, use it. (Also accept URL param `?input=touch` / `?input=mouse`, which writes through to localStorage so it persists.)
2. **UA Client Hints.** If `navigator.userAgentData?.mobile === true`, treat as touch.
3. **iPadOS masquerade.** If `navigator.platform === 'MacIntel'` (or UA contains `Macintosh`) **and** `navigator.maxTouchPoints > 1`, treat as touch. (iPadOS 13+ reports as Mac; this is the standard fix.)
4. **UA string.** If UA matches `/iPhone|iPad|iPod|Android|Mobile|Tablet|Silk|KFAPWI/i`, treat as touch.
5. **Touch capability fallback.** If `('ontouchstart' in window) && navigator.maxTouchPoints > 0` **and** UA does not contain `Windows NT|Macintosh|Linux x86`, treat as touch. (Avoids classifying touch-screen Windows laptops as touch by default — they retain mouse mode unless the user overrides.)
6. **Default:** mouse.

Rationale for the laptop bias toward mouse: a touch-screen laptop almost always has a real keyboard and trackpad attached; defaulting it to touch would silently kill keyboard shortcuts. Users who want the touch model can flip the override.

### 3.2 Manual override UX

- Read from `localStorage.daakaa_input_mode` on boot.
- URL param `?input=touch` / `?input=mouse` / `?input=auto` writes the value (or removes it for `auto`) and reloads-equivalent reapplies. This is the documented "escape hatch" — no in-app UI in v1, intentionally hidden, mentioned in README.
- Detection runs once. Switching at runtime would require teardown of many listeners; not worth it for v1.

### 3.3 Edge cases

- **iPad with Magic Keyboard.** Still classified as touch. Keyboard shortcuts on the Magic Keyboard remain partially available because we keep `keydown` listeners regardless of input mode (they are simply not the *primary* edit path on touch). If the user prefers desktop behaviour on iPad+keyboard, they use `?input=mouse`.
- **Surface / touch-screen Windows laptop.** Defaults to mouse. User can opt in.
- **Headless/unknown UA.** Falls through to mouse.

## 4. State model

### 4.1 New / changed variables

```text
isTouchDevice : boolean    // NEW. Set once at boot. Module-level const-like.
isBottomMode  : boolean    // EXISTING. Reactive to matchMedia. Unchanged.
state.altRows : boolean    // NEW. Persisted in project + localStorage settings, parallels state.altCols.
```

`isTouchDevice` is **not** persisted in the project file — it is a property of the device/session, not the document. It is persisted only via the manual-override key `daakaa_input_mode`.

### 4.2 Body classes

The current code toggles `bottom-mode` class on `<body>` (or wrapper) via `updateLayoutMode()`. Add a parallel:

- `body.input-touch` — present when `isTouchDevice` is true
- `body.input-mouse` — present when `isTouchDevice` is false

These two classes are set **once** at boot and never removed. CSS uses them to gate hover styles, cursor affordances, etc. `bottom-mode` continues to gate panel position only.

### 4.3 What `updateLayoutMode()` should do (after refactor)

- Toggle `bottom-mode` class.
- Move sidepanel DOM between right and bottom containers.
- Update `aria-orientation` of resize handles.
- **Stop** doing anything related to interaction model (no removing dblclick, no swapping listeners). Those are wired once at boot based on `isTouchDevice`.

## 5. Interaction matrix

`Y` = enabled, `N` = disabled, `—` = not applicable.

| Interaction | Wide+Mouse | Wide+Touch | Narrow+Mouse | Narrow+Touch | View mode (any) |
|---|---|---|---|---|---|
| Cell single-click (select / cycle marker via shortcut after focus) | Y | Y | Y | Y | N (read-only) |
| Cell **dblclick → inline edit** | Y | **N** | Y | **N** | N |
| Cell **long-press → inline edit** | — | **N** | — | **N** | N |
| Cell long-press → context menu | — | Y | — | Y | N |
| Cell right-click → context menu | Y | — | Y | — | N |
| Drag-to-select range (mouse) | Y | — | Y | — | N |
| Hover states (CSS `:hover` highlights) | Y | **N** | Y | **N** | unchanged |
| Keyboard shortcuts (V/X/-/O/`,`/Cmd-Z/Y/Delete/arrows) | Y | Y\* | Y | Y\* | navigation only; mutating keys blocked |
| Header dblclick → header edit | Y | **N** | Y | **N** | N |
| Header long-press → context menu | — | Y | — | Y | N |
| Sticky-left dblclick → row name edit | Y | **N** | Y | **N** | N |
| Sticky-left mousedown drag → **row reorder** | Y | — | Y | — | **N** |
| Sticky-left long-press → context menu (existing) | — | Y | — | Y | N |
| Sticky-left **touch drag → row reorder** (NEW) | — | Y | — | Y | **N** |
| Row Details panel edit fields | Y | Y | Y | Y | **N** (inputs disabled) |
| Sidepanel position | right | right | bottom | bottom | unchanged |
| Corner cell edit | Y | **N** | Y | **N** | N |

\* Keyboard shortcuts on touch devices are not removed (a Magic Keyboard may be attached). They are simply not the documented primary path.

**Net behaviour change vs today:**

- iPad landscape (Wide+Touch): loses dblclick-to-edit on cells/headers/corner/sticky-left, loses hover, gains touch row drag-reorder. Edits go through Row Details panel.
- Resized desktop (Narrow+Mouse): keeps dblclick, hover, drag-select, shortcuts. Only the panel moves to the bottom.

## 6. Row drag-to-reorder on touch

**Decision: reuse the existing sticky-left drag mechanism.** Do not invent a new handle.

### 6.1 Rationale

`leftCell.addEventListener('mousedown', ...)` at app.js:801 already implements the reorder drag (ghost row, gap insertion at app.js:1157–1211). It currently fires on mouse only. Adding a parallel `touchstart` path that calls into the same drag-state machine is the smallest viable change and gives users muscle-memory parity between mouse and touch.

### 6.2 Touch grab gesture

- **Press-and-hold on the sticky-left cell for ~250 ms without moving** → enters drag mode. Visual feedback: ghost row appears, source row dims, haptic-style cue (CSS scale/opacity flash).
- **Move before the 250 ms threshold** → treated as a normal vertical scroll of the table. Drag is cancelled.
- **Tap (touchstart + touchend before threshold, no movement)** → opens Row Details for that row in the sidepanel (parallels existing behaviour where tapping a row selects it).
- **Long-press beyond ~600 ms without entering drag** → falls through to existing context-menu long-press (already wired at app.js:868). To avoid conflict, the 250 ms drag-arm window must precede the 600 ms context-menu window: if the user moves within the arm window, scroll wins; if they hold still past 250 ms but release before 600 ms with no movement, context menu wins; if they hold and then start moving after 250 ms but before 600 ms, drag wins. Practical rule: **as soon as the finger moves more than 6 px after the 250 ms arm, cancel context-menu timer and start the drag.**

### 6.3 No separate drag-handle icon

Rejected. Adds visual clutter, duplicates a mechanism that already exists, and the sticky-left column is already the canonical "row handle" zone. Discoverability is addressed by the existing empty-state hint already shown in `$rowDetailsBody` (app.js:908) — extend that copy to mention "press and hold to reorder" on touch.

### 6.4 Disabled in view mode

When `state.viewMode` is true, the touchstart handler returns immediately, mirroring the mouse path's existing guard.

## 7. View-mode lockdown

`state.viewMode` must block **every** edit entry point. Audit list — each must be explicitly guarded:

| Entry point | Current code site (approximate) | Guard required |
|---|---|---|
| Cell dblclick → inline edit | cell dblclick handler | `if (state.viewMode) return;` |
| Cell long-press → inline edit | (must be removed entirely; see §5) | n/a after removal |
| Header dblclick → header cell edit | app.js:770 | guard |
| Sticky-left dblclick → row name edit | app.js:845 | guard (already partial) |
| Sticky-left mousedown drag → reorder | app.js:801 | guard (already present at app.js:2655 area) |
| Sticky-left **touchstart drag** → reorder (NEW) | new handler | guard |
| Corner cell edit (project title) | corner cell handler | guard |
| Row Details panel inputs | `$rowDetailsBody` form fields | set `disabled` on all inputs/selects/buttons when entering view mode; restore on exit |
| Add row / add column / add pattern buttons | toolbar | `disabled` when in view mode |
| Context menus (cell, header, sticky-left) | contextmenu + long-press handlers | suppress entirely in view mode (do not even open the menu) |
| Keyboard mutating shortcuts (V/X/-/O/`,`/Delete/Backspace, paste, Cmd-Z/Y) | app.js:1892 area (`if (!state.viewMode && ...)`) | already guarded — verify also covers Cmd-Z/Y, Delete, Backspace, paste |
| Keyboard navigation (arrows, Tab) | keydown handler | **allowed** in view mode |
| Drag-to-select range | mousedown on cell | allowed (selection only, no mutation) |
| Style panel toggles, Header Patterns edits, sidepanel forms | sidepanel | **allowed** — view mode locks the *grid data* only (cells, rows, row details, corner, inline edit, context-menu edits, keyboard value shortcuts, drag-to-reorder, long-press). Style panel, Header Patterns editor, and other appearance/configuration controls remain editable. Resolved 2026-04-06. |

**Important:** the audit must be implemented as a single helper, e.g. `function isReadOnly() { return state.viewMode; }`, called at the top of every mutating handler. Do not scatter `state.viewMode` checks ad hoc — they get out of sync.

When toggling into view mode, also call a `lockRowDetailsPanel()` that walks `$rowDetailsBody` and sets `disabled` on `input, select, textarea, button`. Reverse on toggle out.

## 8. Alt rows toggle

### 8.1 UI placement

In the **Style** panel (`index.html`:82–85), directly **below** the "Alternating columns" field:

```html
<label class="field">
  <span class="field-label">Alternating columns</span>
  <input type="checkbox" id="alt-cols-toggle" checked>
</label>
<label class="field">
  <span class="field-label">Alternating rows</span>
  <input type="checkbox" id="alt-rows-toggle">
</label>
```

Default: **off** (`state.altRows = false`). Alt cols stays default-on for backwards compatibility.

### 8.2 State

- `state.altRows: boolean` — added to defaults, persisted in project JSON (`saveProject` / `loadProject` near app.js:2151 / 2206 / 2592), and to localStorage settings (near app.js:2605).
- Migration: missing field on load → `false`. No project version bump needed; the field is additive.

### 8.3 CSS approach

Mirror the existing `.alt-cols` mechanism. The current renderer (app.js:2531) writes a t2 background on every even **column** when `state.altCols`. Add a parallel: when `state.altRows`, write the **same t2 background** on every even **row** index (1-based, so visually striped). Cells where both an even row and an even column meet should remain at t2 (not stack to a darker tier) — single tier only.

Implementation choice: a `.alt-rows` class on `$table` plus a CSS rule `table.alt-rows tbody tr:nth-child(even) td:not(.sticky-left) { background: var(--t2); }` is cleaner than touching the renderer. Use this if it composes correctly with the existing per-cell background writes; otherwise extend the renderer the same way alt-cols is handled.

The two toggles are independent — all four combinations (neither / cols only / rows only / both) are valid.

## 9. Edge cases, risks, open questions

1. **View mode and the Style panel.** Resolved 2026-04-06: view mode locks **content editing only** — cells, rows, row details, corner cell, inline edit, context-menu edits, keyboard value shortcuts, drag-to-reorder, long-press. View mode does **NOT** lock the Style panel, Header Patterns editor, or other appearance/configuration controls. Those remain editable so the presenter can retune styling while presenting without toggling out.

2. **Keyboard shortcuts on touch devices.** Kept enabled because Magic Keyboards exist. Risk: an iPad user without a keyboard is unaffected; an iPad user with one gets a hidden power feature. Acceptable.

3. **`updateLayoutMode()` existing side effects.** It currently runs at boot and on resize. After the refactor it must not undo any one-shot listener wiring. Verify by running a wide → narrow → wide cycle and confirming dblclick still works on a desktop.

4. **Persistence of `daakaa_input_mode`.** Stored at the localStorage root, not under the per-project settings key. It is a device preference, not a document preference.

5. **iPadOS detection false positives.** A real Mac with a touch-bar reports `maxTouchPoints === 0`, so the §3.1 step 3 check is safe. A Mac with a Wacom tablet reports `maxTouchPoints > 0` but `navigator.platform === 'MacIntel'` — would be misclassified as touch. Mitigation: the override exists.

6. **Removal of long-press inline edit.** Need to grep for any path where a `longPressTimer` callback opens an editor (vs only opening a context menu). Per the user, this is currently a bug on mobile. The audit at app.js:1406, 1411, 1430 shows the timer opens a context menu, not an editor — good. But verify there is no second long-press path on cells specifically that opens edit.

7. **Touch row reorder vs vertical scroll.** Tablet users scroll the table vertically by dragging anywhere. The 250 ms arm window on the sticky-left cell is the only place where scroll is overridden. Keep the override scoped strictly to `.sticky-left` — never to body cells.

8. **Backwards compatibility.**
   - Existing projects: load fine, `altRows` defaults to false.
   - Existing localStorage settings: load fine, `altRows` defaults to false, `daakaa_input_mode` absent → auto-detect.
   - No migration code beyond default-fill.

9. **Hover CSS gating.** All `:hover` rules that produce visual changes on cells/headers/buttons should be wrapped: `body.input-mouse .cell:hover { ... }`. This prevents the iOS sticky-hover bug where a tap leaves a cell visually "hovered" until the next tap elsewhere.

## 10. Acceptance criteria

- [ ] On a fresh iPad (Safari, landscape, 1024 px wide), the right sidepanel shows, dblclick on cells does nothing, tapping a row opens Row Details, press-and-hold on sticky-left initiates drag-reorder, no hover artefacts after tapping.
- [ ] On a desktop browser resized to 600 px wide, the bottom panel shows, dblclick on a cell still opens inline edit, keyboard shortcuts still mutate cells, `:hover` still highlights.
- [ ] On a phone, behaviour matches today (bottom panel, touch model) plus the new touch row-reorder gesture and the removal of any long-press-to-edit path.
- [ ] On a desktop, behaviour matches today.
- [ ] `?input=touch` on a desktop forces touch model without moving the panel; `?input=mouse` on an iPad forces mouse model without moving the panel.
- [ ] Toggling view mode disables every entry point listed in §7. Pressing V, X, `-`, `O`, `,`, Delete, Backspace, Cmd-Z, Cmd-Y, Cmd-V, double-clicking a cell, long-pressing a row, opening any context menu, dragging a row, and editing any Row Details field all do nothing while view mode is on.
- [ ] Style panel shows two independent toggles "Alternating columns" and "Alternating rows". All four on/off combinations render correctly with a single t2 tier (no doubled darkening at intersections).
- [ ] Project save/load round-trips `altRows`. Old projects without the field load with `altRows = false`.

## 11. Implementation order (suggested)

1. Add `isTouchDevice` detection + `body.input-touch`/`input-mouse` classes + `?input=` override.
2. Refactor `updateLayoutMode()` to handle layout only.
3. Gate dblclick / hover / drag-select handlers on `!isTouchDevice` instead of `!isBottomMode`.
4. Add touch-drag path on sticky-left, sharing the existing drag state machine.
5. Add `isReadOnly()` helper and centralise all view-mode guards through it; add `lockRowDetailsPanel()`.
6. Add `state.altRows` + UI toggle + CSS + persistence.
7. Manual QA against §10 acceptance criteria on: macOS Chrome, macOS Chrome resized narrow, iPad Safari landscape, iPad Safari portrait, iPhone Safari, Android Chrome.
