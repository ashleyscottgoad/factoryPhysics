using FactoryPhysics.Api.Data;
using FactoryPhysics.Api.Services;
using FactoryPhysics.Simulation;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database is optional locally: without a connection string the game runs
// in-memory only. On Azure, set the "Default" connection string on the App Service.
var connectionString = builder.Configuration.GetConnectionString("Default");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddDbContext<FactoryDbContext>(options =>
        options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));
}

builder.Services.AddSingleton<ContentService>();
builder.Services.AddSingleton<GameService>();
builder.Services.AddHostedService<TickHostedService>();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// Game content (resources + recipes), admin-editable. Version lets clients
// detect changes via /api/state and refetch.
app.MapGet("/api/content", (ContentService content) => Results.Ok(new
{
    version = content.Version,
    resources = content.Catalog.Resources,
    buildings = content.Catalog.Buildings,
}));

// Live factory state snapshot, polled by the client.
app.MapGet("/api/state", (GameService game, ContentService content) =>
{
    var catalog = content.Catalog;
    return Results.Ok(game.WithState(state => new
    {
        contentVersion = content.Version,
        cash = state.Cash,
        lifetimeRevenue = state.LifetimeRevenue,
        elapsedSeconds = state.ElapsedSeconds,
        // Copied: the snapshot is serialized after the state lock is released.
        inventory = new Dictionary<string, int>(state.Inventory),
        buildings = state.Buildings.Select(b =>
        {
            var def = catalog.FindBuilding(b.DefinitionId);
            return new
            {
                definitionId = b.DefinitionId,
                cycleActive = b.CycleActive,
                progress = def is { ProductionTimeSeconds: > 0 }
                    ? Math.Clamp(b.ProgressSeconds / def.ProductionTimeSeconds, 0, 1)
                    : 0,
            };
        }).ToList(),
    }));
});

app.MapPost("/api/buildings/{definitionId}", (string definitionId, GameService game) =>
    game.TryPurchaseBuilding(definitionId)
        ? Results.Ok()
        : Results.BadRequest(new { error = "Unknown building or insufficient cash" }));

app.MapPost("/api/save", async (GameService game, CancellationToken ct) =>
{
    await game.SaveAsync(ct);
    return Results.Ok();
});

// --- Admin (requires the X-Admin-Key header matching the AdminKey setting) ---

var admin = app.MapGroup("/api/admin");

admin.AddEndpointFilter(async (context, next) =>
{
    var http = context.HttpContext;
    var configuredKey = http.RequestServices.GetRequiredService<IConfiguration>()["AdminKey"];

    if (string.IsNullOrEmpty(configuredKey))
    {
        // Local dev convenience only; in production an unset key disables admin.
        if (http.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            return await next(context);
        }

        return Results.Problem(
            statusCode: StatusCodes.Status503ServiceUnavailable,
            detail: "Admin is disabled: no AdminKey is configured on the server.");
    }

    return http.Request.Headers["X-Admin-Key"] == configuredKey
        ? await next(context)
        : Results.Unauthorized();
});

admin.MapPut("/content", async (
    ContentUpdateRequest request,
    ContentService content,
    CancellationToken ct) =>
{
    var errors = await content.UpdateAsync(request.Resources, request.Buildings, ct);
    return errors.Count == 0
        ? Results.Ok(new { version = content.Version })
        : Results.BadRequest(new { errors });
});

admin.MapPost("/content/reset", async (ContentService content, CancellationToken ct) =>
{
    await content.ResetToDefaultsAsync(ct);
    return Results.Ok(new { version = content.Version });
});

admin.MapPost("/game/reset", async (GameService game, CancellationToken ct) =>
{
    game.ResetGame();
    await game.SaveAsync(ct);
    return Results.Ok();
});

app.Run();

internal sealed record ContentUpdateRequest(
    List<ResourceDefinition> Resources,
    List<BuildingDefinition> Buildings);
