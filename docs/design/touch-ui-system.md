# Touch UI System — Design Specification

**Daakaa · Version 1.0 · April 2026**

> Authored by Pictor (Art Direction). Implementation is Textor's remit — do not edit source files based on this document without Textor's coordination.

---

## Preamble

After Textor's refactor, input device detection (`body.input-touch` / `body.input-mouse`) is decoupled from viewport width (`max-width: 768px`). This means:

| Context | Body class | Layout mode |
|---|---|---|
| iPad landscape | `input-touch` | Right sidepanel (wide) |
| iPad portrait | `input-touch` | Right sidepanel (wide) |
| iPhone | `input-touch` | Bottom panel (narrow) |
| Desktop narrow window | `input-mouse` | Bottom panel (narrow) |
| Desktop wide | `input-mouse` | Right sidepanel (wide) |

**All touch-specific scaling and sizing rules must be gated on `body.input-touch`, not on `@media (max-width: 768px)`.** The narrow-viewport media query governs layout structure only (column → row, bottom panel vs right panel). The `×1.143` factor and the `16px !important` overrides inside the `768px` breakpoint are the patchwork being removed.

---

## §1 — Typography Scale

### Rationale

The current codebase uses ad-hoc sizes: 10px, 11px, 12px, 13px, 14px, 15px, 16px — with no consistent ratio between roles. In touch mode the existing mobile overrides add another arbitrary layer. The result is labels that visually overwhelm their inputs, and helper text that is unreadable on a 9.7-inch screen held at arm's length.

A single modular scale with ratio **1.125** (major second, slight) is adopted. It is conservative enough to work in a dense productivity tool (not a reading app) whilst still producing clear hierarchy. Base unit is 13px mouse / 15px touch.

### Mouse-mode baseline (current desktop)

| Role | Size | Weight | Line-height | CSS class / element |
|---|---|---|---|---|
| Panel section header | 13px | 600 | 1.3 | `.panel-header` |
| Field label | 12px | 400 | 1 (single-line) | `.field-label` |
| Input / select text | 12px | 400 | — | `.field input`, `.field select` |
| Legend (fieldset) | 11px | 600 | 1.3 | `.fieldset legend` |
| Button text | 12px | 400 | — | `.btn` |
| Small button text | 11px | 400 | — | `.btn-sm` |
| Tab text | 12px | 400 / 600 active | — | `.bottom-tab` |
| Pattern item text | 12px | 400 | — | `.pattern-item` |
| Pattern sub-editor inputs | 11px | 400 | — | `.pat-editor-row input` |
| Row details helper text | 11px | 400 | 1.4 | `.row-details-info` |
| History node | 11px | 400 / 700 current | 1.3 | `.history-node` |
| History timestamp | 10px | 400 | — | `.history-node-time` |

This is the unchanged baseline — no new CSS variables needed for mouse mode, as existing sizes are acceptable.

### Touch-mode scale (body.input-touch)

Scale ratio: **1.125**. Touch base size: **15px**.

| Derived step | Exact px | Rounded to |
|---|---|---|
| base ÷ 1.125 | 13.3px | 13px |
| base | 15px | 15px |
| base × 1.125 | 16.875px | 17px |
| base × 1.125² | 18.98px | 19px |

| Role | Size | Weight | Line-height | Notes |
|---|---|---|---|---|
| Panel section header | 15px | 600 | 1.3 | `body.input-touch .panel-header` |
| Sidepanel title | 19px | 700 | 1.2 | `body.input-touch .sidepanel-title` |
| Field label | 13px | 400 | 1.4 | `body.input-touch .field-label` |
| Input / select text | **16px** | 400 | — | See §1 note on iOS zoom below |
| Textarea text | **16px** | 400 | 1.4 | Same iOS zoom requirement |
| Legend (fieldset) | 13px | 600 | 1.3 | `body.input-touch .fieldset legend` |
| Button text | 15px | 400 | — | `body.input-touch .btn` |
| Small button text | 13px | 400 | — | `body.input-touch .btn-sm` |
| Tab text | 13px | 400 / 600 active | — | `body.input-touch .bottom-tab` |
| Pattern item text | 13px | 400 | — | `body.input-touch .pattern-item` |
| Pattern sub-editor inputs | **16px** | 400 | — | iOS zoom: must be ≥ 16px |
| Row details helper text | 13px | 400 | 1.5 | `body.input-touch .row-details-info` |
| History node | 13px | 400 / 700 current | 1.3 | `body.input-touch .history-node` |
| History timestamp | 11px | 400 | — | `body.input-touch .history-node-time` |

**iOS Safari zoom note.** Safari on iOS zooms the viewport when an `<input>` or `<textarea>` with `font-size < 16px` receives focus. This behaviour has been confirmed still active as of iOS 18 / Safari 18 (2025).[^1] All editable inputs and textareas in touch mode must have `font-size: 16px` or higher. The 16px floor applies to the *computed* font-size of the input element itself — a parent `font-size` override does not inherit into `<input>` without explicit `font-size` on the input. Use `font-size: 16px` directly on all touch-mode inputs; do **not** use `!important` (it was only needed because the old rules competed with the `768px` breakpoint, which will no longer apply to inputs).

---

## §2 — Control Size System

### Touch target philosophy

Apple HIG recommends a minimum tappable area of **44 × 44 pt** for all interactive controls.[^2] Material Design 3 recommends **48 × 48 dp**.[^3] In practice, for a dense productivity tool that must fit information into an iPad-sized viewport, 44px is the correct floor — matching Apple HIG, which is the primary platform target. This is not a compromise: it is the standard.

### CSS variable additions (Textor to implement)

```css
/* Touch control dimensions */
--touch-input-h:       44px;   /* height of all inputs, selects, standard buttons */
--touch-btn-sm-h:      36px;   /* height of .btn-sm in touch mode */
--touch-tab-h:         40px;   /* bottom-tab height */
--touch-handle-h:      20px;   /* bottom panel drag handle thickness */
--touch-px:            14px;   /* horizontal padding inside inputs/buttons */
--touch-field-gap:     12px;   /* vertical gap between .field rows */
--touch-checkbox-size: 20px;   /* checkbox / toggle target dimension */

/* Typography */
--touch-font-base:     15px;
--touch-font-input:    16px;   /* must be ≥ 16 for iOS Safari anti-zoom */
--touch-font-label:    13px;
--touch-font-sm:       13px;
--touch-font-btn:      15px;
--touch-font-header:   15px;
```

### Standard control heights in touch mode

| Control | Height | Notes |
|---|---|---|
| `input[type="text"]` | 44px | `--touch-input-h` |
| `input[type="number"]` | 44px | `--touch-input-h` |
| `select` | 44px | `--touch-input-h` |
| `.btn` | 44px | `--touch-input-h` |
| `.btn-sm` | 36px | `--touch-btn-sm-h`; label allows slightly smaller where space is critical |
| `input[type="color"]` | 44px | `--touch-input-h` |
| `.pattern-item-btn` (×, +, −) | 36px × 36px | `--touch-btn-sm-h` square |
| `.row-detail-toggles button` | 44px × 44px | `--touch-input-h` square |
| `.cell-edit-toolbar button` | 36px × 36px | In-spreadsheet context; 36px acceptable since adjacent buttons cluster |
| `.bottom-tab` | 40px | `--touch-tab-h`; see §3 |
| `.sidepanel-tab` (right-panel toggle) | full-height strip, min-width 32px | Wider strip improves edge-swipe reachability on iPad |

### Horizontal padding

- Inputs and selects: `padding: 0 var(--touch-px)` → `0 14px`
- Buttons: `padding: 0 var(--touch-px)` → `0 14px`
- `.btn-sm`: `padding: 0 10px`

### Vertical rhythm between fields

Field rows (`.field`) currently have `margin-bottom: 8px`. In touch mode: `gap: var(--touch-field-gap)` → `12px`. This is set on the `.panel-body` or the field container, not on `.field` itself (which uses `margin-bottom`). Consistent with using a flex `gap` rather than margins where possible.

### Checkbox and toggle

The native `input[type="checkbox"]` renders at browser-default size (roughly 13–16px in most mobile WebKit). The touch target wrapper (`.field` label) already spans full width, so the actual tap area is the full field row height — the checkbox's visual size does not need to change. However, to make the visual hit feel intentional, recommend:

```css
body.input-touch .field input[type="checkbox"] {
  width:  var(--touch-checkbox-size);   /* 20px */
  height: var(--touch-checkbox-size);
  accent-color: #000;
}
```

The full `.field` label row is `height: var(--touch-input-h)` (44px) and already acts as the tap target.

---

## §3 — Bottom Panel Drag Handle

### Current state

In narrow-viewport mode the `.bottom-panel-handle` is a `height: 8px` transparent strip with a 36×3px pill indicator (`::after`, opacity 0.25). This is too thin for reliable finger targeting — an 8px strip is easy to miss, especially when the hand approaches from below.

### Touch-mode specification

| Property | Mouse mode (current) | Touch mode |
|---|---|---|
| Handle thickness | 8px | 20px (`--touch-handle-h`) |
| Pill indicator width | 36px | 40px |
| Pill indicator height | 3px | 4px |
| Pill indicator opacity | 0.25 | 0.35 |
| Pill indicator `top` offset | 3px | 8px (centred in 20px strip) |

The handle background remains transparent in both modes. The pill indicator is purely visual — the whole strip is the drag target.

**CSS selector:** `body.input-touch .bottom-panel-handle` — do not change the mouse-mode rule at all.

### Tab bar clearance

The `.bottom-panel-tabs` strip is currently `height: 32px` / `height: 40px` (touch override). It is **not** being made draggable (confirmed with user). However, to reduce accidental handle-grabs while reaching for a tab, the tab bar must have generous vertical padding so fingers land confidently:

```css
body.input-touch .bottom-panel-tabs {
  height: var(--touch-tab-h);   /* 40px */
}

body.input-touch .bottom-tab {
  padding: 0 4px;   /* horizontal — flex: 1 handles width */
}
```

The 20px drag handle + 40px tab bar = 60px combined chrome at the top of the bottom panel. This is consistent with iOS native bottom-sheet patterns and provides clear visual separation between the resize gesture zone and the navigation zone.

### Right-panel sidepanel toggle

The `.sidepanel-tab` strip (desktop + iPad right-panel mode) is currently `width: 20px`. On touch, this is borderline — a vertical 20px strip is hard to tap precisely. In touch mode, widen it:

```css
body.input-touch .sidepanel-tab {
  width: 32px;
  min-width: 32px;
  font-size: 14px;
}

body.input-touch .sidepanel.collapsed {
  width: 32px;
  min-width: 32px;
}
```

Note: `app.js` also sets `$sidepanel.style.width` on collapse. Textor will need to check the JS collapse/expand logic handles the new 32px value in touch mode (currently it hardcodes `20px` via CSS only — but check whether any inline-style overrides in the toggle logic reference the collapsed width numerically).

---

## §4 — Panel-by-Panel Control Audit

All measurements taken from the current `style.css` as of the April 2026 codebase state.

---

### 4.1 Spreadsheet Panel (`data-tab-id="sheet"`)

**HTML controls in this panel:**
- `input[type="number"]#col-count` — uses `.field` pattern
- Four `.btn.btn-sm` buttons (Import/Export xlsx, Export/Import project) in two `.btn-row` rows

**Current sizes:**
- `#col-count`: height `28px`, font-size `12px` (via `.field input[type="number"]`)
- Buttons: height `24px`, font-size `11px` (via `.btn-sm`)

**Inconsistency:**
The number input is 28px tall whilst the buttons in the same panel are 24px. Both are below touch-target minimum. In touch mode the height disparity between the number stepper (tall) and the action buttons (short) looks mismatched — the import/export row reads as less important, which is misleading since it is a primary action.

**Touch-mode prescription:**
- `#col-count`: `height: var(--touch-input-h)` (44px), `font-size: var(--touch-font-input)` (16px)
- `.btn-sm` in touch: `height: var(--touch-btn-sm-h)` (36px), `font-size: var(--touch-font-sm)` (13px)

The `.btn-row` gap should increase: `gap: 6px` → `8px` in touch mode.

**Inline `style="margin-top:4px;"` on both `.btn-row` divs in HTML** — these inline margins should ideally be removed and handled via a touch-mode `.panel-body` rule. However this is an HTML structural decision for Textor to confirm.

---

### 4.2 Style Panel (`data-tab-id="style"`)

**HTML controls:**
- `input[type="text"]#font-family` — `.field`
- `input[type="color"]#theme-color` — `.field`
- `select#color-target` — `.field`
- `input[type="checkbox"]#alt-cols-toggle` — `.field`
- `input[type="checkbox"]#alt-rows-toggle` — `.field`

**Current sizes:**
- Text input: height `28px`, font-size `12px`
- Colour input: height `28px`, `flex: 0 0 40px`
- Select: height `28px`, font-size `12px`
- Checkboxes: browser default (~16px visual), full-width label row

**Inconsistencies:**
- The colour swatch (`input[type="color"]`) is `40px wide × 28px tall` — an odd rectangle. On touch it should be square and taller.
- `flex: 0 0 40px` on the colour input means the field label takes all remaining width — fine, but the 40px swatch is small for touch.

**Touch-mode prescription:**
- All text inputs and selects: `height: var(--touch-input-h)` (44px), `font-size: 16px`
- Colour input: `flex: 0 0 44px`, `height: 44px`, `padding: 4px` (wider swatch, square in touch)
- Checkbox rows: no height change needed — `.field` label rows will be `44px` tall via `min-height: var(--touch-input-h)` on `.field`

Add to touch rules:
```css
body.input-touch .field {
  min-height: var(--touch-input-h);
}
```

This ensures even checkbox rows have a 44px tap area.

---

### 4.3 Header Patterns Panel (`data-tab-id="header"`)

**HTML controls (dynamically generated in `app.js`):**
- `.pattern-item` rows, each containing:
  - `select` (pattern type)
  - `input[type="number"]` (start, step)
  - `.pattern-item-btn` buttons (delete, reorder)
- `.pat-custom-editor` / `.pat-mapping-editor` sub-panels, each containing:
  - `.pat-editor-row` rows: `input[type="text"]` pairs
  - `.pat-editor-header` label row
- `#add-pattern` — `.btn.btn-sm`

**Current sizes:**
- `.pattern-item select`: height `22px`, font-size `11px`
- `.pattern-item input[type="number"]`: height `22px`, font-size `11px`, width `44px`
- `.pattern-item-btn`: `20×20px`, font-size `11px`
- `.pat-editor-row input`: height `22px`, font-size `11px`

**Inconsistencies — the most egregious panel:**
This is the problem panel. At 22px and 11px, these controls are categorically untouchable. The entire pattern editing experience on an iPad is broken at current sizes. The 11px font triggers iOS zoom on every focus. The 20px buttons cannot be reliably tapped.

The current patchwork in `@media (max-width: 768px)` bumped these to `34px / 16px` — but only for narrow viewports. An iPad in portrait or landscape (wide viewport, right panel) gets none of these overrides.

**Touch-mode prescription:**
```
.pattern-item select:     height 44px, font-size 16px, flex: 1
.pattern-item input:      height 44px, font-size 16px
.pattern-item-btn:        width 36px, height 36px, font-size 13px
.pat-editor-row input:    height 44px, font-size 16px
.pat-custom-editor:       max-height 200px (more room for larger rows)
.pat-mapping-editor:      max-height 200px
.pat-editor-header:       font-size 13px
```

The `.pat-editor-row` gap between the two inputs and arrow should increase: `gap: 4px` → `gap: 8px` in touch mode for clear visual separation.

---

### 4.4 Row Details Panel (`data-tab-id="rows"`)

**HTML controls (dynamically generated):**
- `.row-detail-name-input` — `input[type="text"]`
- `.row-detail-toggles button` (bold, underline, strikethrough — icon buttons)
- Value-mapping select / input controls (generated per row)

**Current sizes:**
- `.row-detail-name-input`: height `22px`, font-size `12px`
- `.row-detail-toggles button`: `28×24px`, font-size `12px`

**Inconsistencies:**
- Name input is 22px — the smallest named input in the whole codebase, despite being the primary editable field in this panel.
- The toggle buttons are `28×24px` — not square, and below touch minimum in both dimensions.

**Touch-mode prescription:**
```
.row-detail-name-input:          height 44px, font-size 16px
.row-detail-toggles button:      width 44px, height 44px, font-size 15px
```

The toggle buttons become 44×44px squares — important because bold/underline are the primary per-row style actions on iPad.

---

### 4.5 History Panel (`data-tab-id="hist"`)

**HTML controls (generated):**
- `.history-node` rows — clickable items, not editable
- `.history-branch-toggle` — text button

**Current sizes:**
- `.history-node`: font-size `11px`, padding `3px 4px`
- `.history-node-time`: font-size `10px`
- `.history-branch-toggle`: font-size `10px`, padding `2px 4px`

**Inconsistencies:**
The history panel is a display/navigation surface, not a form editor. Touch targets are still relevant — tapping a node to jump to it must be reliable. However the density is acceptable if padding is increased.

**Touch-mode prescription:**
```
.history-node:            font-size 13px, padding 8px 6px (min-height ~36px)
.history-node-time:       font-size 11px
.history-branch-toggle:   font-size 11px, padding 6px 8px
.history-panel:           font-size 13px, max-height: none in touch (let the panel scroll naturally)
```

The `max-height: 240px` constraint on `.history-panel` is appropriate for mouse mode but in touch mode — where the panel is full-width and often the only thing visible in the bottom panel — removing the cap and letting `sidepanel-content`'s `overflow-y: auto` handle scrolling is cleaner. Gate the removal with `body.input-touch`.

---

## §5 — Sidepanel Not Filling Bottom — Bug Report

### Symptom

In `touch + portrait` mode (iPad portrait: `body.input-touch`, viewport > 768px → **right-panel layout**), the sidepanel content does not fill to the bottom of the viewport. There is dead white space below the last panel.

### Investigation

**Layout chain:**

```
html, body                 height: 100%
  #app                     height: 100%, display: flex, flex-direction: row
    .sidepanel             height: 100%, display: flex, flex-direction: row
      .sidepanel-tab       height: 100%, width: 20px
      .sidepanel-content   flex: 1, overflow-y: auto
```

The `.sidepanel` itself is correct: `height: 100%` on a direct child of `#app` which is `height: 100%` → this resolves cleanly.

**The bug is in `.sidepanel-content`.**

`.sidepanel-content` has `flex: 1` and `overflow-y: auto` but **no `height` or `min-height: 0`**. In a `flex-direction: row` container, `flex: 1` expands the *width* of the element. Height, however, is governed by the cross-axis (vertical). Without `align-items` or `align-self` set, flex children default to `align-items: stretch` — which *should* cause `.sidepanel-content` to stretch to fill the parent's height.

**However:** the parent `.sidepanel` has `flex-direction: row`. `.sidepanel-content` stretches in the *cross axis* (height) only when the container has a resolved height. The `.sidepanel` has `height: 100%` — which resolves because `#app` has `height: 100%`, and `html`/`body` both have `height: 100%`. So the chain is correct.

The actual failure is more subtle. On Safari/WebKit on iOS, `overflow-y: auto` on a flex child that has no explicit `height` can break the height constraint in certain contexts — particularly when:
1. The flex child contains a `<details>` element with `open` state (`.panel[open]`), and
2. The intrinsic content height of the flex child exceeds the container height.

In this scenario, **WebKit does not clamp the flex child's height** to the container when the child uses `overflow-y: auto` without `min-height: 0`. The child expands to its content height, overflowing the sidepanel, which causes the visual gap at the bottom (the sidepanel appears to end before the viewport bottom because the content overflows rather than scrolls).

**Root cause:** Missing `min-height: 0` on `.sidepanel-content` and, critically, missing `height: 0` or `height: 100%` to force the scroll container to treat its own height as bounded.

### Proposed CSS fix

Add to the existing `.sidepanel-content` rule in `style.css`:

```css
.sidepanel-content {
  flex: 1;
  min-width: 0;
  min-height: 0;        /* ADD: prevents flex child from expanding beyond parent */
  height: 0;            /* ADD: with flex:1, this resolves to the available height,
                                forcing overflow-y:auto to activate correctly */
  overflow-y: auto;
  padding: 20px;
  padding-left: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
```

The `height: 0` trick (combined with `flex: 1`) is a well-established WebKit/Safari fix for this class of flex overflow bug. Setting `height: 0` does not visually shrink the element — `flex: 1` overrides it to fill the available space — but it tells the browser that the element's intrinsic height is bounded, which causes `overflow-y: auto` to activate scroll rather than expanding indefinitely.

**Secondary suspect:** If the above does not fully resolve the issue on all tested iOS Safari versions, also check whether any open `<details>` panel inside `.sidepanel-content` has `display: block` without `overflow: hidden` — an open `<details>` will add its full content height to the scroll container's intrinsic size, which exacerbates the bug. The current `.panel` rule does have `overflow: hidden` — so this is not the primary cause, but verify it is not overridden in any touch-specific state.

**No JS changes are required** for this fix. It is a pure CSS correction.

---

## §6 — Colour & Visual Consistency

### Existing tier system

The `--t2 / --t3 / --t4` tier system (as specified in the visual identity memory, April 2026) holds without modification in touch mode. No new colour variables are needed for touch-specific states.

### Touch-specific visual changes

**Active/pressed states replace hover states.** On touch, `:hover` does not fire reliably (or fires inconsistently with the "sticky hover" bug on iOS where the last-touched element retains `:hover` state). All hover-dependent visual feedback must be replicated with `:active` for touch users.

Currently, every interactive element uses `:hover` for feedback (background → `--t4`, colour inversion). In touch mode, add:

```css
body.input-touch .btn:active,
body.input-touch .pattern-item-btn:active,
body.input-touch .bottom-tab:active,
body.input-touch .panel-header:active,
body.input-touch .history-node:active,
body.input-touch .context-menu-item:active {
  background: var(--t4);
  color: var(--accent-text);
}
```

Note: do **not** suppress `:hover` rules on `body.input-touch` — some iPad keyboards/mice are used in conjunction with a touch screen. `:hover` on desktop hover-capable iPads (Magic Keyboard trackpad) should still work.

**Focus rings.** The current codebase has no explicit `:focus-visible` styling — inputs receive the browser default blue outline. In touch mode on iOS, this is usually suppressed entirely (iOS Safari hides focus outlines by default). For accessibility on iPad with external keyboard, add a consistent focus ring:

```css
body.input-touch :focus-visible {
  outline: 2px solid #000;
  outline-offset: 1px;
}
```

This is consistent with the app's existing `cell-editing` outline (`outline: 2px solid #000`) — extending the same visual language to all focused controls.

**No hover cursors.** `cursor: pointer` and `cursor: col-resize` are meaningless on touch. They are harmless but add no value. No change needed — they degrade gracefully.

**No touch-specific colour changes.** The monochrome identity (black/white/grey accent) holds identically for touch and mouse modes. There is no case for making touch controls coloured or more "visually prominent" — the identity's restraint is a deliberate choice, not a desktop-only concession.

---

## §7 — Implementation Notes for Textor

### New CSS variables to add

Add to `:root` in `style.css`:

```css
/* Touch UI system — all values from §2 */
--touch-input-h:       44px;
--touch-btn-sm-h:      36px;
--touch-tab-h:         40px;
--touch-handle-h:      20px;
--touch-px:            14px;
--touch-field-gap:     12px;
--touch-checkbox-size: 20px;
--touch-font-base:     15px;
--touch-font-input:    16px;
--touch-font-label:    13px;
--touch-font-sm:       13px;
--touch-font-btn:      15px;
--touch-font-header:   15px;
```

### Rules to delete (the patchwork)

Inside `@media (max-width: 768px)` in `style.css`, remove the following blocks entirely — they are being superseded by `body.input-touch` rules:

- The entire "Mobile typography scale" section (lines ~1142–1232), which includes:
  - `.field-label { font-size: 14px }`
  - `.fieldset legend { font-size: 13px }`
  - `.panel-header { font-size: 15px }`
  - `.bottom-tab { font-size: 14px }`
  - `.btn { font-size: 14px; height: 34px }`
  - `.btn-sm { font-size: 13px; height: 28px }`
  - `.pattern-item { font-size: 14px }`
  - `.pattern-item-btn { font-size: 13px; width: 28px; height: 28px }`
  - `.row-details-info { font-size: 13px }`
  - `.row-detail-toggles button { font-size: 14px; width: 34px; height: 30px }`
  - `.context-menu { font-size: 14px }`
  - `.context-menu-input-row { font-size: 14px }`
  - `.history-panel { font-size: 13px }`
  - `.history-node-time { font-size: 12px }`
  - All `font-size: 16px !important` overrides on `.field input`, `.pattern-item select`, `.pat-editor-row input`, `.row-detail-name-input`, `.context-menu-input-row input`

The `height: 34px` overrides on inputs within the same block are also removed — replaced by `--touch-input-h: 44px`.

**Important:** the bottom-tab height currently set at `height: 32px` inside the `.bottom-panel-tabs` rule under `@media (max-width: 768px)` is a *layout* rule, not a touch rule — it should remain in the breakpoint. Only the typography and sizing overrides move to `body.input-touch`.

### New selector structure

All touch-specific sizing rules are added as a new block at the end of `style.css`, before the closing comment, using `body.input-touch` as the gate:

```css
/* ── Touch UI System (body.input-touch) ────────── */

body.input-touch .field-label { ... }
body.input-touch .field input[type="text"],
body.input-touch .field input[type="number"],
body.input-touch .field select { ... }
/* etc. */
```

This keeps the `@media (max-width: 768px)` block focused exclusively on layout changes (flex direction, panel show/hide, sidepanel → bottom-panel transition) with no sizing or typographic responsibilities.

### Sidepanel content fix (§5)

Add `min-height: 0` and `height: 0` to `.sidepanel-content` as described in §5. This is a global change — not gated behind any breakpoint or class — as it fixes a structural issue that affects all modes.

### HTML structural changes

None required. The existing structure supports all prescribed changes through CSS and CSS variables alone.

### Context menu

The `.context-menu` and `.context-menu-input-row` controls are dynamically generated by `app.js` and appear on long-press / right-click. In touch mode:

```css
body.input-touch .context-menu {
  font-size: var(--touch-font-base);   /* 15px */
  min-width: 200px;
}

body.input-touch .context-menu-item {
  padding: 10px 16px;   /* was 6px 14px — taller tap rows */
}

body.input-touch .context-menu-input-row input {
  height: var(--touch-input-h);    /* 44px */
  font-size: var(--touch-font-input);  /* 16px */
  width: 60px;
}

body.input-touch .context-menu-input-row button {
  height: var(--touch-input-h);    /* 44px */
  font-size: var(--touch-font-sm);
}
```

---

## §8 — Summary of Key Decisions

| Decision | Rationale |
|---|---|
| Touch target floor: **44px** | Apple HIG for iOS/iPad; 48dp (Material) would be ideal but 44px is appropriate for a dense productivity tool |
| Input font floor: **16px** | iOS Safari still zooms viewport on focus for `font-size < 16px` — confirmed active on iOS 18 (2025) |
| Scale ratio: **1.125** | Dense enough for productivity, produces clean 13→15→17→19px sequence |
| Base touch font: **15px** | Legible on Retina displays at typical iPad arm's length; does not over-inflate a dense grid UI |
| Drag handle: **20px** thick (touch) | Finger hit area; pill indicator centred at 8px from top |
| Sidepanel toggle strip: **32px** wide (touch) | Edge-reachability on iPad; 20px is finger-tight |
| `height: 0` on `.sidepanel-content` | WebKit Safari fix for flex child overflow with `overflow-y: auto` |
| `:active` states added for touch | iOS sticky-hover problem; `:hover` rules preserved for Magic Keyboard/trackpad use |
| No touch-specific colour changes | Identity's restraint is valid; no exception warranted |

---

## Appendix — Sources

[^1]: iOS Safari auto-zoom threshold: [Defensive CSS — Input zoom on iOS Safari](https://defensivecss.dev/tip/input-zoom-safari/); [CSS-Tricks — 16px or Larger Text Prevents iOS Form Zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/). Confirmed active on iOS 18 / Safari 18 via community discussions through early 2026.

[^2]: Apple HIG touch targets: [Apple Developer — Accessibility (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/accessibility); [Deque Docs — Touch Target Size (2024)](https://docs.deque.com/devtools-mobile/2024.9.18/en/ios-touch-target-size/). Minimum: 44 × 44 pt.

[^3]: Material Design 3 touch targets: [Material Design 3 — Accessibility designing](https://m3.material.io/foundations/designing/structure); [Android Accessibility Help — Touch target size](https://support.google.com/accessibility/android/answer/7101858). Minimum: 48 × 48 dp.

[^4]: General touch UI best practices: [nextnative.dev — 9 Mobile App UI Design Best Practices for 2025](https://nextnative.dev/blog/mobile-app-ui-design-best-practices); [Cygnis — Web App UI/UX Best Practices in 2025](https://cygnis.co/blog/web-app-ui-ux-best-practices-2025/).
