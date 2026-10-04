/* Shared by the studio page and by every packed app. One clone, one field builder. */
(function (root) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function appendField(parent, key, value, sample, hint) {
    var label = document.createElement("label");
    var isJson = value !== null && typeof value === "object";
    label.className = "field" + (isJson ? " field--json" : "");
    label.appendChild(document.createTextNode(key));
    if (hint) {
      var hintNode = document.createElement("span");
      hintNode.className = "hint";
      hintNode.textContent = hint;
      label.appendChild(hintNode);
    }
    var input;
    var basis = sample === undefined ? value : sample;
    if (isJson) {
      input = document.createElement("textarea");
      input.dataset.json = "1";
      input.spellcheck = false;
      input.rows = 6;
      input.value = JSON.stringify(value, null, 2);
    } else if (typeof value === "boolean" || typeof basis === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!value;
    } else if (typeof value === "number" || typeof basis === "number") {
      input = document.createElement("input");
      input.type = "number";
      var numeric = typeof basis === "number" ? basis : value;
      input.step = Number.isInteger(numeric) ? "1" : "any";
      input.value = value;
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.value = value == null ? "" : String(value);
    }
    input.dataset.key = key;
    label.appendChild(input);
    parent.appendChild(label);
    return input;
  }

  root.Roses = { clone: clone, appendField: appendField };
})(typeof window !== "undefined" ? window : this);
