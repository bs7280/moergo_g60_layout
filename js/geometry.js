/*
 * Physical geometry for the MoErgo Go60.
 *
 * Positions are in key units (1u = one keycap pitch) and use the KLE / QMK
 * `info.json` convention: a key is drawn at (x, y), then rotated `r` degrees
 * clockwise about the point (rx, ry).
 *
 * Raw coordinates come from keymap-drawer's `resources/extra_layouts/go60.json`,
 * which tracks github.com/moergo-keyboards/go60-zmk-config.
 *
 * This tool is Go60-only by design. Anything else is rejected in parse.js
 * rather than rendered on the wrong geometry.
 *
 * The index of each entry is the ZMK key-position index — the same order
 * bindings appear in inside `bindings = < ... >`.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80Geometry = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var FINGERS = ['pinky-outer', 'pinky', 'ring', 'middle', 'index', 'index-inner'];

  // ------------------------------------------------------------------ boards

  // MoErgo Go60 — 60 keys. A properly curved column stagger (unlike the
  // Glove80's flat half-unit drop), a three-key bottom row per half, and three
  // thumb keys per half.
  var SPEC = {
    name: 'go60',
    label: 'Go60',
    maxX: 16,
    pos: [
      [0, 0.9], [1, 0.9], [2, 0.25], [3, 0], [4, 0.15], [5, 0.25],
      [11, 0.25], [12, 0.15], [13, 0], [14, 0.25], [15, 0.9], [16, 0.9],

      [0, 1.9], [1, 1.9], [2, 1.25], [3, 1], [4, 1.15], [5, 1.25],
      [11, 1.25], [12, 1.15], [13, 1], [14, 1.25], [15, 1.9], [16, 1.9],

      [0, 2.9], [1, 2.9], [2, 2.25], [3, 2], [4, 2.15], [5, 2.25],
      [11, 2.25], [12, 2.15], [13, 2], [14, 2.25], [15, 2.9], [16, 2.9],

      [0, 3.9], [1, 3.9], [2, 3.25], [3, 3], [4, 3.15], [5, 3.25],
      [11, 3.25], [12, 3.15], [13, 3], [14, 3.25], [15, 3.9], [16, 3.9],

      [2, 4.25], [3, 4], [4, 4.15],
      [12, 4.15], [13, 4], [14, 4.25],

      [4, 4.25, 15, 4.5, 9], [4, 4.25, 30, 4.5, 9], [4, 4.25, 45, 4.5, 9],
      [12, 4.25, -45, 12.5, 9], [12, 4.25, -30, 12.5, 9], [12, 4.25, -15, 12.5, 9]
    ],
    rowRanges: [[0, 11], [12, 23], [24, 35], [36, 47], [48, 59]],
    leftRanges: [[0, 5], [12, 17], [24, 29], [36, 41], [48, 50], [54, 56]],
    thumbRanges: [[54, 59]],
    gridRows: [
      [[0, 1, 2, 3, 4, 5], [null, null, null, null, null, null], [6, 7, 8, 9, 10, 11]],
      [[12, 13, 14, 15, 16, 17], [null, null, null, null, null, null], [18, 19, 20, 21, 22, 23]],
      [[24, 25, 26, 27, 28, 29], [null, null, null, null, null, null], [30, 31, 32, 33, 34, 35]],
      [[36, 37, 38, 39, 40, 41], [null, null, null, null, null, null], [42, 43, 44, 45, 46, 47]],
      [[null, null, 48, 49, 50, null], [54, 55, 56, 57, 58, 59], [null, 51, 52, 53, null, null]]
    ]
  };

  // ------------------------------------------------------------------ build

  function inRanges(i, ranges) {
    for (var n = 0; n < ranges.length; n++) {
      if (i >= ranges[n][0] && i <= ranges[n][1]) return true;
    }
    return false;
  }

  function build(spec) {
    var keys = spec.pos.map(function (p, i) {
      var isThumb = inRanges(i, spec.thumbRanges);
      var side = inRanges(i, spec.leftRanges) ? 'left' : 'right';
      var x = p[0];
      var col = side === 'left' ? x : spec.maxX - x;   // mirror onto 0..5
      var row = -1;
      for (var r = 0; r < spec.rowRanges.length; r++) {
        if (i >= spec.rowRanges[r][0] && i <= spec.rowRanges[r][1]) { row = r; break; }
      }
      return {
        i: i, x: x, y: p[1], w: 1, h: 1,
        r: p[2] || 0, rx: p[3] || 0, ry: p[4] || 0,
        side: side, row: row, col: col,
        cluster: isThumb ? 'thumb' : 'main',
        finger: isThumb ? 'thumb' : (FINGERS[col] || 'index')
      };
    });

    var board = {
      name: spec.name,
      label: spec.label,
      keys: keys,
      count: keys.length,
      gridRows: spec.gridRows,
      thumbRanges: spec.thumbRanges
    };

    board.center = function (k) {
      var cx = k.x + k.w / 2, cy = k.y + k.h / 2;
      if (!k.r) return { x: cx, y: cy };
      var a = k.r * DEG, dx = cx - k.rx, dy = cy - k.ry;
      return {
        x: k.rx + dx * Math.cos(a) - dy * Math.sin(a),
        y: k.ry + dx * Math.sin(a) + dy * Math.cos(a)
      };
    };

    board.corners = function (k) {
      var pts = [[k.x, k.y], [k.x + k.w, k.y], [k.x + k.w, k.y + k.h], [k.x, k.y + k.h]];
      if (!k.r) return pts.map(function (p) { return { x: p[0], y: p[1] }; });
      var a = k.r * DEG;
      return pts.map(function (p) {
        var dx = p[0] - k.rx, dy = p[1] - k.ry;
        return {
          x: k.rx + dx * Math.cos(a) - dy * Math.sin(a),
          y: k.ry + dx * Math.sin(a) + dy * Math.cos(a)
        };
      });
    };

    var _bounds = null;
    board.bounds = function () {
      if (_bounds) return _bounds;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      keys.forEach(function (k) {
        board.corners(k).forEach(function (p) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      });
      _bounds = { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
      return _bounds;
    };

    /** Human-readable name for a position, e.g. "L r2 ring" / "L thumb 1". */
    board.posLabel = function (k) {
      var s = k.side === 'left' ? 'L' : 'R';
      if (k.cluster === 'thumb') {
        var group = spec.thumbRanges.length > 1
          ? (k.i <= spec.thumbRanges[0][1] ? 'thumb-upper' : 'thumb-lower')
          : 'thumb';
        var range = null;
        for (var n = 0; n < spec.thumbRanges.length; n++) {
          if (k.i >= spec.thumbRanges[n][0] && k.i <= spec.thumbRanges[n][1]) range = spec.thumbRanges[n];
        }
        var half = (range[1] - range[0] + 1) / 2;
        var off = k.i - range[0];
        return s + ' ' + group + ' ' + ((k.side === 'left' ? off : off - half) + 1);
      }
      return s + ' r' + k.row + ' ' + k.finger;
    };

    return board;
  }

  var BOARD = build(SPEC);

  return {
    BOARD: BOARD,
    KEYBOARD: 'go60',
    COUNT: BOARD.count
  };
});
