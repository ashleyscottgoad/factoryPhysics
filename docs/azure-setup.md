# Azure Provisioning Checklist

The plan: reuse the HeatTracker hosting setup — a **new App Service** for this
API, a **new database on the existing Azure SQL server**, and a new Static Web
App for the client.

**Deployed resources (2026-06):**

| Resource | Name / URL |
|---|---|
| App Service (API) | `factory-physics` — https://factory-physics-ecbmgwf8ahhybtb9.eastus2-01.azurewebsites.net |
| Static Web App (client) | https://gray-beach-04855450f.7.azurestaticapps.net |
| Database | *(not yet created)* |

## 1. Database (existing SQL server, new database)

1. In the Azure portal, open the existing SQL server used by HeatTracker.
2. Create a new database, e.g. `factoryphysics` (the smallest tier is fine —
   v1 writes one save-game row about once a minute).
3. Run `db/migrations/001_create_save_games.sql` against the new database
   (Query editor in the portal, SSMS, or `sqlcmd`).
4. Note the connection string (SQL auth or, better, the same auth approach
   HeatTracker uses). It will look like:
   ```
   Server=tcp:<server>.database.windows.net,1433;Initial Catalog=factoryphysics;...
   ```

## 2. App Service (API)

1. Create a new App Service:
   - Runtime stack: **.NET 10 (LTS)** on Linux *(done — created 2026-06)*.
   - Reuse the existing App Service Plan if it has headroom (no extra cost).
2. Under **Settings → Environment variables → Connection strings**, add:
   - Name: `Default`, Type: `SQLAzure`, Value: the connection string from step 1.
     (ASP.NET Core surfaces this as `ConnectionStrings:Default` automatically.)
3. Under **Environment variables → App settings**, add the client origin for CORS:
   - `Cors__AllowedOrigins__0` = `https://gray-beach-04855450f.7.azurestaticapps.net`
   - No trailing slash — the value must match the browser's `Origin` header exactly.
4. If using SQL auth, make sure the server firewall allows Azure services
   (it already will if HeatTracker's App Service connects the same way).
5. Download the **publish profile** (Overview → Get publish profile) and save
   it as the GitHub repo secret `AZURE_WEBAPP_PUBLISH_PROFILE`.
6. Set `AZURE_WEBAPP_NAME` in `.github/workflows/deploy-api.yml` to the new
   App Service name.

## 3. Static Web App (client)

1. Create a new Static Web App (Free tier).
   - For deployment source choose **Other** so Azure doesn't auto-commit its
     own workflow — this repo already has `.github/workflows/deploy-client.yml`.
2. Copy the **deployment token** (Overview → Manage deployment token) and save
   it as the GitHub repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. Set `VITE_API_BASE_URL` in `.github/workflows/deploy-client.yml` to
   `https://<app-service-name>.azurewebsites.net`.

## 4. Verify

1. Push to `main` (or run both deploy workflows manually via
   **Actions → Run workflow**).
2. `https://<app-service-name>.azurewebsites.net/api/health` → `{"status":"ok"}`.
3. Open the Static Web App URL — cash should tick up as the starter ore mine
   produces and you buy buildings.
4. Restart the App Service and reload — state should restore from the
   `SaveGames` table (auto-saves every minute and on shutdown).

## Notes

- v1 keeps live game state in memory and persists snapshots, so **run a single
  instance** (no scale-out) and disable any slot-swap/multi-instance settings.
- "Always On" should be enabled if the plan supports it, so the simulation
  keeps ticking when nobody has the page open (that's the idle-game promise).
