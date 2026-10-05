(function () {
  "use strict";

  var appRoot = document.querySelector(".app");
  if (!appRoot || appRoot.getAttribute("data-booted") === "1") return;
  if (!window.Roses) return;
  appRoot.setAttribute("data-booted", "1");

  var ROOT = (function () {
    function baseFrom(src) {
      var at = (src || "").lastIndexOf("studio.js");
      return at === -1 ? "" : src.slice(0, at);
    }
    var current = document.currentScript && document.currentScript.getAttribute("src");
    var fromCurrent = baseFrom(current);
    if (fromCurrent || (current && current.indexOf("studio.js") !== -1)) return fromCurrent;
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var found = baseFrom(scripts[i].getAttribute("src") || "");
      if (found || (scripts[i].getAttribute("src") || "").indexOf("studio.js") !== -1) return found;
    }
    return "";
  })();

  function asset(path) {
    return ROOT + path;
  }

  var KEY = "roses.draft.v1";
  var NONCE_KEY = "roses.nonce";
  var sourceEl = document.getElementById("source");
  var gutter = document.getElementById("gutter");
  var stageFrame = document.getElementById("stage");
  var fields = document.getElementById("fields");
  var gameName = document.getElementById("game-name");
  var engineName = document.getElementById("engine-name");
  var docState = document.getElementById("doc-state");
  var stageError = document.getElementById("stage-error");
  var menu = document.getElementById("export-menu");
  var exportBtn = document.getElementById("btn-export");
  var banner = document.getElementById("banner");
  var peekEl = document.getElementById("peek");
  var peekWrap = document.getElementById("peek-wrap");
  var flashEl = document.getElementById("flash");
  var statTick = document.getElementById("stat-tick");
  var statCount = document.getElementById("stat-count");
  var statMs = document.getElementById("stat-ms");
  var statMode = document.getElementById("stat-mode");
  var runBtn = document.getElementById("btn-run");
  var speedBtn = document.getElementById("btn-speed");

  var runtimeSource = "";
  var sharedSource = "";
  var defaultSource = "";
  var defaultGame = null;
  var game = { name: "Hearth", params: {} };
  var lastMeta = null;
  var fieldSig = "";
  var mode = "game";
  var running = true;
  var speed = 1;
  var stageReady = false;
  var broken = false;
  var pendingDraft = null;
  var gutterLines = 0;
  var editTimer = 0;
  var iconBytes = null;
  var iconGen = 0;
  var paramTimer = 0;
  var saveTimer = 0;
  var flashTimer = 0;
  var nonce = localStorage.getItem(NONCE_KEY);
  if (!nonce) {
    nonce = Math.random().toString(36).slice(2);
    localStorage.setItem(NONCE_KEY, nonce);
  }

  var clone = window.Roses.clone;

  function flash(text) {
    flashEl.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      flashEl.textContent = "";
    }, 3200);
  }

  function renderGutter() {
    var n = sourceEl.value.split("\n").length;
    if (n === gutterLines) return;
    gutterLines = n;
    var lines = new Array(n);
    for (var i = 0; i < n; i++) lines[i] = String(i + 1);
    gutter.textContent = lines.join("\n");
  }

  function jsonForHtml(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function srcdoc(runtime) {
    var bundle = jsonForHtml(sharedSource + "\n" + runtime);
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" +
      "html,body{margin:0;height:100%;background:#140f0d;overflow:hidden}" +
      "canvas{display:block;width:100%;height:100%;touch-action:none}" +
      "</style></head><body><canvas id=\"stage\" tabindex=\"0\"></canvas>" +
      "<script type=\"application/json\" id=\"roses-bundle\">" + bundle + "</script>" +
      "<script>window.__ROSES_PREVIEW__=true;" +
      "new Function(JSON.parse(document.getElementById(\"roses-bundle\").textContent))();</script>" +
      "</body></html>"
    );
  }

  function send(msg) {
    if (!stageReady || !stageFrame.contentWindow) return;
    stageFrame.contentWindow.postMessage(msg, "*");
  }

  function activeParams() {
    if (mode === "defaults" && lastMeta && lastMeta.defaults) return clone(lastMeta.defaults);
    return clone(game.params || {});
  }

  function applyNow() {
    clearTimeout(editTimer);
    docState.textContent = broken ? "error" : "live";
    send({ type: "boot", source: sourceEl.value, params: activeParams() });
    saveSoon();
  }

  function scheduleEdit() {
    docState.textContent = "editing";
    clearTimeout(editTimer);
    editTimer = setTimeout(applyNow, 650);
    saveSoon();
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ source: sourceEl.value, game: game }));
    } catch (err) {
      /* Storage can be full. The document is still on screen. */
    }
  }

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (err) {
      return null;
    }
  }

  function setMode(next) {
    mode = next;
    document.getElementById("mode-game").setAttribute("aria-pressed", next === "game" ? "true" : "false");
    document.getElementById("mode-defaults").setAttribute("aria-pressed", next === "defaults" ? "true" : "false");
    statMode.textContent = next === "game" ? "game" : "defaults";
    send({ type: "params", params: activeParams() });
  }

  function setRunning(next) {
    running = next;
    runBtn.textContent = running ? "Pause" : "Run";
  }

  function buildFields(defaults) {
    fields.innerHTML = "";
    var names = Object.keys(defaults || {});
    for (var i = 0; i < names.length; i++) {
      var key = names[i];
      var sample = defaults[key];
      if (!Object.prototype.hasOwnProperty.call(game.params, key)) game.params[key] = clone(sample);
      var hint = key === "placements"
        ? "Each entry is { x, y, mix }. x and y are 0–1. mix is 0 deep rose, 1 paper."
        : "";
      window.Roses.appendField(fields, key, game.params[key], sample, hint);
    }
  }

  function fillFields() {
    gameName.value = game.name || "";
    var inputs = fields.querySelectorAll("[data-key]");
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var value = game.params[input.dataset.key];
      if (input.dataset.json === "1") input.value = JSON.stringify(value == null ? null : value, null, 2);
      else if (input.type === "checkbox") input.checked = !!value;
      else input.value = value == null ? "" : value;
    }
  }

  function readFields() {
    var params = Object.assign({}, game.params);
    var inputs = fields.querySelectorAll("[data-key]");
    var bad = false;
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var key = input.dataset.key;
      if (input.dataset.json === "1") {
        try {
          params[key] = JSON.parse(input.value);
          input.classList.remove("is-bad");
        } catch (err) {
          input.classList.add("is-bad");
          bad = true;
        }
      } else if (input.type === "checkbox") {
        params[key] = input.checked;
      } else if (input.type === "number") {
        var n = Number(input.value);
        if (Number.isFinite(n)) params[key] = n;
      } else {
        params[key] = input.value;
      }
    }
    if (bad) {
      flash("A parameter is not valid JSON.");
      return;
    }
    game.params = params;
    game.name = gameName.value.trim() || "Untitled";
    saveSoon();
    if (mode !== "game") return;
    clearTimeout(paramTimer);
    paramTimer = setTimeout(function () {
      send({ type: "params", params: clone(game.params) });
    }, 180);
  }

  function onMeta(meta) {
    lastMeta = meta;
    broken = false;
    stageError.hidden = true;
    engineName.textContent = meta.name || "Untitled engine";
    document.title = (meta.name || "Engine") + " — ROSES";
    docState.textContent = "live";
    var sig = Object.keys(meta.defaults || {}).sort().join("|");
    if (sig !== fieldSig) {
      fieldSig = sig;
      buildFields(meta.defaults || {});
    }
  }

  function onMessage(ev) {
    if (ev.source !== stageFrame.contentWindow) return;
    var msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready") {
      stageReady = true;
      applyNow();
    } else if (msg.type === "meta") {
      onMeta(msg.meta || {});
    } else if (msg.type === "error") {
      broken = true;
      docState.textContent = "error";
      stageError.hidden = false;
      stageError.textContent = msg.message || "The engine stopped.";
      setRunning(false);
    } else if (msg.type === "warn") {
      flash(msg.message || "Warning.");
    } else if (msg.type === "stats") {
      statTick.textContent = "tick " + msg.tick;
      statCount.textContent = msg.count + " entities";
      statMs.textContent = msg.ms + " ms";
      if (typeof msg.running === "boolean") setRunning(msg.running);
    } else if (msg.type === "running") {
      setRunning(!!msg.running);
    } else if (msg.type === "peek" && peekWrap.open) {
      peekEl.textContent = msg.text || "";
    }
  }

  function closeMenu() {
    menu.hidden = true;
    exportBtn.setAttribute("aria-expanded", "false");
  }

  function slug(value) {
    var text = String(value || "roses")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return text || "roses";
  }

  function tomlQuote(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .slice(0, 80);
  }

  function bytesToBase64(bytes) {
    var bin = "";
    var chunk = 0x2000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function download(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/octet-stream" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 15000);
  }

  var EXPORT_CSS = "html,body{margin:0;height:100%;background:#140f0d;color:#f3eee4;font-family:Palatino,'Palatino Linotype','Iowan Old Style','Liberation Serif',Georgia,serif}\n" +
    "canvas{display:block;width:100%;height:100%;touch-action:none}\n" +
    "#hud{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:10px 12px;pointer-events:none}\n" +
    "#hud button,#hud summary,#hud label,#hud input,#hud textarea,#hud details{pointer-events:auto}\n" +
    "#title{margin:8px 0 0;font-size:22px;font-weight:500;font-style:italic;text-shadow:0 1px 10px #140f0d}\n" +
    ".hud-actions{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end}\n" +
    "#hud button,#hud summary{background:transparent;color:#f3eee4;border:1px solid rgba(243,238,228,.35);min-height:44px;padding:0 12px;font:inherit;cursor:pointer}\n" +
    "#readout{position:fixed;left:12px;bottom:12px;margin:0;font-variant-numeric:tabular-nums;font-size:12px;letter-spacing:.08em;color:rgba(243,238,228,.75);pointer-events:none}\n" +
    "#warn{position:fixed;left:12px;right:12px;bottom:76px;margin:0;padding:10px 12px;color:#f3eee4;border:1px solid rgba(243,238,228,.35);background:rgba(20,15,13,.88)}\n" +
    "#err{position:fixed;left:12px;right:12px;bottom:40px;margin:0;padding:10px 12px;background:#f3eee4;color:#6e2426}\n" +
    ".panel{position:relative}\n" +
    ".sheet{position:absolute;right:0;top:48px;width:min(320px,86vw);background:#f3eee4;color:#211815;padding:12px;border:1px solid rgba(33,24,21,.14);max-height:62vh;overflow:auto}\n" +
    ".sheet button{display:block;width:100%;margin:0 0 8px;color:#211815;background:#fffdf8;border:1px solid rgba(33,24,21,.18)}\n" +
    ".field,.check{display:flex;flex-direction:column;gap:4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}\n" +
    ".check{flex-direction:row;align-items:center;text-transform:none;letter-spacing:0;font-size:14px}\n" +
    ".sheet input,.sheet textarea{font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#211815;background:#fffdf8;border:1px solid rgba(33,24,21,.2);padding:8px;width:100%}\n" +
    ".hint{font-size:13px;line-height:1.4;text-transform:none;letter-spacing:0;color:#8a7d72}\n" +
    ".is-bad{border-color:#8f3030}\n";

  function buildExportHtml(kind) {
    var isGame = kind === "game";
    var title = isGame ? game.name || "Game" : (lastMeta && lastMeta.name) || "Engine";
    var params = isGame ? game.params || {} : (lastMeta && lastMeta.defaults) || {};
    var gameRecord = { kind: isGame ? "game" : "engine", title: title, params: params };
    var html =
      "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">" +
      "<title>" +
      title.replace(/[&<>]/g, function (ch) {
        return { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;" }[ch];
      }) +
      "</title><script src=\"webxdc.js\"></script><style>" +
      EXPORT_CSS +
      "</style></head><body><canvas id=\"stage\" tabindex=\"0\"></canvas><div id=\"hud\"></div>" +
      "<script type=\"application/json\" id=\"roses-engine\">" + jsonForHtml(sourceEl.value) + "</script>" +
      "<script type=\"application/json\" id=\"roses-game\">" + jsonForHtml(gameRecord) + "</script>" +
      "<script type=\"application/json\" id=\"roses-runtime\">" + jsonForHtml(sharedSource + "\n" + runtimeSource) + "</script>" +
      "<script>new Function(JSON.parse(document.getElementById(\"roses-runtime\").textContent))();</script>" +
      "</body></html>";
    var manifest = 'name = "' + tomlQuote(title) + '"\n';
    return { html: html, manifest: manifest, title: title, filename: slug(title) + (isGame ? ".xdc" : "-engine.xdc") };
  }

  function pack(kind) {
    if (!window.RosesZip) {
      flash("Packer missing.");
      return;
    }
    if (kind === "engine" && !lastMeta) {
      flash("Let the stage read the engine before packing a sandbox.");
      closeMenu();
      return;
    }
    var built = buildExportHtml(kind);
    Promise.all([
      iconBytes ? Promise.resolve(iconBytes) : fetch(asset("icon.png")).then(function (res) { return res.arrayBuffer(); }),
      fetch(asset("LICENSE")).then(function (res) { return res.text(); }),
    ]).then(function (parts) {
      var license = parts[1];
      var html = "<!--\n" + license.trim() + "\n-->\n" + built.html;
      var zip = window.RosesZip.buildZip([
        { name: "index.html", data: html },
        { name: "manifest.toml", data: built.manifest },
        { name: "icon.png", data: new Uint8Array(parts[0]) },
        { name: "LICENSE", data: license },
      ]);
      var realChat = window.webxdc && !window.webxdc.__rosesShim && typeof window.webxdc.sendToChat === "function";
      if (realChat) {
        window.webxdc.sendToChat({
          file: { name: built.filename, base64: bytesToBase64(zip) },
          text: built.title + " — packed by ROSES",
        }).catch(function () {
          download(zip, built.filename);
        });
        flash("Handing " + built.filename + " to the chat.");
      } else {
        download(zip, built.filename);
        flash(broken ? "Packed " + built.filename + ". The stage last reported an error." : "Packed " + built.filename);
      }
      closeMenu();
    }).catch(function () {
      flash("Could not pack the app.");
    });
  }

  function pushDraft() {
    var payload = {
      kind: "roses-draft",
      nonce: nonce,
      source: sourceEl.value,
      game: game,
      senderName: window.webxdc && window.webxdc.selfName ? String(window.webxdc.selfName).slice(0, 48) : "",
      senderAddr: window.webxdc && window.webxdc.selfAddr ? String(window.webxdc.selfAddr).slice(0, 80) : "",
    };
    var size = 0;
    try {
      size = JSON.stringify(payload).length;
    } catch (err) {
      flash("This draft cannot be serialized.");
      return;
    }
    if (size > 100000) {
      flash("Draft is too large to sync.");
      return;
    }
    save();
    if (!window.webxdc || typeof window.webxdc.sendUpdate !== "function") {
      flash("Saved on this device.");
      return;
    }
    try {
      window.webxdc.sendUpdate({ payload: payload, info: "ROSES draft" }, "ROSES draft");
    } catch (err) {
      flash("The chat refused the draft.");
      return;
    }
    flash(window.webxdc.__rosesShim ? "Draft kept in the local shim." : "Draft sent to the chat.");
  }

  function applyDraft() {
    if (!pendingDraft) return;
    sourceEl.value = pendingDraft.source || "";
    game = pendingDraft.game || { name: "Untitled", params: {} };
    gameName.value = game.name || "";
    fieldSig = "";
    if (lastMeta) buildFields(lastMeta.defaults || {});
    fillFields();
    renderGutter();
    banner.hidden = true;
    applyNow();
    save();
  }

  function restoreSample() {
    sourceEl.value = defaultSource;
    game = clone(defaultGame);
    gameName.value = game.name || "Hearth";
    fieldSig = "";
    iconBytes = null;
    var iconInput = document.getElementById("game-icon");
    if (iconInput) iconInput.value = "";
    renderGutter();
    try { localStorage.removeItem(KEY); } catch (err) {}
    applyNow();
    flash("Sample restored.");
  }

  sourceEl.addEventListener("input", function () {
    renderGutter();
    scheduleEdit();
  });
  sourceEl.addEventListener("scroll", function () {
    gutter.scrollTop = sourceEl.scrollTop;
  });
  sourceEl.addEventListener("keydown", function (ev) {
    if (ev.key === "Tab") {
      ev.preventDefault();
      var start = sourceEl.selectionStart;
      var end = sourceEl.selectionEnd;
      sourceEl.value = sourceEl.value.slice(0, start) + "  " + sourceEl.value.slice(end);
      sourceEl.selectionStart = sourceEl.selectionEnd = start + 2;
      renderGutter();
      scheduleEdit();
    } else if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      applyNow();
    } else if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
      ev.preventDefault();
      save();
      flash("Saved on this device.");
    }
  });

  fields.addEventListener("input", readFields);
  gameName.addEventListener("input", function () {
    game.name = gameName.value.trim() || "Untitled";
    saveSoon();
  });
  document.getElementById("mode-game").addEventListener("click", function () { setMode("game"); });
  document.getElementById("mode-defaults").addEventListener("click", function () { setMode("defaults"); });
  runBtn.addEventListener("click", function () {
    send(running ? { type: "pause" } : { type: "resume" });
    setRunning(!running);
  });
  document.getElementById("btn-step").addEventListener("click", function () {
    send({ type: "step" });
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    send({ type: "params", params: activeParams() });
  });
  speedBtn.addEventListener("click", function () {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    speedBtn.textContent = speed + "×";
    send({ type: "speed", speed: speed });
  });
  document.getElementById("restore").addEventListener("click", restoreSample);
  var iconInput = document.getElementById("game-icon");
  if (iconInput) {
    iconInput.addEventListener("change", function () {
      var gen = ++iconGen;
      var file = iconInput.files && iconInput.files[0];
      if (!file) {
        iconBytes = null;
        return;
      }
      if (file.size > 262144) {
        iconBytes = null;
        iconInput.value = "";
        flash("Icon must be a PNG under 256 KB.");
        return;
      }
      file.arrayBuffer().then(function (buf) {
        if (gen !== iconGen) return;
        var bytes = new Uint8Array(buf);
        var png = bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
        if (!png) {
          iconBytes = null;
          iconInput.value = "";
          flash("That file is not a PNG.");
          return;
        }
        iconBytes = bytes;
        flash("Icon kept for the next export.");
      }).catch(function () {
        if (gen !== iconGen) return;
        iconBytes = null;
        flash("The icon could not be read.");
      });
    });
  }
  document.getElementById("btn-sync").addEventListener("click", pushDraft);
  document.getElementById("banner-apply").addEventListener("click", applyDraft);
  document.getElementById("banner-dismiss").addEventListener("click", function () {
    banner.hidden = true;
    pendingDraft = null;
  });
  exportBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    exportBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
  });
  document.getElementById("export-engine").addEventListener("click", function () { pack("engine"); });
  document.getElementById("export-game").addEventListener("click", function () { pack("game"); });
  document.addEventListener("click", function (ev) {
    if (!menu.hidden && !exportBtn.parentNode.contains(ev.target)) closeMenu();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") closeMenu();
  });
  window.addEventListener("message", onMessage);

  if (window.webxdc && typeof window.webxdc.setUpdateListener === "function") {
    var draftSettled = false;
    var heldDraft = null;
    var heldDraftSerial = 0;
    var bannerText = document.getElementById("banner-text");

    function showDraft(payload) {
      pendingDraft = payload;
      var name = typeof payload.senderName === "string"
        ? payload.senderName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 48)
        : "";
      if (bannerText) {
        bannerText.textContent = name
          ? "A draft arrived from " + name + ". Applying it runs that code on this device."
          : "A draft arrived from the chat. Applying it runs that code on this device.";
      }
      banner.hidden = false;
    }

    function finishDrafts() {
      if (draftSettled) return;
      draftSettled = true;
      if (heldDraft) showDraft(heldDraft);
    }

    function onDraft(update) {
      var payload = update && update.payload;
      var usable = payload && payload.kind === "roses-draft" && payload.nonce !== nonce && typeof payload.source === "string";
      if (!draftSettled) {
        if (usable && (update.serial || 0) >= heldDraftSerial) {
          heldDraftSerial = update.serial || 0;
          heldDraft = payload;
        }
        return;
      }
      if (usable) showDraft(payload);
    }

    var draftsDone = window.webxdc.setUpdateListener(onDraft, 0);
    if (draftsDone && typeof draftsDone.then === "function") draftsDone.then(finishDrafts, finishDrafts);
    else finishDrafts();
  }

  Promise.all([
    fetch(asset("shared.js")).then(function (res) { return res.text(); }),
    fetch(asset("runtime.js")).then(function (res) { return res.text(); }),
    fetch(asset("samples/mote.js")).then(function (res) { return res.text(); }),
    fetch(asset("samples/hearth.json")).then(function (res) { return res.json(); }),
  ]).then(function (parts) {
    sharedSource = parts[0];
    runtimeSource = parts[1];
    defaultSource = parts[2];
    defaultGame = parts[3];
    var saved = loadDraft();
    if (saved && typeof saved.source === "string" && saved.game) {
      sourceEl.value = saved.source;
      game = saved.game;
    } else {
      sourceEl.value = defaultSource;
      game = clone(defaultGame);
    }
    gameName.value = game.name || "Hearth";
    renderGutter();
    stageFrame.srcdoc = srcdoc(runtimeSource);
  }).catch(function () {
    stageError.hidden = false;
    stageError.textContent = "The studio could not load its scaffold.";
  });
})();
