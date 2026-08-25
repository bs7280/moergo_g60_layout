/*
 * WM-motion practice.
 *
 * Drills intent -> physical key, which is the thing that transfers between the
 * native-chord tiers and a real WM. What the key *emits* is deliberately not
 * what's being trained.
 *
 * Three input sources, in descending fidelity:
 *
 *   fkeys  the WM layer is flashed and emits F13-F24. Real muscle memory.
 *   base   nothing flashed yet: press the physical key while on your base
 *          layer and we map the letter back to a position via the layout.
 *          Same finger, same motion, available today.
 *   click  click the board. Learning the map, not drilling it.
 *
 * `base` exists because the layer doesn't have to exist before the practice
 * does. It used to matter more: the plan was three tiers, two of which emitted
 * chords a browser can never see (the OS eats LG(...) and hyper first). With
 * Rectangle and PowerToys both consuming F-keys directly there is only one
 * tier, so `fkeys` is now full fidelity and `base` is just the pre-flash path.
 */
(function () {
  'use strict';

  var Geo = window.G80Geometry;
  var Codes = window.G80Keycodes;
  var Parse = window.G80Parse;
  var Render = window.G80Render;
  var Join = window.G80WMJoin;
  var BOARD = Geo.BOARD;

  var LS = { theme: 'g80.theme', source: 'g80.p.source', stats: 'g80.p.stats' };
  var SESSION_LENGTH = 24;

  var $ = function (s) { return document.querySelector(s); };

  var state = {
    source: localStorage.getItem(LS.source) || 'auto',
    reveal: false,
    model: null,
    plan: [],          // [{key, pos, label, prompt, group}]
    byPos: {},         // pos -> action
    codeToPos: {},     // KeyboardEvent.code -> pos
    fromLayer: null,   // layer index the F-keys were found on, if any
    current: null,
    askedAt: 0,
    locked: false,
    queue: [],
    log: []            // {key, correct, ms, got}
  };

  // -------------------------------------------------------------- the join

  /**
   * The join lives in js/wmjoin.js — shared with the cheat sheet so the two
   * pages can't disagree about where a key is.
   *
   * An action can live on more than one position: the layer is mirrored, so
   * "snap left" is on the right hand (hold G) and the left hand (hold H).
   * Either is a correct answer, so `positions` is a list and `pos` is just the
   * first of them, kept for stats and the F-key path.
   */
  function buildPlan(model) {
    var joined = Join.plan(model, window.G80_WM_ACTIONS || []);
    state.fromLayer = joined.layer;
    state.plan = joined.actions;
    state.byPos = {};
    state.plan.forEach(function (a) {
      a.positions.forEach(function (p) { state.byPos[p] = a; });
    });
  }

  function ctxOf(m) {
    return { os: 'mac', layerNames: m.layerNames, defines: m.defines, behaviors: m.behaviors };
  }

  /**
   * For `base` input: what does each practice position emit on the base layer
   * today? Ambiguous letters are dropped rather than guessed.
   */
  function buildBaseMap(model) {
    state.codeToPos = {};
    if (!model) return;
    var ctx = ctxOf(model);
    var counts = {};
    var candidate = {};
    state.plan.forEach(function (a) {
      a.positions.forEach(function (pos) {
        var kc = Codes.tapKeycode(model.layers[0][pos], ctx);
        var code = Codes.toBrowserCode(kc);
        if (!code) return;
        counts[code] = (counts[code] || 0) + 1;
        candidate[code] = pos;
      });
    });
    Object.keys(candidate).forEach(function (code) {
      if (counts[code] === 1) state.codeToPos[code] = candidate[code];
    });
  }

  // --------------------------------------------------------------- session

  function newSession() {
    state.log = [];
    state.queue = [];
    refillQueue();
    state.locked = false;
    next();
    renderStats();
  }

  /** Weighted so the ones you miss or are slow on come back sooner. */
  function refillQueue() {
    var weights = state.plan.map(function (a) {
      var hits = state.log.filter(function (l) { return l.key === a.key; });
      if (!hits.length) return 3;
      var wrong = hits.filter(function (l) { return !l.correct; }).length;
      var slow = hits.filter(function (l) { return l.correct && l.ms > 1500; }).length;
      return 1 + wrong * 4 + slow * 2;
    });
    var bag = [];
    state.plan.forEach(function (a, i) {
      for (var n = 0; n < weights[i]; n++) bag.push(a);
    });
    // Shuffle, then avoid asking the same thing twice in a row.
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    var out = [];
    bag.forEach(function (a) {
      if (!out.length || out[out.length - 1].key !== a.key) out.push(a);
    });
    state.queue = out.slice(0, 40);
  }

  function next() {
    if (state.log.length >= SESSION_LENGTH) return finish();
    if (!state.queue.length) refillQueue();
    state.current = state.queue.shift();
    state.askedAt = performance.now();
    state.locked = false;
    renderPrompt();
    renderBoard();
  }

  function answer(posOrNull, gotLabel) {
    if (!state.current || state.locked) return;
    state.locked = true;
    var ms = Math.round(performance.now() - state.askedAt);
    var correct = state.current.positions.indexOf(posOrNull) >= 0;
    state.log.push({ key: state.current.key, correct: correct, ms: ms, got: posOrNull });

    var el = $('#feedback');
    if (correct) {
      el.className = 'feedback ok';
      el.textContent = '✓  ' + ms + 'ms';
    } else {
      el.className = 'feedback bad';
      var got = posOrNull != null && state.byPos[posOrNull]
        ? 'that key is “' + state.byPos[posOrNull].label + '”'
        : (gotLabel ? 'that was ' + gotLabel : 'not a practice key');
      el.textContent = '✗  ' + got + ' — “' + state.current.label + '” is highlighted';
    }
    renderBoard(correct ? 'ok' : 'bad');
    renderStats();
    setTimeout(next, correct ? 380 : 1400);
  }

  function finish() {
    state.current = null;
    var n = state.log.length;
    var right = state.log.filter(function (l) { return l.correct; });
    var times = right.map(function (l) { return l.ms; }).sort(function (a, b) { return a - b; });
    var median = times.length ? times[Math.floor(times.length / 2)] : 0;

    var perKey = {};
    state.log.forEach(function (l) {
      var p = perKey[l.key] = perKey[l.key] || { n: 0, ok: 0, ms: [] };
      p.n++; if (l.correct) { p.ok++; p.ms.push(l.ms); }
    });
    var rows = state.plan.map(function (a) {
      var p = perKey[a.key];
      if (!p) return null;
      var avg = p.ms.length ? Math.round(p.ms.reduce(function (x, y) { return x + y; }, 0) / p.ms.length) : null;
      return { label: a.label, group: a.group, n: p.n, ok: p.ok, avg: avg };
    }).filter(Boolean).sort(function (x, y) {
      return (x.ok / x.n) - (y.ok / y.n) || (y.avg || 0) - (x.avg || 0);
    });

    $('#prompt').innerHTML = '<span class="done">Session complete</span>';
    $('#feedback').className = 'feedback';
    $('#feedback').textContent = right.length + '/' + n + ' correct · median ' + median + 'ms';
    $('#summary').innerHTML =
      '<table><thead><tr><th>action</th><th>acc</th><th>avg</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var acc = Math.round((r.ok / r.n) * 100);
        return '<tr class="' + (acc < 100 ? 'weak' : '') + '"><td>' + esc(r.label) + '</td>' +
          '<td>' + r.ok + '/' + r.n + '</td>' +
          '<td>' + (r.avg == null ? '—' : r.avg + 'ms') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<button id="btn-again">Again</button>';
    $('#btn-again').onclick = newSession;
    renderBoard();
  }

  // ---------------------------------------------------------------- render

  function renderPrompt() {
    if (!state.current) return;
    $('#summary').innerHTML = '';
    $('#feedback').className = 'feedback';
    $('#feedback').textContent = '';
    $('#prompt').innerHTML = '<span class="grp">' + esc(state.current.group) + '</span>' +
      esc(state.current.prompt);
    $('#progress').textContent = state.log.length + ' / ' + SESSION_LENGTH;
  }

  function renderBoard(mark) {
    var legends = {};
    var extra = {};
    var show = state.reveal || !state.current;

    state.plan.forEach(function (a) {
      var isTarget = state.current && a.key === state.current.key;
      a.positions.forEach(function (pos) {
        legends[pos] = {
          main: (show || (mark && isTarget)) ? a.label : '·',
          sub: show ? a.key : '',
          cls: 'layer'
        };
        // Both hands light up — either one was a correct answer.
        if (mark && isTarget) extra[pos] = mark === 'ok' ? 'p-ok' : 'p-target';
        else extra[pos] = 'p-key';
      });
    });
    if (mark === 'bad') {
      var got = state.log[state.log.length - 1].got;
      if (got != null && state.current.positions.indexOf(got) < 0) extra[got] = 'p-wrong';
    }

    $('#stage').innerHTML = Render.board(blankModel(), {
      board: BOARD, layer: 0, os: 'mac',
      legends: legends, extraClass: extra
    });
  }

  var _blank = null;
  function blankModel() {
    if (_blank) return _blank;
    var layer = [];
    for (var i = 0; i < BOARD.count; i++) layer.push('&none');
    _blank = { layers: [layer], layerNames: ['WM'], behaviors: {}, defines: {}, combos: [] };
    return _blank;
  }

  function renderStats() {
    var n = state.log.length;
    if (!n) { $('#running').textContent = ''; return; }
    var ok = state.log.filter(function (l) { return l.correct; }).length;
    $('#running').textContent = ok + '/' + n + ' correct';
    $('#progress').textContent = n + ' / ' + SESSION_LENGTH;
  }

  function renderSource() {
    var s = state.source;
    var label = { auto: 'Auto', fkeys: 'F13–F24', base: 'Base layer', click: 'Click only' }[s];
    $('#btn-source').textContent = label;
    var note;
    if (state.fromLayer != null) {
      note = 'F-keys found on layer ' + state.fromLayer + ' (' +
        esc(state.model.layerNames[state.fromLayer]) + ') — positions are live.';
    } else {
      note = 'No F13–F24 layer in this layout yet; using the proposed positions from ' +
        '<code>data/wm-actions.js</code>.';
    }
    var total = state.plan.reduce(function (n, a) { return n + a.positions.length; }, 0);
    if (total > state.plan.length) {
      note += ' Mirrored — ' + total + ' positions for ' + state.plan.length +
        ' actions; either hand counts.';
    }
    if (effectiveSource() === 'base') {
      note += ' Press the physical key on your <b>base layer</b> — ' +
        Object.keys(state.codeToPos).length + ' of ' + total + ' positions are unambiguous.';
    } else if (effectiveSource() === 'fkeys') {
      note += ' Listening for F13–F24.';
    } else {
      note += ' Click the board to answer.';
    }
    $('#srcnote').innerHTML = note;
  }

  function effectiveSource() {
    if (state.source !== 'auto') return state.source;
    return state.fromLayer != null ? 'fkeys' : 'base';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------------------------------------------------------------- events

  function bind() {
    $('#btn-source').onclick = function () {
      var order = ['auto', 'fkeys', 'base', 'click'];
      state.source = order[(order.indexOf(state.source) + 1) % order.length];
      localStorage.setItem(LS.source, state.source);
      renderSource();
    };
    $('#btn-reveal').onclick = function (e) {
      state.reveal = !state.reveal;
      e.currentTarget.setAttribute('aria-pressed', state.reveal);
      renderBoard();
    };
    $('#btn-restart').onclick = newSession;
    $('#btn-theme').onclick = function () {
      var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(LS.theme, t);
      $('#btn-theme').textContent = t === 'dark' ? 'Light' : 'Dark';
    };

    $('#stage').addEventListener('click', function (e) {
      var g = e.target.closest('.key');
      if (!g) return;
      var i = parseInt(g.getAttribute('data-i'), 10);
      answer(state.byPos[i] ? i : null);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { newSession(); return; }
      var src = effectiveSource();

      if (src !== 'click' && /^F(1[3-9]|2[0-4])$/.test(e.code)) {
        e.preventDefault();
        /*
         * `code` is bare ("F13") even when the firmware sent a modified
         * chord, so rebuild the name the action map uses. v2's catalog uses
         * Ctrl/Alt/Shift bands (not just Shift), nested in the same
         * Ctrl-outermost/Shift-innermost order tools/edits/wm-redesign-*.js
         * emits — LC(LA(LS(F13))) — so this has to match that exactly or
         * every modified chord scores as wrong regardless of which key was
         * actually pressed.
         */
        var name = (e.ctrlKey ? 'LC(' : '') + (e.altKey ? 'LA(' : '') + (e.shiftKey ? 'LS(' : '') +
          e.code + (e.shiftKey ? ')' : '') + (e.altKey ? ')' : '') + (e.ctrlKey ? ')' : '');
        var a = state.plan.filter(function (x) { return x.key === name; })[0];
        answer(a ? a.pos : null, name);
        return;
      }
      if (src === 'base' && state.codeToPos[e.code] != null) {
        e.preventDefault();
        answer(state.codeToPos[e.code], e.code);
        return;
      }
      // A key that isn't part of the drill is still a wrong answer — that's
      // the misfire you want to see, not something to swallow.
      if (state.current && !state.locked && e.key.length === 1) {
        answer(null, '“' + e.key + '”');
      }
    });
  }

  // ------------------------------------------------------------------ boot

  document.documentElement.setAttribute('data-theme', localStorage.getItem(LS.theme) || 'dark');
  $('#btn-theme').textContent =
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark';

  var src = localStorage.getItem('g80.src') || window.G80_LAYOUT_SOURCE;
  if (src) {
    var m = Parse.parseAuto(src, { title: 'layout' });
    if (!m.error && m.ok !== false) state.model = m;
  }
  buildPlan(state.model);
  buildBaseMap(state.model);

  if (!state.plan.length) {
    $('#prompt').textContent = 'No actions configured — see data/wm-actions.js';
  } else {
    bind();
    renderSource();
    newSession();
  }
})();
