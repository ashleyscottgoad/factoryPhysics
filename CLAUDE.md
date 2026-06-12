# Factory Idle Game — Project Context

## Project Vision

An idle/simulation game inspired by *Capitalism Plus* and *Factorio*, focused on the satisfaction of watching raw materials flow through a production chain and become finished goods and revenue. The "bliss" of the game is emergent complexity from simple rules — a humming, self-running production network.

**Not** a full economic simulator (yet). Initial scope is deliberately narrow: get the production chain loop feeling good before adding market dynamics, branding, or competition.

---

## Current Scope (v1)

**In scope:**
- Production chains: Raw Materials → Production Steps → Finished Goods → Sales → Revenue
- Idle/auto-running simulation (the factory runs itself; player invests and expands)
- Quality as a slow-burn mechanic affecting demand over time (Toyota-in-the-80s model)
- Visual representation of goods flowing through the chain (node graph / factory floor)

**Out of scope for now:**
- Branding and advertising effects on demand
- Market competition / rival businesses
- Complex demand modeling
- Multiplayer

**Default chains (Capitalism 2–inspired, cheap → expensive):**
```
Bakery     Wheat → Flour → Bread
Timber     Timber → Lumber → Furniture
Textiles   Cotton → Fabric → Apparel
Machinery  Ore → Metal → Parts → Machine
Petrochem  Crude Oil → Plastic → Toys
Automotive Metal + Parts + Plastic → Car   (multi-ingredient capstone)
```
The engine supports multi-ingredient recipes (a station consumes a list of
inputs, all-or-nothing per cycle). The Car Plant is the showcase: it joins the
machinery and petrochem chains into one production network.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | ASP.NET Core (C#, .NET 10) | Existing experience, Azure-native |
| Frontend | TypeScript + React (Vite) | UI shell and app structure |
| Rendering | Pixi.js | Canvas-based game/simulation visuals |
| Database | Azure SQL | Production chain state, save data |
| Hosting | Azure App Service + Static Web Apps | Mirrors existing HeatTracker infrastructure |

### Why this stack
- ASP.NET Core is already known and has seamless Azure/SQL Server integration
- TypeScript/React is the natural frontend pairing — typed, component-based, familiar mental model from C#
- Pixi.js handles the visual simulation layer (animated flows, nodes, factories) efficiently
- SQL Server models the production graph naturally as relational data

### Hosting plan
- **New Azure App Service** for the API, on the same hosting setup used by HeatTracker
- **Same Azure SQL server** as HeatTracker, with a **new database** for this game
- Frontend deployed via Azure Static Web Apps
- See `docs/azure-setup.md` for the step-by-step provisioning checklist

---

## Architecture Overview

```
[React + Pixi.js Frontend]
        ↕ REST API / SignalR
[ASP.NET Core Backend]
        ↕
[SQL Server Database]
        ↕
[Azure Hosting]
```

- **Frontend** handles rendering the factory visualization and player interactions
- **Backend** runs the simulation tick logic, production timers, and economic calculations
- **Database** persists factory configurations, production chain state, inventory, and financials
- **SignalR** (optional, later) for real-time updates pushing simulation state to the UI

---

## Core Game Loop

```
1. Player starts with basic raw material income
2. Player builds production buildings that consume inputs → produce outputs on a timer
3. Finished goods auto-sell at market rate → generate revenue
4. Player reinvests revenue into more capacity, new production steps, or efficiency upgrades
5. Quality slowly accumulates (or degrades) based on production decisions
6. Over time, quality reputation affects demand multiplier
```

---

## Data Model (Starting Point)

### Key Entities

**Resource**
- ResourceId, Name, Tier (raw/intermediate/finished), BaseValue

**ProductionBuilding**
- BuildingId, Name, InputResourceId(s), OutputResourceId, ProductionTimeSeconds, QualityRating

**ProductionChain**
- ChainId — a named sequence of buildings forming a full pipeline

**PlayerFactory**
- FactoryId, PlayerId, ChainId, CurrentInventory (JSON or child table), Revenue, QualityScore

**Market**
- ResourceId, CurrentDemandMultiplier, BasePrice

> Implementation note: resources and building definitions are admin-editable
> and stored relationally (`Resources`, `BuildingDefinitions` tables — see
> `db/migrations/002`). `src/simulation/GameContent.cs` holds the defaults that
> seed the database on first run. Save games remain a JSON snapshot per player.

---

## Simulation Design Principles

- **Tick-based** — simulation advances on a server-side timer (e.g. every second or configurable)
- **Simple rules, emergent complexity** — each building does one thing; complexity comes from chaining them
- **Quality is a slow variable** — changes gradually, not per-tick; represents accumulated reputation
- **Bottlenecks are intentional gameplay** — if one step is slow, the whole chain backs up; that's a puzzle to solve

---

## Quality Mechanic (Design Intent)

Quality is not immediately visible to the customer. It accumulates over time and affects a `DemandMultiplier` on finished goods sales:

- Low quality: demand slowly erodes (customers notice, switch away)
- High quality: demand compounds (reputation grows, premium pricing unlocks)
- Inspired by Toyota's 1980s quality revolution — short-term investment in quality pays off long-term

Implementation note: Quality score should be a float (0.0–1.0) per production building, aggregated across the chain. Demand multiplier updates on a slow cadence (daily/weekly in game time), not per tick.

---

## Development Workflow

### Recommended Approach
1. Design and architecture discussions → use Opus 4.8 in Claude.ai
2. Implementation sessions → Claude Code
3. Keep this `CLAUDE.md` updated as decisions are made

### Project Structure
```
/factoryPhysics/
  CLAUDE.md               ← this file
  FactoryPhysics.sln
  /src/
    /api/                 ← ASP.NET Core backend (FactoryPhysics.Api)
    /client/              ← React + TypeScript + Pixi.js frontend
    /simulation/          ← Core tick/production logic (FactoryPhysics.Simulation)
  /db/
    /migrations/          ← SQL Server schema migrations (plain .sql, run in order)
  /docs/
    design-notes.md       ← Running design decisions log
    azure-setup.md        ← Azure provisioning checklist
  /.github/workflows/     ← CI + Azure deployment
```

### Edit → Build → Test Loop
- Backend changes: build and run locally via `dotnet run --project src/api`
- Frontend changes: `cd src/client && npm run dev` (proxies `/api` to the backend)
- Deploys to Azure happen via GitHub Actions on push to `main`

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06 | Start with idle model, not real-time | Lower complexity, still satisfying; can add speed controls later |
| 2026-06 | Quality out of v1 core loop | Keeps first prototype focused; quality added after basic chain works |
| 2026-06 | Fixed market pricing in v1 | Removes demand modeling complexity; add dynamic demand in v2 |
| 2026-06 | First chain: Ore → Metal → Parts → Machine | Simple 3-step chain; enough to validate the loop |
| 2026-06 | Reuse HeatTracker hosting: new App Service, same Azure SQL server, new database | Known infrastructure, no new cost surface |
| 2026-06 | .NET 8 LTS, game content in code, DB stores save games only | Smallest persistence surface for v1; relational content model deferred to v2 |
| 2026-06 | Retarget to .NET 10 LTS | App Service was provisioned with the .NET 10 (Linux) stack; local SDK is 10.0.x anyway |
| 2026-06 | Multi-ingredient recipes: inputs are a list, consumed all-or-nothing per cycle | Unlocks Capitalism-style converging chains (car = metal + parts + plastic); stored as JSON in `BuildingDefinitions.InputsJson` |
| 2026-06 | Content is data-driven: admin page edits recipes + graphics, stored in Resources/BuildingDefinitions tables | The v2 relational model arrived early; code defaults seed the DB on first run |
| 2026-06 | Admin protected by a shared key (`AdminKey` app setting → `X-Admin-Key` header) | Public URL needs at least a crude lock; real auth deferred |
| 2026-06 | Server holds live game state in memory; periodic + on-demand save to SQL | Idle games need cheap ticks; SQL round-trip per tick is unnecessary |

---

## Open Questions (To Decide)

- [ ] Turn-based (player clicks advance time) vs fully idle (runs automatically)? *(v1 skeleton is fully idle — server ticks once per second)*
- [ ] Top-down factory floor view vs abstract node graph view? *(v1 skeleton uses abstract node graph)*
- [ ] Single production chain to start, or let player build multiple parallel chains?
- [ ] How granular is inventory? (units, batches, continuous flow?) *(v1 skeleton uses whole units)*
- [ ] Game time scale — does 1 real second = 1 game minute? Configurable?
- [ ] Offline progress: simulate elapsed time on load, or pause while away?

---

## Reference / Inspiration

- **Capitalism Plus / Capitalism II** — supply chain and business economics model
- **Factorio** — production chain satisfaction, bottleneck gameplay
- **Mini Metro** — elegance of watching a network self-organize
- **Cookie Clicker / Idle games** — core reinvestment loop structure
