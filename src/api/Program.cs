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

// Static game content: resources and purchasable buildings.
app.MapGet("/api/content", () => Results.Ok(new
{
    resources = GameContent.Resources,
    buildings = GameContent.Buildings,
}));

// Live factory state snapshot, polled by the client.
app.MapGet("/api/state", (GameService game) =>
    Results.Ok(game.WithState(state => new
    {
        cash = state.Cash,
        lifetimeRevenue = state.LifetimeRevenue,
        elapsedSeconds = state.ElapsedSeconds,
        // Copied: the snapshot is serialized after the state lock is released.
        inventory = new Dictionary<string, int>(state.Inventory),
        buildings = state.Buildings.Select(b =>
        {
            var def = GameContent.FindBuilding(b.DefinitionId);
            return new
            {
                definitionId = b.DefinitionId,
                cycleActive = b.CycleActive,
                progress = def is { ProductionTimeSeconds: > 0 }
                    ? Math.Clamp(b.ProgressSeconds / def.ProductionTimeSeconds, 0, 1)
                    : 0,
            };
        }).ToList(),
    })));

app.MapPost("/api/buildings/{definitionId}", (string definitionId, GameService game) =>
    game.TryPurchaseBuilding(definitionId)
        ? Results.Ok()
        : Results.BadRequest(new { error = "Unknown building or insufficient cash" }));

app.MapPost("/api/save", async (GameService game, CancellationToken ct) =>
{
    await game.SaveAsync(ct);
    return Results.Ok();
});

app.Run();
