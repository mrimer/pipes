# Cool Pipes

A tile-based puzzle game about getting water to flow through pipes.
It incorporates Magic Tower elements and a campaign editor.
Browser-based, built with TypeScript + Webpack + Canvas.

## Quick start

```bash
npm install
npm run dev     # dev server at http://localhost:8080
npm test        # jest test suite (1489 tests)
npm run build   # production bundle → dist/
npm run lint    # type-aware lint check (no auto-fix)
npm run lint:fix  # apply auto-fixes
```

## Project layout

See AGENTS.md for the full architectural overview, module map, and contributor invariants.

Top-level directories:
- src/ — game source (TypeScript)
- tests/ — Jest test suite
- data/ — sound + image assets
- .github/workflows/ — CI/CD (GitHub Pages deploy)

## Deployment

Pushes to main deploy to GitHub Pages via .github/workflows/deploy.yml. Build artifact lives in dist/.

## Dependencies

- TypeScript 5.4+ / Webpack 5
- ESLint 8 with type-aware rules
- Jest 29 (Node default; jsdom opt-in per test file via @jest-environment jsdom)
- `src/i18n.ts` + `src/i18n/<locale>.ts` — translation helper and locale catalogs. See AGENTS.md for the pattern.
- i18n coverage tests (`tests/i18nCoverage.test.ts`) enforce defined/used translation keys.
- See package.json for the full list. Overrides block forces uuid ^11.1.1 to clear a transitive vuln.

## Contributing

Read AGENTS.md first — it documents architectural invariants (save-data versioning, memory teardown discipline, validation patterns, performance caching). Tests + lint + build must all stay green:

```bash
npm run lint && npm test && npm run build
```
