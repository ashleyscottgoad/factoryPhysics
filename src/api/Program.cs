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

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// The simulation runs in the browser now; the server still owns content, so
// seed/load it once at startup (the tick service used to do this).
try
{
    await app.Services.GetRequiredService<ContentService>().InitializeAsync();
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Failed to load content from database; using defaults");
}

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

// Cloud save: the client owns the live state and posts its save JSON here.
app.MapGet("/api/save", async (GameService game, CancellationToken ct) =>
{
    var saved = await game.LoadRawAsync(ct);
    return saved is null
        ? Results.NoContent()
        : Results.Ok(new { stateJson = saved.Value.Json, savedAtUtc = saved.Value.UpdatedAtUtc });
});

app.MapPut("/api/save", async (SaveRequest request, GameService game, CancellationToken ct) =>
{
    await game.SaveRawAsync(request.StateJson, ct);
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
    await game.ResetGameAsync(ct);
    return Results.Ok();
});

app.Run();

internal sealed record ContentUpdateRequest(
    List<ResourceDefinition> Resources,
    List<BuildingDefinition> Buildings);

internal sealed record SaveRequest(string StateJson);
