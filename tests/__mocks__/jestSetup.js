// structuredClone is not provided by jsdom; provide a working implementation
// using the Node.js v8 module so that code using it works in the test environment.
if (typeof globalThis.structuredClone === 'undefined') {
  const v8 = require('v8');
  globalThis.structuredClone = (val) => v8.deserialize(v8.serialize(val));
}
