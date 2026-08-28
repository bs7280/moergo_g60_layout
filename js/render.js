/*
 * SVG renderer.
 *
 * Builds the whole board as one SVG string (60–80 keys — cheap enough that a
 * full rebuild on every layer change is imperceptible) and relies on event
 * delegation via `data-i` for interaction.
 */
(function (root, factory) {
  // In Node `this` is module.exports, so the browser global is never there.
  var codes = root.G80Keycodes ||
    (typeof module === 'object' && module.exports && require('./keycodes.js'));
  var mod = factory(codes);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80Render = mod;
})(typeof self !== 'undefined' ? self : this, function (Codes) {
  'use strict';

  var U = 64;          // px per key unit
  var PAD = 3.6;       // gap between keycaps, px
  var MARGIN = 10;     // px around the whole board

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function glyphLen(s) { return Array.from(String(s == null ? '' : s)).length; }

  /** Split a long legend over at most two balanced lines. */
  function wrapMain(text) {
    var s = String(text == null ? '' : text);
    if (glyphLen(s) <= 8) return [s];
    var parts = s.split(/[\s_]+/).filter(Boolean);
    if (parts.length < 2) return [s];
    var best = null;
    for (var cut = 1; cut < parts.length; cut++) {
      var a = parts.slice(0, cut).join(' ');
      var b = parts.slice(cut).join(' ');
      var score = Math.max(glyphLen(a), glyphLen(b));
      if (best === null || score < best.score) best = { a: a, b: b, score: score };
    }
    return [best.a, best.b];
  }

  /** Font size for the main legend, so long words still fit on a 1u cap. */
  function mainSize(lines) {
    var n = Math.max.apply(null, lines.map(glyphLen));
    if (lines.length > 1) {
      if (n <= 5) return 12.5;
      if (n <= 7) return 10.5;
      return 9;
    }
    if (n <= 1) return 21;
    if (n === 2) return 18;
    if (n <= 4) return 14.5;
    if (n <= 6) return 11.5;
    if (n <= 8) return 9.8;
    return 8.6;
  }

  /**
   * What a `&trans` key actually does: fall through to the layer below. ZMK
   * resolves this against whatever lower layers happen to be active, so this is
   * the common-case approximation — walk down to the first non-transparent
   * binding, ending at the base layer.
   */
  function resolveTrans(model, layerIdx, keyIdx) {
    // A conditional layer is never up on its own — it appears on top of the
    // layers that triggered it, so those are what its `&trans` keys actually
    // fall through to. Walking down by raw index would show the caps of
    // layers it can never coexist with, which is exactly the confident-and-
    // wrong picture the ghost is supposed to prevent.
    var start = layerIdx - 1;
    var conds = (model.conditional || []).filter(function (c) {
      return c.thenLayer === layerIdx;
    });
    if (conds.length) {
      start = -1;
      conds.forEach(function (c) {
        c.ifLayers.forEach(function (l) { if (l < layerIdx && l > start) start = l; });
      });
    }
    for (var l = start; l >= 0; l--) {
      var b = model.layers[l][keyIdx];
      if (b && b.trim() !== '&trans') return { binding: b, layer: l };
    }
    return null;
  }

  function ctxOf(model, state) {
    return {
      os: state.os || 'mac',
      layerNames: model.layerNames,
      defines: model.defines,
      behaviors: model.behaviors
    };
  }

  /** Combos visible right now: all of them, or just the selected key's. */
  function visibleCombos(model, state, layerIdx) {
    var all = (model.combos || []).filter(function (c) {
      return !c.layers.length || c.layers.indexOf(layerIdx) >= 0;
    });
    if (state.showCombos) return all;
    if (state.selected == null) return [];
    return all.filter(function (c) { return c.keys.indexOf(state.selected) >= 0; });
  }

  /**
   * @param {object} model  parsed keymap model
   * @param {object} state  { board, layer, os, showIndex, showTrans, showCombos,
   *                          highlight:Set, selected, legends, extraClass }
   * @returns {string} SVG markup
   */
  function board(model, state) {
    state = state || {};
    var geo = state.board;
    var layerIdx = state.layer || 0;
    var bindings = model.layers[layerIdx] || [];
    var ctx = ctxOf(model, state);

    var b = geo.bounds();
    var w = b.w * U + MARGIN * 2;
    var h = b.h * U + MARGIN * 2;
    var ox = -b.minX * U + MARGIN;
    var oy = -b.minY * U + MARGIN;

    var combos = visibleCombos(model, state, layerIdx);
    var comboKeys = new Set();
    combos.forEach(function (c) { c.keys.forEach(function (i) { comboKeys.add(i); }); });

    var parts = [];
    parts.push('<svg class="board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      w.toFixed(1) + ' ' + h.toFixed(1) + '" role="img" aria-label="' + esc(geo.label) +
      ' layer ' + esc(model.layerNames[layerIdx]) + '">');
    parts.push('<g transform="translate(' + ox.toFixed(2) + ' ' + oy.toFixed(2) + ')">');

    geo.keys.forEach(function (k) {
      var raw = bindings[k.i] || '&none';
      var f = Codes.format(raw, ctx);
      // Callers can paint their own legend on a cap — the practice harness
      // shows what a key *means* ("snap left") rather than what it emits.
      if (state.legends && state.legends[k.i]) {
        var o = state.legends[k.i];
        f = { top: o.top || '', main: o.main || '', sub: o.sub || '',
              cls: o.cls || f.cls, layer: null, raw: raw, desc: o.desc || f.desc };
      }
      var ghost = null;

      if (f.cls === 'trans' && state.showTrans !== false && layerIdx > 0) {
        var under = resolveTrans(model, layerIdx, k.i);
        if (under) {
          ghost = Codes.format(under.binding, ctx);
          ghost.fromLayer = under.layer;
        }
      }

      var cls = ['key', 'k-' + f.cls];
      if (state.selected === k.i) cls.push('is-selected');
      if (state.highlight && state.highlight.has(k.i)) cls.push('is-hit');
      else if (state.highlight && state.highlight.size) cls.push('is-dim');
      if (k.cluster === 'thumb') cls.push('is-thumb');
      if (comboKeys.has(k.i)) cls.push('in-combo');
      if (state.extraClass && state.extraClass[k.i]) cls.push(state.extraClass[k.i]);

      var tx = (k.x * U).toFixed(2);
      var ty = (k.y * U).toFixed(2);
      var transform = k.r
        ? 'rotate(' + k.r + ' ' + (k.rx * U).toFixed(2) + ' ' + (k.ry * U).toFixed(2) + ') translate(' + tx + ' ' + ty + ')'
        : 'translate(' + tx + ' ' + ty + ')';

      var capW = U - PAD * 2;
      var capH = U - PAD * 2;
      var cx = U / 2;

      var g = ['<g class="' + cls.join(' ') + '" data-i="' + k.i + '" transform="' + transform + '">'];
      g.push('<rect class="cap" x="' + PAD + '" y="' + PAD + '" width="' + capW + '" height="' + capH + '" rx="7"/>');
      g.push('<rect class="cap-top" x="' + (PAD + 3) + '" y="' + (PAD + 2.5) + '" width="' + (capW - 6) + '" height="' + (capH - 7) + '" rx="5"/>');

      // Legends live in a counter-rotated group so thumb keys stay readable
      // while the caps themselves keep their true angle.
      g.push(k.r ? '<g transform="rotate(' + (-k.r) + ' ' + cx + ' ' + cx + ')">' : '<g>');

      var lines = wrapMain(f.main);
      var fs = mainSize(lines);
      var mainY = U / 2 + fs * 0.35 + (f.top ? 5 : 0) - (f.sub ? 4 : 0) - (ghost ? 5 : 0)
        - (lines.length > 1 ? fs * 0.55 : 0);

      if (f.top) {
        // Layer names can be long ("Cursor_macOS"); shrink rather than overflow.
        var tl = glyphLen(f.top);
        var topFs = tl <= 8 ? 9.5 : (tl <= 11 ? 8.2 : 7.2);
        g.push('<text class="lg-top" x="' + cx + '" y="' + (PAD + 14) +
          '" style="font-size:' + topFs + 'px">' + esc(f.top) + '</text>');
      }
      lines.forEach(function (ln, li) {
        if (!ln) return;
        g.push('<text class="lg-main" x="' + cx + '" y="' + (mainY + li * (fs + 1.5)).toFixed(1) +
          '" style="font-size:' + fs + 'px">' + esc(ln) + '</text>');
      });
      if (f.sub) {
        g.push('<text class="lg-sub" x="' + cx + '" y="' + (U - PAD - 6) + '">' + esc(f.sub) + '</text>');
      }
      // What a transparent key actually inherits from below.
      if (ghost && (ghost.main || ghost.top)) {
        var gl = wrapMain(ghost.main || ghost.top)[0];
        g.push('<text class="lg-ghost" x="' + cx + '" y="' + (mainY + 14).toFixed(1) + '" style="font-size:' +
          Math.min(13, mainSize([gl])) + 'px">' + esc(gl) + '</text>');
      }
      if (state.showIndex) {
        g.push('<text class="lg-idx" x="' + (PAD + 5) + '" y="' + (U - PAD - 5) + '">' + k.i + '</text>');
      }
      g.push('</g></g>');
      parts.push(g.join(''));
    });

    // Combo overlay last, so the dashed links sit above the caps.
    combos.forEach(function (c) {
      var pts = c.keys
        .filter(function (i) { return geo.keys[i]; })
        .map(function (i) {
          var p = geo.center(geo.keys[i]);
          return (p.x * U).toFixed(1) + ',' + (p.y * U).toFixed(1);
        });
      if (pts.length < 2) return;
      parts.push('<polyline class="combo-line" points="' + pts.join(' ') + '"/>');
      pts.forEach(function (p) {
        var xy = p.split(',');
        parts.push('<circle class="combo-dot" cx="' + xy[0] + '" cy="' + xy[1] + '" r="3"/>');
      });
    });

    parts.push('</g></svg>');
    return parts.join('');
  }

  /** Everything the inspector panel needs about one key. */
  function describe(model, state, i) {
    var geo = state.board;
    var k = geo.keys[i];
    var ctx = ctxOf(model, state);
    var rows = model.layers.map(function (layer, li) {
      var raw = layer[i] || '&none';
      return { layer: li, name: model.layerNames[li], raw: raw, fmt: Codes.format(raw, ctx) };
    });
    var combos = (model.combos || []).filter(function (c) { return c.keys.indexOf(i) >= 0; });
    return { key: k, position: geo.posLabel(k), rows: rows, combos: combos };
  }

  return { board: board, describe: describe, resolveTrans: resolveTrans, U: U };
});
