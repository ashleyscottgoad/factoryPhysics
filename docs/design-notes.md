# Design Notes

Running log of design decisions. Newest at the top. Larger context lives in
`CLAUDE.md` (decisions log table there is the summary; this file holds the
reasoning).

## 2026-06-12 — Starting cash must cover the full chain

First playtest hit an economic dead end: only finished goods (Machines)
generate revenue, the full chain costs 1,600, and starting cash was 250 — so
after buying a smelter the player could never earn another cent. Starting cash
is now 2,000. Longer term, a real early game wants either a cheaper first
revenue source or the ability to sell intermediates at a discount; revisit
with balancing.

## 2026-06-12 — Initial skeleton

**Server-authoritative idle simulation.** The backend owns the game state and
ticks it once per second in a hosted service; the client polls `/api/state`
once per second and renders. Rationale: keeps the client a pure view (easy to
swap visualizations), prevents save-file editing, and matches the "factory
runs itself even when you're not watching" fantasy — the App Service keeps
ticking after the browser closes.

**In-memory state, periodic persistence.** SQL is a save-game store
(JSON snapshot, one row per player), not the live simulation store. A SQL
round-trip per tick would be pointless load for an idle game. Auto-save every
60s plus save-on-shutdown bounds loss to a minute of idle progress.

**Content in code, not in the database.** Resources and building definitions
live in `GameContent.cs`. With four resources and four buildings, a content
pipeline is overhead. Revisit when content needs to change without a deploy.

**Chain order = list order.** `GameContent.Buildings` is ordered upstream →
downstream and the engine processes buildings in that order, so a single tick
lets goods made early in the tick be consumed later in the tick. Multiple
parallel chains will need an explicit graph (the `ProductionChain` entity in
the data model sketch).

**Whole-unit inventory.** Integers, not continuous flow — simpler to reason
about, and discrete dots are what we want to render anyway.

**Numbers are placeholders.** Costs, production times, and values in
`GameContent.cs` were eyeballed so the loop is playable (ore mine pays back in
~100s); real balancing comes after the loop feels right.

## Open / next

- Quality mechanic (design intent in CLAUDE.md) — after the basic loop works.
- SignalR push instead of polling once the UI feels constrained by 1s polls.
- Offline catch-up vs Always On: currently relying on Always On; if the plan
  doesn't support it, simulate the elapsed gap on startup (the engine's
  `Tick` already handles large deltas).
- Multiple players: state is single-player (`PlayerId = "default"`); the
  save-game schema already keys by player id.
