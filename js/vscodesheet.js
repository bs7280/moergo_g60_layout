/*
 * VS Code cheat sheet — same idea as js/wmsheet.js (draw the layer as what
 * it DOES, not what it emits), pointed at data/vscode-actions.js instead.
 *
 * Simpler than the WM sheet in one way (no auto-detection — see
 * js/vscodejoin.js) and slightly different in another: WM has one primary
 * layer + an auto-found sibling; here both `VSCode_macOS` and
 * `VSCode_Win` are known up front, so there's an explicit OS toggle for
 * the board instead of always drawing whichever layer `findLayer()` picked.
 */
(function () {
  'use strict';

  var Geo = window.G80Geometry;
  var Codes = window.G80Keycodes;
  var Parse = window.G80Parse;
  var Render = window.G80Render;
  var Join = window.G80VSCodeJoin;
  var BOARD = Geo.BOARD;

  var LS = { theme: 'g80.theme', legend: 'g80.vscode.legend', os: 'g80.vscode.os' };
  var MODES = ['action', 'chord', 'base'];
  var MODE_LABEL = { action: 'Actions', chord: 'Chords', base: 'Base letters' };

  var $ = function (s) { return document.querySelector(s); };

  var state = {
    mode: localStorage.getItem(LS.legend) || 'action',
    os: localStorage.getItem(LS.os) || 'mac',
    model: null,
    macLayer: null,
    winLayer: null,
    actions: [],
    doors: { into: [], outof: [] }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function emitLabel(raw, os) {
    var ctx = Join.ctxOf(state.model);
    ctx.os = os || 'mac';
    var f = Codes.format(raw, ctx);
    if (f.cls === 'trans' || f.cls === 'none') return null;
    return ((f.top ? f.top + ' ' : '') + (f.main || '')).trim() || null;
  }

  function posName(i) {
    var k = BOARD.keys[i];
    return k ? BOARD.posLabel(k) : '#' + i;
  }

  function currentLayer() { return state.os === 'win' ? state.winLayer : state.macLayer; }
  function currentChordField() { return state.os === 'win' ? 'winKey' : 'key'; }

  // ------------------------------------------------------------------ board

  function renderBoard() {
    var layerIdx = currentLayer();
    var legends = {};
    var extra = {};

    state.actions.forEach(function (a) {
      var p = a.pos;
      var base = Join.baseKey(state.model, p);
      var chord = a[currentChordField()] || a.key;
      var main = a.label;
      var sub = chord;
      if (state.mode === 'chord') { main = chord; sub = a.label; }
      else if (state.mode === 'base') { main = base || '·'; sub = a.label; }
      legends[p] = { top: a.group, main: main, sub: sub, cls: 'layer', desc: a.prompt };
      extra[p] = 'p-key';
    });

    state.doors.into.forEach(function (d) {
      if (legends[d.pos]) return;
      legends[d.pos] = {
        top: d.kind,
        main: Join.baseKey(state.model, d.pos) || '#' + d.pos,
        sub: '', cls: 'layer',
        desc: 'Enters the layer (' + d.kind + ')'
      };
      extra[d.pos] = 'p-hold';
    });
    state.doors.outof.forEach(function (d) {
      legends[d.pos] = {
        top: d.kind,
        main: state.model.layerNames[d.target] || String(d.target),
        sub: '', cls: 'layer', desc: String(d.raw)
      };
      extra[d.pos] = 'p-exit';
    });

    $('#stage').innerHTML = layerIdx == null ? '' : Render.board(state.model, {
      board: BOARD, layer: layerIdx, os: state.os === 'win' ? 'pc' : 'mac',
      showTrans: false, legends: legends, extraClass: extra
    });
  }

  // ------------------------------------------------------------------ table

  function renderSheet() {
    var groups = {};
    state.actions.forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });

    var macName = state.macLayer != null ? state.model.layerNames[state.macLayer] : null;
    var winName = state.winLayer != null ? state.model.layerNames[state.winLayer] : null;

    var html = '<table class="sheet"><thead><tr>' +
      '<th>action</th><th>key</th>' +
      (macName ? '<th>' + esc(macName) + '</th>' : '') +
      (winName ? '<th>' + esc(winName) + '</th>' : '') +
      '<th>command</th>' +
      '</tr></thead><tbody>';
    var cols = 2 + (macName ? 1 : 0) + (winName ? 1 : 0) + 1;

    Object.keys(groups).forEach(function (g) {
      html += '<tr class="grouprow"><td colspan="' + cols + '">' + esc(g) + '</td></tr>';
      groups[g].forEach(function (a) {
        function cell(layerIdx, os) {
          var raw = layerIdx == null ? null : state.model.layers[layerIdx][a.pos];
          var emits = raw ? emitLabel(raw, os) : null;
          return '<td>' + (emits ? '<code>' + esc(emits) + '</code>' : '<span class="miss">—</span>') + '</td>';
        }
        var base = Join.baseKey(state.model, a.pos);
        html += '<tr><td>' + esc(a.prompt || a.label) + '</td>' +
          '<td class="keys"><b>' + esc(base || '#' + a.pos) + '</b></td>' +
          (macName ? cell(state.macLayer, 'mac') : '') +
          (winName ? cell(state.winLayer, 'pc') : '') +
          '<td class="dim">' + esc(a.command || '') + '</td></tr>';
      });
    });

    html += '</tbody></table>';
    $('#sheet').innerHTML = html;
  }

  function renderDoors() {
    if (!state.doors.into.length && !state.doors.outof.length) {
      $('#entry').innerHTML = '';
      return;
    }
    function collapse(doors) {
      var seen = {}, out = [];
      doors.forEach(function (d) {
        var k = d.pos + '/' + d.kind + '/' + d.target;
        if (seen[k]) { seen[k].on.push(state.model.layerNames[d.layer]); return; }
        seen[k] = { d: d, on: [state.model.layerNames[d.layer]] };
        out.push(seen[k]);
      });
      return out;
    }
    function line(e, dir) {
      var d = e.d;
      var base = Join.baseKey(state.model, d.pos);
      var suffix = dir === 'out'
        ? ' <span class="dim">&rarr; ' + esc(state.model.layerNames[d.target]) + '</span>'
        : '';
      return '<span class="door"><b>' + esc(base || '#' + d.pos) + '</b>' +
        '<span class="dim"> ' + esc(posName(d.pos)) + ' on ' + esc(e.on.join(', ')) + '</span> ' +
        '<em>' + esc(d.kind) + '</em>' + suffix + '</span>';
    }
    $('#entry').innerHTML =
      '<div class="doors"><span class="lbl">in</span>' +
        collapse(state.doors.into).map(function (e) { return line(e, 'in'); }).join('') + '</div>' +
      '<div class="doors"><span class="lbl">out</span>' +
        collapse(state.doors.outof).map(function (e) { return line(e, 'out'); }).join('') + '</div>';
  }

  function renderNote() {
    $('#btn-legend').textContent = MODE_LABEL[state.mode];
    $('#btn-os').textContent = state.os === 'win' ? 'Windows' : 'macOS';
    var layerIdx = currentLayer();
    var note;
    if (layerIdx == null) {
      note = 'No <code>VSCode_' + (state.os === 'win' ? 'Win' : 'macOS') + '</code> layer in this layout.';
    } else {
      note = '<b>' + esc(state.model.layerNames[layerIdx]) + '</b> (layer ' + layerIdx + ') — ' +
        state.actions.length + ' bound positions. Labels come from ' +
        '<code>data/vscode-actions.js</code>; positions come from the layout. ' +
        'Toggle "macOS/Windows" to see the other OS\'s chords — 5 of 20 differ by OS, the rest are identical.';
    }
    $('#srcnote').innerHTML = note;
  }

  function renderAll() { renderNote(); renderDoors(); renderBoard(); renderSheet(); }

  // ------------------------------------------------------------------- boot

  document.documentElement.setAttribute('data-theme', localStorage.getItem(LS.theme) || 'dark');
  $('#btn-theme').textContent =
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark';

  var src = localStorage.getItem('g80.src') || window.G80_LAYOUT_SOURCE;
  if (src) {
    var m = Parse.parseAuto(src, { title: 'layout' });
    if (!m.error && m.ok !== false) state.model = m;
  }

  if (!state.model) {
    $('#srcnote').innerHTML = 'No layout loaded — run <code>node tools/bake.js</code>, ' +
      'or drag an export onto the <a href="index.html">viewer</a> first.';
  } else {
    var joined = Join.plan(state.model, window.G80_VSCODE_ACTIONS || []);
    state.macLayer = joined.macLayer;
    state.winLayer = joined.winLayer;
    state.actions = joined.actions;
    state.doors = Join.doors(state.model, currentLayer());

    $('#btn-legend').onclick = function () {
      state.mode = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
      localStorage.setItem(LS.legend, state.mode);
      renderNote();
      renderBoard();
    };
    $('#btn-os').onclick = function () {
      state.os = state.os === 'win' ? 'mac' : 'win';
      localStorage.setItem(LS.os, state.os);
      state.doors = Join.doors(state.model, currentLayer());
      renderAll();
    };
    $('#btn-theme').onclick = function () {
      var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(LS.theme, t);
      $('#btn-theme').textContent = t === 'dark' ? 'Light' : 'Dark';
    };

    renderAll();
  }
})();
