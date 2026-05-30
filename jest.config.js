/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  // Keep Node as the default for speed; DOM/localStorage tests opt into jsdom
  // explicitly per-file via `@jest-environment jsdom`.
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '\\.(ogg|mp3|wav)$': '<rootDir>/tests/__mocks__/fileMock.js',
  },
  // Global setup is intentionally minimal: only shared polyfills go here.
  // jsdom-provided globals (document/window/localStorage) are available in
  // tests that opt into jsdom.
  setupFiles: ['<rootDir>/tests/__mocks__/jestSetup.js'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/game.ts'],
  coverageThreshold: {
    './src/board.ts': { lines: 80 },
    './src/tile.ts': { lines: 80 },
  },
};
