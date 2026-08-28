/*
 * Cheat sheet builder — the whole layout as ONE tall, self-contained SVG.
 *
 * Made for a vertical monitor: every interesting layer stacked top to bottom,
 * each with how you get in and out (read off the keymap via wmjoin.doors, so
 * it can't go stale), the combos as both a list and an overlay, and the WM
 * layers labelled with what they *do* rather than what they emit.
 *
 * The same string is used two ways: cheatsheet.html injects it into the page,
 * and tools/cheatsheet.js writes it to docs/cheatsheet.svg for the README.
 * That's why every style is inlined here — an SVG viewed as an <img> (GitHub
 * README) gets no page CSS.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var mod = factory(
    root.G80Geometry || (isNode && require('./geometry.js')),
    root.G80Keycodes || (isNode && require('./keycodes.js')),
    root.G80Render || (isNode && require('./render.js')),
    root.G80WMJoin || (isNode && require('./wmjoin.js')),
    root.G80VSCodeJoin || (isNode && require('./vscodejoin.js'))
  );
  if (isNode) module.exports = mod;
  else root.G80Sheet = mod;
})(typeof self !== 'undefined' ? self : this, function (Geo, Codes, Render, Join, VJoin) {
  'use strict';

  var U = Render.U;            // px per key unit, must match render.js
  var BOARD_MARGIN = 10;       // render.js MARGIN — board svg padding
  var PAD = 26;                // page padding
  var FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, system-ui, sans-serif";

  /* Dark-theme cap colours, resolved from css/app.css variables. Kept as data
   * so the <style> block and the legend chips can't disagree. */
  var COLORS = {
    alpha: ['#1b2432', '#dde6f2'], num: ['#1a2735', '#b5d6f2'],
    punct: ['#1a2735', '#b5d6f2'], edit: ['#16292a', '#9adecc'],
    nav: ['#16283b', '#8ec5f7'], fn: ['#2a2317', '#e3c491'],
    mod: ['#241c34', '#c4aef7'], modtap: ['#241c34', '#c4aef7'],
    layer: ['#0e2f39', '#63dcea'], layertap: ['#0e2f39', '#63dcea'],
    keypad: ['#1e2733', '#c9d5e4'], mouse: ['#1c2340', '#9fb2ff'],
    media: ['#2d1b29', '#f0a4cd'], system: ['#321e17', '#f2b184'],
    rgb: ['#182d20', '#94e0a6'], macro: ['#2a2617', '#ded29a'],
    trans: ['#10151d', '#4b5768'], none: ['#0d1117', '#33404f'],
    other: ['#1b2432', '#cfd9e6']
  };

  var LEGEND = [
    ['alpha', 'letters'], ['num', 'numbers'], ['punct', 'punctuation'],
    ['nav', 'navigation'], ['edit', 'editing'], ['mod', 'modifiers'],
    ['layer', 'layer keys'], ['fn', 'F-keys'], ['keypad', 'keypad'],
    ['mouse', 'mouse'], ['media', 'media'], ['system', 'system'],
    ['rgb', 'RGB'], ['macro', 'macros'], ['trans', 'inherits ▽']
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function glyphLen(s) { return Array.from(String(s == null ? '' : s)).length; }

  /* Rough text width — only used to decide where lines wrap, so an
   * overestimate just wraps a little early. */
  function tw(s, fs) { return glyphLen(s) * fs * 0.62; }

  function style() {
    var css = [
      'text{font-family:' + FONT + ';fill:#e7edf5}',
      '.sh-h1{font-size:19px;font-weight:650}',
      '.sh-sub{font-size:12px;fill:#93a1b3}',
      '.sh-sec{font-size:15px;font-weight:650}',
      '.sh-secn{fill:#5e6b7c;font-weight:500}',
      '.sh-line{font-size:11.5px;fill:#93a1b3}',
      '.sh-lbl{font-size:9px;fill:#5e6b7c;letter-spacing:.08em}',
      '.sh-b{fill:#e7edf5;font-weight:600}',
      '.sh-faint{fill:#5e6b7c}',
      '.sh-verb{fill:#4fc3f7}',
      '.sh-tgt{fill:#63dcea}',
      '.sh-emit{fill:#e3c491}',
      '.key .cap{fill:#1a222d;stroke:rgba(0,0,0,.35);stroke-width:.75}',
      '.key .cap-top{fill:#1b2432;stroke:rgba(255,255,255,.045);stroke-width:.75}',
      '.key text{text-anchor:middle;fill:#cfd9e6;font-family:' + FONT + '}',
      '.lg-main{font-weight:560}',
      '.lg-top{font-size:9.5px;font-weight:600;opacity:.78;letter-spacing:.02em}',
      '.lg-sub{font-size:8.5px;opacity:.5;letter-spacing:.04em;text-transform:uppercase}',
      '.lg-ghost{opacity:.34;font-style:italic}',
      '.lg-idx{font-size:8px;text-anchor:start;fill:#4fc3f7;opacity:.65}',
      '.key.k-none .cap{opacity:.45}',
      '.key.k-trans .cap{opacity:.65}',
      '.key.k-layer .cap,.key.k-layertap .cap{stroke:#63dcea;stroke-width:1.1;stroke-opacity:.55}',
      '.combo-line{stroke:#4fc3f7;stroke-width:1.6;stroke-opacity:.5;stroke-dasharray:4 3;fill:none}',
      '.combo-dot{fill:#4fc3f7;fill-opacity:.85}',
      '.key.in-combo .cap{stroke:#4fc3f7;stroke-opacity:.8;stroke-width:1.4}'
    ];
    Object.keys(COLORS).forEach(function (c) {
      css.push('.key.k-' + c + ' .cap-top{fill:' + COLORS[c][0] + '}' +
               '.key.k-' + c + ' text{fill:' + COLORS[c][1] + '}');
    });
    return '<style>' + css.join('\n') + '</style>';
  }

  function osOf(name) { return /win|pc|linux/i.test(name || '') ? 'pc' : 'mac'; }

  function ctxFor(model, os) {
    return { os: os || 'mac', layerNames: model.layerNames,
             defines: model.defines, behaviors: model.behaviors };
  }

  /** "&kp LG(LEFT)" -> "⌘ ←" / "Win ←" — one printable label for a binding. */
  function emitLabel(model, raw, os) {
    if (!raw) return null;
    var f = Codes.format(raw, ctxFor(model, os));
    if (f.cls === 'trans' || f.cls === 'none') return null;
    return ((f.top ? f.top + ' ' : '') + (f.main || '')).trim() || null;
  }

  // ------------------------------------------------------------------ doors

  /* Same key on several source layers is one door, not three. */
  function collapse(model, doors) {
    var seen = {}, out = [];
    doors.forEach(function (d) {
      var k = d.pos + '/' + d.kind + '/' + d.target;
      if (seen[k]) {
        var nm = model.layerNames[d.layer];
        if (seen[k].on.indexOf(nm) < 0) seen[k].on.push(nm);
        return;
      }
      seen[k] = { d: d, on: [model.layerNames[d.layer]] };
      out.push(seen[k]);
    });
    return out;
  }

  /** Printable name for a position: what its cap says on the base layer. */
  function keyLabel(model, pos) {
    var f = Codes.format(model.layers[0][pos] || '&none', ctxFor(model, 'mac'));
    var main = f.cls !== 'trans' && f.cls !== 'none' ? f.main : '';
    return main || Join.baseKey(model, pos) || '#' + pos;
  }

  var VERB = { other: 'tap-dance' };

  /**
   * One door as { text: plain string for width math, spans: svg tspans }.
   * dir 'in': hold RET (R thumb 2) from HRM_macOS, HRM_WinLinx
   * dir 'out': hold J (R r2 index) → MouseFast
   */
  function doorSpan(model, e, dir, self) {
    var d = e.d;
    var key = keyLabel(model, d.pos);
    var k = BOARD().keys[d.pos];
    var pos = k ? BOARD().posLabel(k) : '#' + d.pos;
    var verb = (VERB[d.kind] || d.kind) + (self ? ' = exit' : '');
    var tgt = !self && dir === 'out' ? (model.layerNames[d.target] || String(d.target)) : null;
    var from = dir === 'in' ? e.on.join(', ') : null;

    var text = verb + ' ' + key + ' (' + pos + ')' +
      (tgt ? ' → ' + tgt : '') + (from ? ' on ' + from : '');
    var spans =
      '<tspan class="sh-verb">' + esc(verb) + '</tspan>' +
      '<tspan class="sh-b"> ' + esc(key) + '</tspan>' +
      '<tspan class="sh-faint"> (' + esc(pos) + ')</tspan>' +
      (tgt ? '<tspan class="sh-tgt"> → ' + esc(tgt) + '</tspan>' : '') +
      (from ? '<tspan class="sh-faint"> on ' + esc(from) + '</tspan>' : '');
    return { text: text, spans: spans };
  }

  /*
   * Combos are doors too — Gaming is entered by a chord, not a layer key, and
   * wmjoin.doors only reads layer bindings. Without this the Gaming section
   * has no IN line at all, which is exactly the key you'd come here to find.
   */
  function comboDoors(model, li) {
    var out = [];
    (model.combos || []).forEach(function (c) {
      var f = Codes.format(c.binding, ctxFor(model, 'mac'));
      if (f.layer == null || f.layer !== li) return;
      var head = String(c.binding).trim().split(/\s+/)[0];
      var verb = head === '&tog' ? 'toggle' : head === '&to' ? 'switch'
        : head === '&sl' ? 'sticky' : 'hold';
      var keys = c.keys.map(function (i) { return keyLabel(model, i); }).join(' + ');
      var note = 'combo' +
        (c.layers && c.layers.length
          ? ', on ' + c.layers.map(function (l) { return model.layerNames[l] || l; }).join(', ')
          : ', any layer') +
        (verb === 'toggle' ? ' · same chord exits' : '');
      out.push({
        text: verb + ' ' + keys + ' (' + note + ')',
        spans: '<tspan class="sh-verb">' + esc(verb) + '</tspan>' +
          '<tspan class="sh-b"> ' + esc(keys) + '</tspan>' +
          '<tspan class="sh-faint"> (' + esc(note) + ')</tspan>'
      });
    });
    return out;
  }

  /*
   * The trackpads are a door too — `zip_temp_layer` on the cirque listeners
   * is how Mouse is *actually* entered most of the time, and doors() only
   * reads layer bindings, so without this the Mouse section claims the only
   * way in is a thumb key.
   */
  function padDoors(model, li) {
    var auto = (model.pointer && model.pointer.autoLayer) || [];
    var hit = auto.filter(function (a) { return a.layer === li; });
    if (!hit.length) return [];
    var which = hit.length > 1 ? 'either trackpad'
      : /_lh_/.test(hit[0].listener) ? 'the left trackpad' : 'the right trackpad';
    var note = 'holds ' + hit[0].ms + ' ms after you stop';
    return [{
      text: 'touch ' + which + ' (' + note + ')',
      spans: '<tspan class="sh-verb">touch</tspan>' +
        '<tspan class="sh-b"> ' + esc(which) + '</tspan>' +
        '<tspan class="sh-faint"> (' + esc(note) + ')</tspan>'
    }];
  }

  // ------------------------------------------------------------ pointer speed

  /** 2 -> "2", 1.5 -> "1.5", 1/18 -> "0.06" — a gain, not a measurement. */
  function gainNum(v) {
    if (v >= 10) return String(Math.round(v));
    return v.toFixed(2).replace(/\.?0+$/, '') || '0';
  }

  var SPEED_FIELDS = [['move', 'pointer'], ['scroll', 'scroll'],
                      ['padLeft', 'left pad'], ['padRight', 'right pad']];

  /**
   * The scaler line for a layer: what the input processors multiply by, and
   * how that compares with the layer it falls through to. For the mouse speed
   * layers this is the entire content of the layer.
   */
  function speedSpans(model, li, baseLi) {
    var all = (model.pointer && model.pointer.speeds) || {};
    var sp = all[li];
    if (!sp) return null;
    var base = baseLi != null ? all[baseLi] : null;
    var out = [];
    SPEED_FIELDS.forEach(function (f) {
      var pair = sp[f[0]];
      if (!pair || !pair[1]) return;
      var v = pair[0] / pair[1];
      var b = base && base[f[0]] && base[f[0]][1] ? base[f[0]][0] / base[f[0]][1] : null;
      out.push('<tspan class="sh-faint">' + esc(f[1]) + ' </tspan>' +
        '<tspan class="sh-b">×' + gainNum(v) + '</tspan>' +
        (b && b !== v
          ? '<tspan class="sh-faint"> (' + gainNum(v / b) + '× base)</tspan>' : ''));
    });
    return out.length ? out.join('<tspan class="sh-faint">   ·   </tspan>') : null;
  }

  /* Greedy line packing: doors joined with a wide gap until the line is full. */
  function packLines(items, maxW, fs) {
    var lines = [], cur = null, curW = 0;
    items.forEach(function (it) {
      var w = tw(it.text, fs);
      if (!cur || curW + w + 26 > maxW) {
        cur = []; curW = 0; lines.push(cur);
      }
      cur.push(it.spans);
      curW += w + 26;
    });
    // NBSPs — svg collapses plain runs of spaces, and the gap is the separator.
    return lines.map(function (l) {
      return l.join('<tspan class="sh-faint">   ·   </tspan>');
    });
  }

  // ------------------------------------------------------------------ board

  var _board = null;
  function BOARD() { return _board || (_board = Geo.BOARD); }

  function boardSize() {
    var b = BOARD().bounds();
    return { w: b.w * U + BOARD_MARGIN * 2, h: b.h * U + BOARD_MARGIN * 2 };
  }

  /** Render one layer and pin it at (x, y) inside the outer svg. */
  function placedBoard(model, state, x, y, w, h) {
    var svg = Render.board(model, state);
    return svg.replace('<svg class="board"',
      '<svg class="board" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"');
  }

  // -------------------------------------------------------------------- wm

  /**
   * Intent legends for the WM layers: main = what it does ("mon ←"), sub =
   * what this layer emits there (F13 on the practice layer, Win+← on WM_Win).
   */
  function wmLegends(model, actions) {
    if (!actions || !actions.length) return {};
    var joined = Join.plan(model, actions);
    if (joined.layer == null) return {};

    var all = [];
    joined.actions.forEach(function (a) { all = all.concat(a.positions); });
    var sib = Join.sibling(model, joined.layer, all);

    var out = {};
    [joined.layer, sib && sib.layer].forEach(function (li) {
      if (li == null) return;
      var legends = {};
      joined.actions.forEach(function (a) {
        a.positions.forEach(function (p) {
          var emit = emitLabel(model, model.layers[li][p], osOf(model.layerNames[li]));
          if (li !== joined.layer && !emit) return;   // sibling doesn't bind it
          legends[p] = { top: a.group, main: a.label, sub: emit || a.key,
                         cls: 'layer', desc: a.prompt };
        });
      });
      if (Object.keys(legends).length) out[li] = legends;
    });
    return out;
  }

  /**
   * Same idea for the VS Code layers: caps say what the chord *does* in the
   * editor ("focus ←", "session"), with the emission as the small text —
   * otherwise these layers read as a wall of ⌃⇧F13s, which is exactly the
   * kind of cap nobody can learn from. Layers are found by name via
   * vscodejoin; a layout without them just gets no legends.
   */
  function vscodeLegends(model, actions) {
    if (!VJoin || !actions || !actions.length) return {};
    var layers = VJoin.findLayers(model);
    var out = {};
    [layers.mac, layers.win].forEach(function (li) {
      if (li == null) return;
      var legends = {};
      actions.forEach(function (a) {
        var emit = emitLabel(model, model.layers[li][a.pos], osOf(model.layerNames[li]));
        if (!emit) return;                       // this OS's layer skips the action
        legends[a.pos] = { top: a.group, main: a.label, sub: emit,
                           cls: 'layer', desc: a.prompt };
      });
      if (Object.keys(legends).length) out[li] = legends;
    });
    return out;
  }

  /** Intent legends for one layer found by name — Teams, and whoever's next. */
  function namedLegends(model, layerName, actions) {
    if (!actions || !actions.length) return {};
    var li = model.layerNames.indexOf(layerName);
    if (li < 0) return {};
    var legends = {};
    actions.forEach(function (a) {
      var emit = emitLabel(model, model.layers[li][a.pos], osOf(layerName));
      if (!emit) return;
      legends[a.pos] = { top: a.group, main: a.label, sub: emit,
                         cls: 'layer', desc: a.prompt };
    });
    var out = {};
    if (Object.keys(legends).length) out[li] = legends;
    return out;
  }

  // ------------------------------------------------------------------ combos

  function comboRows(model) {
    var rows = (model.combos || []).map(function (c) {
      var emit = emitLabel(model, c.binding, 'mac') || c.binding;
      var keys = c.keys.map(function (i) { return keyLabel(model, i); }).join(' + ');
      var desc = String(c.desc || '').replace(/\s*-\s*TailorKey\s*$/i, '');
      if (/^F\d+ combo\b/i.test(desc)) desc = '';   // "F4 combo for Go60" says nothing
      var m = /^F(\d+)$/.exec(emit);
      return { emit: emit, keys: keys, desc: desc, ord: m ? +m[1] : 100 };
    });
    rows.sort(function (a, b) { return a.ord - b.ord; });
    return rows;
  }

  // ------------------------------------------------------------------ build

  /** How many keys a layer actually binds — `&trans`/`&none` don't count. */
  function boundCount(layer) {
    return (layer || []).filter(function (b) {
      return b && !/^&(trans|none)\b/.test(String(b).trim());
    }).length;
  }

  /** Every layer something can switch to, so an empty layer isn't a dead one. */
  function reachableLayers(model) {
    var seen = {};
    var ctx = ctxFor(model, 'mac');
    model.layers.forEach(function (layer) {
      layer.forEach(function (raw) {
        var f = Codes.format(raw, ctx);
        if (f.layer != null) seen[f.layer] = true;
      });
    });
    (model.combos || []).forEach(function (c) {
      var f = Codes.format(c.binding, ctx);
      if (f.layer != null) seen[f.layer] = true;
    });
    ((model.pointer && model.pointer.autoLayer) || []).forEach(function (a) {
      seen[a.layer] = true;
    });
    return seen;
  }

  /**
   * Which layer an all-`&trans` layer shows the keys of: whatever you were on
   * when you reached for it. MouseSlow is only ever entered from Mouse, so its
   * caps are Mouse's caps.
   */
  function inheritsFrom(model, li) {
    var from = {};
    Join.doors(model, li).into.forEach(function (d) { from[d.layer] = true; });
    var keys = Object.keys(from);
    return keys.length === 1 ? +keys[0] : null;
  }

  /**
   * Layers worth printing, mouse layers right after the base pair.
   *
   * A layer that binds nothing is still worth printing when something can
   * reach it — MouseSlow/Fast/Warp are 60 `&trans` keys apiece whose whole
   * job is the pointer scaler on the input listener, and dropping them for
   * being "empty" is what left the sheet with a hole from 10 to 12.
   */
  function pickLayers(model) {
    var reachable = reachableLayers(model);
    var idxs = [];
    model.layers.forEach(function (l, li) {
      if (boundCount(l) || reachable[li]) idxs.push(li);
    });
    function rank(li) {
      if (li <= 1) return 0;
      if (/mouse/i.test(model.layerNames[li] || '')) return 1;
      return 2;
    }
    return idxs.slice().sort(function (a, b) {
      return rank(a) - rank(b) || a - b;
    });
  }

  /**
   * @param {object} model   parsed keymap model
   * @param {object} opts    { title, source, generated, wmActions }
   * @returns {{svg: string, width: number, height: number}}
   */
  function build(model, opts) {
    opts = opts || {};
    var bs = boardSize();
    var W = bs.w + PAD * 2;
    var maxLine = W - PAD * 2 - 44;
    var parts = [];
    var y = PAD + 6;

    function text(cls, x, str) {
      parts.push('<text class="' + cls + '" x="' + x + '" y="' + y.toFixed(1) + '">' + str + '</text>');
    }

    // ---- header
    y += 14;
    text('sh-h1', PAD, esc(opts.title || model.title || 'Go60'));
    y += 19;
    var sub = (opts.source ? esc(opts.source) + '  ·  ' : '') +
      model.layers.length + ' layers  ·  ' + (model.combos || []).length + ' combos' +
      (opts.generated ? '  ·  ' + esc(opts.generated) : '');
    text('sh-sub', PAD, sub);
    y += 16;
    text('sh-sub', PAD, 'Cap corners: top text = layer / modifier held, bottom = shifted or variant. ' +
      '<tspan class="sh-verb">hold</tspan> = held key, <tspan class="sh-tgt">→ layer</tspan> = where it goes.');

    // ---- category legend
    y += 22;
    var cx = PAD;
    LEGEND.forEach(function (lg) {
      var w = 20 + tw(lg[1], 11) + 14;
      if (cx + w > W - PAD) { cx = PAD; y += 20; }
      parts.push('<rect x="' + cx + '" y="' + (y - 10) + '" width="12" height="12" rx="3" fill="' +
        COLORS[lg[0]][0] + '" stroke="' + COLORS[lg[0]][1] + '" stroke-opacity=".55"/>');
      parts.push('<text class="sh-line" x="' + (cx + 17) + '" y="' + y.toFixed(1) + '">' + esc(lg[1]) + '</text>');
      cx += w;
    });

    var legendsByLayer = wmLegends(model, opts.wmActions);
    [vscodeLegends(model, opts.vscodeActions),
     namedLegends(model, 'Teams', opts.teamsActions)].forEach(function (set) {
      Object.keys(set).forEach(function (li) { legendsByLayer[li] = set[li]; });
    });
    var order = pickLayers(model);
    var combosDone = false;

    function section(title, num) {
      y += 34;
      text('sh-sec', PAD,
        (num != null ? '<tspan class="sh-secn">' + num + ' · </tspan>' : '') + esc(title));
      y += 8;
    }

    function doorBlock(li) {
      var d = Join.doors(model, li);
      [['in', collapse(model, d.into)], ['out', collapse(model, d.outof)]].forEach(function (pair) {
        var dir = pair[0];
        var items = pair[1].map(function (e) {
          var self = e.d.kind === 'toggle' && e.d.target === li;
          return doorSpan(model, e, dir, self);
        });
        if (dir === 'in') items = padDoors(model, li).concat(comboDoors(model, li), items);
        if (!items.length) return;
        // Gutter label on the first line only — a second "OUT" under the
        // first reads as a second list rather than a wrap.
        packLines(items, maxLine, 11.5).forEach(function (line, i) {
          y += 16;
          if (!i) {
            parts.push('<text class="sh-lbl" x="' + PAD + '" y="' + y.toFixed(1) + '">' +
              dir.toUpperCase() + '</text>');
          }
          parts.push('<text class="sh-line" x="' + (PAD + 32) + '" y="' + y.toFixed(1) + '">' + line + '</text>');
        });
      });
    }

    function line(str) {
      y += 16;
      parts.push('<text class="sh-line" x="' + PAD + '" y="' + y.toFixed(1) + '">' + str + '</text>');
    }

    function speedBlock(li, baseLi) {
      var sp = speedSpans(model, li, baseLi);
      if (!sp) return;
      y += 16;
      // "SPEED" is wider than the IN/OUT gutter it shares a column with.
      parts.push('<text class="sh-lbl" x="' + PAD + '" y="' + y.toFixed(1) + '">SPEED</text>');
      parts.push('<text class="sh-line" x="' + (PAD + 46) + '" y="' + y.toFixed(1) + '">' + sp + '</text>');
    }

    /*
     * A layer with no bindings of its own gets the doors and the scaler but no
     * board: every cap would be a ghost of the layer it came from, so three
     * more copies of the Mouse board would say nothing the first one didn't.
     */
    function variantSection(li) {
      var from = inheritsFrom(model, li);
      section(model.layerNames[li] || 'layer ' + li, li);
      line('<tspan class="sh-faint">Every key is </tspan><tspan class="sh-b">▽</tspan>' +
        '<tspan class="sh-faint"> — the caps stay exactly as they are on </tspan>' +
        (from != null
          ? '<tspan class="sh-tgt">' + from + ' · ' + esc(model.layerNames[from] || from) + '</tspan>'
          : '<tspan class="sh-faint">the layer underneath</tspan>') +
        '<tspan class="sh-faint">; only the pointer gain changes.</tspan>');
      doorBlock(li);
      speedBlock(li, from);
    }

    function layerSection(li) {
      if (!boundCount(model.layers[li])) return variantSection(li);
      section(model.layerNames[li] || 'layer ' + li, li);
      doorBlock(li);
      speedBlock(li, null);
      var st = { board: BOARD(), layer: li, os: osOf(model.layerNames[li]), showTrans: true };
      if (legendsByLayer[li]) {
        st.legends = legendsByLayer[li];
        line('Caps show what the key does; small text is what it emits.');
      }
      y += 10;
      parts.push(placedBoard(model, st, PAD, y, bs.w, bs.h));
      y += bs.h;
    }

    function comboSection() {
      var rows = comboRows(model);
      if (!rows.length) return;
      section('Combos — press both keys together', null);
      var half = Math.ceil(rows.length / 2);
      var colX = [PAD, PAD + Math.floor((W - PAD * 2) / 2)];
      var yTop = y;
      var yMax = y;
      [rows.slice(0, half), rows.slice(half)].forEach(function (col, ci) {
        y = yTop;
        col.forEach(function (r) {
          y += 17;
          parts.push('<text class="sh-line" x="' + colX[ci] + '" y="' + y.toFixed(1) + '">' +
            '<tspan class="sh-emit">' + esc(r.emit) + '</tspan>' +
            '<tspan class="sh-b">  ' + esc(r.keys) + '</tspan>' +
            (r.desc ? '<tspan class="sh-faint">  ' + esc(r.desc).slice(0, 78) + '</tspan>' : '') +
            '</text>');
        });
        yMax = Math.max(yMax, y);
      });
      y = yMax + 12;
      parts.push(placedBoard(model,
        { board: BOARD(), layer: 0, os: 'mac', showCombos: true, showTrans: false },
        PAD, y, bs.w, bs.h));
      y += bs.h;
    }

    order.forEach(function (li) {
      layerSection(li);
      if (li === 1 && !combosDone) { comboSection(); combosDone = true; }
    });
    if (!combosDone) comboSection();

    y += PAD;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.ceil(y) +
      '" viewBox="0 0 ' + W + ' ' + Math.ceil(y) + '" font-family="' + esc(FONT) + '">' +
      style() +
      '<rect x="0" y="0" width="' + W + '" height="' + Math.ceil(y) + '" fill="#0a0d12"/>' +
      parts.join('\n') +
      '</svg>';
    return { svg: svg, width: W, height: Math.ceil(y) };
  }

  return { build: build, COLORS: COLORS };
});
