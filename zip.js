/* STORE-method ZIP writer. No compression, so a messenger can open the .xdc. */
(function () {
  "use strict";

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function encode(data) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    return new Uint8Array(data);
  }

  function u16(n) {
    return [n & 255, (n >>> 8) & 255];
  }

  function u32(n) {
    return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  }

  function buildZip(files) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    /* 2026-10-03 20:40 */
    var time = 42240;
    var date = 23875;

    for (var i = 0; i < files.length; i++) {
      var nameBytes = new TextEncoder().encode(files[i].name);
      var data = encode(files[i].data);
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(time),
        u16(date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        Array.from(nameBytes),
      );
      locals.push(new Uint8Array(local));
      locals.push(data);

      var central = [].concat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(time),
        u16(date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        Array.from(nameBytes),
      );
      centrals.push(new Uint8Array(central));
      offset += local.length + data.length;
    }

    var centralSize = 0;
    for (var c = 0; c < centrals.length; c++) centralSize += centrals[c].length;
    var eocd = new Uint8Array(
      [].concat(
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(files.length),
        u16(files.length),
        u32(centralSize),
        u32(offset),
        u16(0),
      ),
    );

    var total = offset + centralSize + eocd.length;
    var out = new Uint8Array(total);
    var cursor = 0;
    function put(chunk) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    }
    for (var j = 0; j < locals.length; j++) put(locals[j]);
    for (var k = 0; k < centrals.length; k++) put(centrals[k]);
    put(eocd);
    return out;
  }

  var api = { buildZip: buildZip, crc32: crc32 };
  if (typeof window !== "undefined") window.RosesZip = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
