# Pipes Game – Agent Configuration

## Project Overview
**Pipes** is an HTML5 puzzle game where the player connects pipe segments to route water from a source to a destination.
It is coded in **TypeScript** and rendered in the browser using the **HTML5 Canvas API**.

## Technology Stack
| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode) |
| Rendering | HTML5 Canvas 2D |
| Build | Webpack 5 + ts-loader |
| Package manager | npm |
| Testing | Jest + ts-jest |
| Linting | ESLint (typescript-eslint) |
| Formatting | Prettier |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages (`gh-pages` branch) |

## Repository Layout
```
pipes/
├── .github/
│   ├── agents.md          # This file – agent configuration
│   └── workflows/
│       └── deploy.yml     # Build & deploy to GitHub Pages
├── src/
│   ├── main.ts            # Entry point – bootstraps the game
│   ├── game.ts            # Core game loop (update / render)
│   ├── board.ts           # Board / grid state management
│   ├── tile.ts            # Tile model and rendering
│   └── types.ts           # Shared TypeScript types & enums
├── index.html             # Shell HTML loaded by GitHub Pages
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## Coding Conventions
- **TypeScript strict mode** is enabled (`"strict": true` in tsconfig.json).  
  Every value must have an explicit type or be clearly inferred – no `any`.
- Use `const` by default; `let` only when re-assignment is required.
- Name files and exported symbols in **camelCase** (`tileRenderer.ts`), classes in **PascalCase** (`TileRenderer`), constants in **UPPER_SNAKE_CASE** (`MAX_GRID_SIZE`).
- Each logical game subsystem lives in its own file under `src/`.
- Keep functions short and single-purpose. Prefer pure functions where possible.
- Use JSDoc comments on every exported function / class.
- Never use `document.write`. Access the DOM only in `main.ts`.

## Build & Development Commands
```bash
# Install dependencies
npm install

# Start local dev server (hot-reload on http://localhost:8080)
npm run dev

# Production build (output → dist/)
npm run build

# Run unit tests
npm test

# Lint & auto-fix
npm run lint
```

## Game Architecture Guidelines
- **Game loop**: `requestAnimationFrame`-driven loop in `game.ts`.  
  `update(dt)` advances game state; `render(ctx)` draws to canvas.
- **Board**: 2-D grid of `Tile` objects. Dimensions are configurable constants.
- **Tile**: stores pipe type (straight, elbow, T-junction, cross, empty) and rotation (0°/90°/180°/270°). Tile logic must be pure – no DOM/Canvas dependencies.
- **Win condition**: A connected water path exists from source tile to sink tile.
- **Input**: Click/tap a tile to rotate it 90° clockwise.
- **Assets**: Prefer programmatic Canvas drawing over external image files so the game works fully offline.

## Testing Guidelines
- Unit-test pure game logic (tile connection checks, path-finding, win detection) with Jest.
- Do **not** unit-test Canvas rendering code – test the underlying data instead.
- Test files live next to source files as `*.test.ts`.
- Achieve ≥ 80 % line coverage on `src/board.ts` and `src/tile.ts`.

## GitHub Pages Deployment
- The `deploy.yml` workflow triggers on every push to `main`.
- It runs `npm ci`, `npm run build`, then deploys `dist/` to the `gh-pages` branch using `actions/deploy-pages`.
- The game is publicly accessible at `https://mrimer.github.io/pipes/`.

## Security & Accessibility
- No external network requests at runtime (fully self-contained).
- Provide keyboard navigation: arrow keys to move focus, Enter/Space to rotate the focused tile.
- Use sufficient color contrast (WCAG AA) for pipe segments.
- Do not store any user data.
