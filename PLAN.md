# No-Guess Minesweeper — Development Plan

A browser Minesweeper where every board can be fully cleared by logic. The first click is always an opening, and a built-in solver checks every board before the player sees it.

> **Stack assumption:** TypeScript + Vite, Vitest for tests, plain DOM for the UI (no framework). The core engine, solver and generator are pure TypeScript with no DOM dependencies, so the UI layer can be swapped later (React, Canvas, a Django-served page, etc.) without touching the logic.

---

## 1. Goals and non-goals

**v1 goals**
- Standard modes: Beginner 9×9/10, Intermediate 16×16/40, Expert 30×16/99, plus Custom.
- Every board is clearable without guessing, starting from the first click.
- Seeded, deterministic boards that can be shared and replayed by URL.
- Standard controls: reveal, flag, chord, mine counter, timer.
- A hint button that shows a cell the solver can prove is safe.

**Non-goals for v1** (possible later)
- Kaboom-style adaptive mode, where mines are placed lazily and guessing is punished only when a safe move existed.
- Accounts, leaderboards, multiplayer.
- Mine probability display.

---

## 2. Core invariant (the most important rule)

> **The solver may only make deductions that hold in every mine layout consistent with what the player can see.**

- No probabilities and no "likely safe" guesses. If the solver can't prove a cell, it reports itself **stuck**.
- The solver may be **incomplete** (it can give up on hard positions). It must never be **unsound** (it must never call an unproven cell safe or mined).
- A board is accepted only when the solver clears it **from scratch**, using only information visible to the player.
- Incompleteness only costs generation time, because more boards get rejected. Unsoundness breaks the game's promise. When the two conflict, choose soundness.

---

## 3. Architecture

```
src/
  core/
    rng.ts          # seeded PRNG (sfc32 or mulberry32), seed from string
    board.ts        # Board type, index<->(x,y), precomputed neighbor lists
    game.ts         # game state machine: reveal, flood fill, flag, chord, win/loss
  solver/
    types.ts        # PlayerView, Deduction, SolveResult
    constraints.ts  # build constraints from the visible frontier
    tier1.ts        # single-cell rules
    tier2.ts        # subset / pair reduction
    tier3.ts        # component enumeration + global mine count
    solve.ts        # driver: run tiers until solved or stuck
  generator/
    generate.ts     # place mines -> verify -> retry / perturb
  worker/
    gen.worker.ts   # runs generation off the main thread
  ui/
    render.ts, input.ts, hud.ts, main.ts
scripts/
  bench.ts          # generation benchmark CLI (run with tsx)
tests/
  oracle.ts         # brute-force reference solver for small boards
```

**Data model**
- Cells are stored in flat arrays with index `i = y * width + x`.
- `mines: Uint8Array` (1 = mine), `numbers: Uint8Array` (precomputed adjacent-mine counts).
- `neighbors: Int32Array[]`, precomputed once per board size.
- Player state per cell: `hidden | revealed | flagged`.

**Board identity:** `(generatorVersion, width, height, mineCount, seed, firstClickIndex)` fully determines a board. Include `generatorVersion` in share URLs so old links still work after the generator changes.

---

## 4. Solver design

The solver plays against a `PlayerView`: revealed cells, their numbers, and cells it has proven to be mines. It never reads the real mine layout directly. It only asks the board for the number under a cell after it has proven that cell safe and revealed it, exactly as a player would.

**Constraints:** For each revealed number cell *n* that still has hidden neighbors:
`sum(hidden, unproven neighbors) = number(n) − provenMinesAround(n)`

**Frontier** = hidden cells that appear in at least one constraint.
**Interior** = hidden cells that appear in none.

### Tier 1: single-cell rules
- Remaining count = 0 → all of that constraint's cells are safe.
- Remaining count = number of cells → all of them are mines.

### Tier 2: subset reduction
- If constraint A's cells are a subset of B's: `B − A` has `count(B) − count(A)` mines. Add that as a new constraint and re-apply Tier 1.
- Limit this to constraints that share cells, to avoid O(n²) work over the whole frontier.

### Tier 3: component enumeration + global mine count
1. Split the frontier into **connected components** (two cells are connected if they share a constraint).
2. For each component, use backtracking with constraint propagation to enumerate consistent assignments. Record:
   - `feasibleK`: the set of mine counts *k* the component can hold
   - for each cell and each k: whether mine is possible and whether safe is possible
3. Combine across components with the global count. Let `M` = total mines − proven mines and `I` = number of interior cells. A combination is valid when `0 ≤ M − Σk ≤ I`.
4. A component cell is **certainly safe** if no valid combination puts a mine on it, and **certainly a mine** if every valid combination does.
5. Interior cells are **all safe** if every valid combination has `M − Σk = 0`, and **all mines** if every valid combination has `M − Σk = I`.

Certainty only needs to know whether something is *possible*, not how many layouts allow it. So the solver can use boolean subset-sum feasibility instead of exact layout counts, which avoids big-number math. Exact counts are only needed for a future probability display.

**Size cap:** If a component exceeds a configurable size (start around 40 cells and tune with the benchmark), Tier 3 skips it. If nothing else makes progress, the solver reports stuck. That is sound, and the board simply gets rejected.

**Driver loop:** try Tier 1 → Tier 2 → Tier 3 in order. On any progress, apply it (reveal safe cells, which may flood-fill, and mark mines) and restart from Tier 1. Record the highest tier used, so difficulty can later be graded by tier.

---

## 5. Generator design

1. Mark a **safe zone**: the first-click cell plus its neighbors (up to 3×3). This guarantees the first click is an opening.
2. Place `mineCount` mines uniformly at random outside the safe zone, using the seeded RNG.
3. Run the solver from the first click. If it clears the board, **accept**.
4. If it gets stuck:
   - **Phase A (ship first):** reject and re-roll from the next RNG state, up to a retry budget.
   - **Phase B (add if the benchmark shows a high rejection rate):** perturbation. Move one or more mines between cells that are still hidden in the stuck state, outside the safe zone. Then **re-verify from scratch**. Re-verifying is what keeps perturbation sound, so never patch a partial solve.
5. If the retry budget runs out, report failure. The UI offers to retry or lower the density.

**Generate after the first click**, as Simon Tatham's Mines does: show an empty grid, and when the player clicks, generate in the worker with that click as the safe zone. Show a spinner only if generation takes longer than about 150 ms.

**Custom mode validation:**
- Require `mineCount ≤ width × height − 9`.
- Warn when density is above about 25%. No-guess boards get much harder to find as density rises, so let the benchmark determine the hard cap.

---

## 6. Game rules (`core/game.ts`)

- **Reveal:** a hidden, unflagged cell. A 0 flood-fills (iteratively, not recursively, to avoid stack overflow on big boards).
- **Flag:** toggles on hidden cells. The mine counter shows `mines − flags`, which can go negative.
- **Chord:** clicking a revealed number whose flag count equals its number reveals all its other hidden neighbors. If a flag is wrong, this can lose the game, as in classic Minesweeper.
- **Win:** every non-mine cell revealed. Auto-flag the remaining mines.
- **Loss:** a mine is revealed. Show all mines and mark wrong flags.
- **Timer:** starts on the first reveal and stops on win or loss.

---

## 7. Testing strategy

| Layer | What to test |
|---|---|
| `rng` | Same seed gives the same sequence; output range and distribution sanity check |
| `board` | Index/coordinate round-trip; neighbor counts at corners, edges and interior; number calculation |
| `game` | Flood fill, chord (correct and wrong flags), win/loss detection, no reveal on flagged cells |
| solver tiers | Hand-made positions with known answers, including classic patterns such as 1-2-1, 1-2-2-1, and endgame cases that need the global mine count |
| **solver vs. oracle** | Property test (fast-check): on random small boards (≤ 5×5), every deduction must match the brute-force oracle, which enumerates all consistent layouts. Catches unsoundness. |
| generator | Property test: every generated board is solvable from its first click; the first click is always a 0; the same inputs produce the same board |
| e2e (optional) | Playwright: play a seeded board using the solver's move list and confirm the win screen |

The oracle test matters most. Unsoundness is the one bug that silently breaks the "no guessing" promise.

---

## 8. Phases

Each phase is sized for one focused Claude Code session and ends with passing tests and a commit.

### Phase 0: Scaffold
- Vite + TypeScript (strict), Vitest, fast-check, ESLint, Prettier, tsx.
- npm scripts: `dev`, `build`, `test`, `test:watch`, `lint`, `bench`.
- Add `CLAUDE.md` (starter version provided alongside this plan).
- **Done when:** `npm test` and `npm run build` pass on an empty project.

### Phase 1: Core model
- `rng.ts`, `board.ts`, `game.ts` with full unit tests.
- Temporary generator: random placement with the safe zone, not yet verified.
- **Done when:** a game can be played start to finish in tests.

### Phase 2: Solver tiers 1–2
- `PlayerView`, constraint building, Tier 1, Tier 2, and the driver loop.
- Hand-made pattern tests.
- **Done when:** the solver clears positions that only need simple logic and reports stuck on a true 50/50.

### Phase 3: Solver tier 3 + oracle
- Component splitting, enumeration, global-count combination, size cap.
- Brute-force oracle and the soundness property test.
- **Done when:** the oracle property test passes on 10k+ random small boards and endgame mine-count cases are solved.

### Phase 4: Generator + benchmark
- Phase A generator (reject and retry).
- `scripts/bench.ts`: for each difficulty, N boards; report acceptance rate, mean/p95 time, attempts histogram, highest tier used.
- **Decision point:** if Expert p95 is too slow (target under 200 ms in the worker), implement Phase B perturbation and benchmark again.
- **Done when:** every standard difficulty meets the time target.

### Phase 5: UI
- Grid rendering (CSS grid of buttons is fine at Expert's 480 cells), input (left = reveal, right = flag, click on number = chord, long-press = flag on touch), HUD (counter, timer, restart).
- Generation in the Web Worker after the first click.
- **Done when:** all three difficulties are playable in the browser end to end.

### Phase 6: Polish
- Seed in the URL (`?v=1&w=30&h=16&m=99&s=abc123&c=245`) and a share button.
- Hint button: highlights one solver-proven safe cell and counts hints used.
- Optional difficulty grading by highest solver tier required.
- Local stats (wins, best times per difficulty) in `localStorage`, wrapped in try/catch.
- **Done when:** sharing a link reproduces the same board on another device.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Solver unsoundness | Oracle property tests in CI; re-verify from scratch after any perturbation |
| Tier 3 slow on large components | Size cap plus constraint propagation during backtracking; profile with the benchmark |
| High rejection rate at Expert or high density | Phase B perturbation; cap Custom density based on benchmark data |
| Boards that are provable but feel impossible to humans | Grade by highest tier used; optionally limit Beginner to Tier 1–2 boards |
| Generator changes break shared links | `generatorVersion` in the seed tuple; keep old generator versions callable |

---

## 10. Kickoff prompts for Claude Code

Paste one per session, after Claude Code has read `PLAN.md` and `CLAUDE.md`.

1. `Read PLAN.md and CLAUDE.md. Do Phase 0. Stop when tests and build pass.`
2. `Do Phase 1 from PLAN.md. Write tests first for board.ts and game.ts, then implement.`
3. `Do Phase 2. Include tests for 1-2-1 and 1-2-2-1 patterns and a forced 50/50 that must return stuck.`
4. `Do Phase 3. Build tests/oracle.ts first, then Tier 3, then the fast-check soundness test. Do not weaken the oracle test to make it pass.`
5. `Do Phase 4. Run the benchmark and report the numbers before deciding whether perturbation is needed.`
6. `Do Phase 5. Keep all game logic in core/solver/generator; ui/ only renders and forwards input.`
7. `Do Phase 6.`
