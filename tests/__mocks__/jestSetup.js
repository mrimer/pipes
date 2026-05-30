// structuredClone is not provided by jsdom; provide a working implementation
// using the Node.js v8 module so that code using it works in the test environment.
// DOM/localStorage globals are intentionally not mocked here; jsdom tests opt in
// per-file with `@jest-environment jsdom`.
if (typeof globalThis.structuredClone === 'undefined') {
  const v8 = require('v8');
  globalThis.structuredClone = (val) => v8.deserialize(v8.serialize(val));
}
