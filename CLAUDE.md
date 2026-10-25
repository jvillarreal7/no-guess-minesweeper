# No-Guess Minesweeper

Browser Minesweeper where every board can be cleared by logic alone. Full plan and phases: `PLAN.md`.

## Commands
- `npm run dev`: Vite dev server
- `npm test` / `npm run test:watch`: Vitest
- `npm run lint`: ESLint + Prettier check
- `npm run build`: production build
- `npm run bench -- --difficulty expert --n 1000`: generator benchmark
- Pushing to `main` lints, tests, builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). Keep `base: './'` in `vite.config.ts`: Pages serves the site from `/<repo-name>/`.

## Architecture rules
- `src/core`, `src/solver` and `src/generator` are pure TypeScript: no DOM, no `window`, no timers. They must run in Node (tests, bench) and in a Web Worker.
- `src/ui` only renders state and forwards input. Game rules never live in the UI.
- All randomness goes through the seeded RNG in `core/rng.ts`. Never call `Math.random()` in the engine.
- Cells are flat-array indices (`i = y * width + x`). Neighbor lists are precomputed.

## Solver invariant (do not break)
- The solver deduces only what holds in **every** layout consistent with what the player can see. No probabilities.
- The solver reads mine positions only by revealing cells it has already proven safe.
- Incomplete is acceptable (report stuck). Unsound is a critical bug.
- A board is accepted only after a **from-scratch** solve from the first click succeeds. After any perturbation, re-verify from scratch.
- Never weaken, skip or narrow the oracle soundness test (`tests/oracle.ts` + property test) to get it passing. Fix the solver instead.

## Conventions
- TypeScript strict mode; no `any`.
- Write tests before or alongside each module; each phase ends with green tests and a commit.
- Use iterative flood fill, not recursive.
- Wrap `localStorage` access in try/catch.
- Bump `GENERATOR_VERSION` whenever generator output for a given seed changes.
