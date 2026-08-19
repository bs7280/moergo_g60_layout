/* UI wiring for the Glove80 layer viewer. */
(function () {
  'use strict';

  var Geo = window.G80Geometry;
  var Codes = window.G80Keycodes;
  var Parse = window.G80Parse;
  var Render = window.G80Render;

  var LS = {
    theme: 'g80.theme', os: 'g80.os', idx: 'g80.idx', trans: 'g80.trans',
    peek: 'g80.peek', combos: 'g80.combos', src: 'g80.src', srcName: 'g80.srcName'
  };

  var state = {
    layer: 0,
    peekLayer: null,
    selected: null,
    query: '',
    os: localStorage.getItem(LS.os) || 'mac',
    showIndex: localStorage.getItem(LS.idx) === '1',
    showTrans: localStorage.getItem(LS.trans) !== '0',
    peek: localStorage.getItem(LS.peek) !== '0',
    showCombos: localStorage.getItem(LS.combos) === '1',
    board: Geo.BOARD,
    highlight: new Set()
  };

  var model = null;
  var $ = function (sel) { return document.querySelector(sel); };

  // ------------------------------------------------------------------ theme

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LS.theme, t);
    var b = $('#btn-theme');
    if (b) b.textContent = t === 'dark' ? 'Light' : 'Dark';
  }

  // ------------------------------------------------------------------ load

  function load(input, name) {
    // A .keymap carries no title; fall back to the file name.
    var parsed = Parse.parseAuto(input, { title: String(name || '').replace(/\.[^.]+$/, '') });
    if (parsed.error) { showError(name, [parsed.error]); return false; }
    if (parsed.ok === false) { showError(name, parsed.errors); return false; }

    model = parsed;
    state.layer = 0;
    state.selected = null;
    state.peekLayer = null;
    if (name) model.fileName = name;
    renderAll();
    renderNotice(parsed.warnings);
    return true;
  }

  /** A layout we can't fully resolve is not shown at all — see js/parse.js. */
  function showError(name, messages) {
    model = null;
    $('#layers').innerHTML = '';
    $('#brand-title').textContent = 'Go60';
    $('#brand-sub').innerHTML = '<b>' + escapeHtml(name || 'layout') + '</b> · rejected';
    $('#notice').className = 'notice err on';
    $('#notice').innerHTML = '<b>Refusing to render ' + escapeHtml(name || 'this layout') + '</b>' +
      (messages || []).map(function (m) { return '<div>' + escapeHtml(m) + '</div>'; }).join('');
    $('#stage').innerHTML = '';
    $('#inspector').innerHTML = '<div class="insp-head"><div class="pos">Nothing loaded</div>' +
      '<div class="desc">Fix the config and re-bake, drop a different export on the window, ' +
      'or press Reload to discard this one.</div></div>';
  }

  function renderNotice(warnings) {
    var el = $('#notice');
    if (!warnings || !warnings.length) { el.className = 'notice'; el.innerHTML = ''; return; }
    el.className = 'notice warn on';
    el.innerHTML = warnings.map(function (m) { return '<div>' + escapeHtml(m) + '</div>'; }).join('');
  }

  function showEmpty() {
    model = null;
    $('#layers').innerHTML = '';
    $('#brand-title').textContent = 'Go60';
    $('#brand-sub').innerHTML = 'no layout loaded';
    $('#notice').className = 'notice';
    $('#notice').innerHTML = '';
    $('#stage').innerHTML = '<div class="empty"><b>No layout loaded</b>' +
      '<div>Drop a Go60 <code>.json</code> export on this window,</div>' +
      '<div>or run <code>node tools/bake.js</code> to bake <code>layouts/</code> into the page.</div></div>';
    $('#inspector').innerHTML = '<div class="insp-head"><div class="pos">Nothing loaded</div></div>';
  }

  /**
   * Nothing hand-loaded: fall back to the baked layout, else an empty state.
   * If the baked layout is itself invalid, `load` has already put the refusal
   * on screen — leave it there rather than papering over it with "no layout".
   */
  function loadFallback() {
    if (window.G80_LAYOUT_SOURCE) {
      load(window.G80_LAYOUT_SOURCE, window.G80_LAYOUT_NAME || 'baked layout');
      return;
    }
    showEmpty();
  }

  function loadFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var text = String(r.result);
      if (load(text, file.name)) {
        try {
          localStorage.setItem(LS.src, text);
          localStorage.setItem(LS.srcName, file.name);
        } catch (e) { /* layout too big to cache; not fatal */ }
        toast('Loaded ' + file.name + ' — ' + model.layers.length + ' layers');
      }
    };
    r.readAsText(file);
  }

  // ----------------------------------------------------------------- render

  function activeLayer() {
    return state.peekLayer != null ? state.peekLayer : state.layer;
  }

  function renderAll() {
    renderBrand();
    renderLayers();
    renderBoard();
    renderInspector();
    // Deep-linkable: index.html#2 opens straight onto layer 2.
    if (state.peekLayer == null) {
      try { history.replaceState(null, '', '#' + state.layer); } catch (e) { /* file:// */ }
    }
  }

  function renderBrand() {
    var srcLabel = model.source === 'keymap' ? '.keymap' : 'layout JSON';
    var bits = [
      '<b>' + escapeHtml(model.title) + '</b>',
      model.layers.length + ' layers',
      model.keyCount + ' keys',
      escapeHtml(model.fileName || srcLabel)
    ];
    if (model.combos && model.combos.length) bits.splice(2, 0, model.combos.length + ' combos');
    $('#brand-title').textContent = state.board.label;
    $('#brand-sub').innerHTML = bits.join(' · ');
  }

  function renderLayers() {
    var cur = activeLayer();
    var html = model.layerNames.map(function (n, i) {
      var cls = 'layer-tab' + (state.peekLayer === i ? ' is-peek' : '');
      return '<button class="' + cls + '" role="tab" data-layer="' + i + '" aria-selected="' +
        (i === cur) + '"><span class="n">' + i + '</span>' + escapeHtml(n) + '</button>';
    }).join('');
    $('#layers').innerHTML = html;
  }

  function renderBoard() {
    $('#stage').innerHTML = Render.board(model, {
      board: state.board,
      showCombos: state.showCombos,
      layer: activeLayer(),
      os: state.os,
      showIndex: state.showIndex,
      showTrans: state.showTrans,
      highlight: state.highlight,
      selected: state.selected
    });
  }

  function renderInspector() {
    var el = $('#inspector');
    if (state.selected == null) {
      el.innerHTML =
        '<div class="insp-head"><div class="pos">No key selected</div>' +
        '<div class="desc">Click a key for its binding on every layer.</div></div>' +
        '<div class="legend">' + legendHtml() + '</div>';
      return;
    }
    var d = Render.describe(model, { os: state.os, board: state.board }, state.selected);
    var cur = d.rows[activeLayer()];
    var chips = d.rows.map(function (r) {
      var cls = 'chip' + (r.layer === activeLayer() ? ' is-current' : '') +
        (r.fmt.cls === 'trans' ? ' is-trans' : '');
      return '<button class="' + cls + '" data-layer="' + r.layer + '">' +
        '<span class="nm">' + r.layer + ' ' + escapeHtml(r.name) + '</span>' +
        '<code>' + escapeHtml(r.raw) + '</code></button>';
    }).join('');

    var combosHtml = '';
    if (d.combos.length) {
      combosHtml = '<div class="insp-combos"><div class="ttl">' + d.combos.length +
        ' combo' + (d.combos.length > 1 ? 's' : '') + '</div>' +
        d.combos.map(function (c) {
          var others = c.keys.filter(function (x) { return x !== d.key.i; });
          return '<div class="cb"><code>' + escapeHtml(c.binding) + '</code> · with #' +
            others.join(', #') + (c.layers.length ? ' · on ' +
            c.layers.map(function (l) { return escapeHtml(model.layerNames[l] || l); }).join(', ') : ' · all layers') +
            '</div>';
        }).join('') + '</div>';
    }

    el.innerHTML =
      '<div class="insp-head">' +
        '<div class="pos">#' + d.key.i + ' · ' + escapeHtml(d.position) + '</div>' +
        '<div class="now">' + escapeHtml(cur.fmt.main || cur.fmt.top || '—') + '</div>' +
        '<div class="desc">' + escapeHtml(cur.fmt.desc) + '</div>' +
      '</div>' +
      combosHtml +
      '<div class="insp-layers">' + chips + '</div>';
  }

  function legendHtml() {
    var used = new Set();
    model.layers.forEach(function (layer) {
      layer.forEach(function (b) {
        used.add(Codes.format(b, {
          os: state.os, layerNames: model.layerNames,
          defines: model.defines, behaviors: model.behaviors
        }).cls);
      });
    });
    return Codes.CATEGORIES.filter(function (c) { return used.has(c[0]); })
      .map(function (c) {
        return '<span><i style="background:var(--cap-' + c[0] + ',var(--cap-other));' +
          'border-color:var(--fg-' + c[0] + ',var(--fg-other))"></i>' + c[1] + '</span>';
      }).join('');
  }

  // ----------------------------------------------------------------- search

  function runSearch(q) {
    state.query = q;
    state.highlight = new Set();
    if (!q.trim()) { renderBoard(); return; }
    var needle = q.trim().toLowerCase();
    var ctx = {
      os: state.os, layerNames: model.layerNames,
      defines: model.defines, behaviors: model.behaviors
    };
    var hitLayers = [];
    model.layers.forEach(function (layer, li) {
      var hits = 0;
      layer.forEach(function (b, i) {
        var f = Codes.format(b, ctx);
        var hay = (b + ' ' + f.main + ' ' + f.top + ' ' + f.sub + ' ' + f.desc).toLowerCase();
        if (hay.indexOf(needle) >= 0) {
          hits++;
          if (li === activeLayer()) state.highlight.add(i);
        }
      });
      if (hits) hitLayers.push(model.layerNames[li] + ' (' + hits + ')');
    });
    renderBoard();
    if (hitLayers.length) toast('“' + q + '” → ' + hitLayers.join(', '), false, 2600);
    else toast('No match for “' + q + '”', true, 1800);
  }

  // ------------------------------------------------------------------ text

  function layerToText(li) {
    var ctx = {
      os: state.os, layerNames: model.layerNames,
      defines: model.defines, behaviors: model.behaviors
    };
    var binds = model.layers[li];
    var W = 9;
    var cell = function (i) {
      if (i == null) return ' '.repeat(W);
      var f = Codes.format(binds[i], ctx);
      if (f.cls === 'none') return ' '.repeat(W);
      if (f.cls === 'trans') return pad('▽', W);
      return pad(f.top && f.main ? f.top + '/' + f.main : (f.main || f.top || '?'), W);
    };
    var lines = state.board.gridRows.map(function (row) {
      return row.map(function (seg) {
        return seg.map(cell).join('');
      }).join(' ').replace(/\s+$/, '');
    });
    return '# ' + model.title + ' — layer ' + li + ': ' + model.layerNames[li] + '\n' + lines.join('\n');
  }

  function pad(s, n) {
    s = String(s);
    if (s.length > n - 1) s = s.slice(0, n - 1);
    return s + ' '.repeat(Math.max(1, n - s.length));
  }

  // ----------------------------------------------------------------- events

  function bind() {
    $('#btn-theme').onclick = function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    };
    $('#btn-os').onclick = function (e) {
      state.os = state.os === 'mac' ? 'pc' : 'mac';
      localStorage.setItem(LS.os, state.os);
      e.currentTarget.textContent = state.os === 'mac' ? '⌘ Mac' : '⊞ PC';
      if (model) { renderBoard(); renderInspector(); }
    };
    $('#btn-idx').onclick = function (e) {
      state.showIndex = !state.showIndex;
      localStorage.setItem(LS.idx, state.showIndex ? '1' : '0');
      e.currentTarget.setAttribute('aria-pressed', state.showIndex);
      if (model) renderBoard();
    };
    $('#btn-trans').onclick = function (e) {
      state.showTrans = !state.showTrans;
      localStorage.setItem(LS.trans, state.showTrans ? '1' : '0');
      e.currentTarget.setAttribute('aria-pressed', state.showTrans);
      if (model) renderBoard();
    };
    $('#btn-peek').onclick = function (e) {
      state.peek = !state.peek;
      localStorage.setItem(LS.peek, state.peek ? '1' : '0');
      e.currentTarget.setAttribute('aria-pressed', state.peek);
    };
    $('#btn-combos').onclick = function (e) {
      state.showCombos = !state.showCombos;
      localStorage.setItem(LS.combos, state.showCombos ? '1' : '0');
      e.currentTarget.setAttribute('aria-pressed', state.showCombos);
      if (model) renderBoard();
    };
    $('#btn-copy').onclick = function () {
      if (!model) return;
      var txt = layerToText(activeLayer());
      navigator.clipboard.writeText(txt).then(function () {
        toast('Layer copied as text');
      }, function () {
        toast('Clipboard blocked — see console', true);
        console.log(txt);
      });
    };
    $('#btn-reset').onclick = function () {
      localStorage.removeItem(LS.src);
      localStorage.removeItem(LS.srcName);
      loadFallback();
      toast(model ? 'Reloaded ' + model.fileName : 'Cleared');
    };
    $('#file').onchange = function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); };
    $('#btn-load').onclick = function () { $('#file').click(); };

    var searchTimer;
    $('#search').oninput = function (e) {
      if (!model) return;
      clearTimeout(searchTimer);
      var v = e.target.value;
      searchTimer = setTimeout(function () { runSearch(v); }, 160);
    };

    // Layer tabs + inspector chips both carry data-layer.
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-layer]');
      if (!t || !model) return;
      state.layer = parseInt(t.getAttribute('data-layer'), 10);
      state.peekLayer = null;
      if (state.query) runSearch(state.query);
      renderAll();
    });

    // Key selection.
    var stage = $('#stage');
    stage.addEventListener('click', function (e) {
      var g = e.target.closest('.key');
      if (!g || !model) return;
      var i = parseInt(g.getAttribute('data-i'), 10);
      state.selected = state.selected === i ? null : i;
      renderBoard(); renderInspector();
    });

    // Hover a layer key to peek at that layer.
    var peekTimer;
    stage.addEventListener('mouseover', function (e) {
      if (!state.peek || !model) return;
      var g = e.target.closest('.key');
      if (!g) return;
      var i = parseInt(g.getAttribute('data-i'), 10);
      var f = Codes.format(model.layers[activeLayer()][i], {
        os: state.os, layerNames: model.layerNames,
        defines: model.defines, behaviors: model.behaviors
      });
      clearTimeout(peekTimer);
      if (f.layer == null || f.layer === activeLayer()) return;
      var target = f.layer;
      peekTimer = setTimeout(function () {
        state.peekLayer = target;
        renderLayers(); renderBoard();
      }, 220);
    });
    stage.addEventListener('mouseleave', function () {
      clearTimeout(peekTimer);
      if (state.peekLayer != null) { state.peekLayer = null; renderLayers(); renderBoard(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') {
        if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); runSearch(''); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
      if (!model) return;
      if (e.key === 'Escape') { state.selected = null; renderBoard(); renderInspector(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        state.layer = (state.layer + 1) % model.layers.length; step(); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        state.layer = (state.layer - 1 + model.layers.length) % model.layers.length; step(); return;
      }
      if (/^[0-9]$/.test(e.key)) {
        var n = parseInt(e.key, 10);
        if (n < model.layers.length) { state.layer = n; step(); }
      }
    });

    function step() {
      state.peekLayer = null;
      if (state.query) runSearch(state.query);
      renderAll();
    }

    // Drag & drop a .json or .keymap anywhere on the window.
    var dz = $('#dropzone'), depth = 0;
    window.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; dz.classList.add('on'); });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; dz.classList.remove('on'); } });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; dz.classList.remove('on');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
  }

  // ------------------------------------------------------------------ utils

  var toastTimer;
  function toast(msg, isErr, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, ms || 2200);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------------- boot

  applyTheme(localStorage.getItem(LS.theme) || 'dark');
  $('#btn-os').textContent = state.os === 'mac' ? '⌘ Mac' : '⊞ PC';
  $('#btn-idx').setAttribute('aria-pressed', state.showIndex);
  $('#btn-trans').setAttribute('aria-pressed', state.showTrans);
  $('#btn-peek').setAttribute('aria-pressed', state.peek);
  $('#btn-combos').setAttribute('aria-pressed', state.showCombos);

  var deep = /^#(\d+)$/.exec(location.hash);   // read before the first render rewrites it
  var saved = localStorage.getItem(LS.src);
  // A rejected saved layout stays rejected on screen; "Reload" drops it.
  if (saved) load(saved, localStorage.getItem(LS.srcName) || 'saved layout');
  else loadFallback();
  if (model && deep && +deep[1] < model.layers.length) { state.layer = +deep[1]; renderAll(); }
  bind();
})();
