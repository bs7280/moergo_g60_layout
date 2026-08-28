/*
 * Parsers for the shapes a MoErgo config comes in:
 *
 *   1. A ZMK `.keymap` devicetree file (what the firmware builds from).
 *   2. The JSON the MoErgo Layout Editor exports (my.moergo.com/go60 -> Export).
 *      Older exports carry custom behaviours as devicetree text in
 *      `custom_defined_behaviors`; newer ones (firmware_api_version >= 1) carry
 *      structured `holdTaps` / `macros` / `combos` / `inputListeners` arrays.
 *
 * Everything normalises to:
 *
 *   {
 *     source, keyboard, title, notes, keyCount,
 *     layerNames: string[],
 *     layers:     string[][]     // raw ZMK binding text
 *     defines:    { NAME: value },
 *     behaviors:  { name: {...} },
 *     combos:     [{name, desc, binding, keys, layers, timeoutMs}],
 *     warnings:   string[]
 *   }
 */
(function (root, factory) {
  var codes = (typeof module === 'object' && module.exports)
    ? require('./keycodes.js')
    : root.G80Keycodes;
  var mod = factory(codes);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80Parse = mod;
})(typeof self !== 'undefined' ? self : this, function (Codes) {
  'use strict';

  var KEYBOARD = 'go60';
  var KEY_COUNT = 60;

  // ------------------------------------------------------------------ shared

  function stripComments(src) {
    // Replace comments with equivalent whitespace so offsets stay usable.
    return src
      .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
      .replace(/\/\/[^\n]*/g, function (m) { return m.replace(/[^\n]/g, ' '); });
  }

  /** Return the {start, end} of the braced block that follows `fromIndex`. */
  function braceBlock(src, fromIndex) {
    var open = src.indexOf('{', fromIndex);
    if (open < 0) return null;
    var depth = 0;
    for (var i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return { start: open + 1, end: i };
      }
    }
    return null;
  }

  /** Split the body of `bindings = < ... >` into individual bindings. */
  function splitBindings(text) {
    var out = [];
    var toks = String(text)
      .replace(/[<>]/g, ' ')
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    var cur = null;
    toks.forEach(function (t) {
      if (t[0] === '&') {
        if (cur) out.push(cur.join(' '));
        cur = [t];
      } else if (cur) {
        // `LC( LS( A ) )` may arrive split across tokens; glue it back up.
        var prev = cur[cur.length - 1];
        if (/[(,]$/.test(prev) || /^[),]/.test(t)) cur[cur.length - 1] = prev + t;
        else cur.push(t);
      }
    });
    if (cur) out.push(cur.join(' '));
    return out;
  }

  /**
   * `layer_HRM_macOS` -> `HRM_macOS`, `default_layer` -> `Default`.
   * Deliberate mixed case is left alone so keymap-derived names match what the
   * Layout Editor's `layer_names` would have said.
   */
  function prettyLayerName(nodeName) {
    var s = String(nodeName)
      .replace(/^layer[_-]/i, '')
      .replace(/[_-]layer[_-]?\d*$/i, '');
    if (!s) s = nodeName;
    if (/[A-Z]/.test(s)) return s;
    return s.replace(/[_-]+/g, ' ').trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || nodeName;
  }

  var LAYER_BEHAVIORS = ['&mo', '&to', '&tog', '&sl', '&lt'];

  var KIND_BY_COMPATIBLE = {
    'zmk,behavior-hold-tap': 'hold-tap',
    'zmk,behavior-tap-dance': 'tap-dance',
    'zmk,behavior-macro': 'macro',
    'zmk,behavior-macro-one-param': 'macro',
    'zmk,behavior-macro-two-param': 'macro',
    'zmk,behavior-mod-morph': 'mod-morph',
    'zmk,behavior-sticky-key': 'sticky',
    'zmk,behavior-caps-word': 'caps-word',
    'zmk,behavior-key-repeat': 'key-repeat'
  };

  /**
   * Decide whether invoking a behaviour reaches a layer, so the renderer can
   * colour it as a layer key and make it clickable. Sets either a fixed
   * `layer` (baked into the definition) or `layerParam` (supplied at the call
   * site, e.g. `&thumb_v2_TKZ 5 BSPC`).
   */
  function detectLayerReach(entry, defines) {
    for (var i = 0; i < entry.bindings.length; i++) {
      var toks = String(entry.bindings[i]).trim().split(/\s+/);
      if (LAYER_BEHAVIORS.indexOf(toks[0]) < 0) continue;
      if (toks.length > 1) {
        var v = toks[1];
        if (/^\d+$/.test(v)) { entry.layer = parseInt(v, 10); return; }
        if (defines && defines[v] != null && /^\d+$/.test(String(defines[v]))) {
          entry.layer = parseInt(defines[v], 10); return;
        }
      } else if (entry.cells > 0) {
        // Bare `&mo` — the layer arrives as the i-th invocation parameter.
        entry.layerParam = i;
        return;
      }
    }
  }

  /**
   * Pull custom behaviours out of devicetree source. Works on a whole `.keymap`
   * file or on the Layout Editor's `custom_defined_behaviors` blob.
   */
  function extractBehaviors(src, defines) {
    var out = {};
    var clean = stripComments(src);
    var re = /([A-Za-z_][\w-]*)\s*:\s*([A-Za-z_][\w-]*)\s*\{/g;   // `name: node { ... }`
    var m;
    while ((m = re.exec(clean)) !== null) {
      var block = braceBlock(clean, m.index + m[0].length - 1);
      if (!block) continue;
      var body = clean.slice(block.start, block.end);
      var compatible = (/compatible\s*=\s*"([^"]+)"/.exec(body) || [])[1] || '';
      if (compatible && compatible.indexOf('zmk,behavior') !== 0) continue;
      if (!compatible && !/bindings\s*=/.test(body)) continue;

      var label = (/label\s*=\s*"([^"]+)"/.exec(body) || [])[1] || '';
      var cells = parseInt((/#binding-cells\s*=\s*<\s*(\d+)\s*>/.exec(body) || [])[1] || '0', 10);
      var bindings = splitBindings((/bindings\s*=([\s\S]*?);/.exec(body) || [])[1] || '');
      var kind = KIND_BY_COMPATIBLE[compatible] ||
        (compatible ? compatible.replace('zmk,behavior-', '') : 'custom');

      var entry = {
        name: m[1], node: m[2], label: label, kind: kind, cells: cells,
        bindings: bindings, params: [],
        desc: describeBehavior(m[1], label, kind, bindings),
        layer: null, layerParam: null
      };
      // Same shape the structured JSON path produces, so a hold-tap resolves
      // its hold/tap pair identically whichever format it came from.
      if (kind === 'hold-tap' && bindings.length >= 2) {
        entry.holdTap = { hold: bindings[0], tap: bindings[1] };
        var num = function (prop) {
          var x = new RegExp(prop + '\\s*=\\s*<\\s*(\\d+)\\s*>').exec(body);
          return x ? parseInt(x[1], 10) : null;
        };
        entry.tappingTermMs = num('tapping-term-ms');
        entry.quickTapMs = num('quick-tap-ms');
        entry.requirePriorIdleMs = num('require-prior-idle-ms');
        var flavor = (/flavor\s*=\s*"([^"]+)"/.exec(body) || [])[1];
        if (flavor) entry.flavor = flavor;
      }
      detectLayerReach(entry, defines);
      out[m[1]] = entry;
    }
    return out;
  }

  function describeBehavior(name, label, kind, bindings) {
    var pretty = label || name;
    var b = bindings.length ? bindings.join(', ') : '';
    if (kind === 'hold-tap') return pretty + ' — hold-tap over ' + (b || '?');
    if (kind === 'tap-dance') return pretty + ' — tap dance: ' + (b || '?');
    if (kind === 'macro') return pretty + ' — macro: ' + (b || '?');
    if (kind === 'mod-morph') return pretty + ' — mod-morph: ' + (b || '?');
    return pretty + (b ? ' — ' + kind + ': ' + b : ' — ' + kind);
  }

  /**
   * Resolve a `<A B C>` cell list to numbers, going through `#define`s.
   * Returns null for anything that can't be resolved so callers can complain
   * rather than quietly dropping it.
   */
  function resolveCells(text, defines) {
    return String(text == null ? '' : text)
      .replace(/[<>,]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(function (t) {
        if (/^\d+$/.test(t)) return parseInt(t, 10);
        var v = defines && defines[t];
        if (v != null && /^\d+$/.test(String(v).trim())) return parseInt(String(v).trim(), 10);
        return null;
      });
  }

  /**
   * Combos from a devicetree `combos { ... }` node. Positions and layers are
   * routinely written as `#define`d constants (POS_LH_T1, LAYER_Symbol), so
   * everything goes through `defines`.
   */
  function extractCombos(src, defines) {
    var clean = stripComments(src);
    var out = [];
    var re = /(^|\s)combos\s*\{/g;
    var m;
    while ((m = re.exec(clean)) !== null) {
      var block = braceBlock(clean, m.index + m[0].length - 1);
      if (!block) continue;
      var body = clean.slice(block.start, block.end);
      if (!/compatible\s*=\s*"zmk,combos"/.test(body)) continue;

      var nodeRe = /([A-Za-z_][\w-]*)\s*\{/g;
      var n;
      while ((n = nodeRe.exec(body)) !== null) {
        var blk = braceBlock(body, n.index + n[0].length - 1);
        if (!blk) continue;
        var cbody = body.slice(blk.start, blk.end);
        nodeRe.lastIndex = blk.end;

        var posText = (/key-positions\s*=\s*<([^>]*)>/.exec(cbody) || [])[1];
        if (posText == null) continue;
        var keys = resolveCells(posText, defines);
        var layersText = (/layers\s*=\s*<([^>]*)>/.exec(cbody) || [])[1];
        var layers = layersText == null ? [] : resolveCells(layersText, defines);
        var timeout = (/timeout-ms\s*=\s*<\s*(\d+)\s*>/.exec(cbody) || [])[1];
        var binds = splitBindings((/bindings\s*=\s*<([\s\S]*?)>\s*;/.exec(cbody) || [])[1] || '');

        out.push({
          name: n[1].replace(/^combo_/, ''),
          desc: '',
          binding: binds[0] || '&none',
          keys: keys,
          layers: layers,
          timeoutMs: timeout ? parseInt(timeout, 10) : undefined,
          unresolved: keys.indexOf(null) >= 0 || layers.indexOf(null) >= 0
        });
      }
    }
    return out;
  }

  /**
   * `ZMK_TD_LAYER(name, layer)` is a preprocessor macro, not a node, so the
   * behaviour scanner can't see it. It expands to a tap-dance over
   * `<&mo layer>, <&to layer>` — handle that one shape directly rather than
   * pretending to be a C preprocessor. Any other function-like macro that
   * defines a behaviour still trips the undefined-behaviour check.
   */
  function extractMacroBehaviors(src, defines) {
    var out = {};
    var clean = stripComments(src);
    var re = /^[^\S\n]*ZMK_TD_LAYER\s*\(\s*([A-Za-z_][\w-]*)\s*,\s*([A-Za-z_]\w*|\d+)\s*\)/gm;
    var m;
    while ((m = re.exec(clean)) !== null) {
      var name = m[1];
      var arg = m[2];
      var entry = {
        name: name, node: name, label: '', kind: 'tap-dance', cells: 0,
        bindings: ['&mo ' + arg, '&to ' + arg], params: [],
        desc: name + ' — tap dance: tap/hold for layer ' + arg + ', tap again to lock',
        layer: null, layerParam: null
      };
      detectLayerReach(entry, defines);
      out[name] = entry;
    }
    return out;
  }

  function extractDefines(src) {
    var defines = {};
    var re = /^[ \t]*#define[ \t]+([A-Za-z_]\w*)[ \t]+(.+?)[ \t]*$/gm;
    var m;
    while ((m = re.exec(src)) !== null) defines[m[1]] = m[2].trim();
    return defines;
  }

  /*
   * Which listener a `zip_*_scaler` under it is scaling. The mouse speed
   * layers bind nothing at all — every key is `&trans` — so these processors
   * are the ONLY thing that tells them apart, and without reading them the
   * sheet has literally nothing to say about layers like MouseWarp.
   *
   *   &mmv_input_listener {
   *       LAYER_MouseFast { layers = <LAYER_MouseFast>;
   *                         input-processors = <&zip_xy_scaler 3 2>; };
   *   };
   *
   * -> speeds[11].move = [3, 2]
   */
  var SCALER_FIELD = {
    mmv_input_listener: 'move',
    msc_input_listener: 'scroll',
    cirque_lh_listener: 'padLeft',
    cirque_rh_listener: 'padRight'
  };

  /**
   * Pointer gains and pad-activated layers, read off the input listeners.
   * @returns {{speeds: object, autoLayer: Array}} speeds is layer index ->
   *   { move|scroll|padLeft|padRight: [numerator, denominator] }.
   */
  function extractPointerSpeeds(src, defines) {
    var clean = stripComments(src);
    var speeds = {};
    var autoLayer = [];

    function layerNum(tok) {
      var v = /^\d+$/.test(tok) ? tok : (defines && defines[tok]);
      return v != null && /^\d+$/.test(String(v)) ? parseInt(v, 10) : null;
    }

    var re = /&(\w*_listener)\s*\{/g;
    var m;
    while ((m = re.exec(clean)) !== null) {
      var blk = braceBlock(clean, m.index + m[0].length - 1);
      if (!blk) continue;
      var body = clean.slice(blk.start, blk.end);
      re.lastIndex = blk.end;

      // `zip_temp_layer` sits on the listener itself: touch the pad and the
      // board lands on that layer for N ms. That is how Mouse is normally
      // entered, so it belongs on the sheet next to the key-based doors.
      var t = /&zip_temp_layer\s+([A-Za-z_]\w*|\d+)\s+(\d+)/.exec(body);
      if (t && layerNum(t[1]) != null) {
        autoLayer.push({ listener: m[1], layer: layerNum(t[1]), ms: parseInt(t[2], 10) });
      }

      var field = SCALER_FIELD[m[1]];
      if (!field) continue;

      var childRe = /([A-Za-z_][\w-]*)\s*\{/g;
      var c;
      while ((c = childRe.exec(body)) !== null) {
        var cb = braceBlock(body, c.index + c[0].length - 1);
        if (!cb) continue;
        var cbody = body.slice(cb.start, cb.end);
        childRe.lastIndex = cb.end;
        var lm = /layers\s*=\s*<\s*([A-Za-z_]\w*|\d+)\s*>/.exec(cbody);
        var sm = /&zip_(?:xy|scroll)_scaler\s+(\d+)\s+(\d+)/.exec(cbody);
        if (!lm || !sm) continue;
        var li = layerNum(lm[1]);
        if (li == null) continue;
        (speeds[li] || (speeds[li] = {}))[field] =
          [parseInt(sm[1], 10), parseInt(sm[2], 10)];
      }
    }
    return { speeds: speeds, autoLayer: autoLayer };
  }

  // -------------------------------------------------------------- .keymap

  function parseKeymap(src, meta) {
    var warnings = [];
    var errors = [];
    var defines = extractDefines(src);
    var clean = stripComments(src);
    var behaviors = extractBehaviors(src, defines);
    var fromMacros = extractMacroBehaviors(src, defines);
    Object.keys(fromMacros).forEach(function (k) {
      if (!behaviors[k]) behaviors[k] = fromMacros[k];
    });
    var combos = extractCombos(src, defines);
    combos.filter(function (c) { return c.unresolved; }).forEach(function (c) {
      errors.push('Combo "' + c.name + '" has key positions or layers that could not be ' +
        'resolved to numbers — a #define is missing.');
    });

    var keymapBody = null;
    var re = /(^|\s)keymap\s*\{/g;
    var m;
    while ((m = re.exec(clean)) !== null) {
      var block = braceBlock(clean, m.index + m[0].length - 1);
      if (!block) continue;
      var body = clean.slice(block.start, block.end);
      if (/compatible\s*=\s*"zmk,keymap"/.test(body)) { keymapBody = body; break; }
      if (keymapBody === null) keymapBody = body;
    }
    if (keymapBody === null) {
      return { error: 'No `keymap { ... }` node found — is this a ZMK .keymap file?' };
    }

    var layerNames = [];
    var layers = [];
    var nodeRe = /([A-Za-z_][\w-]*)\s*\{/g;
    var n;
    while ((n = nodeRe.exec(keymapBody)) !== null) {
      var blk = braceBlock(keymapBody, n.index + n[0].length - 1);
      if (!blk) continue;
      var lbody = keymapBody.slice(blk.start, blk.end);
      nodeRe.lastIndex = blk.end;
      var bindMatch = /bindings\s*=\s*<([\s\S]*?)>\s*;/.exec(lbody);
      if (!bindMatch) continue;

      var display = (/display-name\s*=\s*"([^"]+)"/.exec(lbody) || [])[1];
      var lbl = (/label\s*=\s*"([^"]+)"/.exec(lbody) || [])[1];
      layerNames.push(display || lbl || prettyLayerName(n[1]));
      layers.push(splitBindings(bindMatch[1]));
    }

    if (!layers.length) return { error: 'Found a keymap node but no layers with `bindings = < ... >`.' };

    var keyCount = checkLayerSizes(layers, layerNames, errors);

    return {
      source: 'keymap',
      keyboard: (meta && meta.keyboard) || null,
      keyCount: keyCount,
      title: (meta && meta.title) || 'ZMK keymap',
      notes: '',
      layerNames: layerNames,
      layers: layers,
      defines: defines,
      behaviors: behaviors,
      combos: combos,
      pointer: extractPointerSpeeds(src, defines),
      warnings: warnings,
      errors: errors
    };
  }

  /**
   * Every layer must be exactly one Go60's worth of keys. Nothing is padded —
   * a short layer means the file isn't what we think it is, and silently
   * filling it with `&none` would paint a confident, wrong picture.
   */
  function checkLayerSizes(layers, layerNames, errors) {
    var seen = layers.map(function (l) { return l.length; });
    var wrong = [];
    seen.forEach(function (n, i) {
      if (n !== KEY_COUNT) wrong.push('"' + (layerNames[i] || i) + '" has ' + n);
    });
    if (wrong.length) {
      errors.push('Expected ' + KEY_COUNT + ' bindings per layer (Go60), but ' +
        wrong.length + ' layer' + (wrong.length > 1 ? 's differ' : ' differs') + ': ' +
        wrong.slice(0, 4).join(', ') + (wrong.length > 4 ? ', …' : '') + '.');
    }
    return seen.length ? Math.max.apply(null, seen) : 0;
  }

  // ---------------------------------------------------- MoErgo Layout Editor

  function paramToString(node) {
    if (node == null) return '';
    if (typeof node !== 'object') return String(node);
    var v = String(node.value == null ? '' : node.value).trim();
    var kids = (node.params || []).map(paramToString).filter(function (s) { return s !== ''; });
    if (!kids.length) return v;
    if (/\($/.test(v)) return v + kids.join(',') + ')';   // "LS(" + "N1" + ")"
    return v + '(' + kids.join(',') + ')';
  }

  function bindingToString(node) {
    if (node == null) return '&none';
    if (typeof node === 'string') return node;
    var head = String(node.value == null ? '' : node.value).trim();
    var params = (node.params || []).map(paramToString).filter(function (s) { return s !== ''; });
    return [head].concat(params).join(' ').trim() || '&none';
  }

  /** Structured `holdTaps` / `macros` arrays from newer exports. */
  function structuredBehaviors(obj, defines) {
    var out = {};

    (obj.holdTaps || []).forEach(function (h) {
      var name = String(h.name || '').replace(/^&/, '');
      if (!name) return;
      var entry = {
        name: name, label: '', kind: 'hold-tap', cells: 2,
        bindings: (h.bindings || []).map(String),
        params: [],
        holdTap: { hold: (h.bindings || [])[0], tap: (h.bindings || [])[1] },
        tappingTermMs: h.tappingTermMs == null ? null : h.tappingTermMs,
        quickTapMs: h.quickTapMs == null ? null : h.quickTapMs,
        requirePriorIdleMs: h.requirePriorIdleMs == null ? null : h.requirePriorIdleMs,
        flavor: h.flavor,
        desc: (h.description || describeBehavior(name, '', 'hold-tap', h.bindings || [])),
        layer: null, layerParam: null
      };
      detectLayerReach(entry, defines);
      out[name] = entry;
    });

    (obj.macros || []).forEach(function (mac) {
      var name = String(mac.name || '').replace(/^&/, '');
      if (!name) return;
      var bindings = (mac.bindings || []).map(bindingToString);
      var entry = {
        name: name, label: '', kind: 'macro', cells: (mac.params || []).length,
        bindings: bindings,
        params: (mac.params || []).slice(),
        desc: mac.description || describeBehavior(name, '', 'macro', bindings),
        layer: null, layerParam: null
      };
      detectLayerReach(entry, defines);
      out[name] = entry;
    });

    return out;
  }

  function structuredCombos(obj) {
    return (obj.combos || []).map(function (c) {
      // The editor writes `layers: [-1]` for "every layer"; an empty list means
      // the same thing everywhere else. Left as -1 it matches no layer at all
      // and the combo silently never renders.
      var layers = (c.layers || []).filter(function (l) { return l >= 0; });
      return {
        name: c.name || '',
        desc: c.description || '',
        binding: bindingToString(c.binding),
        keys: (c.keyPositions || []).slice(),
        layers: layers,
        timeoutMs: c.timeoutMs
      };
    });
  }

  function parseMoergoJson(obj) {
    if (!obj || !Array.isArray(obj.layers)) {
      return { error: 'Not a MoErgo layout export — no `layers` array.' };
    }
    var warnings = [];
    var errors = [];
    var names = obj.layer_names || [];
    var layers = obj.layers.map(function (layer) {
      return (layer || []).map(bindingToString);
    });
    var layerNames = layers.map(function (_, i) { return names[i] || ('Layer ' + i); });
    var keyCount = checkLayerSizes(layers, layerNames, errors);

    // Only the current export shape is supported: behaviours as structured
    // `holdTaps` / `macros` arrays. The pre-firmware_api_version exports put
    // them in `custom_defined_behaviors` as devicetree text, which resolves to
    // a completely different code path — refuse rather than half-read it.
    var legacy = [obj.custom_defined_behaviors, obj.custom_devicetree]
      .filter(function (t) { return t && String(t).trim(); });
    if (legacy.length) {
      errors.push('Legacy export: behaviours are devicetree text in ' +
        'custom_defined_behaviors/custom_devicetree. This tool only reads the current ' +
        'format (structured holdTaps/macros/combos arrays). Re-export from my.moergo.com/go60.');
    }
    var defines = {};
    var behaviors = structuredBehaviors(obj, defines);

    return {
      source: 'moergo-json',
      keyboard: obj.keyboard || null,
      keyCount: keyCount,
      title: obj.title || 'Untitled layout',
      notes: obj.notes || '',
      creator: obj.creator || '',
      tags: obj.tags || [],
      date: obj.date || null,
      firmwareApi: obj.firmware_api_version,
      layerNames: layerNames,
      layers: layers,
      defines: defines,
      behaviors: behaviors,
      combos: structuredCombos(obj),
      inputListeners: obj.inputListeners || [],
      config: obj.config_parameters || [],
      warnings: warnings,
      errors: errors
    };
  }

  // -------------------------------------------------------------- validation

  /**
   * Refuse anything we would have to guess about.
   *
   * The failure this guards against is silent: an unrecognised binding still
   * renders — as a prettified version of its own name — so a wrong picture
   * looks exactly like a right one. `&mod_tab_v2_TKZ LCTRL` reads as "Tab"
   * when it is actually Ctrl. Better to stop.
   */
  function validate(model) {
    var errors = (model.errors || []).slice();
    var warnings = (model.warnings || []).slice();

    if (model.keyboard && String(model.keyboard).toLowerCase() !== KEYBOARD) {
      errors.push('This layout is for "' + model.keyboard + '". This tool only supports the ' +
        KEYBOARD + ' (MoErgo Go60).');
    }
    if (!model.layers || !model.layers.length) {
      errors.push('No layers found.');
    }
    if (model.layerNames && model.layers &&
        model.layerNames.length !== model.layers.length) {
      warnings.push('layer_names has ' + model.layerNames.length + ' entries for ' +
        model.layers.length + ' layers.');
    }

    // Every binding head must be a known built-in or defined by this layout.
    var unresolved = {};
    (model.layers || []).forEach(function (layer, li) {
      layer.forEach(function (binding, i) {
        var head = String(binding || '').trim().split(/\s+/)[0];
        if (!head) return;
        if (Codes.isBuiltin(head)) return;
        if (model.behaviors && model.behaviors[head.replace(/^&/, '')]) return;
        var key = head;
        (unresolved[key] = unresolved[key] || []).push(model.layerNames[li] + ' #' + i);
      });
    });
    var names = Object.keys(unresolved);
    if (names.length) {
      errors.push('Undefined behaviour' + (names.length > 1 ? 's' : '') + ': ' +
        names.map(function (n) {
          var at = unresolved[n];
          return n + ' (' + at.length + '×, first at ' + at[0] + ')';
        }).join('; ') +
        '. Not a ZMK/MoErgo built-in and not defined by this layout — its parameters ' +
        'cannot be interpreted, so the legend would be a guess.');
    }

    model.errors = errors;
    model.warnings = warnings;
    model.ok = errors.length === 0;
    return model;
  }

  // ------------------------------------------------------------------- auto

  /** Accept a string (JSON or devicetree) or an already-parsed object. */
  function parseAuto(input, meta) {
    if (input && typeof input === 'object') return validate(parseMoergoJson(input));
    var text = String(input || '');
    var trimmed = text.replace(/^﻿/, '').trim();
    if (trimmed[0] === '{') {
      var obj;
      try {
        obj = JSON.parse(trimmed);
      } catch (e) {
        return { error: 'Looks like JSON but failed to parse: ' + e.message };
      }
      return validate(parseMoergoJson(obj));
    }
    var km = parseKeymap(text, meta);
    return km.error ? km : validate(km);
  }

  return {
    KEYBOARD: KEYBOARD,
    KEY_COUNT: KEY_COUNT,
    validate: validate,
    parseAuto: parseAuto,
    parseKeymap: parseKeymap,
    parseMoergoJson: parseMoergoJson,
    splitBindings: splitBindings,
    extractBehaviors: extractBehaviors,
    extractCombos: extractCombos,
    extractDefines: extractDefines,
    extractPointerSpeeds: extractPointerSpeeds,
    bindingToString: bindingToString
  };
});
