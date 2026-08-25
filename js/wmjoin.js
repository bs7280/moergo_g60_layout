/*
 * The join: position -> F-key -> intent.
 *
 * Your layout knows "position 31 emits F13". data/wm-actions.js knows "F13
 * means send this window to the left monitor". Neither knows the other, and
 * joining them on the keycode is the whole idea behind both the drill and the
 * cheat sheet — rebind a key in the editor, re-bake, and every label moves
 * with it, because nothing here hardcodes a position.
 *
 * Lives in its own file because two pages need it (practice.html, wm.html) and
 * a second copy of the detector would drift.
 */
(function (root, factory) {
  // In Node `this` is module.exports, so the browser global is never there.
  var codes = root.G80Keycodes ||
    (typeof module === 'object' && module.exports && require('./keycodes.js'));
  var mod = factory(codes);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80WMJoin = mod;
})(typeof self !== 'undefined' ? self : this, function (Codes) {
  'use strict';

  /*
   * F13-F24, bare or wrapped in any number/combo of LC()/LA()/LS()/LG()
   * modifiers (v2's catalog uses single Ctrl/Alt/Shift bands; nothing here
   * assumes only one). Stripped via Codes.unwrapMods rather than a
   * hand-rolled regex, so it can't drift from what js/keycodes.js already
   * parses for display.
   */
  function isFkey(code) {
    var u = Codes.unwrapMods(code);
    return /^F(?:1[3-9]|2[0-4])$/.test(u.code);
  }
  // Kept for anything external that still wants a plain pattern (rare — an
  // arbitrarily-nested-parens key can't be matched by a single regex).
  var FKEY = /^(?:L[CASG]\()*F(?:1[3-9]|2[0-4])\)*$/;

  function ctxOf(m) {
    return { os: 'mac', layerNames: m.layerNames, defines: m.defines, behaviors: m.behaviors };
  }

  function copy(a, positions) {
    var o = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    o.positions = positions;
    o.pos = positions[0];
    return o;
  }

  /**
   * The layer that binds the most of F13-F24, and every position binding each
   * one. Positions is a LIST per key: the layer is mirrored, so each action
   * sits under both hands.
   */
  function findLayer(model) {
    if (!model) return null;
    var ctx = ctxOf(model);
    var best = null;
    model.layers.forEach(function (layer, li) {
      var found = {};
      layer.forEach(function (b, i) {
        var kc = Codes.tapKeycode(b, ctx);
        if (kc && isFkey(kc)) (found[kc] = found[kc] || []).push(i);
      });
      var n = Object.keys(found).length;
      if (n && (!best || n > best.n)) best = { n: n, layer: li, positions: found };
    });
    return best;
  }

  /**
   * Merge the layer's real positions into the action list. Falls back to the
   * proposed pos/altPos in data/wm-actions.js for anything the layer doesn't
   * bind — which is the whole list, before you've flashed anything.
   */
  function plan(model, actions) {
    var best = findLayer(model);
    var out = (actions || []).map(function (a) {
      var configured = [a.pos, a.altPos].filter(function (p) { return p != null; });
      return copy(a, (best && best.positions[a.key]) || configured);
    });
    if (best) {
      // Anything the layer binds that the action map doesn't name yet.
      Object.keys(best.positions).forEach(function (k) {
        if (!out.some(function (a) { return a.key === k; })) {
          out.push(copy({ key: k, group: 'other', label: k, prompt: 'Press ' + k },
                        best.positions[k]));
        }
      });
    }
    return {
      layer: best ? best.layer : null,
      actions: out.filter(function (a) { return a.positions.length; })
    };
  }

  /**
   * How you reach the layer, and how you leave — read off the keymap rather
   * than written down, so it can't go stale. `into` is every binding on some
   * other layer that points at this one; `outof` is every layer-switching key
   * on the layer itself.
   */
  function doors(model, wm) {
    var out = { into: [], outof: [] };
    if (!model || wm == null) return out;
    var ctx = ctxOf(model);

    function kindOf(raw, depth) {
      var head = String(raw).trim().split(/\s+/)[0];
      if (head === '&mo' || head === '&lt') return 'hold';
      if (head === '&to') return 'switch';
      if (head === '&tog') return 'toggle';
      if (head === '&sl') return 'sticky';
      // A custom hold-tap wraps one of the above. Behaviours are keyed WITHOUT
      // the leading '&' — `&WM_hold_v1` is stored as `WM_hold_v1`.
      var beh = model.behaviors && model.behaviors[head.replace(/^&/, '')];
      var inner = beh && ((beh.holdTap && beh.holdTap.hold) || (beh.bindings && beh.bindings[0]));
      if (inner && inner !== head && (depth || 0) < 4) return kindOf(inner, (depth || 0) + 1);
      return 'other';
    }

    model.layers.forEach(function (layer, li) {
      layer.forEach(function (raw, i) {
        var f = Codes.format(raw, ctx);
        if (f.layer == null) return;
        var door = { layer: li, pos: i, raw: raw, kind: kindOf(raw), target: f.layer };
        if (li !== wm && f.layer === wm) out.into.push(door);
        else if (li === wm) out.outof.push(door);
      });
    });
    return out;
  }

  /**
   * The per-OS twin: another layer bound at the SAME positions but emitting
   * something else — WM_Win sends `Win+Left` where WM_practice sends `F17`.
   *
   * First choice: a layer sharing this repo's naming convention — layer
   * names before the first `_` (`WM_practice`/`WM_Win` both start `WM_`).
   * "Find the other OS's WM layer" is exactly what this function is for, and
   * this is reliable where pure position overlap no longer is (see why
   * below) — checked empirically against the real v2 layout, not assumed.
   *
   * Falls back to position-overlap scoring only among that same
   * prefix-matched set if there's more than one candidate, or the full
   * layer list if the primary layer doesn't follow the naming convention at
   * all. Two OS catalogs can legitimately differ in size now (v2: Windows
   * owns 14 workspace positions macOS doesn't have at all), so recall just
   * needs to clear a low floor, and precision (hits/total) is what should
   * separate a real twin from a layer that just happens to bind a lot.
   *
   * That fallback is best-effort, not exact: once the primary layer covers
   * most of the board (v2's WM_Win: 53 of 60 positions), almost any
   * densely-bound layer overlaps it heavily by pigeonhole alone — verified
   * this concretely breaks pure density scoring (a `Keypad` utility layer
   * out-scored the real `WM_practice` twin on both hits and precision in
   * testing), which is why the name-prefix check comes first rather than
   * being a tiebreaker.
   */
  function sibling(model, layerIdx, positions) {
    if (!model || layerIdx == null || !positions.length) return null;

    function bound(b) {
      return b && !/^&(trans|none)\b/.test(String(b).trim());
    }

    var selfName = model.layerNames[layerIdx] || '';
    var prefix = /^[A-Za-z]+_/.exec(selfName);
    var pool = null;
    if (prefix) {
      var named = [];
      model.layers.forEach(function (layer, li) {
        if (li !== layerIdx && (model.layerNames[li] || '').indexOf(prefix[0]) === 0) named.push(li);
      });
      if (named.length) pool = named;
    }
    if (!pool) {
      pool = [];
      model.layers.forEach(function (layer, li) { if (li !== layerIdx) pool.push(li); });
    }
    if (pool.length === 1) return { layer: pool[0], name: model.layerNames[pool[0]] };

    var best = null;
    pool.forEach(function (li) {
      var layer = model.layers[li];
      var hits = positions.filter(function (p) { return bound(layer[p]); }).length;
      if (hits < positions.length * 0.5) return;   // recall floor — some overlap required
      var total = layer.filter(bound).length;
      if (!total) return;
      var precision = hits / total;

      if (!best || precision > best.precision ||
          (precision === best.precision && hits > best.hits)) {
        best = { layer: li, hits: hits, total: total, precision: precision };
      }
    });
    if (!best) return null;
    return { layer: best.layer, name: model.layerNames[best.layer] };
  }

  /** What a position types on the base layer — "the J key", for a cheat sheet. */
  function baseKey(model, pos) {
    if (!model) return null;
    return Codes.tapKeycode(model.layers[0][pos], ctxOf(model));
  }

  return { FKEY: FKEY, findLayer: findLayer, plan: plan, doors: doors, sibling: sibling,
           baseKey: baseKey, ctxOf: ctxOf };
});
