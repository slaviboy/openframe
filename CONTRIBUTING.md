# Contributing to Openframe

## Principles

1. **No fake features.** A control ships only when its whole chain works: UI → command → document mutation → history → persistence → renderer → reload. Unfinished features stay out of the UI and are marked in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).
2. **No network.** Never add code that performs network requests, loads remote assets, or reports telemetry. Lint, CSP and E2E guards enforce this.
3. **The document is the source of truth.** Mutate it only through transactions (`editor.history.run` / `begin`–`commit`). Never keep document data in React state.
4. **Layer boundaries.** `core` has no DOM, React, CanvasKit or IO. `engine` and `editor` have no React. UI code reads stores and dispatches commands.

## Workflow

```bash
npm install
npm run dev
npm run check        # typecheck + lint + unit tests: must pass before every commit
npm run test:e2e     # required for changes that touch UI, persistence, rendering or PWA
```

For each change:

1. Read the relevant spec article in the documentation mirror and the matching row in the feature matrix.
2. Put behavior in `core` or `editor` with unit tests first. Wire the UI afterwards.
3. Route every new user action through the command registry (`src/editor/commands`), so menus, shortcuts, the palette and tests share it.
4. Show that gestures produce exactly one undo step.
5. Update the feature matrix row: status plus the tests that cover it. Update the relevant document in `docs/`.
6. Record significant decisions as an ADR in `docs/adr/NNNN-title.md`.

## Code style

- **TypeScript.** Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`, and no `@ts-ignore` to silence errors.
- **Size.** Keep modules small and focused. Match the comment density of surrounding code: explain algorithms and non-obvious decisions, not the syntax.
- **UI values.** Take every dimension and color from design tokens (`src/ui/tokens.css`, `src/ui/tokens.ts`). No arbitrary pixel values in components.
- **Icons.** Icons are original artwork in `src/ui/icons`. Do not copy third-party or proprietary assets.

## Dependencies

Before adding a dependency, confirm that it:
- is necessary
- is maintained
- works fully offline
- is materially better than a small internal implementation
- doesn't bloat the bundle

Pin exact versions for runtime dependencies, and record the reason in the pull request.

## Commit and pull request checklist

- [ ] `npm run check` passes
- [ ] E2E passes for affected areas (all three browsers)
- [ ] Feature matrix updated
- [ ] Docs and ADRs updated where behavior or architecture changed
- [ ] No new network access, no dead UI, no TODO placeholders in shipped code
