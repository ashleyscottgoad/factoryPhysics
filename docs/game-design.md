# Factory Physics — Game Design Doc (v2 direction)

> Status: north-star design, June 2026. Supersedes the "watch goods flow" v1
> framing with a concrete loop. The v1 engine (linear chains, tick sim, flow
> visuals, bottleneck/ratio hints, PWA) is the foundation this builds on.

## 1. The pitch

A clean factory tycoon where the satisfaction isn't *building more* — it's
**making the line flow**. You diagnose what's choking your factory, feed it,
smooth out the chaos, and keep it healthy, then watch a stuttering, stalling
production line turn into a smooth, humming river of goods and cash.

It's the game an Industrial Engineer would actually want to exist: built on the
real science of manufacturing (the *Factory Physics* of throughput, WIP,
variability) and the chase at the heart of *The Goal* (find the constraint, beat
it, watch it move) — but with **none of the math in the player's face**. The
equations run the world; the player feels the result.

## 2. Design pillars

1. **The constraint is the game.** At any moment one station limits the whole
   factory. Surfacing it, feeding it, and elevating it — then re-finding it when
   it moves — is the core loop. (Theory of Constraints / drum-buffer-rope.)
2. **Flow beats sprawl.** You win by *smoothing and simplifying*, not by carpet-
   bombing the screen with buildings. Elegance is the high score.
3. **Variability is the antagonist.** A perfectly "balanced" line still stalls
   when production is random. Taming chaos with the right buffers is the craft.
   (Factory Physics: buffer variability with inventory, capacity, or time.)
4. **Math in the background, sensation in the foreground.** Little's Law, OEE,
   and variance run under the hood. The player sees pulsing constraints, swelling
   buffers, healthy/sick machines — and an *optional* "engineer's overlay" that
   exposes the real numbers for those who want them (precedent: the ⚖ ratio
   toggle).
5. **Revenue is deferred, not designed-out.** No ads/IAP now. But the
   architecture (client-side sim, cloud save, offline catch-up) already makes the
   obvious hooks — time-skip, temporary multipliers — drop-in later. See §9.

## 3. Core loop

```
Observe → the factory is stuttering somewhere.
Diagnose → find the constraint (the real limiter, not just a starved node).
Decide  → exploit it (feed it, protect it), subordinate the rest (don't just
          overproduce upstream — that's waste), or elevate it (capacity, uptime,
          a smoothing upgrade).
Watch   → throughput rises… and the constraint jumps somewhere new.
Repeat  → at a higher level. Occasionally reset (Kaizen / greenfield) for a
          permanent step-change.
```

The "aha" that keeps players hooked is **the moving bottleneck**: the moment you
fix one station and the limiter leaps elsewhere. v1 already detects
starvation/bottlenecks — v2 makes that detection the protagonist.

## 4. The systems (and how each is *felt*, not shown)

### 4a. The constraint (Theory of Constraints)
- Compute the system constraint each tick: the station whose effective capacity
  caps whole-line throughput (extends v1's supply/demand `flowRates`).
- **Felt as:** a persistent "spotlight" on the constraint — it's the hero of the
  screen. Upstream over-production is gently discouraged (it just grows WIP, see
  4b). Throughput readout = the constraint's rate (drum-buffer-rope).
- **The hook:** when you elevate the constraint, the spotlight visibly *moves*.

### 4b. Buffers & variability (Factory Physics)
- Production times gain **variance**, not just an average. Variability propagates
  and starves/blocks stations even when average rates "balance" — the core
  Factory Physics truth.
- The player buffers variability three ways, each with a cost:
  - **Inventory buffer** — protective WIP stock in front of the constraint.
  - **Capacity buffer** — spare machines / surge capacity.
  - **Time buffer** — slack / scheduling headroom.
- **Little's Law felt:** `WIP = Throughput × Cycle Time`. Too much WIP → goods
  crawl to cash (long cycle time); too little → the constraint starves. The sweet
  spot is the puzzle. Shown via the existing heaps (WIP) and starved-pulse, never
  as a formula.

### 4c. Reliability & OEE (a bit of D)
- Machines run at <100% uptime; micro-stops and breakdowns are a variability
  source. Choose **preventive maintenance** (steady cost, fewer surprises) vs
  **run-to-failure** (cheap until it isn't).
- **OEE = Availability × Performance × Quality** — and Quality reuses the v1
  quality mechanic, so it slots in cleanly.
- **Felt as:** a per-machine health glow; a breakdown on a constraint-feeder is a
  visible crisis that your buffer (4b) either absorbs or doesn't.

### 4d. Quality (carried from v1)
- Slow-burn reputation → demand multiplier (Toyota-in-the-80s). Now also the
  **Q in OEE**, tying the existing design intent into the flow model.

### 4e. Prestige = Kaizen / greenfield
- The idle-staple reset, reframed: run a **Kaizen event** or open a **greenfield
  plant**, carrying over "standard work" — permanent improvements (faster setups,
  lower variance, better uptime) framed as *learned best practice*, not arbitrary
  multipliers. Thematically: continuous improvement.

## 5. Progression

Depth comes from **mastering flow on each line**, not from endlessly adding lines.

1. **Tutorial line (Bakery):** learn feed-the-constraint with low variability.
2. **Variability unlocks:** machines start to vary; learn protective buffers.
3. **Maintenance unlocks:** uptime becomes a lever; PM vs run-to-failure.
4. **Smoothing/leveling (Heijunka), pull/Kanban toggles:** advanced flow tools;
   discover that pull (just-in-time) beats push for variable demand.
5. **Kaizen/prestige:** lock in gains, step up to a harder plant.

## 6. The "engineer's overlay" (signature feature)

A toggle (like ⚖ ratios) that flips the HUD from *feel* to *instrumentation*:
real-time throughput, WIP, cycle time, OEE per machine, the VUT/variability
read, and the current constraint named explicitly. Casual players never see it;
IE-minded players (and you) get the dashboard. This is a cheap, distinctive hook
that turns "secretly a real simulation" into a selling point.

## 7. What stays out of the first vertical slice

Build the *smallest thing that proves the loop is fun*: **one line + variability
+ a clearly-surfaced moving constraint + protective WIP buffer.** Defer
maintenance/OEE, pull/Kanban, multi-line strategy, and prestige until the core
diagnose-and-fix loop feels good on its own. If feeding a moving constraint isn't
satisfying with one line, more systems won't save it.

## 8. Open design questions

- How much variability is *fun* vs frustrating? (Tuning, §Milestone 8.)
- Is the constraint always exactly one station, or a "constraint zone"?
- Time scale: how fast does the bottleneck move relative to a session?
- How visible should WIP cost be before it feels like punishment?

## 9. Monetization (deferred — architecture notes only)

Do **not** build now. When/if added, the existing design makes these drop-in:
- **Time-skip / "collect offline now":** offline catch-up already exists; an ad
  could grant an extra catch-up window.
- **Temporary 2× / surge:** a multiplier on the tick rate or constraint output.
- **Remove-ads / cosmetic plant skins.**
Keep the sim authoritative client-side with cloud save so these stay multipliers
on top of the loop, never a redesign.

## 10. Build roadmap & recommended model per session

Each row is a self-contained session. **Rule of thumb:** design/balance/math →
reach for the strong tier; implementing an agreed spec → Sonnet; small wiring →
Sonnet/Haiku. Plan-mode any milestone marked *(plan first)*.

| # | Milestone | Nature | Suggested model |
|---|---|---|---|
| 1 | This design doc | Design/strategy | Opus 4.8 / Fable 5 (done) |
| 2 | Engine: per-station **variability** (production-time variance) + reliability/uptime *(plan first)* | Core sim design + math | **Opus 4.8/Fable** to design, **Sonnet 4.6** to implement (done) |
| 3 | **Constraint detection** + "moving bottleneck" spotlight in the UI | Algorithm on existing `flowRates`; clear spec | **Sonnet 4.6** |
| 4 | **Protective WIP buffer** before the constraint (drum-buffer-rope) *(plan first)* | Systems design + feel | **Opus 4.8/Fable** to design, **Sonnet** to implement |
| 5 | **Maintenance / OEE** (PM vs run-to-failure, machine health) | Mechanic + math | **Opus 4.8** design, **Sonnet** implement |
| 6 | **Feedback/juice pass** (constraint spotlight, buffer/health visuals, flow-smoothness meter) | Visual/UX implementation | **Sonnet 4.6** |
| 7 | **Engineer's overlay** (numbers toggle) | Clear UI spec, reuses ratio-toggle pattern | **Sonnet 4.6** (or **Haiku 4.5**) |
| 8 | **Balancing & tuning pass** (variability curves, buffer costs, pacing) | Hard design-math | **Fable 5 / Opus 4.8** |
| 9 | **Prestige / Kaizen** layer | Systems design | **Opus 4.8** design, **Sonnet** implement |
| 10 | (Later) Monetization hooks | Mostly wiring | **Sonnet 4.6** |

**Workflow that gets the most from your tokens:** open design-heavy milestones
(2, 4, 5, 8, 9) in **plan mode on the strong model**, get the plan approved, then
either continue or switch to **Sonnet** to execute the approved plan. Pure
implementation and UI milestones (3, 6, 7) can start on **Sonnet** directly.
