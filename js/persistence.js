/*
 * Copyright 2026 Daakaa Contributors
 * Licensed under the Apache License, Version 2.0
 */

// ── Persistence ────────────────────────────────────
var _lastSavedAt = 0;
var _lastModifiedAt = 0;

function saveState() {
  try {
    var s = { ...state };
    delete s.selectedRow;
    delete s.selectedGroup;
    delete s.selection;
    delete s.anchor;
    delete s.viewMode;
    localStorage.setItem('daakaa-state', JSON.stringify(s));
  } catch (_) {}
  saveUndoTree();
  _lastSavedAt = Date.now();
  updateLastSavedDisplay();
}

// Format elapsed time as a short relative string.
function formatRelativeTime(ts) {
  if (!ts) return '';
  var sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return sec + 's ago';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  var hr = Math.floor(min / 60);
  return hr + 'h ago';
}

function updateLastSavedDisplay() {
  var el = document.getElementById('last-saved-display');
  if (!el) return;
  var parts = [];
  if (_lastModifiedAt) parts.push('Modified ' + formatRelativeTime(_lastModifiedAt));
  if (_lastSavedAt) parts.push('Saved ' + formatRelativeTime(_lastSavedAt));
  el.textContent = parts.join(' · ');
}

// Periodically refresh the relative time display.
setInterval(updateLastSavedDisplay, 30000);

function loadState() {
  try {
    var raw = localStorage.getItem('daakaa-state');
    if (!raw) return;
    var s = JSON.parse(raw);
    if (s.cols) state.cols = s.cols;
    if (s.headerPatterns) state.headerPatterns = s.headerPatterns;
    if (s.rows) state.rows = s.rows;
    if (s.cells) state.cells = s.cells;
    if (s.font) state.font = s.font;
    if (s.color) state.color = s.color;
    if (s.colorTarget) state.colorTarget = s.colorTarget;
    if (typeof s.zoom === 'number') state.zoom = s.zoom;
    if (typeof s.altCols === 'boolean') state.altCols = s.altCols;
    if (typeof s.altRows === 'boolean') state.altRows = s.altRows;
    if (s.headerOverrides) state.headerOverrides = s.headerOverrides;
    if (Array.isArray(s.groups)) state.groups = s.groups;
    if (typeof s.pinnedCollapsed === 'boolean') state.pinnedCollapsed = s.pinnedCollapsed;
    if (typeof s.otherCollapsed === 'boolean') state.otherCollapsed = s.otherCollapsed;
    if (s.pattern && !s.headerPatterns) {
      state.headerPatterns = [{ pattern: s.pattern, start: s.patternStart || 0, step: s.patternStep || 1 }];
    }
  } catch (_) {}
}

function syncSidepanelFromState() {
  $colCount.value = state.cols;
  $fontFamily.value = state.font;
  $themeColor.value = state.color;
  $colorTarget.value = state.colorTarget;
  $altColsToggle.checked = state.altCols;
  $table.classList.toggle('alt-cols', state.altCols);
  if ($altRowsToggle) $altRowsToggle.checked = state.altRows;
  $table.classList.toggle('alt-rows', state.altRows);
}

// ── Check if table has content ─────────────────────
function tableHasContent() {
  if (Object.keys(state.cells).length > 0) return true;
  for (var _i = 0; _i < state.rows.length; _i++) {
    var row = state.rows[_i];
    if (row.name && !row.name.match(/^Item \d+$/)) return true;
  }
  return false;
}

// ── Gzip compression helpers ───────────────────────
async function compressToGzip(text) {
  var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function decompressGzip(blob) {
  var stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ── Project Export (.daakaa) ───────────────────────
async function handleProjectExport() {
  var includeHistory = await showConfirm('Include undo history in export?', 'Yes', 'No');

  var project = {
    version: 2,
    timestamp: Date.now(),
    cols: state.cols,
    rows: state.rows,
    cells: state.cells,
    headerPatterns: state.headerPatterns,
    headerOverrides: state.headerOverrides,
    font: state.font,
    color: state.color,
    colorTarget: state.colorTarget,
    altCols: state.altCols,
    altRows: state.altRows,
    zoom: state.zoom,
    groups: state.groups,
    pinnedCollapsed: state.pinnedCollapsed,
    otherCollapsed: state.otherCollapsed,
  };

  if (includeHistory) {
    project.history = {
      undoTree: undoTree,
      undoCurrentId: undoCurrentId,
      undoNextId: undoNextId,
      lastVisitedChild: lastVisitedChild,
    };
  }

  var json = JSON.stringify(project);
  var blob = await compressToGzip(json);
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'daakaa-project.daakaa.gz';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Unified Import (auto-detect file type) ─────────
async function handleUnifiedImport() {
  var file = $importFileInput.files[0];
  if (!file) return;
  $importFileInput.value = '';
  var name = file.name.toLowerCase();
  if (name.endsWith('.daakaa.gz') || name.endsWith('.daakaa.json') || name.endsWith('.json') || name.endsWith('.gz')) {
    await handleProjectImport(file);
  } else {
    await handleImport(file);
  }
}

// ── Project Import (.daakaa) ───────────────────────
async function handleProjectImport(file) {
  if (!file) return;

  if (tableHasContent()) {
    var ok = await showConfirm('The current project has data. Overwrite?');
    if (!ok) return;
  }

  // Support both .gz (compressed) and .json (legacy/uncompressed)
  var text;
  if (file.name.endsWith('.gz')) {
    text = await decompressGzip(file);
  } else {
    text = await file.text();
  }
  try {
    var project = JSON.parse(text);

    // Restore document state
    if (project.cols) state.cols = project.cols;
    if (project.rows) state.rows = project.rows;
    if (project.cells) state.cells = project.cells;
    if (project.headerPatterns) state.headerPatterns = project.headerPatterns;
    if (project.headerOverrides) state.headerOverrides = project.headerOverrides;

    // Restore grouping state (with defaults for v1 imports)
    state.groups = Array.isArray(project.groups) ? project.groups : [];
    state.pinnedCollapsed = typeof project.pinnedCollapsed === 'boolean' ? project.pinnedCollapsed : false;
    state.otherCollapsed = typeof project.otherCollapsed === 'boolean' ? project.otherCollapsed : false;

    // Restore settings
    if (project.font) state.font = project.font;
    if (project.color) state.color = project.color;
    if (project.colorTarget) state.colorTarget = project.colorTarget;
    if (typeof project.altCols === 'boolean') state.altCols = project.altCols;
    if (typeof project.altRows === 'boolean') state.altRows = project.altRows; else state.altRows = false;
    if (typeof project.zoom === 'number') state.zoom = project.zoom;

    // Restore history if present
    if (project.history) {
      undoTree = project.history.undoTree || {};
      undoCurrentId = project.history.undoCurrentId ?? 0;
      undoNextId = project.history.undoNextId ?? 1;
      lastVisitedChild = project.history.lastVisitedChild || {};
      if (!undoTree[undoCurrentId]) createRootNode();
    } else {
      createRootNode();
    }

    state.selectedRow = null;
    state.selectedGroup = null;
    state.selection = null;
    state.anchor = null;

    // Sync UI
    syncSidepanelFromState();
    applyStyles();
    setZoom(state.zoom);
    renderPatternList();
    renderTable();
    renderHistoryPanel();
    saveState();
    saveUndoTree();

    showToast('Project imported.');
  } catch (err) {
    showToast('Import failed: ' + err.message);
  }
}

// ── XLSX Import ────────────────────────────────────
async function handleImport(file) {
  if (!file) return;

  if (tableHasContent()) {
    var ok = await showConfirm('The current table contains data. Overwrite with the imported file?');
    if (!ok) return;
  }

  var arrayBuf = await file.arrayBuffer();

  try {
    if (typeof XLSX === 'undefined') { showToast('XLSX library not loaded.'); return; }

    var data = new Uint8Array(arrayBuf);
    var wb = XLSX.read(data, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var json = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (!json || json.length < 2) { showToast('Empty or invalid spreadsheet.'); return; }

    // ── Read bold/underline via ExcelJS ──
    var cellStyles = {}; // { "r_c": { bold, underline } }
    if (typeof ExcelJS !== 'undefined') {
      try {
        var exWb = new ExcelJS.Workbook();
        await exWb.xlsx.load(arrayBuf);
        var exWs = exWb.worksheets[0];
        if (exWs) {
          exWs.eachRow((row, rowNum) => {
            row.eachCell((cell, colNum) => {
              var font = cell.font;
              if (font && (font.bold || font.underline)) {
                cellStyles[`${rowNum}_${colNum}`] = {
                  bold: !!font.bold,
                  underline: !!font.underline,
                };
              }
            });
          });
        }
      } catch (exErr) {
        console.warn('ExcelJS style read failed, continuing without styles:', exErr);
      }
    }

    // ── Detect header rows ──
    var headerRows = [];
    var dataStartRow = 0;

    for (var r = 0; r < json.length; r++) {
      var row = json[r];
      if (!row || row.length <= 1) { dataStartRow = r; break; }

      var cornerVal = row[0];
      var values = row.slice(1).map((v) => v === null || v === undefined ? '' : v);

      var detected = detectPatternFromValues(values);
      var cornerPattern = detectCornerPattern(cornerVal);

      if (detected || cornerPattern) {
        headerRows.push({ row: r, cornerVal: cornerVal, values: values, detected: detected, cornerPattern: cornerPattern });
        dataStartRow = r + 1;
      } else {
        break;
      }
    }

    if (headerRows.length === 0) {
      headerRows.push({
        row: 0,
        cornerVal: json[0][0],
        values: json[0].slice(1),
        detected: null,
        cornerPattern: null,
      });
      dataStartRow = 1;
    }

    // ── Build header patterns ──
    var newPatterns = [];
    var newOverrides = {};
    var numCols = Math.max(...json.map((r) => r.length)) - 1;

    headerRows.forEach((hr, idx) => {
      var pat = null;

      if (hr.detected) {
        pat = hr.detected;
      } else if (hr.cornerPattern) {
        var valDetected = detectPatternFromValues(hr.values);
        if (valDetected) {
          pat = valDetected;
        } else {
          pat = { pattern: '数字', start: 0, step: 1 };
          hr.values.forEach((v, c) => {
            if (v !== '' && v !== undefined) {
              newOverrides[`${idx}_${c}`] = String(v);
            }
          });
        }
      } else {
        pat = { pattern: '数字', start: 0, step: 1 };
        hr.values.forEach((v, c) => {
          if (v !== '' && v !== undefined) {
            newOverrides[`${idx}_${c}`] = String(v);
          }
        });
      }

      newPatterns.push(pat);

      var cornerStr = (hr.cornerVal !== undefined && hr.cornerVal !== null) ? String(hr.cornerVal) : '';
      if (cornerStr !== '' && cornerStr !== pat.pattern) {
        newOverrides[`corner_${idx}`] = cornerStr;
      }
    });

    // ── Build data rows with bold/underline detection ──
    var dropped = [];
    var newRows = [];
    var newCells = {};

    for (var r = dataStartRow; r < json.length; r++) {
      var rowData = json[r];
      if (!rowData || rowData.length === 0) continue;
      var name = String(rowData[0] || `Item ${newRows.length + 1}`);

      var exRow = r + 1;
      var exCol = 1;
      var style = cellStyles[`${exRow}_${exCol}`] || {};

      newRows.push({
        name: name,
        bold: !!style.bold,
        underline: !!style.underline,
      });

      var rowIdx = newRows.length - 1;
      for (var c = 1; c < rowData.length && c <= numCols; c++) {
        var val = rowData[c] === null || rowData[c] === undefined ? '' : String(rowData[c]);
        if (val === '' || CYCLE.includes(val) || /^←\d+✓$/.test(val)) {
          if (val !== '') {
            if (!newCells[rowIdx]) newCells[rowIdx] = {};
            newCells[rowIdx][c - 1] = val;
          }
        } else {
          dropped.push(`Row ${r + 1}, Col ${c + 1}: "${val}"`);
        }
      }
    }

    commitUndoNode('Import');
    state.cols = numCols || state.cols;
    state.rows = newRows.length > 0 ? newRows : state.rows;
    state.cells = newCells;
    state.headerPatterns = newPatterns.length > 0 ? newPatterns : state.headerPatterns;
    state.headerOverrides = newOverrides;
    state.selectedRow = null;
    state.selectedGroup = null;
    state.selection = null;
    state.anchor = null;
    state.groups = [];
    state.pinnedCollapsed = false;
    state.otherCollapsed = false;

    $colCount.value = state.cols;
    renderPatternList();
    renderTable();
    saveState();

    if (dropped.length > 0) {
      showToast(`Imported. Dropped ${dropped.length} non-conforming cell(s).`);
      console.log('Dropped cells:', dropped);
    } else {
      showToast('Imported successfully.');
    }
  } catch (err) {
    showToast('Import failed: ' + err.message);
    console.error(err);
  }
}

// ── XLSX Export (styled, via ExcelJS) ──────────────
async function handleExport() {
  if (typeof ExcelJS === 'undefined') { showToast('ExcelJS library not loaded.'); return; }

  var cols = state.cols;
  var rows = state.rows;
  var hpats = state.headerPatterns;
  var fontName = state.font || 'Sarasa UI CL';

  var accentHex = state.color.replace('#', '').toUpperCase();
  var accentARGB = 'FF' + accentHex;

  var ar = parseInt(accentHex.slice(0, 2), 16);
  var ag = parseInt(accentHex.slice(2, 4), 16);
  var ab = parseInt(accentHex.slice(4, 6), 16);
  var lum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  var accentTextARGB = lum > 0.5 ? 'FF000000' : 'FFFFFFFF';

  var avg = (ar + ag + ab) / 3;
  var borderGrey = Math.round(avg);
  var borderARGB = 'FF' + [borderGrey, borderGrey, borderGrey].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

  var accentFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentARGB } };
  var thinBorder = { style: 'thin', color: { argb: borderARGB } };
  var thickBorder = { style: 'medium', color: { argb: 'FF000000' } };

  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Daakaa');
  wb.properties = { defaultFont: { name: fontName, size: 11 } };

  var totalCols = cols + 1;

  // Write header rows
  hpats.forEach((_, h) => {
    var rowData = [getCornerCellValue(h)];
    for (var c = 0; c < cols; c++) rowData.push(getHeaderCellValue(h, c));
    var exRow = ws.addRow(rowData);
    exRow.height = 20;

    exRow.eachCell((cell, colNum) => {
      cell.font = { name: fontName, size: 11, bold: true, color: { argb: accentTextARGB } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = accentFill;

      var isLastHeaderRow = h === hpats.length - 1;
      var isFirstCol = colNum === 1;

      cell.border = {
        top: thinBorder,
        left: thinBorder,
        right: isFirstCol ? thickBorder : thinBorder,
        bottom: isLastHeaderRow ? thickBorder : thinBorder,
      };
    });
  });

  // Write data rows
  rows.forEach((row, r) => {
    var rowData = [row.name];
    for (var c = 0; c < cols; c++) rowData.push(getCellValue(r, c));
    var exRow = ws.addRow(rowData);
    exRow.height = 20;

    exRow.eachCell((cell, colNum) => {
      cell.font = {
        name: fontName,
        size: 11,
        bold: colNum === 1 ? row.bold : false,
        underline: colNum === 1 ? row.underline : false,
        color: { argb: 'FF000000' },
      };

      if (colNum === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          right: thickBorder,
          bottom: thinBorder,
        };
        if (state.colorTarget === 'all') {
          cell.fill = accentFill;
          cell.font.color = { argb: accentTextARGB };
        }
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          right: thinBorder,
          bottom: thinBorder,
        };

        var val = String(cell.value || '');
        if (val === '✓') cell.font.color = { argb: 'FF2D8A4E' };
        else if (val === '×') cell.font.color = { argb: 'FFC0392B' };
        else if (val === '〇') cell.font.color = { argb: 'FF2980B9' };
        else if (val === '—') cell.font.color = { argb: borderARGB };

        if (state.altCols && colNum % 2 === 0) {
          cell.fill = accentFill;
        }
      }
    });
  });

  // Column widths
  ws.getColumn(1).width = 14;
  for (var c = 2; c <= totalCols; c++) ws.getColumn(c).width = 6;

  // Generate and download
  var buffer = await wb.xlsx.writeBuffer();
  var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'daakaa.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
