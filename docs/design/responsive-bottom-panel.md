# Responsive Bottom Panel Spec

**Status:** Draft
**Date:** 2026-04-06
**Addresses:** Responsive sidepanel behaviour on narrow viewports

---

## 1. Requirements Recap

On narrow viewports (phones, iPad portrait, narrow desktop windows), the right sidepanel must:
- Move from the **right** to the **bottom** of the viewport.
- Convert its five collapsible `<details>` sections into horizontal **tabs**.
- Remain resizable (drag top edge) and collapsible.
- Show identical content to the desktop `<details>` panel bodies.

The five sections/tabs are:
1. **Spreadsheet** (import/export, column count)
2. **Style** (font, colour, alternating columns)
3. **Header Patterns** (pattern list, add)
4. **Row Details** (row info, add)
5. **History** (undo tree)

---

## 2. Breakpoint

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Trigger | `max-width: 768px` | Already used in `style.css` at line 990. iPad portrait is 768px. Reuse this breakpoint rather than adding a new one. |
| Mechanism | **CSS media query** for layout/positioning; **JS `matchMedia` listener** for drag-axis logic only. | Layout is pure CSS. JS only needs to know the current mode to switch drag direction (horizontal vs vertical) and collapse threshold. |

The existing `@media (max-width: 768px)` block currently makes the sidepanel overlay from the right. This spec **replaces** that block entirely.

---

## 3. Bottom Panel Layout

### 3.1 Dimensions

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default height | `240px` | ~35% of iPhone SE (667px height), ~23% of iPad portrait (1024px height). Reasonable for all narrow devices. |
| Min height (while expanded) | `120px` | Enough for tab bar + one row of content. |
| Max height | `70vh` | Never consume more than 70% of the viewport; spreadsheet must remain usable. |
| Width | `100%` | Full viewport width. |
| Collapse threshold | `60px` | If dragged below 60px, snap to collapsed state. |

### 3.2 Structure (top to bottom)

```
+--------------------------------------------------+
|  ═══ drag handle (8px)                           |  <- .sidepanel-handle
+--------------------------------------------------+
| [Ssheet] [Style] [Header] [Rows] [Hist]         |  <- .sidepanel-tabs
+--------------------------------------------------+
|                                                  |
|  Active tab content (scrollable)                 |  <- .sidepanel-tab-content
|                                                  |
+--------------------------------------------------+
```

### 3.3 Drag Handle

| Parameter | Value |
|-----------|-------|
| Height | `8px` |
| Visual indicator | 32px-wide, 3px-tall, centred pill (border-radius 1.5px), colour `var(--border)` |
| Cursor | `row-resize` |
| Touch target | The full 8px strip is the touch target. No extra padding needed since the tab bar below also responds to touch. |

This handle is a **new element** added inside `.sidepanel`, visible only in bottom mode. On desktop, the existing `.sidepanel-tab` (20px vertical strip) continues to serve as the drag/toggle control.

### 3.4 Tab Bar

| Parameter | Value |
|-----------|-------|
| Height | `32px` |
| Layout | `display: flex; flex-direction: row` |
| Tab count | 5 (all visible simultaneously, no scrolling) |
| Tab sizing | `flex: 1 1 0` (equal width) |
| Active indicator | 2px solid black bottom border on the active tab |
| Inactive style | No bottom border; colour `#666` |
| Font size | `11px` |
| Text alignment | Centre |

**Tab labels** (abbreviated to fit narrow screens):

| Section | Tab Label | Rationale |
|---------|-----------|-----------|
| Spreadsheet | **Sheet** | 5 chars, clear enough |
| Style | **Style** | Already short |
| Header Patterns | **Header** | "Patterns" is too long |
| Row Details | **Rows** | Concise |
| History | **Hist** | Concise |

No icons. Text only. Matches the Excel-like minimal aesthetic.

### 3.5 Tab Content Area

| Parameter | Value |
|-----------|-------|
| Height | Remaining space below tab bar and handle |
| Overflow | `overflow-y: auto; scrollbar-width: none` (hidden scrollbar, matching desktop) |
| Padding | `12px 16px` |

Each tab's content is exactly the `.panel-body` content from the corresponding `<details>` section. No content changes, no reordering, no omissions.

---

## 4. Collapsed State

| Parameter | Value |
|-----------|-------|
| Collapsed height | `40px` (handle 8px + tab bar 32px) |
| Tabs visible? | **Yes** — the tab bar remains visible when collapsed |
| Content area | Hidden (`display: none` or `height: 0; overflow: hidden`) |
| How to expand | Tap any tab, or drag the handle upward |
| How to collapse | Drag handle downward past collapse threshold (60px), or tap the currently-active tab again |

Rationale for keeping tabs visible when collapsed: the user can switch context (tap a different tab) and expand in one gesture. A bare handle would require two gestures (expand, then find the right section). This also gives a visual reminder of what the panel contains.

---

## 5. Resize Behaviour (Bottom Mode)

The resize logic mirrors the desktop sidepanel drag, but on the vertical axis.

### 5.1 Drag Interaction

| Event | Action |
|-------|--------|
| `pointerdown` on handle | Record `startY`, `startH` (panel height). Set `pointer-capture`. |
| `pointermove` | `newH = startH + (startY - e.clientY)`. Clamp to `[60, 70vh]`. If `newH < 60`, add `collapsed` class and set height to `40px`. Otherwise, set height to `newH + 'px'` and remove `collapsed`. |
| `pointerup` | If no movement detected (< 3px), treat as a **click**: toggle collapsed/expanded. Release pointer capture. |

Using `pointer` events (not `mouse`/`touch` separately) for unified handling. This is the same pattern the desktop drag should migrate to eventually, but that is out of scope here.

### 5.2 State Persistence

| Parameter | Behaviour |
|-----------|-----------|
| `_lastBottomPanelHeight` | JS variable, default `240`. Updated whenever the user finishes a drag at a valid height. Used to restore height when expanding from collapsed. |
| Cross-mode memory | When switching from bottom-mode to desktop-mode (viewport resize), the panel reverts to its desktop width state (`_lastSidepanelWidth`). When switching back to bottom-mode, it uses `_lastBottomPanelHeight`. Each mode remembers its own last size independently. |

---

## 6. Mode Transition (Crossing the Breakpoint)

| Aspect | Behaviour |
|--------|-----------|
| Detection | `window.matchMedia('(max-width: 768px)')` listener, plus the corresponding CSS media query. |
| CSS | Media query handles: flex direction of `#app`, panel positioning, showing/hiding handle vs tab strip, tab bar layout. Transition is **instant** (no animation). |
| JS | `matchMedia` `change` event handler updates a flag (e.g. `state._bottomMode`). This flag controls: (a) drag axis in the resize handler, (b) which last-size variable to use, (c) tab selection logic. |
| Panel open/closed state | **Preserved** across transitions. If the panel was collapsed in right mode, it stays collapsed in bottom mode (and vice versa). |
| Active tab | Defaults to whichever `<details>` was last opened. If multiple were open (desktop allows this), default to the first open one. |

---

## 7. CSS Architecture

All layout changes are in a single `@media (max-width: 768px)` block, replacing the existing one at line 990.

### 7.1 Key CSS Rules (Bottom Mode)

```css
@media (max-width: 768px) {
  #app {
    flex-direction: column;
  }

  .sidepanel {
    flex-direction: column;
    width: 100%;
    min-width: 100%;
    height: 240px;
    min-height: 40px;        /* collapsed = handle + tabs */
    max-height: 70vh;
    border-left: none;
    border-top: 1px solid var(--border);
    order: 2;                /* below editor */
  }

  .sidepanel.collapsed {
    height: 40px;
    min-height: 40px;
  }

  /* Hide desktop toggle strip */
  .sidepanel-tab {
    display: none;
  }

  /* Show bottom-mode handle */
  .sidepanel-handle {
    display: flex;
  }

  /* Show tab bar */
  .sidepanel-tabs {
    display: flex;
  }

  /* Hide <details>/<summary> chrome; show only active panel-body */
  .sidepanel-content .panel {
    display: none;
  }
  .sidepanel-content .panel.active-tab {
    display: block;
  }
  .sidepanel-content .panel.active-tab > summary {
    display: none;
  }

  .sidepanel-content {
    padding: 12px 16px;
    padding-left: 16px;      /* override desktop 0 left-padding */
  }

  .sidepanel.collapsed .sidepanel-content {
    display: none;
  }
}
```

### 7.2 Desktop-Only Defaults

```css
/* These are the defaults (outside media query) */
.sidepanel-handle {
  display: none;              /* hidden on desktop */
}

.sidepanel-tabs {
  display: none;              /* hidden on desktop */
}
```

---

## 8. HTML Changes

Two new elements inside `.sidepanel`, inserted **before** `.sidepanel-content`:

```html
<aside id="sidepanel" class="sidepanel">
  <button id="sidepanel-toggle" class="sidepanel-tab" title="Toggle panel">›</button>

  <!-- NEW: bottom-mode drag handle -->
  <div class="sidepanel-handle" id="sidepanel-handle">
    <div class="sidepanel-handle-pill"></div>
  </div>

  <!-- NEW: bottom-mode tab bar -->
  <nav class="sidepanel-tabs" id="sidepanel-tabs">
    <button class="sidepanel-tab-btn active" data-tab="spreadsheet">Sheet</button>
    <button class="sidepanel-tab-btn" data-tab="style">Style</button>
    <button class="sidepanel-tab-btn" data-tab="header">Header</button>
    <button class="sidepanel-tab-btn" data-tab="rows">Rows</button>
    <button class="sidepanel-tab-btn" data-tab="history">Hist</button>
  </nav>

  <div class="sidepanel-content">
    <!-- existing <details> panels, each gaining a data-tab-id attribute -->
    <details class="panel" open data-tab-id="spreadsheet">...</details>
    <details class="panel" data-tab-id="style">...</details>
    <details class="panel" open data-tab-id="header">...</details>
    <details class="panel" open data-tab-id="rows">...</details>
    <details class="panel" data-tab-id="history">...</details>
  </div>
</aside>
```

Each `<details>` gets a `data-tab-id` attribute matching the corresponding tab button's `data-tab`. The JS tab-switching logic adds/removes the `.active-tab` class on the `<details>` elements.

---

## 9. JS Logic Summary

### 9.1 Tab Switching

```
On tab button click:
  1. Remove .active-tab from all .panel elements
  2. Remove .active from all .sidepanel-tab-btn elements
  3. Add .active-tab to the .panel matching clicked button's data-tab
  4. Add .active to the clicked button
  5. If panel is collapsed, expand it to _lastBottomPanelHeight
  6. If the clicked tab was already active AND panel is expanded, collapse it
```

### 9.2 Mode Detection

```
const mql = window.matchMedia('(max-width: 768px)');
let isBottomMode = mql.matches;

mql.addEventListener('change', (e) => {
  isBottomMode = e.matches;
  if (isBottomMode) {
    // Entering bottom mode:
    // - Set panel height to _lastBottomPanelHeight (or 240px default)
    // - Determine active tab from first open <details>
    // - Apply .active-tab class
  } else {
    // Entering desktop mode:
    // - Clear inline height
    // - Restore width from _lastSidepanelWidth
    // - Remove .active-tab classes (let <details> open/close naturally)
  }
});
```

### 9.3 Drag Handle (Bottom Mode)

Uses `pointerdown`/`pointermove`/`pointerup` on `#sidepanel-handle`. Logic described in section 5.1.

### 9.4 Desktop Drag (Unchanged)

The existing `mousedown`/`mousemove`/`mouseup` logic on `#sidepanel-toggle` remains. It only activates when `isBottomMode === false` (guard at the top of the handler, or simply because `.sidepanel-tab` is hidden in bottom mode and receives no events).

---

## 10. Edge Cases

| Case | Behaviour |
|------|-----------|
| Viewport crosses 768px during a drag | Abort the drag. Release pointer capture. Let the `matchMedia` change handler reset the panel. |
| Orientation change on iPad | Triggers the same `matchMedia` listener. Portrait (768px) = bottom mode. Landscape (1024px) = right mode. |
| All tabs hidden (none applicable) | Not possible. All 5 tabs are always present. Content may be empty (e.g., Row Details with no row selected) but the tab is still shown. |
| Empty state in a tab | Same as desktop: the `.panel-body` content renders its own empty state (e.g., "Double-click a row label to edit..." in Row Details). No change. |
| Virtual keyboard on mobile | The panel is positioned via flexbox (not fixed). When the keyboard pushes the viewport, the panel shrinks naturally. If the keyboard covers the panel entirely, that is acceptable — the user is editing the spreadsheet, not the panel. |
| Touch on spreadsheet while panel is expanded | Spreadsheet is still interactive above the panel. The panel does not overlay the spreadsheet — it is a flex child sharing the viewport vertically. |

---

## 11. What Does NOT Change

- **Desktop layout** (> 768px): completely unchanged. Right sidepanel, `<details>` sections, vertical drag strip, all as-is.
- **Content**: no content changes in any panel section.
- **State persistence**: `localStorage` save/load is unaffected. The panel mode (bottom vs right) is transient, derived from viewport width at runtime.
- **Existing 1024px breakpoint**: the `@media (max-width: 1024px)` rule that sets `--sidepanel-w: 260px` remains. It only applies in desktop mode (768-1024px range).

---

## 12. Implementation Priority

This feature has no dependencies on other in-progress work. Recommended implementation order:

1. **HTML**: Add `data-tab-id` attributes, handle element, and tab bar nav.
2. **CSS**: Replace the `@media (max-width: 768px)` block. Add handle and tab-bar styles (both inside and outside the media query).
3. **JS**: Add `matchMedia` listener, tab-switching logic, and bottom-mode drag handler.
4. **Test**: Verify on iPhone SE (375px), iPad portrait (768px), iPad landscape (1024px, should be desktop mode), and a narrow desktop window.

---

## Alignment Check

- [x] All 5 sections become tabs (Spreadsheet, Style, Header Patterns, Row Details, History)
- [x] Panel moves from right to bottom at the defined breakpoint
- [x] Resizable by dragging top edge (handle)
- [x] Collapsible (drag down or tap active tab)
- [x] Collapsed state shows tabs (one-gesture expand-to-section)
- [x] Tab content is identical to desktop panel body content
- [x] Minimal, Excel-like aesthetic (text labels, no icons, thin borders)
- [x] iPad compatibility preserved (touch events via pointer events)
- [x] No framework dependencies, no build step
