/* Browser-preview shim. Do not put this file inside a packed .xdc.
   Vector injects the real webxdc.js when the script tag is requested. */
(function () {
  "use strict";
  if (window.webxdc) return;

  var KEY = "roses.webxdc.updates.v1";
  var IDKEY = "roses.webxdc.self";
  var selfRec = null;
  try {
    selfRec = JSON.parse(localStorage.getItem(IDKEY) || "null");
  } catch (err) {
    selfRec = null;
  }
  if (!selfRec || !selfRec.addr) {
    selfRec = { addr: "local-" + Math.random().toString(36).slice(2, 10), name: "Local" };
    localStorage.setItem(IDKEY, JSON.stringify(selfRec));
  }

  function load() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-24)));
  }

  var listener = null;

  window.webxdc = {
    __rosesShim: true,
    selfAddr: selfRec.addr,
    selfName: selfRec.name,
    sendUpdate: function (update, descr) {
      if (!update || !("payload" in update)) throw new Error("sendUpdate requires a payload");
      var list = load();
      var serial = 1;
      for (var i = 0; i < list.length; i++) serial = Math.max(serial, (list[i].serial || 0) + 1);
      var record = {
        payload: update.payload,
        info: update.info,
        summary: update.summary,
        document: update.document,
        href: update.href,
        serial: serial,
        max_serial: serial,
        descr: descr || "",
      };
      list.push(record);
      for (var j = 0; j < list.length; j++) list[j].max_serial = serial;
      save(list);
      if (listener) listener(record);
    },
    setUpdateListener: function (cb, serial) {
      listener = typeof cb === "function" ? cb : null;
      var start = serial || 0;
      var queued = listener ? load().filter(function (item) { return item.serial > start; }) : [];
      return Promise.resolve().then(function () {
        if (cb !== listener || !listener) return;
        for (var i = 0; i < queued.length; i++) listener(queued[i]);
      });
    },
    sendToChat: function () {
      return Promise.resolve();
    },
    joinRealtimeChannel: function () {
      var fn = null;
      var bc = null;
      try {
        bc = new BroadcastChannel("roses.webxdc.rt");
      } catch (err) {
        bc = null;
      }
      if (bc) {
        bc.onmessage = function (ev) {
          if (!fn) return;
          var data = ev.data;
          if (data instanceof Uint8Array) fn(data);
          else if (data instanceof ArrayBuffer) fn(new Uint8Array(data));
        };
      }
      return {
        setListener: function (next) {
          fn = next;
        },
        send: function (data) {
          if (!bc) return;
          var bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
          if (bytes.byteLength > 128000) throw new Error("realtime payload exceeds 128000 bytes");
          bc.postMessage(bytes);
        },
        leave: function () {
          if (bc) bc.close();
          fn = null;
        },
      };
    },
  };
})();
