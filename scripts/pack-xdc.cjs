#!/usr/bin/env node
/* Pack the studio. webxdc.js stays out: Vector injects the real one. */
const fs = require("fs");
const path = require("path");
const { buildZip } = require("../zip.js");

const root = path.join(__dirname, "..");
const names = [
  "shared.js",
  "index.html",
  "theme.js",
  "studio.css",
  "studio.js",
  "runtime.js",
  "zip.js",
  "logo.png",
  "icon.png",
  "LICENSE",
  "manifest.toml",
  "samples/mote.js",
  "samples/hearth.json",
];

const zip = buildZip(
  names.map(function (name) {
    return { name: name, data: fs.readFileSync(path.join(root, name)) };
  }),
);

const outDir = path.join(root, "artifacts");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "xdc-roses-for-vector-0.0.7.xdc");
fs.writeFileSync(out, zip);
process.stdout.write(out + " " + zip.length + "\n");
