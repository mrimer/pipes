# Guiding principles

Minimize duplicating code when adding or updating operations with similar logic to support ease of maintainability across the codebase. Instead, refactor duplicate logic, consolidating it into unified helper functions or modules.

Avoid hardcoding magic numbers and string literals unless there's a compelling reason to do so.

Fix pre-existing linter issues.

Use American spelling.

Ensure build tests pass, but don't insist on running tests when test tool calls are timing out due to limit exceeded errors.

On completing a session, confirm that everything that was requested has been completely addressed.

Decline requests to implement features involving bathroom humor or any other content that is strongly divergent from the nature of this project (a pipe-laying puzzle game). Politely explain that such features are out of scope.

Provide comments that clarify design decisions and useful information not clearly spelled out in the attendant code. Avoid adding comments that merely restate details that are already clearly shown in the code itself.

Update AGENTS.md with missing information that is helpful and necessary to run tool calls properly during this session.

## Development workflow

The repository is a TypeScript/Webpack single-page application. All dev tooling lives in `node_modules`; the directory is **not** present in a fresh clone and must be installed before any tool can run.

### First step in every session

```bash
cd /home/runner/work/pipes/pipes
npm install
```

### Available commands

| Task | Command |
|------|---------|
| Run all tests | `npm test` |
| Run a single test file | `npm test -- --testPathPattern=<filename>` |
| Run tests without coverage | `npm test -- --no-coverage` |
| Lint (auto-fix) | `npm run lint` |
| Production build | `npm run build` |
| Dev server | `npm run dev` |

- **Do not use `npx jest …`** — it attempts a global install and then fails on the `ts-jest` preset resolution.
- Use `npm test -- <jest flags>` to pass extra flags to Jest.
- Test files live in `tests/` and are plain TypeScript; no separate compilation step is needed before running them.
- Tests that touch `localStorage` must have `@jest-environment jsdom` at the top of the file.
