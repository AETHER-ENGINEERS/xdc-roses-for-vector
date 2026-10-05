/* Studio theme. The engine document does not see these choices. */
(function () {
  "use strict";

  var KEY = "roses.theme.v1";
  var NIGHT = { ground: "#07060b", ink: "#f3efe6", accent: "#6d3fa8", second: "#1e6b45" };
  var THEMES = [
    { id: "night", name: "Night garden", a: "#07060b", b: "#6d3fa8", c: "#1e6b45" },
    { id: "hearth", name: "Hearth", a: "#f3eee4", b: "#8f3030", c: "#2f6b45" },
    { id: "inkwell", name: "Inkwell", a: "#0c0b0a", b: "#c47a3a", c: "#efe6d6" },
    { id: "tide", name: "Tide", a: "#06110f", b: "#d4b483", c: "#2f8f78" },
    { id: "custom", name: "Custom", a: "#07060b", b: "#6d3fa8", c: "#1e6b45" },
  ];
  var UI_FONTS = [
    { id: "palatino", name: "Palatino", stack: '"Iowan Old Style", Palatino, "Palatino Linotype", "Liberation Serif", Georgia, serif' },
    { id: "georgia", name: "Georgia", stack: 'Georgia, "Liberation Serif", "Times New Roman", serif' },
    { id: "sans", name: "Sans", stack: 'system-ui, "Segoe UI", "Liberation Sans", sans-serif' },
    { id: "mono", name: "Mono", stack: 'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace' },
  ];
  var CODE_FONTS = [
    { id: "mono", name: "System mono", stack: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace' },
    { id: "consolas", name: "Consolas", stack: 'Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace' },
    { id: "palatino", name: "Palatino", stack: '"Iowan Old Style", Palatino, Georgia, serif' },
  ];
  var COLOR_VARS = ["--ink", "--paper", "--paper-2", "--rose", "--rose-deep", "--accent-2", "--mist", "--line", "--stage", "--field", "--on-accent"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeHex(value) {
    var text = String(value || "").trim();
    if (text.charAt(0) !== "#") text = "#" + text;
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      text = "#" + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(text)) return "";
    return text.toLowerCase();
  }

  function rgb(hex) {
    var n = normalizeHex(hex);
    if (!n) return null;
    return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
  }

  function hex(channels) {
    function part(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + part(channels[0]) + part(channels[1]) + part(channels[2]);
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function luma(channels) {
    return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
  }

  function findFont(list, id, fallback) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return fallback;
  }

  function fresh() {
    return { id: "night", ui: "palatino", code: "mono", custom: clone(NIGHT) };
  }

  function load() {
    var saved = fresh();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || typeof raw !== "object") return saved;
      if (THEMES.some(function (theme) { return theme.id === raw.id; })) saved.id = raw.id;
      if (findFont(UI_FONTS, raw.ui, null)) saved.ui = raw.ui;
      if (findFont(CODE_FONTS, raw.code, null)) saved.code = raw.code;
      ["ground", "ink", "accent", "second"].forEach(function (key) {
        var next = raw.custom && normalizeHex(raw.custom[key]);
        if (next) saved.custom[key] = next;
      });
    } catch (err) {}
    return saved;
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {}
  }

  function clearCustomVars() {
    for (var i = 0; i < COLOR_VARS.length; i++) document.documentElement.style.removeProperty(COLOR_VARS[i]);
  }

  function apply(state) {
    var root = document.documentElement;
    root.setAttribute("data-theme", state.id);
    root.style.setProperty("--serif", findFont(UI_FONTS, state.ui, UI_FONTS[0]).stack);
    root.style.setProperty("--mono", findFont(CODE_FONTS, state.code, CODE_FONTS[0]).stack);
    if (state.id !== "custom") {
      clearCustomVars();
      root.style.colorScheme = "";
      return;
    }
    var ground = rgb(state.custom.ground) || rgb(NIGHT.ground);
    var ink = rgb(state.custom.ink) || rgb(NIGHT.ink);
    var accent = rgb(state.custom.accent) || rgb(NIGHT.accent);
    var second = rgb(state.custom.second) || rgb(NIGHT.second);
    var dark = luma(ground) < 0.45;
    var lift = dark ? [255, 255, 255] : [0, 0, 0];
    var paper2 = mix(ground, lift, dark ? 0.07 : 0.06);
    var field = mix(ground, lift, dark ? 0.045 : 0.5);
    var stage = mix(ground, [0, 0, 0], dark ? 0.45 : 0.82);
    var deep = mix(accent, [0, 0, 0], 0.28);
    var mist = mix(ink, ground, 0.42);
    var onAccent = luma(accent) > 0.62 ? "#161018" : "#f6f1ea";
    root.style.setProperty("--paper", hex(ground));
    root.style.setProperty("--paper-2", hex(paper2));
    root.style.setProperty("--ink", hex(ink));
    root.style.setProperty("--rose", hex(accent));
    root.style.setProperty("--rose-deep", hex(deep));
    root.style.setProperty("--accent-2", hex(second));
    root.style.setProperty("--mist", hex(mist));
    root.style.setProperty("--line", "rgba(" + ink[0] + "," + ink[1] + "," + ink[2] + ",0.16)");
    root.style.setProperty("--stage", hex(stage));
    root.style.setProperty("--field", hex(field));
    root.style.setProperty("--on-accent", onAccent);
    root.style.colorScheme = dark ? "dark" : "light";
  }

  var state = load();
  apply(state);

  function bind() {
    var app = document.querySelector(".app");
    var menu = document.getElementById("theme-menu");
    var button = document.getElementById("btn-theme");
    var swatches = document.getElementById("theme-swatches");
    if (!app || !menu || !button || !swatches || app.getAttribute("data-theme-bound") === "1") return;
    app.setAttribute("data-theme-bound", "1");

    var customBox = document.getElementById("custom-fields");
    var uiSelect = document.getElementById("font-ui");
    var codeSelect = document.getElementById("font-code");

    function paintSwatches() {
      swatches.textContent = "";
      for (var i = 0; i < THEMES.length; i++) {
        var theme = THEMES[i];
        var item = document.createElement("button");
        item.type = "button";
        item.className = "swatch";
        item.setAttribute("aria-pressed", state.id === theme.id ? "true" : "false");
        var dot = document.createElement("i");
        var a = theme.id === "custom" ? state.custom.ground : theme.a;
        var b = theme.id === "custom" ? state.custom.accent : theme.b;
        var c = theme.id === "custom" ? state.custom.second : theme.c;
        dot.style.setProperty("--swatch-a", a);
        dot.style.setProperty("--swatch-b", b);
        dot.style.setProperty("--swatch-c", c);
        item.appendChild(dot);
        item.appendChild(document.createTextNode(theme.name));
        item.addEventListener("click", function (id) {
          return function () {
            state.id = id;
            save(state);
            apply(state);
            sync();
          };
        }(theme.id));
        swatches.appendChild(item);
      }
    }

    function fillSelect(select, list, current) {
      select.textContent = "";
      for (var i = 0; i < list.length; i++) {
        var option = document.createElement("option");
        option.value = list[i].id;
        option.textContent = list[i].name;
        option.selected = list[i].id === current;
        select.appendChild(option);
      }
    }

    function syncHexes() {
      ["ground", "ink", "accent", "second"].forEach(function (key) {
        var color = customBox.querySelector('[data-key="' + key + '"]');
        var text = customBox.querySelector('[data-hex="' + key + '"]');
        if (color) color.value = state.custom[key];
        if (text && document.activeElement !== text) text.value = state.custom[key];
      });
    }

    function sync() {
      paintSwatches();
      customBox.hidden = state.id !== "custom";
      fillSelect(uiSelect, UI_FONTS, state.ui);
      fillSelect(codeSelect, CODE_FONTS, state.code);
      syncHexes();
    }

    function chooseCustom(key, value) {
      var next = normalizeHex(value);
      var text = customBox.querySelector('[data-hex="' + key + '"]');
      if (!next) {
        if (text) text.classList.add("is-bad");
        return;
      }
      if (text) text.classList.remove("is-bad");
      state.custom[key] = next;
      state.id = "custom";
      save(state);
      apply(state);
      sync();
    }

    customBox.addEventListener("input", function (ev) {
      var node = ev.target;
      if (node.getAttribute("data-key")) chooseCustom(node.getAttribute("data-key"), node.value);
      if (node.getAttribute("data-hex") && normalizeHex(node.value)) chooseCustom(node.getAttribute("data-hex"), node.value);
    });
    customBox.addEventListener("change", function (ev) {
      var node = ev.target;
      var key = node.getAttribute("data-hex");
      if (!key) return;
      if (!normalizeHex(node.value)) {
        node.value = state.custom[key];
        node.classList.remove("is-bad");
      }
    });

    uiSelect.addEventListener("change", function () {
      state.ui = uiSelect.value;
      save(state);
      apply(state);
    });
    codeSelect.addEventListener("change", function () {
      state.code = codeSelect.value;
      save(state);
      apply(state);
    });

    button.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var exp = document.getElementById("export-menu");
      var expBtn = document.getElementById("btn-export");
      if (exp) exp.hidden = true;
      if (expBtn) expBtn.setAttribute("aria-expanded", "false");
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    });
    document.addEventListener("click", function (ev) {
      if (!menu.hidden && !button.contains(ev.target) && !menu.contains(ev.target)) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });

    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
