/*
 * The join: position -> chord -> VS Code command. Same idea as
 * js/wmjoin.js, deliberately simpler — VS Code's two layers are found by
 * NAME directly (`VSCode_macOS`/`VSCode_Win`), not by scanning the whole
 * model for whichever layer binds the most F13-F24-style chords the way
 * wmjoin.js's findLayer() does. That auto-detection heuristic exists
 * because the WM layers' identity isn't otherwise knowable; here it would
 * actively misfire — the WM layers now bind far more F-key-pattern chords
 * than either VS Code layer does, so a shared "most F-keys wins" scan
 * would find WM_Win, not VSCode_macOS. Knowing the two names directly
 * sidesteps that entirely.
 *
 * `doors()`/`baseKey()`/`ctxOf()` are reused from js/wmjoin.js rather than
 * duplicated — despite the filename, neither has any WM-specific logic;
 * both just need a model and a layer index.
 */
(function (root, factory) {
  var codes = root.G80Keycodes ||
    (typeof module === 'object' && module.exports && require('./keycodes.js'));
  var wmjoin = root.G80WMJoin ||
    (typeof module === 'object' && module.exports && require('./wmjoin.js'));
  var mod = factory(codes, wmjoin);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80VSCodeJoin = mod;
})(typeof self !== 'undefined' ? self : this, function (Codes, WMJoin) {
  'use strict';

  /** Both layers by name — null if a layout doesn't have one. */
  function findLayers(model) {
    if (!model) return { mac: null, win: null };
    var mac = model.layerNames.indexOf('VSCode_macOS');
    var win = model.layerNames.indexOf('VSCode_Win');
    return { mac: mac >= 0 ? mac : null, win: win >= 0 ? win : null };
  }

  /**
   * Unlike wmjoin.js's plan(), every action's position is already known —
   * there's no fallback-detection to do, just carry the action through
   * with a `positions` array so the renderer can use the same shape as
   * the WM cheat sheet's board/table code.
   */
  function plan(model, actions) {
    var layers = findLayers(model);
    var out = (actions || []).map(function (a) {
      var o = {};
      for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
      o.positions = [a.pos];
      return o;
    });
    return { macLayer: layers.mac, winLayer: layers.win, actions: out };
  }

  return {
    findLayers: findLayers,
    plan: plan,
    doors: WMJoin.doors,
    baseKey: WMJoin.baseKey,
    ctxOf: WMJoin.ctxOf
  };
});
