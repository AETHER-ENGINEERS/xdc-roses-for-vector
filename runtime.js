/* ROSES scaffold. Owns the clock, input, canvas, and webxdc wiring.
   The engine document only defines what is possible. */
(function () {
  "use strict";

  var preview = !!window.__ROSES_PREVIEW__;
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d", { alpha: false });
  var engine = null;
  var state = null;
  var running = true;
  var speed = 1;
  var broken = false;
  var acc = 0;
  var last = 0;
  var stepMsMeasure = 0;
  var view = { w: 1, h: 1, dpr: 1, fresh: true };
  var keys = {};
  var pointer = { x: 0, y: 0, nx: 0, ny: 0, down: false, inside: false };
  var justDown = false;
  var justUp = false;
  var play = null;
  var baked = null;
  var selfNonce = Math.random().toString(36).slice(2);
  var channel = null;
  var peers = {};
  var lastRemote = null;
  var remoteMismatch = false;
  var follow = false;
  var broadcast = false;
  var broadcastNoted = false;
  var oversizeNoted = false;
  var lastSendNote = "";
  var lastBroadcast = 0;
  var lastPtrSent = 0;
  var lastStats = 0;
  var lastPeek = 0;
  var webxdcApi = null;
  var cursorId = "c-" + Math.random().toString(36).slice(2);

  function post(msg) {
    if (!preview || !window.parent) return;
    try {
      window.parent.postMessage(msg, "*");
    } catch (err) {
      /* The studio is gone. Keep the stage alive. */
    }
  }

  function fail(err) {
    if (broken) return;
    broken = true;
    running = false;
    var message = err && err.message ? err.message : String(err);
    post({ type: "error", message: message });
    var warn = document.getElementById("warn");
    if (warn) warn.hidden = true;
    var node = document.getElementById("err");
    if (node) {
      node.hidden = false;
      node.textContent = message;
    }
    var pauseBtn = document.getElementById("pause");
    if (pauseBtn) pauseBtn.textContent = "Run";
  }

  function compile(source) {
    var factory = new Function(
      '"use strict";\n' +
        source +
        '\n; return (typeof createEngine === "function") ? createEngine : null;',
    );
    var create = factory();
    if (!create) throw new Error("Define createEngine() in the engine document.");
    var built = create();
    if (
      !built ||
      typeof built.create !== "function" ||
      typeof built.step !== "function" ||
      typeof built.draw !== "function"
    ) {
      throw new Error("createEngine() must return create, step, and draw.");
    }
    return built;
  }

  function clone(value) {
    return window.Roses.clone(value);
  }

  function boot(source, params) {
    engine = compile(source);
    state = engine.create(clone(params || {}));
    if (!state || typeof state !== "object") throw new Error("create() must return a JSON object.");
    state.tick = 0;
    broken = false;
    running = !follow;
    view.fresh = true;
    acc = 0;
    var err = document.getElementById("err");
    if (err) err.hidden = true;
    var warn = document.getElementById("warn");
    if (warn) warn.hidden = true;
    var pauseBtn = document.getElementById("pause");
    if (pauseBtn) pauseBtn.textContent = running ? "Pause" : "Run";
    post({
      type: "meta",
      meta: {
        id: engine.id || "engine",
        name: engine.name || "Untitled engine",
        tickMs: engine.tickMs || 50,
        defaults: engine.defaults || {},
      },
    });
    var title = document.getElementById("title");
    if (title) title.textContent = (play && play.title) || engine.name || "ROSES";
  }

  function applyParams(params) {
    if (!engine) return;
    var userPaused = !running && !broken;
    state = engine.create(clone(params || {}));
    if (!state || typeof state !== "object") throw new Error("create() must return a JSON object.");
    state.tick = 0;
    broken = false;
    running = !follow && !userPaused;
    view.fresh = true;
    acc = 0;
    var err = document.getElementById("err");
    if (err) err.hidden = true;
    var warn = document.getElementById("warn");
    if (warn) warn.hidden = true;
    var pauseBtn = document.getElementById("pause");
    if (pauseBtn) pauseBtn.textContent = running ? "Pause" : "Run";
    post({ type: "running", running: running });
  }

  function snapshotInput() {
    return {
      keys: Object.assign({}, keys),
      pointer: {
        x: pointer.x,
        y: pointer.y,
        nx: pointer.nx,
        ny: pointer.ny,
        down: pointer.down,
        inside: pointer.inside,
      },
      justDown: justDown,
      justUp: justUp,
    };
  }

  function entityCount(value) {
    if (!value || typeof value !== "object") return 0;
    var n = 0;
    var names = Object.keys(value);
    for (var i = 0; i < names.length; i++) {
      if (Array.isArray(value[names[i]])) n += value[names[i]].length;
    }
    return n;
  }

  function oneStep() {
    if (!engine || !state || broken) return;
    var t0 = performance.now();
    var nextTick = (state.tick | 0) + 1;
    state = engine.step(state, snapshotInput()) || state;
    if (!state || typeof state !== "object") throw new Error("step() must return the state object.");
    state.tick = nextTick;
    justDown = false;
    justUp = false;
    stepMsMeasure = performance.now() - t0;
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var bw = Math.max(1, Math.floor(w * dpr));
    var bh = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      view.fresh = true;
    }
    view.w = w;
    view.h = h;
    view.dpr = dpr;
  }

  function drawPeers() {
    var now = performance.now();
    var ids = Object.keys(peers);
    if (!ids.length) return;
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    for (var i = 0; i < ids.length; i++) {
      var peer = peers[ids[i]];
      if (now - peer.seen > 3000) continue;
      ctx.beginPath();
      ctx.arc(peer.x * view.w, peer.y * view.h, peer.d ? 10 : 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(243, 238, 228, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  var sizeDirty = true;
  var seenDpr = -1;
  var watchSize = typeof ResizeObserver === "function";
  if (watchSize) {
    new ResizeObserver(function () { sizeDirty = true; }).observe(canvas);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(100, now - last);
    last = now;
    var peerIds = Object.keys(peers);
    for (var p = 0; p < peerIds.length; p++) {
      if (now - peers[peerIds[p]].seen > 5000) delete peers[peerIds[p]];
    }
    var dprNow = Math.min(window.devicePixelRatio || 1, 2);
    if (!watchSize || sizeDirty || dprNow !== seenDpr) {
      resize();
      seenDpr = dprNow;
      sizeDirty = false;
    }
    if (running && engine && state && !broken && !follow) {
      acc += dt * speed;
      var stepMs = engine.tickMs || 50;
      var guard = 0;
      while (acc >= stepMs && guard++ < 6) {
        try {
          oneStep();
        } catch (err) {
          fail(err);
          break;
        }
        acc -= stepMs;
      }
    }
    if (engine && state && !broken) {
      try {
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        engine.draw(ctx, state, view);
        view.fresh = false;
        drawPeers();
      } catch (err) {
        fail(err);
      }
    }
    if (preview && state && now - lastStats > 250) {
      lastStats = now;
      post({
        type: "stats",
        tick: state.tick | 0,
        count: entityCount(state),
        ms: Math.round(stepMsMeasure * 10) / 10,
        running: running,
      });
    }
    if (preview && state && now - lastPeek > 500) {
      lastPeek = now;
      var text = "";
      try {
        text = JSON.stringify(state, null, 2);
      } catch (err) {
        text = "";
      }
      if (text.length > 1800) text = text.slice(0, 1800) + "\n…";
      post({ type: "peek", text: text });
    }
    if (!preview) {
      maybePointer(now);
      maybeBroadcast(now);
      var readout = document.getElementById("readout");
      if (readout && state && now - lastStats > 200) {
        lastStats = now;
        readout.textContent = (state.tick | 0) + "  ·  " + entityCount(state) + " entities";
      }
    }
  }

  function setPointer(ev) {
    var rect = canvas.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    var y = ev.clientY - rect.top;
    pointer.x = x;
    pointer.y = y;
    pointer.nx = rect.width ? x / rect.width : 0;
    pointer.ny = rect.height ? y / rect.height : 0;
    pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  }

  canvas.addEventListener("pointerdown", function (ev) {
    canvas.focus();
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {
      /* Some webviews refuse capture. The move events still arrive. */
    }
    setPointer(ev);
    pointer.down = true;
    justDown = true;
  });
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerup", function (ev) {
    setPointer(ev);
    pointer.down = false;
    justUp = true;
  });
  canvas.addEventListener("pointercancel", function () {
    pointer.down = false;
    pointer.inside = false;
  });
  canvas.addEventListener("pointerleave", function () {
    pointer.inside = false;
    if (!pointer.down) return;
  });

  window.addEventListener("keydown", function (ev) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    keys[ev.code] = true;
    if (!preview && ev.code === "Space") {
      ev.preventDefault();
      toggleRun();
    }
  });
  window.addEventListener("keyup", function (ev) {
    keys[ev.code] = false;
  });
  window.addEventListener("blur", function () {
    keys = {};
    pointer.down = false;
  });

  function toggleRun() {
    if (broken || follow) return;
    running = !running;
    var button = document.getElementById("pause");
    if (button) button.textContent = running ? "Pause" : "Run";
    post({ type: "running", running: running });
  }

  window.addEventListener("message", function (ev) {
    if (!preview) return;
    var msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "boot") {
      try {
        boot(msg.source || "", msg.params || {});
      } catch (err) {
        fail(err);
      }
    } else if (msg.type === "params") {
      try {
        applyParams(msg.params || {});
      } catch (err) {
        fail(err);
      }
    } else if (msg.type === "pause") {
      running = false;
      post({ type: "running", running: false });
    } else if (msg.type === "resume") {
      if (!broken) running = true;
      post({ type: "running", running: running });
    } else if (msg.type === "step") {
      try {
        oneStep();
      } catch (err) {
        fail(err);
      }
    } else if (msg.type === "speed") {
      var nextSpeed = Number(msg.speed);
      if (!Number.isFinite(nextSpeed)) nextSpeed = 1;
      speed = Math.max(0.25, Math.min(8, nextSpeed));
    }
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildHud() {
    var hud = document.getElementById("hud");
    if (!hud) return;
    var title = el("h1", null, play.title || "ROSES");
    title.id = "title";
    var actions = el("div", "hud-actions");
    var pause = el("button", null, "Pause");
    pause.id = "pause";
    pause.type = "button";
    var step = el("button", null, "Step");
    step.id = "step";
    step.type = "button";
    actions.appendChild(pause);
    actions.appendChild(step);
    actions.appendChild(syncPanel());
    if (play.kind === "engine") actions.appendChild(rulesPanel());
    hud.appendChild(title);
    hud.appendChild(actions);
    var readout = el("p", null, "");
    readout.id = "readout";
    var err = el("p", null, "");
    err.id = "err";
    err.hidden = true;
    var warn = el("p", null, "");
    warn.id = "warn";
    warn.hidden = true;
    document.body.appendChild(readout);
    document.body.appendChild(warn);
    document.body.appendChild(err);
  }

  function syncPanel() {
    var details = el("details", "panel");
    var summary = el("summary", null, "Sync");
    var sheet = el("div", "sheet");
    var push = el("button", null, "Push snapshot");
    push.type = "button";
    push.id = "push";
    var pull = el("button", null, "Pull latest");
    pull.type = "button";
    pull.id = "pull";
    var broadLabel = el("label", "check");
    var broad = document.createElement("input");
    broad.type = "checkbox";
    broad.id = "broadcast";
    broadLabel.appendChild(broad);
    broadLabel.appendChild(document.createTextNode(" Broadcast"));
    var followLabel = el("label", "check");
    var followBox = document.createElement("input");
    followBox.type = "checkbox";
    followBox.id = "follow";
    followLabel.appendChild(followBox);
    followLabel.appendChild(document.createTextNode(" Follow"));
    var hint = el("p", "hint", "One person broadcasts. Everyone else follows. Both at once will fight.");
    sheet.appendChild(push);
    sheet.appendChild(pull);
    sheet.appendChild(broadLabel);
    sheet.appendChild(followLabel);
    sheet.appendChild(hint);
    details.appendChild(summary);
    details.appendChild(sheet);
    return details;
  }

  function rulesPanel() {
    var details = el("details", "panel");
    details.id = "rules";
    details.open = false;
    var summary = el("summary", null, "Rules");
    var sheet = el("div", "sheet");
    sheet.id = "rule-fields";
    var reset = el("button", null, "Restore baked rules");
    reset.type = "button";
    reset.id = "reset-rules";
    sheet.appendChild(reset);
    fillRuleFields(sheet);
    details.appendChild(summary);
    details.appendChild(sheet);
    return details;
  }

  function fillRuleFields(sheet) {
    var params = play.params || {};
    var names = Object.keys(params);
    for (var i = 0; i < names.length; i++) {
      window.Roses.appendField(sheet, names[i], params[names[i]], params[names[i]], "");
    }
  }

  function readRules() {
    var sheet = document.getElementById("rule-fields");
    if (!sheet) return true;
    var next = Object.assign({}, play.params);
    var inputs = sheet.querySelectorAll("[data-key]");
    var bad = false;
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var key = input.dataset.key;
      if (input.dataset.json === "1") {
        try {
          next[key] = JSON.parse(input.value);
          input.classList.remove("is-bad");
        } catch (err) {
          input.classList.add("is-bad");
          bad = true;
        }
      } else if (input.type === "checkbox") {
        next[key] = input.checked;
      } else if (input.type === "number") {
        var n = Number(input.value);
        if (Number.isFinite(n)) next[key] = n;
      } else {
        next[key] = input.value;
      }
    }
    if (bad) return false;
    play.params = next;
    try {
      localStorage.setItem("roses.play.params", JSON.stringify(next));
    } catch (err) {
      /* Private mode can refuse storage. The stage still runs. */
    }
    return true;
  }

  function wireTransport() {
    var pause = document.getElementById("pause");
    var step = document.getElementById("step");
    if (pause) pause.addEventListener("click", toggleRun);
    if (step) {
      step.addEventListener("click", function () {
        try {
          oneStep();
        } catch (err) {
          fail(err);
        }
      });
    }
    var push = document.getElementById("push");
    var pull = document.getElementById("pull");
    var broad = document.getElementById("broadcast");
    var followBox = document.getElementById("follow");
    if (push) push.addEventListener("click", function () { publish(true); });
    if (pull) {
      pull.addEventListener("click", function () {
        if (!lastRemote) {
          if (remoteMismatch) note("The received state does not match this engine.");
          return;
        }
        try {
          adoptRemote();
        } catch (err) {
          fail(err);
        }
      });
    }
    if (broad) {
      broad.addEventListener("change", function () {
        broadcast = broad.checked;
        if (!broadcast) {
          broadcastNoted = false;
          oversizeNoted = false;
          lastSendNote = "";
        }
      });
    }
    if (followBox) {
      followBox.addEventListener("change", function () {
        follow = followBox.checked;
        running = !follow && !broken;
        if (pause) pause.textContent = running ? "Pause" : "Run";
        if (follow && remoteMismatch && !lastRemote) note("The received state does not match this engine.");
      });
    }
    var sheet = document.getElementById("rule-fields");
    if (sheet) {
      sheet.addEventListener("input", function () {
        if (!readRules()) return;
        try {
          applyParams(play.params);
        } catch (err) {
          fail(err);
        }
      });
    }
    var reset = document.getElementById("reset-rules");
    if (reset) {
      reset.addEventListener("click", function () {
        play.params = clone(baked || {});
        try {
          localStorage.removeItem("roses.play.params");
        } catch (err) {}
        var fields = document.getElementById("rule-fields");
        if (!fields) return;
        fields.innerHTML = "";
        fields.appendChild(reset);
        fillRuleFields(fields);
        try {
          applyParams(play.params);
        } catch (err) {
          fail(err);
        }
      });
    }
  }

  function note(message) {
    post({ type: "warn", message: message });
    var node = document.getElementById("warn");
    if (!node) return;
    node.hidden = false;
    node.textContent = message;
  }

  function valueKind(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  function sameShape(local, remote) {
    if (!local || typeof local !== "object" || Array.isArray(local)) return false;
    var localKeys = Object.keys(local).sort();
    var remoteKeys = Object.keys(remote).sort();
    if (localKeys.join("\0") !== remoteKeys.join("\0")) return false;
    for (var i = 0; i < localKeys.length; i++) {
      if (valueKind(local[localKeys[i]]) !== valueKind(remote[remoteKeys[i]])) return false;
    }
    return true;
  }

  function copyState(raw) {
    if (!state || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (!Number.isFinite(Number(raw.tick))) return null;
    try {
      var copy = JSON.parse(JSON.stringify(raw));
      if (!copy || typeof copy !== "object" || Array.isArray(copy)) return null;
      if (!Number.isFinite(Number(copy.tick))) return null;
      if (!sameShape(state, copy)) return null;
      return copy;
    } catch (err) {
      return null;
    }
  }

  function adoptRemote() {
    var copy = copyState(lastRemote);
    if (!copy) {
      note("The received state does not match this engine.");
      return false;
    }
    state = copy;
    view.fresh = true;
    return true;
  }

  function noteSend(message) {
    if (lastSendNote === message) return;
    lastSendNote = message;
    oversizeNoted = true;
    note(message);
  }

  function clearSendNote() {
    lastSendNote = "";
    oversizeNoted = false;
    var sentWarn = document.getElementById("warn");
    if (
      sentWarn &&
      (sentWarn.textContent === "State too large to broadcast." ||
        sentWarn.textContent === "State could not be sent." ||
        sentWarn.textContent === "The chat refused the snapshot.")
    ) {
      sentWarn.hidden = true;
    }
  }

  function publish(withInfo) {
    if (!webxdcApi || !state) return;
    var payload = { kind: "roses-state", nonce: selfNonce, state: state };
    var json = "";
    try {
      json = JSON.stringify(payload);
    } catch (err) {
      noteSend("State could not be sent.");
      return;
    }
    if (json.length > 60000) {
      noteSend("State too large to broadcast.");
      return;
    }
    var update = { payload: payload };
    if (withInfo) update.info = String((play && play.title) || "Snapshot").slice(0, 48);
    try {
      webxdcApi.sendUpdate(update, (play && play.title) || "ROSES");
      clearSendNote();
    } catch (err) {
      noteSend("The chat refused the snapshot.");
    }
  }

  function maybeBroadcast(now) {
    if (!broadcast || follow) return;
    if (now - lastBroadcast < 1000) return;
    lastBroadcast = now;
    publish(!broadcastNoted);
    broadcastNoted = true;
  }

  function maybePointer(now) {
    if (!channel || now - lastPtrSent < 100) return;
    if (!pointer.inside && !pointer.down) return;
    lastPtrSent = now;
    var payload = JSON.stringify({
      t: "ptr",
      id: cursorId,
      x: Math.round(pointer.nx * 1000) / 1000,
      y: Math.round(pointer.ny * 1000) / 1000,
      d: pointer.down ? 1 : 0,
    });
    try {
      channel.send(new TextEncoder().encode(payload));
    } catch (err) {}
  }

  function wireNet() {
    var replaySettled = false;
    var held = null;
    var heldSerial = 0;
    var heldBad = false;

    function finishReplay() {
      if (replaySettled) return;
      replaySettled = true;
      if (held) {
        lastRemote = held;
        remoteMismatch = false;
        if (follow) {
          try {
            adoptRemote();
          } catch (err) {
            fail(err);
          }
        }
        return;
      }
      if (heldBad) {
        lastRemote = null;
        remoteMismatch = true;
      }
    }

    function remember(update) {
      if (!state) return;
      var payload = update && update.payload;
      if (!payload || payload.kind !== "roses-state" || payload.nonce === selfNonce) return;
      if (!payload.state || typeof payload.state !== "object") return;
      if ((update.serial || 0) < heldSerial) return;
      heldSerial = update.serial || 0;
      var incoming = copyState(payload.state);
      if (incoming) {
        held = incoming;
        heldBad = false;
      } else {
        held = null;
        heldBad = true;
      }
    }

    function onUpdate(update) {
      if (!replaySettled) {
        remember(update);
        return;
      }
      var payload = update && update.payload;
      if (!payload || payload.kind !== "roses-state" || payload.nonce === selfNonce) return;
      if (!payload.state || typeof payload.state !== "object") return;
      var incoming = copyState(payload.state);
      if (!incoming) {
        lastRemote = null;
        remoteMismatch = true;
        note("The received state does not match this engine.");
        return;
      }
      remoteMismatch = false;
      lastRemote = incoming;
      if (follow) {
        try {
          adoptRemote();
        } catch (err) {
          fail(err);
        }
      }
    }

    try {
      var done = webxdcApi.setUpdateListener(onUpdate, 0);
      if (done && typeof done.then === "function") done.then(finishReplay, finishReplay);
      else finishReplay();
    } catch (err) {}
    if (typeof webxdcApi.joinRealtimeChannel === "function") {
      try {
        channel = webxdcApi.joinRealtimeChannel();
        channel.setListener(function (data) {
          var text = "";
          try {
            text = new TextDecoder().decode(data);
          } catch (err) {
            return;
          }
          var msg = null;
          try {
            msg = JSON.parse(text);
          } catch (err) {
            return;
          }
          if (!msg || msg.t !== "ptr" || typeof msg.id !== "string") return;
          if (msg.id === cursorId || msg.id.length < 2 || msg.id.length > 40) return;
          if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
          if (!peers[msg.id] && Object.keys(peers).length >= 24) return;
          peers[msg.id] = { x: msg.x, y: msg.y, d: msg.d, seen: performance.now() };
        });
      } catch (err) {
        channel = null;
      }
    }
  }

  function ensureWebxdc() {
    if (window.webxdc) {
      webxdcApi = window.webxdc;
      wireNet();
      return;
    }
    var updates = [];
    var listener = null;
    var serial = 0;
    webxdcApi = {
      __rosesShim: true,
      selfAddr: "local",
      selfName: "Local",
      sendUpdate: function (update) {
        serial += 1;
        var record = { payload: update.payload, info: update.info, serial: serial, max_serial: serial };
        updates.push(record);
        for (var i = 0; i < updates.length; i++) updates[i].max_serial = serial;
        if (listener) listener(record);
      },
      setUpdateListener: function (cb, start) {
        listener = cb;
        var queued = [];
        for (var i = 0; i < updates.length; i++) {
          if (updates[i].serial > (start || 0)) queued.push(updates[i]);
        }
        return Promise.resolve().then(function () {
          if (cb !== listener || !listener) return;
          for (var j = 0; j < queued.length; j++) listener(queued[j]);
        });
      },
      joinRealtimeChannel: function () {
        return { setListener: function () {}, send: function () {}, leave: function () {} };
      },
    };
    wireNet();
  }

  function startStandalone() {
    var srcEl = document.getElementById("roses-engine");
    var gameEl = document.getElementById("roses-game");
    var parsed = {};
    try {
      parsed = JSON.parse((gameEl && gameEl.textContent) || "{}");
    } catch (err) {
      parsed = {};
    }
    baked = clone(parsed.params || {});
    play = {
      kind: parsed.kind === "game" ? "game" : "engine",
      title: parsed.title || "ROSES",
      params: clone(baked),
    };
    if (play.kind === "engine") {
      try {
        var saved = JSON.parse(localStorage.getItem("roses.play.params") || "null");
        if (saved && typeof saved === "object") play.params = saved;
      } catch (err) {}
    }
    buildHud();
    wireTransport();
    var source = "";
    try {
      source = JSON.parse((srcEl && srcEl.textContent) || "\"\"");
    } catch (err) {
      source = "";
    }
    if (typeof source !== "string") source = "";
    try {
      boot(source, play.params);
    } catch (err) {
      fail(err);
    }
    ensureWebxdc();
  }

  if (preview) {
    post({ type: "ready" });
  } else {
    startStandalone();
  }
  requestAnimationFrame(frame);
})();
