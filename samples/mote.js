/**
 * ROSES engine document.
 * Define createEngine(). Return { id, name, tickMs, defaults, create, step, draw }.
 * state must stay JSON-serializable. Do not increment state.tick — the scaffold does.
 * step(state, input) may mutate state and must return it.
 * input.pointer is { x, y, nx, ny, down, inside } plus input.justDown / justUp.
 * nx and ny are 0–1 across the stage. input.keys maps KeyboardEvent.code to a boolean.
 * draw(ctx, state, view) paints in CSS pixels. view is { w, h, dpr, fresh }.
 * defaults are the engine sandbox. A game overrides them, including placements.
 */
function createEngine() {
  var defaults = {
    seed: 1,
    count: 36,
    drift: 0.55,
    gather: 1,
    birth: 0.4,
    cap: 72,
    placements: [],
  };

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!Number.isFinite(n)) n = lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function clamp01(n) {
    return clamp(n, 0, 1);
  }

  function makeRnd(state) {
    return function rnd() {
      var a = state.rng | 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      state.rng = a;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function make(x, y, mix, rand) {
    return {
      x: clamp01(x),
      y: clamp01(y),
      vx: (rand() - 0.5) * 0.0016,
      vy: (rand() - 0.5) * 0.0016,
      mix: clamp01(mix),
      r: 0.02 + rand() * 0.022,
    };
  }

  function colorOf(mix) {
    var deep = [110, 34, 36];
    var rose = [176, 84, 74];
    var paper = [243, 238, 228];
    var t = clamp01(mix);
    var a = t < 0.5 ? deep : rose;
    var b = t < 0.5 ? rose : paper;
    var u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [
      Math.round(a[0] + (b[0] - a[0]) * u),
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
    ];
  }

  return {
    id: "mote",
    name: "Mote",
    tickMs: 40,
    defaults: defaults,

    create: function (params) {
      var p = Object.assign({}, defaults, params || {});
      var cap = clamp(p.cap, 1, 400) | 0;
      var state = { tick: 0, rng: (Number(p.seed) | 0) || 1, motes: [], params: {
        drift: clamp(p.drift, 0, 4),
        gather: clamp(p.gather, 0, 6),
        birth: clamp(p.birth, 0, 2),
        cap: cap,
      } };
      var rnd = makeRnd(state);
      var placements = Array.isArray(p.placements) ? p.placements : [];
      for (var i = 0; i < placements.length && state.motes.length < cap; i++) {
        var pl = placements[i] || {};
        state.motes.push(make(pl.x, pl.y, pl.mix, rnd));
      }
      var target = clamp(p.count, 0, cap) | 0;
      while (state.motes.length < target) {
        state.motes.push(make(rnd(), rnd(), rnd(), rnd));
      }
      return state;
    },

    step: function (state, input) {
      input = input || {};
      var pointer = input.pointer || {};
      var keys = input.keys || {};
      var rnd = makeRnd(state);
      var motes = state.motes;
      var drift = state.params.drift;
      var gather = state.params.gather;
      var birth = state.params.birth;
      var cap = state.params.cap | 0;
      var windX = 0;
      var windY = 0;
      if (keys.ArrowLeft || keys.KeyA) windX -= 1;
      if (keys.ArrowRight || keys.KeyD) windX += 1;
      if (keys.ArrowUp || keys.KeyW) windY -= 1;
      if (keys.ArrowDown || keys.KeyS) windY += 1;

      if (input.justDown && pointer.inside && motes.length < cap) {
        motes.push(make(pointer.nx, pointer.ny, 0.12 + rnd() * 0.25, rnd));
      }

      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        var ang = Math.sin(m.x * 6.2 + state.tick * 0.015) + Math.cos(m.y * 5.4 - state.tick * 0.011);
        m.vx += Math.cos(ang * 2.1) * 0.00085 * drift;
        m.vy += Math.sin(ang * 1.7) * 0.00085 * drift;
        if (pointer.inside) {
          var pull = (pointer.down ? 0.0034 : 0.0011) * gather;
          m.vx += (pointer.nx - m.x) * pull;
          m.vy += (pointer.ny - m.y) * pull;
        }
        m.vx += windX * 0.0016;
        m.vy += windY * 0.0016;
      }

      if (motes.length <= 90) {
        var born = [];
        for (var a = 0; a < motes.length; a++) {
          for (var b = a + 1; b < motes.length; b++) {
            var left = motes[a];
            var right = motes[b];
            var dx = left.x - right.x;
            var dy = left.y - right.y;
            if (dx > 0.5) dx -= 1;
            if (dx < -0.5) dx += 1;
            if (dy > 0.5) dy -= 1;
            if (dy < -0.5) dy += 1;
            var d2 = dx * dx + dy * dy;
            if (d2 > 0 && d2 < 0.0016) {
              var dist = Math.sqrt(d2) || 0.0001;
              var push = 0.00028 / dist;
              left.vx += dx * push;
              left.vy += dy * push;
              right.vx -= dx * push;
              right.vy -= dy * push;
            }
            if (d2 < 0.0008 && motes.length + born.length < cap && rnd() < birth * 0.02) {
              born.push(make((left.x + right.x) / 2, (left.y + right.y) / 2, (left.mix + right.mix) * 0.5, rnd));
            }
          }
        }
        for (var k = 0; k < born.length && motes.length < cap; k++) motes.push(born[k]);
      }

      for (var n = 0; n < motes.length; n++) {
        var body = motes[n];
        body.vx *= 0.965;
        body.vy *= 0.965;
        var speed = Math.hypot(body.vx, body.vy);
        if (speed > 0.018) {
          body.vx = (body.vx / speed) * 0.018;
          body.vy = (body.vy / speed) * 0.018;
        }
        body.x = (((body.x + body.vx) % 1) + 1) % 1;
        body.y = (((body.y + body.vy) % 1) + 1) % 1;
      }
      return state;
    },

    draw: function (ctx, state, view) {
      var w = view.w;
      var h = view.h;
      if (view.fresh) {
        ctx.fillStyle = "#140f0d";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = "rgba(20, 15, 13, 0.22)";
        ctx.fillRect(0, 0, w, h);
      }

      var plate = Math.min(w, h) * 0.34;
      ctx.strokeStyle = "rgba(243, 238, 228, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, plate, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, plate * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      var motes = state.motes.slice().sort(function (a, b) { return b.r - a.r; });
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        var x = m.x * w;
        var y = m.y * h;
        var rad = Math.max(6, m.r * Math.min(w, h));
        var rgb = colorOf(m.mix);
        var pulse = 0.72 + Math.sin(state.tick * 0.08 + m.x * 14) * 0.28;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.95 * pulse) + ")");
        g.addColorStop(0.45, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.35 * pulse) + ")");
        g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(243, 238, 228, 0.92)";
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, rad * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
