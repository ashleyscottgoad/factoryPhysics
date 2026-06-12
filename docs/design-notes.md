# Design Notes

Running log of design decisions. Newest at the top. Larger context lives in
`CLAUDE.md` (decisions log table there is the summary; this file holds the
reasoning).

## 2026-06-12 — Capitalism 2–inspired default chains

Default content is now five parallel industries instead of one chain, ordered
as a cost progression (full-chain price → end product value):

| Chain | Flow | Entry cost | End product |
|---|---|---|---|
| Bakery | Wheat → Flour → Bread | ~$240 | $7 |
| Timber | Timber → Lumber → Furniture | ~$780 | $26 |
| Textiles | Cotton → Fabric → Apparel | ~$950 | $32 |
| Machinery | Ore → Metal → Parts → Machine | ~$1,600 | $40 |
| Petrochem | Crude Oil → Plastic → Toys | ~$3,100 | $120 |

The bakery is the intended opener (new factories start with a wheat farm —
`NewFactory` picks the cheapest extractor); petrochem is the reinvestment
goal. All chains are linear because the engine is single-input-per-station;
Capitalism's multi-ingredient recipes (car = steel + tires) need a
multi-input engine change first — that's the natural next feature.

Rendering: the factory view lays out one row per chain (connected components
over shared resources, computed client-side in `chains.ts`), and the build
menu groups stations by chain. Machinery building ids kept from v1 so
existing saves keep working.

## 2026-06-12 — Admin page: data-driven content

Recipes (inputs/outputs/cost/time) and graphics (color/shape/icon per station
and product) are now editable at `#/admin` and stored in `Resources` /
`BuildingDefinitions` tables; `GameContent.cs` only provides the defaults
that seed the database on first run (and the "reset to defaults" target).

Decisions that fell out of this:

- **Whole-set replace, not row CRUD.** The admin saves the entire content set
  in one PUT; the server validates referential integrity (inputs/outputs must
  reference existing products) and swaps an immutable `ContentCatalog`
  atomically. No FK constraints in the DB — the app is the gatekeeper.
- **Content version.** `/api/state` carries `contentVersion`; the game client
  refetches content when it changes, so admin edits show up mid-session.
- **Edited recipes apply to existing buildings immediately** (next cycle).
  Deleting a definition leaves already-built instances idle, not crashed;
  renaming an id orphans them (warned in the admin UI).
- **Auth is a shared key** (`AdminKey` app setting, `X-Admin-Key` header).
  With no key configured, admin endpoints are open in Development and
  disabled (503) in production, so an unconfigured deploy fails closed.
- **Preview = the real renderer.** The admin preview feeds FactoryCanvas a
  synthetic "one of everything, edges stocked" state, so what you style is
  exactly what the factory view draws.

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
