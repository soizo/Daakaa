/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Row Details sidepanel ──────────────────────────
function buildCellEditorHTML() {
  // Renders the cell editor sub-panel markup for the current selection.
  // Returns '' when no content-cell selection exists.
  if (!state.selection) return '';
  var { r1, c1, r2, c2 } = state.selection;
  var single = (r1 === r2 && c1 === c2);
  var count = (r2 - r1 + 1) * (c2 - c1 + 1);
  var sr1 = displayToStorageIndex(r1);
  var curVal = single && sr1 >= 0 ? getCellValue(sr1, c1) : '';
  var arrowMatch = single ? /^←(\d+)✓$/.exec(curVal) : null;

  var body = '';
  if (arrowMatch) {
    var n = arrowMatch[1];
    body = `
      <div class="cell-editor-label">Arrow count</div>
      <div class="arrow-count-editor">
        <button class="btn btn-sm arrow-count-dec" title="Decrement">−</button>
        <input type="number" class="arrow-count-input" min="0" value="${esc(n)}">
        <button class="btn btn-sm arrow-count-inc" title="Increment">+</button>
      </div>
      <div class="btn-row" style="margin-top:6px;">
        <button class="btn btn-sm arrow-count-clear">Clear</button>
      </div>
    `;
  } else {
    var label = single
      ? 'Cell value'
      : `${count} cells selected`;
    var vals = ['✓', '×', '〇', '—', ''];
    var labels = { '✓': '✓', '×': '×', '〇': '〇', '—': '—', '': '∅' };
    var activeVal = single ? curVal : null;
    var btns = vals.map((v) => {
      var isActive = v === activeVal ? ' active' : '';
      return `<button class="cell-val-btn${isActive}" data-value="${escAttr(v)}">${esc(labels[v])}</button>`;
    }).join('');
    var customHint = (single && curVal && !vals.includes(curVal))
      ? `<div class="cell-editor-hint">Current: ${esc(curVal)}</div>`
      : '';
    body = `
      <div class="cell-editor-label">${esc(label)}</div>
      <div class="cell-value-buttons">${btns}</div>
      ${customHint}
    `;
  }

  return `<hr class="row-cell-separator"><div class="row-cell-editor">${body}</div>`;
}

function bindCellEditorEvents() {
  var editor = $rowDetailsBody.querySelector('.row-cell-editor');
  if (!editor) return;
  if (!state.selection) return;
  var { r1, c1, r2, c2 } = state.selection;

  var applyValueToSelection = (v) => {
    if (isReadOnly()) return;
    commitUndoNode('Set cell');
    for (var r = r1; r <= r2; r++) {
      var sr = displayToStorageIndex(r);
      if (sr < 0) continue;
      for (var c = c1; c <= c2; c++) {
        setCellValue(sr, c, v);
      }
    }
    renderTable();
    saveState();
  };

  editor.querySelectorAll('.cell-val-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyValueToSelection(btn.dataset.value);
    });
  });

  var numInput = editor.querySelector('.arrow-count-input');
  var dec = editor.querySelector('.arrow-count-dec');
  var inc = editor.querySelector('.arrow-count-inc');
  var clearBtn = editor.querySelector('.arrow-count-clear');

  var sr1 = displayToStorageIndex(r1);
  var writeArrow = (n) => {
    if (isReadOnly() || sr1 < 0) return;
    var clean = Math.max(0, parseInt(n, 10) || 0);
    setCellValue(sr1, c1, `←${clean}✓`);
    renderTable();
    saveState();
  };

  if (numInput) {
    numInput.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit arrow count');
      writeArrow(numInput.value);
    });
  }
  if (dec) {
    dec.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Edit arrow count');
      var cur = parseInt((numInput && numInput.value) || '0', 10) || 0;
      writeArrow(Math.max(0, cur - 1));
    });
  }
  if (inc) {
    inc.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Edit arrow count');
      var cur = parseInt((numInput && numInput.value) || '0', 10) || 0;
      writeArrow(cur + 1);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isReadOnly()) return;
      commitUndoNode('Clear arrow count');
      // Resolution #4: clear destination = empty.
      if (sr1 >= 0) setCellValue(sr1, c1, '');
      renderTable();
      saveState();
    });
  }
}

function updateRowDetailsPanel() {
  var idx = state.selectedRow;
  var hasRow = (idx !== null && idx !== undefined && state.rows[idx]);
  var hasSel = !!state.selection;
  var hasGroup = !!state.selectedGroup;

  // Branch: group header selected
  if (hasGroup) {
    var gid = state.selectedGroup;
    var isNamed = gid !== '__pinned__' && gid !== '__other__';
    var group = isNamed ? state.groups.find(g => g.id === gid) : null;
    var label = isNamed ? (group ? group.label : '?') : (gid === '__pinned__' ? 'Pinned' : 'Other');
    var collapsed = getGroupCollapsed(gid);

    // Count rows in this group
    var rowCount = 0;
    if (gid === '__pinned__') {
      rowCount = state.rows.filter(r => r.groupId == null).length;
    } else if (gid === '__other__') {
      var groupIdSet = new Set(state.groups.map(g => g.id));
      rowCount = state.rows.filter(r => r.groupId != null && !groupIdSet.has(r.groupId)).length;
    } else {
      rowCount = state.rows.filter(r => r.groupId === gid).length;
    }

    if (isNamed) {
      $rowDetailsBody.innerHTML = `
        <div class="row-details-selection">
          <input class="row-detail-name-input" type="text" id="rd-group-name" value="${escAttr(label)}" maxlength="50">
          <p style="font-size:12px;opacity:0.6;">${rowCount} row${rowCount !== 1 ? 's' : ''}</p>
          <div class="row-detail-actions" style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <button id="rd-group-toggle" class="btn btn-sm">${collapsed ? 'Expand' : 'Collapse'}</button>
            <span style="flex:1;"></span>
            <button id="rd-group-delete" class="btn btn-sm" style="color:#c0392b;">Delete</button>
          </div>
        </div>
      `;
      var nameInput = document.getElementById('rd-group-name');
      nameInput.addEventListener('input', () => {
        if (isReadOnly() || !group) return;
        commitUndoNodeThrottled('Rename group');
        group.label = nameInput.value;
        // Update the label in the table without full re-render
        var tr = $table.querySelector(`.group-header-row[data-group-id="${CSS.escape(gid)}"]`);
        if (tr) {
          var labelSpan = tr.querySelector('.group-label-text');
          if (labelSpan) labelSpan.textContent = nameInput.value;
        }
        saveState();
      });
      document.getElementById('rd-group-toggle').addEventListener('click', () => {
        toggleGroupCollapse(gid);
      });
      document.getElementById('rd-group-delete').addEventListener('click', () => {
        deleteGroupWithConfirm(gid);
      });
    } else {
      $rowDetailsBody.innerHTML = `
        <div class="row-details-selection">
          <div class="row-detail-name-row">
            <input class="row-detail-name-input" type="text" value="${escAttr(label)}" disabled style="opacity:0.6;">
          </div>
          <p style="font-size:12px;opacity:0.6;">${rowCount} row${rowCount !== 1 ? 's' : ''}</p>
          <div class="row-detail-actions" style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <button id="rd-group-toggle" class="btn btn-sm">${collapsed ? 'Expand' : 'Collapse'}</button>
          </div>
        </div>
      `;
      document.getElementById('rd-group-toggle').addEventListener('click', () => {
        toggleGroupCollapse(gid);
      });
    }
    applyViewModeLock();
    return;
  }

  if (!hasRow && !hasSel) {
    var hint = isTouchDevice
      ? 'Tap a row label to select it. Press and hold to reorder. Long-press for more options.'
      : 'Double-click a row label to edit. Drag to reorder. Right-click for more options.';
    $rowDetailsBody.innerHTML = `<p class="row-details-info">${hint}</p>`;
    return;
  }

  if (!hasRow && hasSel) {
    // Scenario 2: cell selected, no row selected.
    $rowDetailsBody.innerHTML = `
      <p class="row-details-info">Tap a row label to see row details.</p>
      ${buildCellEditorHTML()}
    `;
    bindCellEditorEvents();
    applyViewModeLock();
    return;
  }

  var row = state.rows[idx];

  // Build group section HTML — always show so users can create first group
  var currentGroupId = row.groupId || '';
  var groupSelectHTML = '';
  if (state.groups.length > 0) {
    var options = `<option value=""${currentGroupId === '' || currentGroupId === null ? ' selected' : ''}>Pinned</option>`;
    state.groups.forEach(g => {
      options += `<option value="${escAttr(g.id)}"${currentGroupId === g.id ? ' selected' : ''}>${esc(g.label)}</option>`;
    });
    groupSelectHTML = `
      <label class="field">
        <span class="field-label">Group</span>
        <select id="rd-group">${options}</select>
      </label>
    `;
  }
  var groupDropdownHTML = `
    <div class="row-detail-group-section" style="margin-top:6px;">
      ${groupSelectHTML}
      <div class="btn-row" style="margin-top:4px;">
        <button id="rd-new-group" class="btn btn-sm">+ New Group</button>
        <button id="rd-create-group-above" class="btn btn-sm">Create Group Above</button>
      </div>
    </div>
  `;

  $rowDetailsBody.innerHTML = `
    <div class="row-details-selection">
      <div class="row-detail-name-row">
        <input class="row-detail-name-input" type="text" id="rd-name" value="${escAttr(row.name)}"
          style="font-weight:${row.bold ? '700' : '400'};text-decoration:${row.underline ? 'underline' : 'none'};">
      </div>
      <div class="row-detail-toggles">
        <button id="rd-bold" class="${row.bold ? 'active' : ''}" title="Bold"><b>B</b></button>
        <button id="rd-underline" class="${row.underline ? 'active' : ''}" title="Underline"><u>U</u></button>
      </div>
      ${hasSel ? buildCellEditorHTML() : ''}
      <div class="row-detail-actions">
        <span class="row-detail-actions-label">Move to</span>
        <input type="number" class="row-detail-move-input" id="rd-move-target" min="1" max="${state.rows.length}" value="${idx + 1}">
        <button id="rd-move-btn" class="btn btn-sm">⏎</button>
        <span style="flex:1;"></span>
        <button id="rd-delete" class="btn btn-sm" style="color:#c0392b;">Delete</button>
      </div>
      ${groupDropdownHTML}
    </div>
  `;

  if (hasSel) bindCellEditorEvents();

  var nameInput = document.getElementById('rd-name');
  nameInput.addEventListener('input', () => {
    commitUndoNodeThrottled('Rename row');
    state.rows[idx].name = nameInput.value;
    var cell = $table.querySelector(`.sticky-left[data-storage-row="${idx}"]`);
    if (cell && !cell.classList.contains('cell-editing')) {
      cell.textContent = nameInput.value;
    }
    saveState();
  });

  document.getElementById('rd-bold').addEventListener('click', () => {
    commitUndoNode('Toggle bold');
    state.rows[idx].bold = !state.rows[idx].bold;
    nameInput.style.fontWeight = state.rows[idx].bold ? '700' : '400';
    renderTable();
    saveState();
  });

  document.getElementById('rd-underline').addEventListener('click', () => {
    commitUndoNode('Toggle underline');
    state.rows[idx].underline = !state.rows[idx].underline;
    nameInput.style.textDecoration = state.rows[idx].underline ? 'underline' : 'none';
    renderTable();
    saveState();
  });

  document.getElementById('rd-move-btn').addEventListener('click', () => {
    var target = Math.max(1, Math.min(state.rows.length, +document.getElementById('rd-move-target').value || 1)) - 1;
    if (target !== idx) {
      commitUndoNode('Move row');
      state.selectedRow = target;
      moveRow(idx, target);
      renderTable();
      saveState();
    }
  });

  document.getElementById('rd-delete').addEventListener('click', () => {
    commitUndoNode('Delete row');
    deleteRow(idx);
  });

  // Group dropdown
  var rdGroup = document.getElementById('rd-group');
  if (rdGroup) {
    rdGroup.addEventListener('change', () => {
      if (isReadOnly()) return;
      commitUndoNode('Move row to group');
      var val = rdGroup.value;
      state.rows[idx].groupId = val === '' ? null : val;
      renderTable();
      saveState();
    });
  }

  // New Group button
  var rdNewGroup = document.getElementById('rd-new-group');
  if (rdNewGroup) {
    rdNewGroup.addEventListener('click', () => {
      if (isReadOnly()) return;
      var name = prompt('Group name:', 'New Group');
      if (!name) return;
      commitUndoNode('Create group');
      var newGroup = { id: 'g_' + Date.now(), label: name.trim() || 'New Group', collapsed: false };
      state.groups.push(newGroup);
      state.rows[idx].groupId = newGroup.id;
      renderTable();
      saveState();
    });
  }

  // Create Group Above button
  var rdCreateAbove = document.getElementById('rd-create-group-above');
  if (rdCreateAbove) {
    rdCreateAbove.addEventListener('click', () => {
      if (isReadOnly()) return;
      var name = prompt('Group name:', 'New Group');
      if (!name) return;
      commitUndoNode('Create group');
      var newGroup = { id: 'g_' + Date.now(), label: name.trim() || 'New Group', collapsed: false };
      var currentGroupId = state.rows[idx].groupId;
      var currentGroupIdx = state.groups.findIndex(function(g) { return g.id === currentGroupId; });
      if (currentGroupIdx >= 0) {
        state.groups.splice(currentGroupIdx, 0, newGroup);
      } else {
        state.groups.unshift(newGroup);
      }
      state.rows[idx].groupId = newGroup.id;
      renderTable();
      saveState();
    });
  }

  // Re-apply view-mode lock since we just rebuilt the panel's inputs.
  applyViewModeLock();
}

// ── Inline Editing: Group label ─────────────────────
function startGroupLabelInlineEdit(tr, groupId) {
  var labelSpan = tr.querySelector('.group-label-text');
  if (!labelSpan) return;
  var group = state.groups.find(g => g.id === groupId);
  if (!group) return;

  var oldLabel = group.label;
  var td = labelSpan.closest('td');
  var toggleSpan = td.querySelector('.group-toggle');
  var toggleText = toggleSpan ? toggleSpan.textContent : '';

  td.innerHTML = '';
  if (toggleSpan) {
    var ts = document.createElement('span');
    ts.className = 'group-toggle';
    ts.textContent = toggleText;
    td.appendChild(ts);
  }
  var input = document.createElement('input');
  input.type = 'text';
  input.value = oldLabel;
  input.maxLength = 50;
  input.style.cssText = 'width:calc(100% - 24px);font:inherit;border:1px solid var(--border);padding:0 4px;box-sizing:border-box;';
  td.appendChild(input);
  input.focus();
  input.select();

  var commit = () => {
    var val = input.value.trim();
    if (val && val !== oldLabel) {
      commitUndoNode('Rename group');
      group.label = val;
    }
    renderTable();
    saveState();
  };
  var cancel = () => {
    renderTable();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); input.value = oldLabel; input.blur(); }
  });
  input.addEventListener('blur', commit);
  // Prevent click from bubbling to the group header row (which would toggle collapse)
  input.addEventListener('click', (e) => e.stopPropagation());
}

// ── Sidebar: Corner label field ────────────────────
function renderCornerLabelField() {
  var host = document.getElementById('corner-label-field');
  if (!host) return;
  if (!state.headerOverrides) state.headerOverrides = {};

  var parts = state.headerPatterns.map((hp, h) => {
    var key = `corner_${h}`;
    var hasOverride = Object.prototype.hasOwnProperty.call(state.headerOverrides, key)
      && state.headerOverrides[key] !== undefined;
    var overrideVal = hasOverride ? state.headerOverrides[key] : '';
    var autoVal = hp?.pattern || '';
    var multi = state.headerPatterns.length > 1;
    var labelText = multi ? `Corner label ${h}` : 'Corner label';
    return `
      <div class="field corner-label-field" data-index="${h}">
        <span class="field-label">${esc(labelText)}</span>
        <input type="text" class="corner-label-input" data-index="${h}"
          value="${escAttr(overrideVal)}"
          placeholder="${escAttr(autoVal)}">
        <button class="btn btn-sm corner-label-clear" data-index="${h}"
          title="Clear override" style="${hasOverride ? '' : 'visibility:hidden;'}">×</button>
      </div>
    `;
  }).join('');
  host.innerHTML = parts;

  host.querySelectorAll('.corner-label-input').forEach((inp) => {
    var i = +inp.dataset.index;
    inp.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit corner label');
      if (!state.headerOverrides) state.headerOverrides = {};
      var key = `corner_${i}`;
      var val = inp.value;
      var autoVal = state.headerPatterns[i]?.pattern || '';
      if (val === '' || val === autoVal) {
        delete state.headerOverrides[key];
      } else {
        state.headerOverrides[key] = val;
      }
      // Toggle clear-button visibility without full re-render to avoid
      // clobbering the input's focus/caret position.
      var clearBtn = host.querySelector(`.corner-label-clear[data-index="${i}"]`);
      if (clearBtn) {
        var has = Object.prototype.hasOwnProperty.call(state.headerOverrides, key);
        clearBtn.style.visibility = has ? '' : 'hidden';
      }
      renderTable();
      saveState();
    });
  });

  host.querySelectorAll('.corner-label-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isReadOnly()) return;
      var i = +btn.dataset.index;
      commitUndoNode('Clear corner label');
      if (state.headerOverrides) delete state.headerOverrides[`corner_${i}`];
      renderCornerLabelField();
      renderTable();
      saveState();
    });
  });
}

// ── Sidebar: Selected header cell override ─────────
function renderSelectedHeaderField() {
  var host = document.getElementById('selected-header-field');
  if (!host) return;
  var sel = state.selectedHeader;
  if (!sel) { host.innerHTML = ''; return; }
  var { h, c } = sel;
  if (!state.headerPatterns[h]) { host.innerHTML = ''; return; }
  if (!state.headerOverrides) state.headerOverrides = {};
  var key = `${h}_${c}`;
  var hasOverride = Object.prototype.hasOwnProperty.call(state.headerOverrides, key)
    && state.headerOverrides[key] !== undefined;
  var overrideVal = hasOverride ? state.headerOverrides[key] : '';
  var hp = state.headerPatterns[h];
  var autoVal = hp ? (getPatternValues(hp, c + 1)[c] || '') : '';
  var labelText = `Header [${h}, ${c + 1}]`;

  host.innerHTML = `
    <div class="field selected-header-field">
      <span class="field-label">${esc(labelText)}</span>
      <input type="text" class="selected-header-input"
        value="${escAttr(overrideVal)}"
        placeholder="${escAttr(autoVal)}">
      <button class="btn btn-sm selected-header-clear"
        title="Clear override" style="${hasOverride ? '' : 'visibility:hidden;'}">×</button>
    </div>
  `;

  var inp = host.querySelector('.selected-header-input');
  var clearBtn = host.querySelector('.selected-header-clear');

  inp.addEventListener('input', () => {
    commitUndoNodeThrottled('Edit header cell');
    var val = inp.value;
    if (val === '' || val === autoVal) {
      delete state.headerOverrides[key];
    } else {
      state.headerOverrides[key] = val;
    }
    var has = Object.prototype.hasOwnProperty.call(state.headerOverrides, key);
    if (clearBtn) clearBtn.style.visibility = has ? '' : 'hidden';
    renderTable();
    saveState();
  });

  clearBtn.addEventListener('click', () => {
    if (isReadOnly()) return;
    commitUndoNode('Clear header cell');
    delete state.headerOverrides[key];
    renderSelectedHeaderField();
    renderTable();
    saveState();
  });
}

// ── Sidebar: Pattern List ──────────────────────────
function renderPatternList() {
  $patternList.innerHTML = '';
  state.headerPatterns.forEach((hp, i) => {
    var container = document.createElement('div');

    var div = document.createElement('div');
    div.className = 'pattern-item';

    var options = PATTERN_NAMES.map((name) =>
      `<option value="${esc(name)}"${hp.pattern === name ? ' selected' : ''}>${esc(name)}</option>`
    ).join('');
    options += `<option value="自訂"${hp.pattern === '自訂' ? ' selected' : ''}>自訂</option>`;
    options += `<option value="映射"${hp.pattern === '映射' ? ' selected' : ''}>映射</option>`;

    if (hp.pattern === '自訂') {
      var valCount = hp.values ? hp.values.length : 0;
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <button class="btn btn-sm pat-edit-values" data-index="${i}">Edit values (${valCount})</button>
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    } else if (hp.pattern === '映射') {
      // Build source dropdown: all non-映射 rows except current
      var sourceOptions = '';
      state.headerPatterns.forEach((shp, si) => {
        if (si === i || shp.pattern === '映射') return;
        sourceOptions += `<option value="${si}"${hp.sourceIndex === si ? ' selected' : ''}>#${si}: ${esc(shp.pattern)}</option>`;
      });
      var mapCount = hp.mappings ? Object.keys(hp.mappings).length : 0;
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <select data-index="${i}" class="pat-source" style="width:70px;flex:0 0 70px;">${sourceOptions}</select>
        <button class="btn btn-sm pat-edit-map" data-index="${i}">Edit map (${mapCount})</button>
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    } else {
      var stepDisplay = hp.step > 0 ? '+' + hp.step : String(hp.step);
      div.innerHTML = `
        <select data-index="${i}" class="pat-select">${options}</select>
        <input type="number" class="pat-start" data-index="${i}" value="${hp.start}" title="Start" style="width:40px;">
        <input type="text" class="pat-step" data-index="${i}" value="${stepDisplay}" title="Step" style="width:44px;">
        <button class="pattern-item-btn pat-reset" data-index="${i}" title="Force-reinitialise this header row">↻</button>
        <button class="pattern-item-btn pat-del" data-index="${i}" title="Remove">✕</button>
      `;
    }

    container.appendChild(div);
    $patternList.appendChild(container);
  });

  bindPatternEvents();
  renderCornerLabelField();
  renderSelectedHeaderField();
}

function bindPatternEvents() {
  // Pattern type select — handles type switching
  $patternList.querySelectorAll('.pat-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      var i = +sel.dataset.index;
      var hp = state.headerPatterns[i];
      var oldType = hp.pattern;
      var newType = sel.value;
      var isStandard = (t) => t !== '自訂' && t !== '映射';

      if (oldType === newType) return;
      commitUndoNode('Change pattern');

      // Clean old type fields
      if (isStandard(oldType)) {
        delete hp.start; delete hp.step;
      } else if (oldType === '自訂') {
        delete hp.values;
      } else if (oldType === '映射') {
        delete hp.sourceIndex; delete hp.mappings;
      }

      // Set new type fields
      if (isStandard(newType)) {
        hp.start = 0; hp.step = 1;
      } else if (newType === '自訂') {
        hp.values = [''];
      } else if (newType === '映射') {
        hp.sourceIndex = 0; hp.mappings = {};
      }

      hp.pattern = newType;
      renderPatternList();
      renderTable();
      saveState();
    });
  });

  // Standard pattern controls
  $patternList.querySelectorAll('.pat-start').forEach((input) => {
    input.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit start');
      state.headerPatterns[+input.dataset.index].start = +input.value || 0;
      renderTable();
      saveState();
    });
  });

  $patternList.querySelectorAll('.pat-step').forEach((input) => {
    input.addEventListener('input', () => {
      commitUndoNodeThrottled('Edit step');
      var raw = input.value.replace(/^\+/, '');
      var val = parseInt(raw, 10);
      state.headerPatterns[+input.dataset.index].step = isNaN(val) ? 1 : val;
      renderTable();
      saveState();
    });
    input.addEventListener('blur', () => {
      var hp = state.headerPatterns[+input.dataset.index];
      input.value = hp.step > 0 ? '+' + hp.step : String(hp.step);
    });
  });

  // 映射 source dropdown
  $patternList.querySelectorAll('.pat-source').forEach((sel) => {
    sel.addEventListener('change', () => {
      commitUndoNode('Change source');
      var i = +sel.dataset.index;
      state.headerPatterns[i].sourceIndex = +sel.value;
      renderTable();
      saveState();
    });
  });

  // 自訂 value editor toggle
  $patternList.querySelectorAll('.pat-edit-values').forEach((btn) => {
    btn.addEventListener('click', () => {
      var i = +btn.dataset.index;
      var container = btn.closest('.pattern-item').parentNode;
      var existing = container.querySelector('.pat-custom-editor');
      if (existing) { existing.remove(); return; }
      var editor = buildCustomEditor(i);
      container.appendChild(editor);
    });
  });

  // 映射 mapping editor toggle
  $patternList.querySelectorAll('.pat-edit-map').forEach((btn) => {
    btn.addEventListener('click', () => {
      var i = +btn.dataset.index;
      var container = btn.closest('.pattern-item').parentNode;
      var existing = container.querySelector('.pat-mapping-editor');
      if (existing) { existing.remove(); return; }
      var editor = buildMappingEditor(i);
      container.appendChild(editor);
    });
  });

  // Force-reinitialise per type
  $patternList.querySelectorAll('.pat-reset').forEach((btn) => {
    btn.addEventListener('click', () => {
      commitUndoNode('Reset pattern');
      var i = +btn.dataset.index;
      var hp = state.headerPatterns[i];
      if (hp.pattern === '自訂') {
        hp.values = [''];
      } else if (hp.pattern === '映射') {
        hp.sourceIndex = 0;
        hp.mappings = {};
      } else {
        hp.start = 0;
        hp.step = 1;
      }
      // Clear all overrides for this header row
      if (state.headerOverrides) {
        var prefix = `${i}_`;
        var cornerKey = `corner_${i}`;
        Object.keys(state.headerOverrides).forEach((key) => {
          if (key.startsWith(prefix) || key === cornerKey) delete state.headerOverrides[key];
        });
      }
      renderPatternList();
      renderTable();
      saveState();
    });
  });

  // Delete pattern row with cascade
  $patternList.querySelectorAll('.pat-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      var i = +btn.dataset.index;
      if (state.headerPatterns.length <= 1) return;
      commitUndoNode('Delete pattern');
      state.headerPatterns.splice(i, 1);

      // Cascade: fix 映射 sourceIndex references
      state.headerPatterns.forEach((hp) => {
        if (hp.pattern !== '映射') return;
        if (hp.sourceIndex === i) {
          // Reset to first valid non-映射 row
          var found = 0;
          for (var j = 0; j < state.headerPatterns.length; j++) {
            if (state.headerPatterns[j].pattern !== '映射') { found = j; break; }
          }
          hp.sourceIndex = found;
        } else if (hp.sourceIndex > i) {
          hp.sourceIndex--;
        }
      });

      // Fix header overrides
      if (state.headerOverrides) {
        var newOv = {};
        Object.keys(state.headerOverrides).forEach((key) => {
          var m = key.match(/^(\d+)_(\d+)$/);
          var cm = key.match(/^corner_(\d+)$/);
          if (m) {
            var h = +m[1];
            if (h < i) newOv[key] = state.headerOverrides[key];
            else if (h > i) newOv[`${h - 1}_${m[2]}`] = state.headerOverrides[key];
          } else if (cm) {
            var h = +cm[1];
            if (h < i) newOv[key] = state.headerOverrides[key];
            else if (h > i) newOv[`corner_${h - 1}`] = state.headerOverrides[key];
          }
        });
        state.headerOverrides = newOv;
      }
      renderPatternList();
      renderTable();
      saveState();
    });
  });
}

// ── Sub-panel: 自訂 value editor ──────────────────────
function buildCustomEditor(patIndex) {
  var hp = state.headerPatterns[patIndex];
  if (!hp.values) hp.values = [''];
  var div = document.createElement('div');
  div.className = 'pat-custom-editor';

  function rebuild() {
    div.innerHTML = '';
    hp.values.forEach((val, vi) => {
      var row = document.createElement('div');
      row.className = 'pat-editor-row';
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = val;
      inp.addEventListener('input', () => {
        commitUndoNodeThrottled('Edit value');
        hp.values[vi] = inp.value;
        renderTable();
        saveState();
      });
      row.appendChild(inp);

      var del = document.createElement('button');
      del.className = 'pattern-item-btn';
      del.textContent = '✕';
      del.disabled = hp.values.length <= 1;
      del.addEventListener('click', () => {
        commitUndoNode('Delete value');
        hp.values.splice(vi, 1);
        rebuild();
        updateEditorButton();
        renderTable();
        saveState();
      });
      row.appendChild(del);
      div.appendChild(row);
    });

    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm';
    addBtn.textContent = '+ Add value';
    addBtn.addEventListener('click', () => {
      commitUndoNode('Add value');
      hp.values.push('');
      rebuild();
      updateEditorButton();
      renderTable();
      saveState();
    });
    div.appendChild(addBtn);
  }

  function updateEditorButton() {
    var btn = div.parentNode?.querySelector('.pat-edit-values');
    if (btn) btn.textContent = `Edit values (${hp.values.length})`;
  }

  rebuild();
  return div;
}

// ── Sub-panel: 映射 mapping editor ────────────────────
function buildMappingEditor(patIndex) {
  var hp = state.headerPatterns[patIndex];
  if (!hp.mappings) hp.mappings = {};
  var div = document.createElement('div');
  div.className = 'pat-mapping-editor';

  function rebuild() {
    div.innerHTML = '';

    // Header row
    var header = document.createElement('div');
    header.className = 'pat-editor-header';
    header.innerHTML = '<span>When</span><span style="margin-left:auto;margin-right:auto;">→</span><span>Show</span>';
    div.appendChild(header);

    var entries = Object.entries(hp.mappings);
    entries.forEach(([key, val]) => {
      var row = document.createElement('div');
      row.className = 'pat-editor-row';

      var keyInp = document.createElement('input');
      keyInp.type = 'text';
      keyInp.value = key;
      var originalKey = key;
      keyInp.addEventListener('focus', () => { originalKey = keyInp.value; });
      keyInp.addEventListener('blur', () => {
        var newKey = keyInp.value;
        if (newKey !== originalKey) {
          commitUndoNode('Edit mapping');
          delete hp.mappings[originalKey];
          if (newKey !== '') {
            hp.mappings[newKey] = val;
          }
          rebuild();
          updateEditorButton();
          renderTable();
          saveState();
        }
      });
      row.appendChild(keyInp);

      var arrow = document.createElement('span');
      arrow.className = 'pat-arrow';
      arrow.textContent = '→';
      row.appendChild(arrow);

      var valInp = document.createElement('input');
      valInp.type = 'text';
      valInp.value = val;
      valInp.addEventListener('input', () => {
        commitUndoNodeThrottled('Edit mapping');
        hp.mappings[key] = valInp.value;
        renderTable();
        saveState();
      });
      row.appendChild(valInp);

      var del = document.createElement('button');
      del.className = 'pattern-item-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        commitUndoNode('Delete mapping');
        delete hp.mappings[key];
        rebuild();
        updateEditorButton();
        renderTable();
        saveState();
      });
      row.appendChild(del);
      div.appendChild(row);
    });

    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm';
    addBtn.textContent = '+ Add mapping';
    addBtn.addEventListener('click', () => {
      commitUndoNode('Add mapping');
      hp.mappings[''] = '';
      rebuild();
      updateEditorButton();
      renderTable();
      saveState();
    });
    div.appendChild(addBtn);
  }

  function updateEditorButton() {
    var btn = div.parentNode?.querySelector('.pat-edit-map');
    if (btn) btn.textContent = `Edit map (${Object.keys(hp.mappings).length})`;
  }

  rebuild();
  return div;
}

// ── Zoom System ────────────────────────────────────
function setZoom(z) {
  state.zoom = Math.max(0.5, Math.min(3, +z.toFixed(2)));
  document.documentElement.style.setProperty('--zoom', state.zoom);
  saveState();
}

// ── Style Application ──────────────────────────────
function applyStyles() {
  var root = document.documentElement;
  root.style.setProperty('--font', `"${state.font}", "Sarasa Gothic CL", "Noto Sans CJK SC", sans-serif`);

  // Accent colour
  root.style.setProperty('--accent', state.color);

  // Border: rgba(0,0,0,a) on white that visually matches the accent grey
  var r = parseInt(state.color.slice(1, 3), 16);
  var g = parseInt(state.color.slice(3, 5), 16);
  var b = parseInt(state.color.slice(5, 7), 16);
  var avg = (r + g + b) / 3;
  var borderOpacity = Math.max(0.02, 1 - avg / 255).toFixed(3);
  root.style.setProperty('--border', `rgba(0,0,0,${borderOpacity})`);

  // Text on accent: luminance-based
  var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty('--accent-text', luminance > 0.5 ? '#000' : '#fff');

  // 4-tier rollout: t2 (stripe), t3 (header), t3-solid (wrapper bg), t4 (UI hover).
  root.style.setProperty('--t2', `rgba(${r},${g},${b},0.18)`);
  root.style.setProperty('--t3', `rgba(${r},${g},${b},0.65)`);
  var t3r = Math.round(r * 0.65 + 255 * 0.35);
  var t3g = Math.round(g * 0.65 + 255 * 0.35);
  var t3b = Math.round(b * 0.65 + 255 * 0.35);
  root.style.setProperty('--t3-solid', `rgb(${t3r},${t3g},${t3b})`);
  root.style.setProperty('--t4', state.color);

  document.getElementById('app').dataset.colorTarget = state.colorTarget;
}

// ── Confirm Dialog ─────────────────────────────────
function showConfirm(msg, yesLabel, noLabel) {
  if (yesLabel === undefined) yesLabel = 'Overwrite';
  if (noLabel === undefined) noLabel = 'Cancel';
  return new Promise((resolve) => {
    var overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    overlay.style.display = '';

    var yes = document.getElementById('confirm-yes');
    var no = document.getElementById('confirm-no');
    yes.textContent = yesLabel;
    no.textContent = noLabel;

    var cleanup = () => { overlay.style.display = 'none'; yes.onclick = null; no.onclick = null; };
    yes.onclick = () => { cleanup(); resolve(true); };
    no.onclick = () => { cleanup(); resolve(false); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    }, { once: true });
  });
}

// ── Toast ──────────────────────────────────────────
function showToast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  var div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => {
    div.classList.add('fade-out');
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ── Layout Mode ────────────────────────────────────
function updateLayoutMode() {
  var wasBottom = isBottomMode;
  isBottomMode = mql.matches;

  if (isBottomMode && !wasBottom) {
    $sidepanel.style.width = '';
    $sidepanel.style.minWidth = '';
    $sidepanel.style.height = _lastBottomPanelHeight + 'px';
    document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
      _savedPanelStates[p.dataset.tabId] = p.open;
      p.open = true;
    });
    var activeTab = null;
    for (var tabId in _savedPanelStates) {
      if (_savedPanelStates[tabId] && !activeTab) activeTab = tabId;
    }
    setActiveTab(activeTab || 'rows');
  } else if (!isBottomMode && wasBottom) {
    $sidepanel.style.height = '';
    if (!$sidepanel.classList.contains('collapsed')) {
      $sidepanel.style.width = _lastSidepanelWidth + 'px';
      $sidepanel.style.minWidth = _lastSidepanelWidth + 'px';
    }
    document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
      if (_savedPanelStates.hasOwnProperty(p.dataset.tabId)) {
        p.open = _savedPanelStates[p.dataset.tabId];
      }
      p.classList.remove('active-tab');
    });
  }
}

function setActiveTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.bottom-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  // Update panels
  document.querySelectorAll('.sidepanel-content .panel').forEach(p => {
    p.classList.toggle('active-tab', p.dataset.tabId === tabId);
    if (p.dataset.tabId === tabId) {
      p.open = true;  // Force open so content is visible
    }
  });
  // Expand sidepanel if collapsed
  if ($sidepanel.classList.contains('collapsed') && isBottomMode) {
    $sidepanel.classList.remove('collapsed');
    $sidepanel.style.height = _lastBottomPanelHeight + 'px';
  }
  // Task 3: auto-scroll history panel to current node when Hist tab opens.
  if (tabId === 'hist') {
    scrollHistoryToCurrentNode();
  }
}

// Find a today column index (0-based) if one exists in the current pattern.
function findTodayColumnIndex() {
  var hpats = state.headerPatterns;
  for (var h = 0; h < hpats.length; h++) {
    if (!isCornerCellToday(h)) continue;
    var todayDate = new Date().getDate();
    var allVals = getPatternValues(hpats[h], state.cols);
    for (var c = 0; c < allVals.length; c++) {
      if (String(allVals[c]) === String(todayDate)) return c;
    }
  }
  return -1;
}

// Scroll the spreadsheet wrapper so today's column is visible (roughly centred).
function scrollToTodayColumn() {
  var colIdx = findTodayColumnIndex();
  if (colIdx < 0) return;
  var th = $table.querySelector(`thead th[data-col="${colIdx}"]`);
  if (!th) return;
  var thRect = th.getBoundingClientRect();
  var wrapRect = $wrapper.getBoundingClientRect();
  var thCentreRelative = (th.offsetLeft + th.offsetWidth / 2);
  var targetScrollLeft = thCentreRelative - (wrapRect.width / 2);
  $wrapper.scrollLeft = Math.max(0, targetScrollLeft);
}

// Scroll the history panel so the current node is visible.
function scrollHistoryToCurrentNode() {
  var panel = document.getElementById('history-panel');
  if (!panel) return;
  var currentEl = panel.querySelector('.history-node.current');
  if (currentEl) {
    requestAnimationFrame(() => {
      currentEl.scrollIntoView({ block: 'nearest' });
    });
  }
}
