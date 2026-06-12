using System.Text.Json;
using FactoryPhysics.Api.Data;
using FactoryPhysics.Simulation;
using Microsoft.EntityFrameworkCore;

namespace FactoryPhysics.Api.Services;

/// <summary>
/// Holds the live in-memory factory state and mediates all access to it.
/// v1 is single-player: one factory under a fixed player id. State is ticked
/// by <see cref="TickHostedService"/> and saved to SQL periodically and on demand.
/// </summary>
public sealed class GameService(
    IServiceScopeFactory scopeFactory,
    ContentService content,
    ILogger<GameService> logger)
{
    public const string DefaultPlayerId = "default";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly object _gate = new();
    private FactoryState _state = GameContent.NewFactory(content.Catalog);

    /// <summary>Run an action against the live state under the lock and return its result.</summary>
    public T WithState<T>(Func<FactoryState, T> action)
    {
        lock (_gate)
        {
            return action(_state);
        }
    }

    public void Tick(double deltaSeconds)
    {
        lock (_gate)
        {
            SimulationEngine.Tick(_state, deltaSeconds, content.Catalog);
        }
    }

    public bool TryPurchaseBuilding(string definitionId)
    {
        lock (_gate)
        {
            return SimulationEngine.TryPurchaseBuilding(_state, definitionId, content.Catalog);
        }
    }

    /// <summary>Throw away the current factory and start a new game.</summary>
    public void ResetGame()
    {
        lock (_gate)
        {
            _state = GameContent.NewFactory(content.Catalog);
        }
    }

    /// <summary>Persist the current state. No-op (with a warning) if no database is configured.</summary>
    public async Task SaveAsync(CancellationToken cancellationToken = default)
    {
        string json;
        lock (_gate)
        {
            json = JsonSerializer.Serialize(_state, JsonOptions);
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            logger.LogWarning("Save skipped: no database connection string configured");
            return;
        }

        var save = await db.SaveGames.FindAsync([DefaultPlayerId], cancellationToken);
        if (save is null)
        {
            save = new SaveGame { PlayerId = DefaultPlayerId };
            db.SaveGames.Add(save);
        }

        save.StateJson = json;
        save.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Load saved state if one exists; otherwise keep the current state.</summary>
    public async Task<bool> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            return false;
        }

        var save = await db.SaveGames.AsNoTracking()
            .FirstOrDefaultAsync(s => s.PlayerId == DefaultPlayerId, cancellationToken);
        if (save is null)
        {
            return false;
        }

        var loaded = JsonSerializer.Deserialize<FactoryState>(save.StateJson, JsonOptions);
        if (loaded is null)
        {
            return false;
        }

        lock (_gate)
        {
            _state = loaded;
        }

        return true;
    }
}
