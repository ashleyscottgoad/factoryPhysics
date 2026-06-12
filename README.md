# Factory Physics

An idle factory/production-chain game: watch raw materials flow through a
production chain — **Ore → Metal → Parts → Machine** — and reinvest the
revenue. Inspired by *Capitalism Plus* and *Factorio*. See `CLAUDE.md` for the
full project context and `docs/design-notes.md` for design decisions.

## Stack

- **API** — ASP.NET Core (.NET 10) minimal API; runs the simulation server-side
  (`src/api`, `src/simulation`)
- **Client** — React + TypeScript + Pixi.js via Vite (`src/client`)
- **Database** — Azure SQL (save games); plain SQL migrations in `db/migrations`
- **Hosting** — Azure App Service (API) + Static Web Apps (client); see
  `docs/azure-setup.md`

## Run locally

Backend (no database needed — runs in-memory without a connection string):

```bash
dotnet run --project src/api
# API on http://localhost:5000  →  try /api/health, /api/state
```

Frontend (proxies `/api` to localhost:5000):

```bash
cd src/client
npm install
npm run dev
# UI on http://localhost:5173
```

To test persistence locally, set the `ConnectionStrings__Default` environment
variable to a SQL Server instance that has had `db/migrations/*.sql` applied.

## Deploy

GitHub Actions deploy on push to `main`:

- `.github/workflows/deploy-api.yml` → Azure App Service
- `.github/workflows/deploy-client.yml` → Azure Static Web Apps

One-time Azure setup steps are in `docs/azure-setup.md`.
