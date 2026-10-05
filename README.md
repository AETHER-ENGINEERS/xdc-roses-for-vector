# ROSES

Responsive Open Systems & Engines Studio. A [WebxDC](https://webxdc.org) that runs inside [Vector](https://vectorapp.io) and is used to build other WebxDC apps: an engine, then a game.

ROSES is the studio. An engine is one JavaScript document (`createEngine`) that decides what is possible. A game is that engine plus a name, parameter values, and placements. Export writes a separate `.xdc`. The exported app does not call back to the studio.

**Status:** 0.0.4. One document, a live stage, game parameters, and two exports. Sample engine Mote, sample game Hearth. Engine source is stored as JSON inside the page, so a literal `</script` in the document is not rewritten. Warnings and errors use different lines. An export can carry its own PNG icon. Zip timestamps are the time of packing.

**License:** https://github.com/AETHER-ENGINEERS/AETHER-ENGINEERS/blob/main/LICENSE

The license text in `LICENSE` is immutable and ships at the top of this repository and inside every packed `.xdc`.

Repo: https://github.com/AETHER-ENGINEERS/xdc-roses-for-vector

This is a sibling of [vector-xdc-forge](https://github.com/AETHER-ENGINEERS/vector-xdc-forge) and [OMARG-Vector-strudel](https://github.com/AETHER-ENGINEERS/OMARG-Vector-strudel). It is not a general-purpose IDE and not a game by itself.

---

## Drop-in

Release asset: `xdc-roses-for-vector-0.0.4.xdc`

The same file is at `artifacts/xdc-roses-for-vector-0.0.4.xdc`. Attach it in a Vector chat and tap **Start**.

Rebuild it with:

```sh
node scripts/pack-xdc.cjs
```

`webxdc.js` is a browser shim. It is not packed. Vector injects the real `webxdc.js` when the page requests that script.

Browser check, no Vector: serve this directory and open `index.html`. The shim stores updates in `localStorage` and uses a `BroadcastChannel` for the draft.

---

## What it does

| Piece | Role |
|---|---|
| Engine document | One page. `createEngine()` returns `defaults`, `create`, `step`, and `draw`. |
| Stage | Runs that document. Pause, step, reset, speed. |
| Game | Name and the knobs declared in `defaults`. |
| Export engine | A sandbox `.xdc` with the engine defaults baked in. |
| Export game | The same engine, frozen, with this name and these parameter values. |
| Push draft | Sends the document and game values through the chat. Someone else can apply it. |

State from `step` stays JSON. The scaffold owns `state.tick`.

---

## Layout

| File | Role |
|---|---|
| `index.html` | Studio shell |
| `shared.js` | `clone` and the parameter fields, used by the studio and inlined into exports |
| `studio.js` | Editor, parameters, export |
| `runtime.js` | Stage used by the studio and by exported apps |
| `zip.js` | STORE-method zip writer |
| `webxdc.js` | Browser only. Not packed |
| `samples/mote.js` | Sample engine |
| `samples/hearth.json` | Sample game |
| `manifest.toml` | WebxDC manifest |
| `icon.png` | Icon |
| `LICENSE` | OMARG-AIR/AID, unaltered |
