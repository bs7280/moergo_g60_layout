/*
 * ZMK binding -> display legend.
 *
 * `format(binding, ctx)` takes a raw binding string as it appears in a
 * `.keymap` file (e.g. "&lt 2 SPACE", "&kp LC(LS(A))", "&magic MAGIC 0") and
 * returns what to paint on the keycap:
 *
 *   { top, main, sub, cls, layer, raw, desc }
 *
 *   top   small legend at the top of the cap (the hold action, modifiers, ...)
 *   main  the primary legend
 *   sub   small legend at the bottom (qualifiers like "L"/"R", "num", ...)
 *   cls   category, used for colouring
 *   layer layer index this key activates, if any
 *   desc  a sentence describing the binding, for the inspector
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.G80Keycodes = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- keycodes
  // code -> [main, cls, sub?]
  var K = {};

  function def(codes, main, cls, sub) {
    codes.split(' ').forEach(function (c) { K[c] = [main, cls, sub]; });
  }

  // letters
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (c) { K[c] = [c, 'alpha']; });

  // digits
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
    K['N' + d] = [d, 'num'];
    K['NUMBER_' + d] = [d, 'num'];
  });

  // punctuation / symbols
  def('EXCL EXCLAMATION', '!', 'punct');
  def('AT AT_SIGN', '@', 'punct');
  def('HASH POUND', '#', 'punct');
  def('DLLR DOLLAR', '$', 'punct');
  def('PRCNT PERCENT', '%', 'punct');
  def('CARET', '^', 'punct');
  def('AMPS AMPERSAND', '&', 'punct');
  def('ASTRK ASTERISK STAR', '*', 'punct');
  def('LPAR LEFT_PARENTHESIS', '(', 'punct');
  def('RPAR RIGHT_PARENTHESIS', ')', 'punct');
  def('MINUS SUBTRACT', '-', 'punct');
  def('UNDER UNDERSCORE', '_', 'punct');
  def('EQUAL', '=', 'punct');
  def('PLUS', '+', 'punct');
  def('LBKT LEFT_BRACKET', '[', 'punct');
  def('RBKT RIGHT_BRACKET', ']', 'punct');
  def('LBRC LEFT_BRACE', '{', 'punct');
  def('RBRC RIGHT_BRACE', '}', 'punct');
  def('BSLH BACKSLASH', '\\', 'punct');
  def('PIPE', '|', 'punct');
  def('NON_US_BSLH NON_US_BACKSLASH', '\\', 'punct', 'non-US');
  def('NON_US_HASH', '#', 'punct', 'non-US');
  def('SEMI SEMICOLON', ';', 'punct');
  def('COLON', ':', 'punct');
  def('SQT APOS SINGLE_QUOTE APOSTROPHE', '\'', 'punct');   // ASCII U+0027, not a typographic ’
  def('DQT DOUBLE_QUOTES', '"', 'punct');
  def('GRAVE', '`', 'punct');
  def('TILDE', '~', 'punct');
  def('COMMA', ',', 'punct');
  def('LT LESS_THAN', '<', 'punct');
  def('DOT PERIOD', '.', 'punct');
  def('GT GREATER_THAN', '>', 'punct');
  def('FSLH SLASH', '/', 'punct');
  def('QMARK QUESTION', '?', 'punct');

  // whitespace / editing
  def('SPACE', 'Space', 'edit');
  def('RET ENTER RETURN', '⏎', 'edit', 'Enter');
  def('TAB', 'Tab', 'edit');
  def('ESC ESCAPE', 'Esc', 'edit');
  def('BSPC BACKSPACE', '⌫', 'edit', 'Bksp');
  def('DEL DELETE', '⌦', 'edit', 'Del');
  def('INS INSERT', 'Ins', 'edit');
  def('CAPS CAPSLOCK', 'Caps', 'edit');

  // navigation
  def('LEFT LEFT_ARROW', '←', 'nav');
  def('RIGHT RIGHT_ARROW', '→', 'nav');
  def('UP UP_ARROW', '↑', 'nav');
  def('DOWN DOWN_ARROW', '↓', 'nav');
  def('HOME', 'Home', 'nav');
  def('END', 'End', 'nav');
  def('PG_UP PAGE_UP', 'PgUp', 'nav');
  def('PG_DN PAGE_DOWN', 'PgDn', 'nav');

  // function row
  for (var f = 1; f <= 24; f++) K['F' + f] = ['F' + f, 'fn'];

  // system / misc
  def('PSCRN PRINTSCREEN', 'PrtSc', 'system');
  def('SLCK SCROLLLOCK', 'ScrLk', 'system');
  def('PAUSE_BREAK PAUSE', 'Pause', 'system');
  def('K_CMENU K_APP K_MENU', 'Menu', 'system');
  def('K_POWER', 'Power', 'system');
  def('K_SLEEP', 'Sleep', 'system');
  def('K_LOCK', 'Lock', 'system');
  def('GLOBE', 'Globe', 'system');

  // media / consumer
  // Monochrome glyphs / words only — colour emoji fight with the flat keycaps.
  def('C_MUTE K_MUTE', 'Mute', 'media');
  def('C_VOL_UP K_VOL_UP C_VOLUME_UP', 'Vol +', 'media');
  def('C_VOL_DN K_VOL_DN C_VOLUME_DOWN', 'Vol −', 'media');
  def('C_PP C_PLAY_PAUSE K_PLAY_PAUSE', '⏯', 'media', 'Play');
  def('C_NEXT K_NEXT', '⏭', 'media', 'Next');
  def('C_PREV K_PREV', '⏮', 'media', 'Prev');
  def('C_STOP K_STOP', '⏹', 'media', 'Stop');
  def('C_BRI_UP C_BRIGHTNESS_INC', 'Bri +', 'media');
  def('C_BRI_DN C_BRIGHTNESS_DEC', 'Bri −', 'media');
  def('C_AL_CALC', 'Calc', 'media');
  def('C_AC_SEARCH', 'Search', 'media');

  // keypad
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
    K['KP_N' + d] = [d, 'keypad', 'num'];
    K['KP_NUMBER_' + d] = [d, 'keypad', 'num'];
  });
  def('KP_PLUS', '+', 'keypad', 'num');
  def('KP_MINUS KP_SUBTRACT', '-', 'keypad', 'num');
  def('KP_MULTIPLY KP_ASTERISK', '*', 'keypad', 'num');
  def('KP_DIVIDE KP_SLASH', '/', 'keypad', 'num');
  def('KP_DOT', '.', 'keypad', 'num');
  def('KP_COMMA', ',', 'keypad', 'num');
  def('KP_EQUAL', '=', 'keypad', 'num');
  def('KP_ENTER', '⏎', 'keypad', 'num');
  def('KP_NUM KP_NUMLOCK', 'Num', 'keypad');

  // modifiers -- glyphs depend on the OS preset
  var MODS = {
    LSHFT: ['⇧', 'L'], RSHFT: ['⇧', 'R'],
    LSHIFT: ['⇧', 'L'], RSHIFT: ['⇧', 'R'],
    LCTRL: ['⌃', 'L'], RCTRL: ['⌃', 'R'],
    LALT: ['mac:⌥|pc:Alt', 'L'], RALT: ['mac:⌥|pc:Alt', 'R'],
    LGUI: ['mac:⌘|pc:Win', 'L'], RGUI: ['mac:⌘|pc:Win', 'R'],
    LCMD: ['mac:⌘|pc:Win', 'L'], RCMD: ['mac:⌘|pc:Win', 'R'],
    LMETA: ['mac:⌘|pc:Win', 'L'], RMETA: ['mac:⌘|pc:Win', 'R'],
    LWIN: ['mac:⌘|pc:Win', 'L'], RWIN: ['mac:⌘|pc:Win', 'R']
  };
  Object.keys(MODS).forEach(function (m) { K[m] = [MODS[m][0], 'mod', MODS[m][1]]; });

  // modifier-function wrappers, e.g. LC(A)
  var MOD_FN = {
    LC: '⌃', RC: '⌃',
    LS: '⇧', RS: '⇧',
    LA: 'mac:⌥|pc:Alt', RA: 'mac:⌥|pc:Alt',
    LG: 'mac:⌘|pc:Win', RG: 'mac:⌘|pc:Win'
  };

  function osGlyph(s, os) {
    if (typeof s !== 'string' || s.indexOf('mac:') !== 0) return s;
    var parts = s.split('|');
    var mac = parts[0].slice(4), pc = parts[1].slice(3);
    return os === 'pc' ? pc : mac;
  }

  // What a shifted key produces on a US layout (this layout's `locale` is
  // en-US). Used only to make symbol layers readable — the ⇧ marker is kept.
  var SHIFTED_US = {};
  (function () {
    // Same alias spellings the base keycode table accepts, so nothing silently
    // falls through to the unshifted glyph.
    var pairs = [
      ['N1 NUMBER_1', '!'], ['N2 NUMBER_2', '@'], ['N3 NUMBER_3', '#'],
      ['N4 NUMBER_4', '$'], ['N5 NUMBER_5', '%'], ['N6 NUMBER_6', '^'],
      ['N7 NUMBER_7', '&'], ['N8 NUMBER_8', '*'], ['N9 NUMBER_9', '('],
      ['N0 NUMBER_0', ')'],
      ['MINUS SUBTRACT', '_'], ['EQUAL', '+'],
      ['LBKT LEFT_BRACKET', '{'], ['RBKT RIGHT_BRACKET', '}'],
      ['BSLH BACKSLASH', '|'], ['SEMI SEMICOLON', ':'],
      ['SQT APOS SINGLE_QUOTE APOSTROPHE', '"'],
      ['GRAVE', '~'], ['COMMA', '<'], ['DOT PERIOD', '>'], ['FSLH SLASH', '?']
    ];
    pairs.forEach(function (p) {
      p[0].split(' ').forEach(function (code) { SHIFTED_US[code] = p[1]; });
    });
  })();

  // Well-known modifier stacks.
  var MOD_STACKS = [
    { mods: ['LC', 'LS', 'LA', 'LG'], name: 'Hyper' },
    { mods: ['LC', 'LS', 'LA'], name: 'Meh' }
  ];

  // ------------------------------------------------------------- keycode fmt

  /** Split "LC(LS(A))" into { mods: ['LC','LS'], code: 'A' }. */
  function unwrapMods(code) {
    var mods = [];
    var s = String(code).trim();
    for (;;) {
      var m = /^([LR][CSAG])\s*\(\s*([\s\S]*)\)\s*$/.exec(s);
      if (!m) break;
      mods.push(m[1]);
      s = m[2].trim();
    }
    return { mods: mods, code: s };
  }

  /** Format a bare keycode (no behaviour prefix). */
  function keycode(code, os) {
    var u = unwrapMods(code);
    var base = K[u.code];
    var main, cls, sub;
    if (base) {
      main = osGlyph(base[0], os);
      cls = base[1];
      sub = base[2];
    } else {
      main = u.code.replace(/^(KP_|C_|K_)/, '');
      cls = 'other';
      sub = null;
    }

    if (!u.mods.length) return { main: main, top: '', sub: sub || '', cls: cls };

    // A bare `LALT` inside `LC(LS(LG(LALT)))` is the innermost "key", so fold
    // it into the modifier stack rather than showing it as the main legend.
    var mods = u.mods.slice();
    var innerIsMod = MODS[u.code];
    if (innerIsMod) {
      var asFn = { LSHFT: 'LS', RSHFT: 'RS', LCTRL: 'LC', RCTRL: 'RC', LALT: 'LA', RALT: 'RA', LGUI: 'LG', RGUI: 'RG' }[u.code];
      if (asFn) { mods.push(asFn); main = ''; cls = 'mod'; sub = ''; }
    }

    var norm = mods.map(function (m) { return m.replace(/^R/, 'L'); });

    // A lone shift over a key with a shifted form: show what it actually types.
    // The ⇧ marker stays on top, so nothing is hidden — `LS(N9)` reads "⇧ (".
    if (norm.length === 1 && norm[0] === 'LS' && SHIFTED_US[u.code]) {
      return { main: SHIFTED_US[u.code], top: '⇧', sub: '', cls: 'punct' };
    }
    for (var i = 0; i < MOD_STACKS.length; i++) {
      var st = MOD_STACKS[i];
      if (st.mods.length === norm.length && st.mods.every(function (m) { return norm.indexOf(m) >= 0; })) {
        return { main: main || st.name, top: main ? st.name : '', sub: sub || '', cls: 'mod' };
      }
    }

    var glyphs = mods.map(function (m) { return osGlyph(MOD_FN[m], os); }).join('');
    return { main: main || glyphs, top: main ? glyphs : '', sub: sub || '', cls: main ? cls : 'mod' };
  }

  // ------------------------------------------------------------- binding fmt

  /** Split "&lt 2 SPACE" into ["&lt", "2", "SPACE"], respecting nested parens. */
  function tokenize(binding) {
    var out = [], depth = 0, cur = '';
    var s = String(binding).trim();
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (/\s/.test(c) && depth === 0) {
        if (cur) { out.push(cur); cur = ''; }
      } else {
        cur += c;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function layerName(idx, ctx) {
    if (ctx && ctx.layerNames && ctx.layerNames[idx] != null) return ctx.layerNames[idx];
    return 'L' + idx;
  }

  /** Resolve a layer argument, which may be a number or a #define'd name. */
  function layerIndex(tok, ctx) {
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    if (ctx && ctx.defines && ctx.defines[tok] != null) {
      var v = ctx.defines[tok];
      if (/^\d+$/.test(String(v))) return parseInt(v, 10);
    }
    if (ctx && ctx.layerNames) {
      var i = ctx.layerNames.indexOf(tok);
      if (i >= 0) return i;
    }
    return null;
  }

  var MOUSE_BTN = {
    LCLK: 'L Click', MB1: 'L Click',
    RCLK: 'R Click', MB2: 'R Click',
    MCLK: 'M Click', MB3: 'M Click',
    MB4: 'Back', MB5: 'Fwd'
  };
  var MOUSE_DIR = {
    MOVE_UP: '↑', MOVE_DOWN: '↓', MOVE_LEFT: '←', MOVE_RIGHT: '→'
  };
  var MOUSE_SCRL = {
    SCRL_UP: '↑', SCRL_DOWN: '↓', SCRL_LEFT: '←', SCRL_RIGHT: '→'
  };

  var BT_LABEL = {
    BT_CLR: ['BT Clr', 'Clear this BT profile'],
    BT_CLR_ALL: ['BT Clr All', 'Clear all BT profiles'],
    BT_NXT: ['BT ▶', 'Next BT profile'],
    BT_PRV: ['BT ◀', 'Previous BT profile']
  };

  var RGB_LABEL = {
    RGB_TOG: 'Tog', RGB_HUI: 'Hue+', RGB_HUD: 'Hue-', RGB_SAI: 'Sat+', RGB_SAD: 'Sat-',
    RGB_BRI: 'Bri+', RGB_BRD: 'Bri-', RGB_SPI: 'Spd+', RGB_SPD: 'Spd-',
    RGB_EFF: 'Eff▶', RGB_EFR: 'Eff◀', RGB_ON: 'On', RGB_OFF: 'Off',
    RGB_STATUS: 'Status', RGB_COLOR_HSB: 'Color'
  };

  /**
   * @param {string} binding  raw ZMK binding, e.g. "&lt LOWER SPACE"
   * @param {object} ctx      { os, layerNames, defines, behaviors }
   */
  function format(binding, ctx) {
    ctx = ctx || {};
    var os = ctx.os || 'mac';
    var raw = String(binding || '').trim();
    var t = tokenize(raw);
    var head = t[0] || '';
    var p = t.slice(1);
    var out = { top: '', main: '', sub: '', cls: 'other', layer: null, raw: raw, desc: raw };

    function withLayer(idx, prefix, arrow, desc) {
      var nm = layerName(idx, ctx);
      out.layer = idx;
      out.cls = 'layer';
      out.main = nm;
      out.top = arrow || '';
      out.sub = prefix || '';
      out.desc = desc;
      return out;
    }

    switch (head) {
      case '&kp': {
        var kc = keycode(p.join(' '), os);
        out.main = kc.main; out.top = kc.top; out.sub = kc.sub; out.cls = kc.cls;
        out.desc = 'Tap: ' + (p.join(' ') || '?');
        return out;
      }
      case '&mo': {
        var i1 = layerIndex(p[0], ctx);
        return withLayer(i1, 'hold', '', 'Hold to activate layer ' + layerName(i1, ctx));
      }
      case '&to': {
        var i2 = layerIndex(p[0], ctx);
        return withLayer(i2, 'to', '→', 'Switch to layer ' + layerName(i2, ctx) + ' (turns off others)');
      }
      case '&tog': {
        var i3 = layerIndex(p[0], ctx);
        return withLayer(i3, 'toggle', '⇄', 'Toggle layer ' + layerName(i3, ctx));
      }
      case '&sl': {
        var i4 = layerIndex(p[0], ctx);
        return withLayer(i4, 'sticky', '⊕', 'Sticky layer ' + layerName(i4, ctx) + ' for one keypress');
      }
      case '&lt': {
        var i5 = layerIndex(p[0], ctx);
        var tap = keycode(p.slice(1).join(' '), os);
        out.layer = i5;
        out.cls = 'layertap';
        out.main = tap.main;
        out.top = layerName(i5, ctx);
        out.sub = tap.sub || '';
        out.desc = 'Hold: layer ' + layerName(i5, ctx) + '  ·  Tap: ' + p.slice(1).join(' ');
        return out;
      }
      case '&mt': {
        var hold = keycode(p[0], os);
        var tap2 = keycode(p.slice(1).join(' '), os);
        out.cls = 'modtap';
        out.main = tap2.main;
        out.top = hold.main;
        out.sub = tap2.sub || '';
        out.desc = 'Hold: ' + p[0] + '  ·  Tap: ' + p.slice(1).join(' ');
        return out;
      }
      case '&sk': {
        var sk = keycode(p.join(' '), os);
        out.cls = 'mod'; out.main = sk.main; out.top = '⊕'; out.sub = 'sticky';
        out.desc = 'Sticky ' + p.join(' ') + ' — applies to the next keypress';
        return out;
      }
      case '&mkp': {
        out.cls = 'mouse'; out.sub = 'mouse';
        out.main = MOUSE_BTN[p[0]] || (p[0] || '').replace(/^MB/, 'Btn ');
        out.desc = 'Mouse button: ' + (p[0] || '?');
        return out;
      }
      case '&mmv': {
        out.cls = 'mouse'; out.sub = 'move';
        out.main = MOUSE_DIR[p[0]] || (p[0] || '');
        out.desc = 'Move the pointer: ' + (p[0] || '?');
        return out;
      }
      case '&msc': {
        out.cls = 'mouse'; out.sub = 'scroll';
        out.main = MOUSE_SCRL[p[0]] || (p[0] || '');
        out.desc = 'Scroll: ' + (p[0] || '?');
        return out;
      }
      case '&trans':
        out.cls = 'trans'; out.main = '▽';
        out.desc = 'Transparent — falls through to the layer below';
        return out;
      case '&none':
        out.cls = 'none'; out.main = '';
        out.desc = 'No binding';
        return out;
      case '&bt': {
        out.cls = 'system';
        if (p[0] === 'BT_SEL') {
          out.main = 'BT ' + p[1]; out.sub = 'profile';
          out.desc = 'Select Bluetooth profile ' + p[1];
        } else if (BT_LABEL[p[0]]) {
          out.main = BT_LABEL[p[0]][0]; out.desc = BT_LABEL[p[0]][1];
        } else {
          out.main = (p[0] || 'BT').replace('BT_', 'BT ');
        }
        return out;
      }
      case '&out': {
        out.cls = 'system';
        out.main = { OUT_USB: 'USB', OUT_BLE: 'BLE', OUT_TOG: 'USB/BLE' }[p[0]] || p[0];
        out.sub = 'output';
        out.desc = 'Set endpoint output to ' + (p[0] || '?');
        return out;
      }
      case '&rgb_ug': {
        out.cls = 'rgb'; out.main = RGB_LABEL[p[0]] || (p[0] || '').replace('RGB_', '');
        out.sub = 'RGB';
        out.desc = 'Underglow: ' + (p[0] || '?');
        return out;
      }
      case '&bl': {
        out.cls = 'rgb'; out.main = (p[0] || '').replace('BL_', '') || 'BL'; out.sub = 'backlight';
        out.desc = 'Backlight: ' + (p[0] || '?');
        return out;
      }
      case '&ext_power': {
        out.cls = 'system'; out.main = (p[0] || '').replace('EP_', 'Pwr '); out.sub = 'power';
        out.desc = 'External power: ' + (p[0] || '?');
        return out;
      }
      case '&bootloader':
        out.cls = 'system'; out.main = 'Boot'; out.sub = 'loader';
        out.desc = 'Reboot into the bootloader (firmware flashing)';
        return out;
      case '&sys_reset':
      case '&reset':
        out.cls = 'system'; out.main = 'Reset'; out.desc = 'Reset the keyboard';
        return out;
      case '&caps_word':
        out.cls = 'edit'; out.main = 'CapsWd'; out.desc = 'Caps word — shift until the next word break';
        return out;
      case '&key_repeat':
        out.cls = 'edit'; out.main = 'Repeat'; out.desc = 'Repeat the previous keypress';
        return out;
      case '&studio_unlock':
        out.cls = 'system'; out.main = 'Studio'; out.sub = 'unlock';
        out.desc = 'Unlock ZMK Studio';
        return out;
      case '':
        out.cls = 'none';
        return out;
    }

    // Unknown head: a macro or a custom behaviour defined by the layout.
    var name = head.replace(/^&/, '');
    var beh = ctx.behaviors && ctx.behaviors[name];

    // Built-in Bluetooth profile macros shipped in MoErgo firmware, and this
    // layout's &bt_hop_N replacements (tools/edits/bt-mouse-follow.js) that
    // tap a desktop hotkey first so the machine being left pushes the mouse
    // to the same host. Named unambiguously, so don't let a definition drag
    // them down the macro path.
    var btm = /^bt_(hop_)?(\d+)$/.exec(name);
    if (btm) {
      out.cls = 'system'; out.main = 'BT ' + btm[2];
      out.sub = btm[1] ? '+mouse' : 'profile';
      out.desc = 'Switch output to Bluetooth profile ' + btm[2] + (btm[1] ?
        ' — taps Ctrl+Shift+F' + (17 + +btm[2]) + ' first, so the machine ' +
        'being left pushes the mouse to the same host' : '');
      return out;
    }

    // A hold-tap defines its own hold/tap behaviours; the call site supplies
    // their parameters. `&thumb_v2_TKZ 5 BSPC` over <&mo, &kp> means
    // "hold = &mo 5, tap = &kp BSPC".
    if (beh && beh.kind === 'hold-tap' && beh.holdTap) {
      var holdStr = joinBinding(beh.holdTap.hold, p[0]);
      var tapStr = joinBinding(beh.holdTap.tap, p[1]);
      var hf = format(holdStr, ctx);
      var tf = format(tapStr, ctx);
      out.main = tf.main || tf.top || '';
      out.top = hf.layer != null ? layerName(hf.layer, ctx) : (hf.main || hf.top || '');
      out.sub = tf.sub || '';
      out.layer = hf.layer;
      out.cls = hf.layer != null ? 'layertap' : (hf.cls === 'mod' ? 'modtap' : 'macro');
      out.desc = shortName(name).full + ' — hold: ' + holdStr + '  ·  tap: ' + tapStr +
        (beh.tappingTermMs ? '  ·  ' + beh.tappingTermMs + 'ms' : '') +
        (beh.flavor ? ' ' + beh.flavor : '');
      return out;
    }

    // The JSON export writes `&magic` with its parameters stripped, while the
    // .keymap keeps `&magic LAYER_Magic 0` and resolves as a normal hold-tap.
    // Only the degraded form lands here.
    if (name === 'magic' && !beh) {
      out.cls = 'system'; out.main = 'Magic'; out.sub = 'firmware';
      out.desc = 'MoErgo magic key — this export records no parameters, so the ' +
        'layer it holds for is unknown here. The .keymap export has them.';
      return out;
    }

    if (name === 'rgb_ug_status_macro') {
      out.cls = 'rgb'; out.main = 'Status'; out.sub = 'RGB';
      out.desc = 'Flash the underglow to report battery / connection status';
      return out;
    }

    var sn = shortName(name);

    // A parameterised macro: the payload keycode is the useful legend, the
    // macro name is the qualifier (e.g. autoshift wrappers around every key).
    if (beh && beh.kind === 'macro' && p.length) {
      var payload = null;
      for (var pi = 0; pi < p.length; pi++) {
        if (!/^\d+$/.test(p[pi])) { payload = p[pi]; break; }
      }
      if (payload) {
        var pf = keycode(payload, os);
        out.main = pf.main; out.top = pf.top; out.cls = pf.cls;
        out.sub = sn.family || sn.short;
        out.desc = (beh.desc || sn.full) + ' — ' + raw;
        return out;
      }
    }

    // Layer reached via the definition, or via a named invocation parameter.
    var target = null;
    if (beh && beh.layerParam != null && p[beh.layerParam] != null) target = layerIndex(p[beh.layerParam], ctx);
    else if (beh && beh.layer != null) target = beh.layer;
    // Unknown behaviour called with a single plain layer index, e.g. `&layer 8`.
    else if (!beh && p.length === 1 && /^\d+$/.test(p[0]) && ctx.layerNames && +p[0] < ctx.layerNames.length) {
      target = +p[0];
    }

    if (target != null) {
      out.layer = target;
      out.cls = 'layer';
      out.main = layerName(target, ctx);
      out.top = '';
      // The behaviour *kind* is a more useful qualifier than a mangled name.
      out.sub = (beh && beh.kind) ? beh.kind : sn.short;
      out.desc = (beh && beh.desc ? beh.desc : 'Custom behaviour `' + name + '`') +
        ' → layer ' + layerName(target, ctx);
      return out;
    }

    out.cls = 'macro';
    out.main = sn.rest;
    out.sub = sn.family || (beh && beh.kind ? beh.kind : 'custom');
    out.desc = (beh && beh.desc ? beh.desc : 'Custom behaviour `' + name + '`') +
      (p.length ? ' (' + p.join(' ') + ')' : '');
    return out;
  }

  /** `&mo` + `5` -> `&mo 5`; a bound behaviour with no parameter stays as-is. */
  function joinBinding(behavior, param) {
    var b = String(behavior || '').trim();
    if (!b) return '&none';
    return param == null ? b : b + ' ' + param;
  }

  /**
   * Community layouts (TailorKey and friends) name behaviours like
   * `cur_SELECT_LINE_v1_TKZ`. Strip the version/author suffix and peel off a
   * lowercase family prefix so the cap shows "Select Line" over "cur".
   */
  function shortName(name) {
    var s = String(name).replace(/_v\d+([_-][A-Za-z0-9]+)?$/, '').replace(/_TKZ$/i, '');
    var m = /^([a-z][a-z0-9]{1,5})_(.+)$/.exec(s);
    var family = m ? m[1] : '';
    var rest = m ? m[2] : s;
    return { full: name, short: prettyLabel(s), family: family, rest: prettyLabel(rest) };
  }

  function prettyLabel(s) {
    return String(s)
      .replace(/[_\s]*(hold[_\s]*tap|tap[_\s]*dance|mod[_\s]*morph|sticky[_\s]*key|macro)[_\s]*\d*$/i, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || String(s);
  }

  // Behaviour heads this formatter understands without a definition. Anything
  // outside this set that also isn't defined by the layout is a binding we'd be
  // guessing at — validation treats that as a hard failure rather than
  // rendering a name-derived guess.
  var BUILTIN_ZMK = [
    '&kp', '&mo', '&to', '&tog', '&sl', '&lt', '&mt', '&sk',
    '&mkp', '&mmv', '&msc', '&trans', '&none',
    '&bt', '&out', '&rgb_ug', '&bl', '&ext_power',
    '&bootloader', '&sys_reset', '&reset', '&caps_word', '&key_repeat', '&studio_unlock',
    // only seen inside macro definitions, never in a layer
    '&macro_press', '&macro_tap', '&macro_release', '&macro_wait_time', '&macro_tap_time',
    '&macro_param_1to1', '&macro_param_1to2', '&macro_param_2to1', '&macro_param_2to2'
  ];

  // Shipped in MoErgo firmware, so they never appear in an export's definition
  // arrays even though layers reference them.
  var BUILTIN_MOERGO = ['&magic', '&layer', '&bt_0', '&bt_1', '&bt_2', '&bt_3', '&rgb_ug_status_macro'];

  var BUILTINS = {};
  BUILTIN_ZMK.concat(BUILTIN_MOERGO).forEach(function (b) { BUILTINS[b] = true; });

  /** Is this binding head understood without a layout-supplied definition? */
  function isBuiltin(head) {
    return !!BUILTINS[String(head || '').trim()];
  }

  /**
   * The ZMK keycode a *tap* of this binding produces, or null if tapping it
   * emits nothing (a plain layer hold, a macro, `&none`). Resolves through
   * hold-taps so `&HRM_right_index_v1_TKZ RSHFT J` answers `J`.
   */
  function tapKeycode(binding, ctx) {
    ctx = ctx || {};
    var t = tokenize(binding);
    var head = t[0] || '';
    var p = t.slice(1);
    switch (head) {
      case '&kp': return p.join(' ') || null;
      case '&lt': return p.slice(1).join(' ') || null;
      case '&mt': return p.slice(1).join(' ') || null;
      case '&sk': return null;
      case '&mo': case '&to': case '&tog': case '&sl': case '&trans': case '&none': return null;
    }
    var beh = ctx.behaviors && ctx.behaviors[head.replace(/^&/, '')];
    if (beh && beh.kind === 'hold-tap' && beh.holdTap) {
      var tap = String(beh.holdTap.tap || '');
      if (tap === '&kp') return p[1] != null ? p[1] : null;
      return tapKeycode(tap + (p[1] != null ? ' ' + p[1] : ''), ctx);
    }
    if (beh && beh.kind === 'macro' && p.length) {
      for (var i = 0; i < p.length; i++) if (!/^\d+$/.test(p[i])) return p[i];
    }
    return null;
  }

  // ZMK keycode -> KeyboardEvent.code, for recognising a physical key press.
  var BROWSER_CODE = {
    N1: 'Digit1', N2: 'Digit2', N3: 'Digit3', N4: 'Digit4', N5: 'Digit5',
    N6: 'Digit6', N7: 'Digit7', N8: 'Digit8', N9: 'Digit9', N0: 'Digit0',
    MINUS: 'Minus', EQUAL: 'Equal', LBKT: 'BracketLeft', RBKT: 'BracketRight',
    BSLH: 'Backslash', SEMI: 'Semicolon', SQT: 'Quote', SINGLE_QUOTE: 'Quote',
    GRAVE: 'Backquote', COMMA: 'Comma', DOT: 'Period', FSLH: 'Slash',
    TAB: 'Tab', ESC: 'Escape', SPACE: 'Space', RET: 'Enter', ENTER: 'Enter',
    BSPC: 'Backspace', DEL: 'Delete', HOME: 'Home', END: 'End',
    PG_UP: 'PageUp', PG_DN: 'PageDown',
    LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown'
  };

  /** `J` -> "KeyJ", `F13` -> "F13", `SEMI` -> "Semicolon". */
  function toBrowserCode(code) {
    var c = String(code == null ? '' : code).trim();
    if (!c) return null;
    if (/^[A-Z]$/.test(c)) return 'Key' + c;
    if (/^F([1-9]|1\d|2[0-4])$/.test(c)) return c;
    return BROWSER_CODE[c] || null;
  }

  var CATEGORIES = [
    ['alpha', 'Letter'],
    ['num', 'Number'],
    ['punct', 'Symbol'],
    ['edit', 'Edit / whitespace'],
    ['nav', 'Navigation'],
    ['fn', 'Function'],
    ['mod', 'Modifier'],
    ['modtap', 'Mod-tap'],
    ['layer', 'Layer'],
    ['layertap', 'Layer-tap'],
    ['keypad', 'Keypad'],
    ['mouse', 'Mouse'],
    ['media', 'Media'],
    ['system', 'System / BT'],
    ['rgb', 'Lighting'],
    ['macro', 'Macro / custom'],
    ['trans', 'Transparent'],
    ['none', 'Unbound'],
    ['other', 'Other']
  ];

  return {
    format: format,
    keycode: keycode,
    tokenize: tokenize,
    layerIndex: layerIndex,
    isBuiltin: isBuiltin,
    tapKeycode: tapKeycode,
    toBrowserCode: toBrowserCode,
    CATEGORIES: CATEGORIES,
    KEYCODES: K
  };
});
