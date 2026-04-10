# Group Header Row — CSS Design Specification

**Status:** Design specification
**Date:** 2026-04-10
**Author:** Pictor (art direction)
**Addresses:** Visual design of `.group-header-row`, `.group-header-label`, `.group-toggle`, `.group-label-text`, `.group-summary-cell`

---

## 1. Design Rationale

Group header rows are **structural dividers**, not data rows. Their visual register must sit between the column header (`thead th`, which uses `--t3`) and the blank canvas of data rows (white). The clearest signal for "this is furniture, not content" is to give them a background one tier above a data row but one tier below the frozen column header — that is, `--t2`, the stripe fill tier, used as a *solid* surface rather than an alternating tint.

The sticky-left cell — the group label — reverses this: it borrows the `--t3`/`--t3-solid` treatment that the corner cell uses. The group name thereby shares visual kin with the sheet's primary header chrome, reinforcing the reading "this label names a section of the sheet, just as the corner names the sheet itself."

Summary cells, visible only when a group is collapsed, read as **metadata captions**, not as data. They achieve this through a smaller font, reduced opacity, and the absence of any interactive affordance. When expanded, summary cells are empty — the group header becomes a lean structural band, label on the left, silence on the right.

The toggle indicator (▶/▼) is a minimal geometric affordance. It must rotate rather than swap characters so that the motion itself communicates the collapse direction. A `0.15s ease` rotation keeps it crisp without feeling slow.

No new colours. No gradients. No border-radius. The aesthetic character of this codebase is flat and utilitarian — group headers must feel native to that discipline, not imported from a different UI language.

---

## 2. Assumed HTML Structure

The CSS below assumes the HTML structure specified in `docs/design/row-grouping.md` §4.1, reproduced here for completeness:

```html
<!-- Named group (expanded) -->
<tr class="group-header-row" data-group-id="g_1" data-group-type="named">
  <td class="sticky-left group-header-label" colspan="1">
    <span class="group-toggle">&#9654;</span>
    <span class="group-label-text">Morning Routine</span>
  </td>
  <td class="group-summary-cell" data-col="0"></td>
  <td class="group-summary-cell" data-col="1"></td>
</tr>

<!-- Named group (collapsed) -->
<tr class="group-header-row" data-group-id="g_1" data-group-type="named" data-collapsed="true">
  <td class="sticky-left group-header-label" colspan="1">
    <span class="group-toggle group-toggle--collapsed">&#9654;</span>
    <span class="group-label-text">Morning Routine</span>
  </td>
  <td class="group-summary-cell" data-col="0">
    <span class="group-summary-text">[3] 2&#10003;</span>
  </td>
  <td class="group-summary-cell" data-col="1">
    <span class="group-summary-text">[3]</span>
  </td>
</tr>

<!-- Pinned section header -->
<tr class="group-header-row" data-group-type="pinned">
  <td class="sticky-left group-header-label" colspan="1">
    <span class="group-toggle">&#9654;</span>
    <span class="group-label-text">Pinned</span>
  </td>
  <td class="group-summary-cell" data-col="0"></td>
</tr>

<!-- Other section header -->
<tr class="group-header-row" data-group-type="other">
  <td class="sticky-left group-header-label" colspan="1">
    <span class="group-toggle">&#9654;</span>
    <span class="group-label-text">Other</span>
  </td>
  <td class="group-summary-cell" data-col="0"></td>
</tr>
```

**Key structural requirements:**
- The toggle state is communicated via `.group-toggle--collapsed` on the `<span>`, not by swapping the character. This keeps the rotation transition smooth and avoids a flash of different content during the CSS transition.
- The `data-collapsed="true"` attribute on the `<tr>` is used by JS but is not targeted by CSS — all CSS targets class names.
- Summary text is wrapped in `.group-summary-text` so it can be styled independently of the cell's padding/layout.
- The `<td class="sticky-left group-header-label">` carries *both* the `.sticky-left` class (for position/z-index inheritance) and `.group-header-label` (for its own overrides). The order matters: `.group-header-label` must override `.sticky-left` background where they conflict.

---

## 3. CSS Rules

```css
/* ── Group header rows ─────────────────────────────────────────── */

/*
 * The row itself.
 *
 * Background: --t2 across all content cells. This is the stripe-fill
 * tier, used here as a solid band. It reads as "structural surface"
 * without competing with the --t3 header chrome above it.
 *
 * No hover highlight (neither outline nor background change) because
 * group headers are not selectable data cells. The cursor changes to
 * pointer to signal that the row is clickable for collapse/expand.
 *
 * Pointer events on the row are fine — JS handles the click. But we
 * must not let the existing content-cell hover rules fire, so we
 * override them explicitly in §3.4.
 */
.spreadsheet tr.group-header-row {
  cursor: pointer;
}

.spreadsheet tr.group-header-row td {
  background: var(--t2);
  border-bottom: calc(1px * var(--zoom)) solid var(--border);
  height: calc(var(--cell-h) * var(--zoom));
}


/* ── Named vs. system section headers ──────────────────────────── */

/*
 * Named groups (user-created) receive a slightly stronger top border
 * to visually separate them from the data rows above. A single-pixel
 * border at --border-strong weight is enough — it acts like a ruled
 * line under a chapter heading.
 *
 * Pinned and Other are system-defined sections. They do not need the
 * strong top border because they are less semantically significant —
 * they are organisational conveniences, not user-authored structure.
 * They use the standard --border at the top, giving them a quieter
 * presence in the hierarchy.
 */
.spreadsheet tr.group-header-row[data-group-type="named"] td {
  border-top: calc(1px * var(--zoom)) solid var(--border-strong);
}

.spreadsheet tr.group-header-row[data-group-type="pinned"] td,
.spreadsheet tr.group-header-row[data-group-type="other"] td {
  border-top: calc(1px * var(--zoom)) solid var(--border);
  opacity: 0.75;
}

/*
 * Rationale for opacity on pinned/other:
 * Rather than introducing a new intermediate tint, a fractional
 * opacity on the entire row (background + text + toggle) creates a
 * single, consistent "quieter than named" signal without any new
 * colour math. 0.75 is enough reduction to read as subordinate
 * without becoming illegible.
 */


/* ── Sticky-left label cell ─────────────────────────────────────── */

/*
 * .group-header-label overrides .sticky-left's white background with
 * --t3-solid. This puts the label cell in the same visual register as
 * the corner cell and the column headers — all use --t3-solid. The
 * message is: "this cell labels a structural unit, not a data row."
 *
 * The strong right border is inherited from .sticky-left and is
 * correct here — it maintains the vertical rail that separates labels
 * from content across the whole table.
 */
.spreadsheet td.group-header-label {
  background: var(--t3-solid);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 6px;
  overflow: hidden;
}

/*
 * [data-color-target="all"] override: when the user has opted into
 * "all" colour mode, .sticky-left already gets --t3-solid. The label
 * cell is already at that level, so no additional override is needed.
 * The rule below ensures the label cell stays at --t3-solid regardless
 * of colour-target setting (it should not drop back to white in
 * "headers-only" mode, because it is a structural header).
 */
[data-color-target="all"] .spreadsheet td.group-header-label {
  background: var(--t3-solid);
}


/* ── Toggle indicator ───────────────────────────────────────────── */

/*
 * The toggle is a Unicode right-pointing triangle (U+25B6). It acts
 * as a visual pivot: in its default state (expanded), it points right
 * (▶). When the group is collapsed, .group-toggle--collapsed rotates
 * it 90° clockwise to point down (▼-equivalent without changing the
 * character, preserving transition continuity).
 *
 * font-size: slightly smaller than the label text so it reads as an
 * affordance glyph, not as competing text content.
 *
 * flex-shrink: 0 prevents the toggle from collapsing when the label
 * text is long.
 *
 * The transition is on transform only — no opacity, no colour change.
 * The motion itself is the signal. 0.15s ease is fast enough to feel
 * responsive on touch and crisp on mouse.
 */
.spreadsheet .group-toggle {
  font-size: calc(9px * var(--zoom));
  line-height: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: rotate(90deg); /* expanded: pointing down */
  transform-origin: center;
  transition: transform 0.15s ease;
  color: inherit;
  opacity: 0.7;
}

/*
 * Collapsed state: toggle points right (▶ at 0°).
 */
.spreadsheet .group-toggle--collapsed {
  transform: rotate(0deg);
}


/* ── Group label text ───────────────────────────────────────────── */

/*
 * font-weight: 600 — one step bolder than the regular row labels
 * (font-weight: 400). Named groups are user-authored structural
 * labels; they deserve the weight of a heading without the size of
 * one. 600 is precisely that: presence without elevation.
 *
 * Truncation with ellipsis mirrors the treatment of long row labels
 * in .sticky-left, maintaining visual consistency.
 *
 * The font-size inherits from the table (calc(15px * var(--zoom))),
 * which is correct — the label should feel the same scale as row
 * labels, differentiated only by weight.
 */
.spreadsheet .group-label-text {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/*
 * Pinned and Other labels: match the row's 0.75 opacity by reducing
 * the weight slightly. font-weight: 500 at 0.75 row opacity achieves
 * the "quieter section header" register.
 */
.spreadsheet tr.group-header-row[data-group-type="pinned"] .group-label-text,
.spreadsheet tr.group-header-row[data-group-type="other"] .group-label-text {
  font-weight: 500;
}


/* ── Summary cells ──────────────────────────────────────────────── */

/*
 * Summary cells carry collapsed-group statistics. They must read as
 * metadata captions, not as interactive cell values. Three decisions
 * enforce this:
 *
 * 1. text-align: left — data cells are centred; left-alignment
 *    immediately signals "this is prose/label, not a value."
 *
 * 2. The .group-summary-text span carries the font-size reduction
 *    and opacity dimming. Applying these to the span (not the td)
 *    preserves the td's full height for click targeting.
 *
 * 3. No hover outline, no cursor change — the entire group header
 *    row is clickable (handled by the parent tr's cursor: pointer),
 *    so individual summary cells need no additional affordance.
 *
 * padding: 0 6px left-aligns the text with a small gutter, keeping
 * it from touching the cell border.
 */
.spreadsheet .group-summary-cell {
  text-align: left;
  vertical-align: middle;
  padding: 0 6px;
  user-select: none;
}

.spreadsheet .group-summary-text {
  font-size: calc(11px * var(--zoom));
  opacity: 0.55;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

/*
 * Floor: at zoom values below 1, 11px can become illegible. CSS
 * clamp is not available for calc() in the same way across all
 * targets, so we accept this trade-off — at very low zoom the user
 * is trading legibility for fit, and summary text is non-critical.
 * If a floor becomes necessary, it should be handled in the JS zoom
 * clamping logic, not here.
 */


/* ── Suppress conflicting rules from the base stylesheet ─────────── */

/*
 * The alt-rows rule uses tr:nth-child(even) today, which will be
 * replaced by the JS-assigned .alt-stripe class (per the spec in
 * row-grouping.md §4.2). The rules below are defensive: they ensure
 * group header rows never receive stripe or hover treatment even if
 * the migration is incomplete or if both systems co-exist temporarily.
 *
 * These overrides use the same specificity as the base rules they
 * suppress, with .group-header-row added to the selector.
 */

/* No stripe fill on group header content cells */
.spreadsheet.alt-cols tr.group-header-row td.group-summary-cell:nth-child(even) {
  background: var(--t2);
}

/* No alt-row stripe on group header rows */
.spreadsheet.alt-rows tbody tr.group-header-row td.group-summary-cell {
  background: var(--t2);
}
.spreadsheet.alt-rows tbody tr.group-header-row.alt-stripe td.group-summary-cell {
  background: var(--t2);
}

/* No mouse hover outline on summary cells */
body.input-mouse .spreadsheet tr.group-header-row td.group-summary-cell:hover {
  outline: none;
}
body.input-mouse .spreadsheet.alt-cols tr.group-header-row td.group-summary-cell:nth-child(even):hover {
  outline: none;
}
body.input-mouse .spreadsheet.alt-rows tbody tr.group-header-row td.group-summary-cell:hover {
  outline: none;
}


/* ── Drag hover feedback (cross-group drag target) ──────────────── */

/*
 * When a row is being dragged across a group boundary, the target
 * group header receives .drag-target-group to signal "drop here joins
 * this group." A left accent border on the label cell is sufficient —
 * it is directional (pointing into the group), visually connected to
 * the strong left rail, and does not require any new colour.
 *
 * border-left width of 3px at zoom:1 is perceptible without being
 * heavy. At higher zoom values the 3*zoom formula keeps it
 * proportionate.
 */
.spreadsheet tr.group-header-row.drag-target-group td.group-header-label {
  border-left: calc(3px * var(--zoom)) solid var(--border-strong);
  padding-left: calc(3px * var(--zoom) + 6px); /* compensate for border width */
}


/* ── Empty group visual ─────────────────────────────────────────── */

/*
 * A group with zero rows (created but never populated, or all rows
 * removed) shows its label at reduced opacity. This distinguishes it
 * from populated groups without requiring a separate state class on
 * the row — the .group-empty class on the tr is enough.
 *
 * The effect is a compounded opacity: the row's base opacity is 1
 * (named groups are fully opaque), so .group-empty's 0.5 on the
 * label cell reads as "this section has nothing in it."
 * The summary cells would show "[0]" in collapsed mode, which is
 * already handled by the .group-summary-text opacity. In expanded
 * mode (no rows), the row still renders but feels ghosted.
 */
.spreadsheet tr.group-header-row.group-empty .group-label-text {
  opacity: 0.45;
}
.spreadsheet tr.group-header-row.group-empty .group-toggle {
  opacity: 0.3;
}


/* ── Selected group header (sidepanel selection) ────────────────── */

/*
 * When a group header is selected (state.selectedGroup is set), the
 * row receives .group-header-selected. The visual is a left-border
 * accent on the label cell, identical in weight to the drag-target
 * treatment but always present (not transient). This mirrors how
 * selected rows show their selection in the sticky-left cell via
 * inline background in app.js.
 *
 * We use the border approach here rather than a background change
 * because the label cell already has a distinctive background
 * (--t3-solid). Adding another background layer would compete with
 * the structural colour.
 */
.spreadsheet tr.group-header-row.group-header-selected td.group-header-label {
  border-left: calc(3px * var(--zoom)) solid var(--border-strong);
  padding-left: calc(3px * var(--zoom) + 6px);
}


/* ── Touch adaptations (body.input-touch) ───────────────────────── */

/*
 * Touch targets: The full group-header-row is already 26px * zoom.
 * On touch, rows need a minimum 44px tap target. We achieve this by
 * raising --cell-h for group header rows via the td height property.
 *
 * We cannot override --cell-h globally for touch (it would affect all
 * rows). Instead we set an explicit min-height on the group header tds.
 * The td's height property already uses calc(var(--cell-h) * var(--zoom))
 * from the base .spreadsheet td rule. We override just group header tds.
 *
 * 44px is the Apple HIG minimum, consistent with --touch-input-h.
 */
body.input-touch .spreadsheet tr.group-header-row td {
  height: var(--touch-input-h); /* 44px */
}

/*
 * Toggle icon: slightly larger on touch to make the tap region feel
 * accurate. The tap target is the entire label cell (not just the
 * toggle span), but a larger glyph reduces the perceived precision
 * demand.
 */
body.input-touch .spreadsheet .group-toggle {
  font-size: calc(11px * var(--zoom));
}

/*
 * Summary text: floor the font-size at 12px on touch to preserve
 * legibility at the larger row height. The proportional scaling
 * (11px * zoom) at zoom:1 on touch is fine; this rule only matters
 * if zoom dips below ~1.09.
 */
body.input-touch .spreadsheet .group-summary-text {
  font-size: 12px;
}

/*
 * Label text: slightly larger on touch, matching the touch typography
 * scale. 15px is --touch-font-base, which applies to all primary UI
 * text in touch mode.
 */
body.input-touch .spreadsheet .group-label-text {
  font-size: var(--touch-font-base); /* 15px */
}
```

---

## 4. Visual Hierarchy Summary

| Surface | Background | Border treatment | Weight | Opacity |
|---|---|---|---|---|
| Column header (`thead th`) | `--t3-solid` | Strong bottom 2px | 400 | 100% |
| Corner cell | `--t3-solid` | Strong bottom + right 2px | 600 | 100% |
| **Named group label cell** | `--t3-solid` | Strong top 1px (on tr) | **600** | **100%** |
| **Named group summary cells** | `--t2` | Strong top 1px (on tr) | — | summary text: 55% |
| **Pinned / Other label cell** | `--t3-solid` | Normal top 1px (on tr) | **500** | **row: 75%** |
| **Pinned / Other summary cells** | `--t2` | Normal top 1px (on tr) | — | row: 75%, summary text: 55% |
| Regular data row (odd) | `#fff` | Normal bottom 1px | 400 | 100% |
| Regular data row (even, alt-rows) | `--t2` | Normal bottom 1px | 400 | 100% |

The tier ladder reads cleanly top-to-bottom: frozen chrome (`--t3`) → named group label (`--t3`) → group band (`--t2`) → white data. Named groups share the header chrome tier for their label cell; they assert section authority. Pinned and Other step back to 75% row opacity, acknowledging their system-defined, non-authored nature.

---

## 5. States Covered

| Class / Attribute | What triggers it | Visual effect |
|---|---|---|
| `.group-toggle` (default) | Group is expanded | Toggle rotated 90° (pointing down) |
| `.group-toggle--collapsed` | Group is collapsed | Toggle at 0° (pointing right) |
| `.group-empty` on `<tr>` | Group has 0 member rows | Label at 45% opacity, toggle at 30% |
| `.group-header-selected` on `<tr>` | Group header is selected in sidepanel | 3px left border on label cell |
| `.drag-target-group` on `<tr>` | Row drag crosses into this group | 3px left border on label cell (transient) |
| `data-group-type="pinned"` | System pinned section | 75% row opacity, 500 weight label |
| `data-group-type="other"` | System Other section | 75% row opacity, 500 weight label |

---

## 6. What the JS Renderer Must Do

The CSS above requires the following from the rendering layer (for completeness — these are not CSS decisions but the CSS depends on them):

1. Apply `.group-toggle--collapsed` to `.group-toggle` spans when `group.collapsed === true`. Remove it when expanded.
2. Apply `.group-empty` to the `<tr>` when the group has zero member rows.
3. Apply `.group-header-selected` to the `<tr>` when `state.selectedGroup` matches the row's group ID.
4. Apply `.drag-target-group` to the `<tr>` during drag operations when the pointer is over that group's boundary. Remove it on drag end.
5. Populate `.group-summary-text` spans with the formatted summary string (e.g. `[5] 2✓ 1×`) when the group is collapsed. Clear them or remove the spans when expanded.
6. Do **not** assign `.alt-stripe` to group header rows (per `row-grouping.md` §4.2).
7. Do **not** set `data-row` or `data-storage-row` on group header rows — they are structural, not data-indexed.

---

## 7. Non-Decisions (Deferred)

- **Inline rename editing style:** When the user double-taps the label to rename, the label text becomes an `<input>`. That input's focus ring, sizing, and font should follow the existing `.cell-editing input` pattern. No new rules needed — re-use `.cell-editing`.
- **Collapse-all / expand-all:** No additional CSS required. The per-row toggle and selection classes cover all states.
- **Group colour / icon:** Per `row-grouping.md` §11.3, not planned.
