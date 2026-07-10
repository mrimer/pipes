// structuredClone is not provided by jsdom; provide a working implementation
// using the Node.js v8 module so that code using it works in the test environment.
// DOM/localStorage globals are intentionally not mocked here; jsdom tests opt in
// per-file with `@jest-environment jsdom`.
if (typeof globalThis.structuredClone === 'undefined') {
  const v8 = require('v8');
  globalThis.structuredClone = (val) => v8.deserialize(v8.serialize(val));
}

// Webpack DefinePlugin build constants — default to a non-demo web build.
// Any test that imports src/platform/storage.ts or branches on these constants
// will get deterministic, non-demo, non-devControls web values unless overridden.
globalThis.BUILD_TARGET       = 'web';
globalThis.IS_DEMO            = false;
globalThis.DEV_CONTROLS       = false;
globalThis.BUNDLED_CAMPAIGNS  = [];
