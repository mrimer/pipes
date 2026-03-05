/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/game.ts'],
  coverageThreshold: {
    './src/board.ts': { lines: 80 },
    './src/tile.ts': { lines: 80 },
  },
};
