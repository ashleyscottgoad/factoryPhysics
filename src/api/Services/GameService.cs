using FactoryPhysics.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FactoryPhysics.Api.Services;

/// <summary>
/// Save store for the client-run simulation. The browser owns the live game
/// state and ticks it locally; the server just persists the opaque save JSON
/// the client posts. v1 is single-player: one save under a fixed player id.
/// </summary>
public sealed class GameService(IServiceScopeFactory scopeFactory, ILogger<GameService> logger)
{
    public const string DefaultPlayerId = "default";

    /// <summary>The stored save JSON and when it was written, or null if none.</summary>
    public async Task<(string Json, DateTime UpdatedAtUtc)?> LoadRawAsync(
        CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            return null;
        }

        var save = await db.SaveGames.AsNoTracking()
            .FirstOrDefaultAsync(s => s.PlayerId == DefaultPlayerId, cancellationToken);
        return save is null ? null : (save.StateJson, save.UpdatedAtUtc);
    }

    /// <summary>Upsert the client's save JSON. No-op (with a warning) if no database is configured.</summary>
    public async Task SaveRawAsync(string json, CancellationToken cancellationToken = default)
    {
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

    /// <summary>Delete the save so the client re-seeds a fresh factory.</summary>
    public async Task ResetGameAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            return;
        }

        var save = await db.SaveGames.FindAsync([DefaultPlayerId], cancellationToken);
        if (save is not null)
        {
            db.SaveGames.Remove(save);
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
