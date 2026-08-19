/*
 * WM cheat sheet — the layer drawn as what it *does*, not what it emits.
 *
 * Everything here is read off the keymap through js/wmjoin.js: which layer is
 * the WM layer, which positions carry which action, and which keys get you in
 * and out. Nothing is hardcoded, so re-baking a changed layout redraws this
 * correctly without anyone editing it.
 *
 * This is the browser half of the cheat-sheet idea in PLAN.md §7c. The Rust
 * popup would add "and float it over your desktop without taking focus", which
 * is the expensive 90%; the join itself is already done here.
 */
(function () {
  'use strict';

  var Geo = window.G80Geometry;
  var Codes = window.G80Keycodes;
  var Parse = window.G80Parse;
  var Render = window.G80Render;
  var Join = window.G80WMJoin;
  var BOARD = Geo.BOARD;

  var LS = { theme: 'g80.theme', legend: 'g80.wm.legend' };
  var MODES = ['action', 'fkey', 'base'];
  var MODE_LABEL = { action: 'Actions', fkey: 'F-keys', base: 'Base letters' };

  var $ = function (s) { return document.querySelector(s); };

  var state = {
    mode: localStorage.getItem(LS.legend) || 'action',
    model: null,
    layer: null,
    actions: [],
    doors: { into: [], outof: [] },
    sibling: null
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /*
   * "&kp LG(LEFT)" -> "Win ←" on a PC layer, "⌘ ←" on a Mac one. `LG` is the
   * same keycode either way; only the glyph differs, so the column has to say
   * which machine it's describing or the Windows side reads as Command.
   */
  function emitLabel(raw, os) {
    var ctx = Join.ctxOf(state.model);
    ctx.os = os || 'mac';
    var f = Codes.format(raw, ctx);
    if (f.cls === 'trans' || f.cls === 'none') return null;
    return ((f.top ? f.top + ' ' : '') + (f.main || '')).trim() || null;
  }

  /* Glyphs only — a wrong guess is cosmetic, never a wrong binding. */
  function osOf(name) { return /win|pc|linux/i.test(name || '') ? 'pc' : 'mac'; }

  function posName(i) {
    var k = BOARD.keys[i];
    return k ? BOARD.posLabel(k) : '#' + i;
  }

  /** Right hand or left? The mirror means every action has one of each. */
  function side(i) {
    var k = BOARD.keys[i];
    return k ? k.side : null;
  }

  function handed(a) {
    var out = { left: null, right: null };
    a.positions.forEach(function (p) {
      var s = side(p);
      if (s === 'left' && out.left == null) out.left = p;
      else if (s === 'right' && out.right == null) out.right = p;
    });
    return out;
  }

  // ------------------------------------------------------------------ board

  function renderBoard() {
    var legends = {};
    var extra = {};

    state.actions.forEach(function (a) {
      a.positions.forEach(function (p) {
        var base = Join.baseKey(state.model, p);
        var main = a.label;
        var sub = a.key;
        if (state.mode === 'fkey') { main = a.key; sub = a.label; }
        else if (state.mode === 'base') { main = base || '·'; sub = a.label; }
        legends[p] = { top: a.group, main: main, sub: sub, cls: 'layer', desc: a.prompt };
        extra[p] = 'p-key';
      });
    });

    /*
     * The doors: how you got here, and how you leave. `top` already carries the
     * verb, so `main` is the key you actually press and `sub` is where it goes —
     * saying "hold" three times on one cap helps nobody.
     */
    state.doors.into.forEach(function (d) {
      if (legends[d.pos]) return;                     // an action key wins the cap
      legends[d.pos] = {
        top: d.kind,
        main: Join.baseKey(state.model, d.pos) || '#' + d.pos,
        sub: '', cls: 'layer',
        desc: 'Enters the WM layer (' + d.kind + ')'
      };
      extra[d.pos] = 'p-hold';
    });
    state.doors.outof.forEach(function (d) {
      var self = d.kind === 'toggle' && d.target === state.layer;
      legends[d.pos] = {
        top: d.kind,
        main: self ? 'unlatch' : (state.model.layerNames[d.target] || String(d.target)),
        sub: '', cls: 'layer', desc: String(d.raw)
      };
      extra[d.pos] = 'p-exit';
    });

    $('#stage').innerHTML = Render.board(state.model, {
      board: BOARD, layer: state.layer, os: 'mac',
      showTrans: false, legends: legends, extraClass: extra
    });
  }

  // ------------------------------------------------------------------ table

  function renderSheet() {
    var groups = {};
    state.actions.forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });

    var win = state.sibling;
    var html = '<table class="sheet"><thead><tr>' +
      '<th>action</th><th>keys</th>' +
      '<th>' + esc(state.model.layerNames[state.layer]) + '</th>' +
      (win ? '<th>' + esc(win.name) + '</th>' : '') +
      '</tr></thead><tbody>';
    var cols = win ? 4 : 3;

    Object.keys(groups).forEach(function (g) {
      html += '<tr class="grouprow"><td colspan="' + cols + '">' + esc(g) + '</td></tr>';
      groups[g].forEach(function (a) {
        var h = handed(a);
        function key(p) {
          if (p == null) return '<span class="miss">—</span>';
          return '<b>' + esc(Join.baseKey(state.model, p) || '#' + p) + '</b>';
        }
        /*
         * Each OS cell is "what the key emits there" + "what to configure".
         * The emission is read off the layer, never written down — the two WM
         * layers send different things from the same position, and hardcoding
         * either would go stale the moment one is rebound.
         */
        function cell(layerIdx, note, os) {
          var raw = layerIdx == null ? null : state.model.layers[layerIdx][a.pos];
          var emits = raw ? emitLabel(raw, os) : null;
          var todo = /helper|unresolved/.test(note || '');
          return '<td>' + (emits ? '<code>' + esc(emits) + '</code>' : '<span class="miss">—</span>') +
            (note ? ' <span class="' + (todo ? 'todo' : 'dim') + '">' + esc(note) + '</span>' : '') +
            '</td>';
        }
        html += '<tr><td>' + esc(a.prompt || a.label) + '</td>' +
          '<td class="keys">' + key(h.right) + '<span class="dim"> / </span>' + key(h.left) + '</td>' +
          cell(state.layer, a.mac, osOf(state.model.layerNames[state.layer])) +
          (win ? cell(win.layer, a.win, osOf(win.name)) : '') + '</tr>';
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
    /*
     * The same key on both base layers is one door, not two — collapse by
     * position and kind so the strip reads "G on HRM_macOS, HRM_WinLinx".
     */
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
      // A toggle pointed at its own layer is the way back out, not a target.
      var suffix = dir === 'out' && !(d.kind === 'toggle' && d.target === state.layer)
        ? ' <span class="dim">&rarr; ' + esc(state.model.layerNames[d.target]) + '</span>'
        : '';
      var verb = (d.kind === 'toggle' && d.target === state.layer) ? 'unlatch' : d.kind;
      return '<span class="door"><b>' + esc(base || '#' + d.pos) + '</b>' +
        '<span class="dim"> ' + esc(posName(d.pos)) + ' on ' + esc(e.on.join(', ')) + '</span> ' +
        '<em>' + esc(verb) + '</em>' + suffix + '</span>';
    }

    $('#entry').innerHTML =
      '<div class="doors"><span class="lbl">in</span>' +
        collapse(state.doors.into).map(function (e) { return line(e, 'in'); }).join('') + '</div>' +
      '<div class="doors"><span class="lbl">out</span>' +
        collapse(state.doors.outof).map(function (e) { return line(e, 'out'); }).join('') + '</div>';
  }

  function renderNote() {
    $('#btn-legend').textContent = MODE_LABEL[state.mode];
    var n = state.actions.length;
    var positions = state.actions.reduce(function (t, a) { return t + a.positions.length; }, 0);
    var note;
    if (state.layer == null) {
      note = 'No layer in this layout binds F13–F24 yet — showing the proposed ' +
        'positions from <code>data/wm-actions.js</code>.';
    } else {
      note = '<b>' + esc(state.model.layerNames[state.layer]) + '</b> (layer ' + state.layer +
        ') — ' + n + ' actions across ' + positions + ' keys' +
        (positions === n * 2 ? ', mirrored onto both hands' : '') + '. ' +
        'Labels come from <code>data/wm-actions.js</code>; positions come from the layout.';
      if (state.sibling) {
        note += ' Twin layer <b>' + esc(state.sibling.name) + '</b> (' + state.sibling.layer +
          ') holds the same positions with different emissions — both columns below.';
      }
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
    var joined = Join.plan(state.model, window.G80_WM_ACTIONS || []);
    state.layer = joined.layer;
    state.actions = joined.actions;
    state.doors = Join.doors(state.model, state.layer);

    // The per-OS twin: same positions, different emissions (WM_Win).
    var allPositions = [];
    state.actions.forEach(function (a) { allPositions = allPositions.concat(a.positions); });
    state.sibling = Join.sibling(state.model, state.layer, allPositions);

    $('#btn-legend').onclick = function () {
      state.mode = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
      localStorage.setItem(LS.legend, state.mode);
      renderNote();
      renderBoard();
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
