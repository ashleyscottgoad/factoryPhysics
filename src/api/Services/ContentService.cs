using FactoryPhysics.Api.Data;
using FactoryPhysics.Simulation;
using Microsoft.EntityFrameworkCore;

namespace FactoryPhysics.Api.Services;

/// <summary>
/// Owns the live <see cref="ContentCatalog"/>. Loads admin-edited content
/// from the database at startup (seeding defaults on first run); without a
/// database, edits work but only live in memory. <see cref="Version"/> bumps
/// on every change so clients know to refetch.
/// </summary>
public sealed class ContentService(IServiceScopeFactory scopeFactory, ILogger<ContentService> logger)
{
    private readonly object _gate = new();

    public ContentCatalog Catalog { get; private set; } = GameContent.Default;

    public int Version { get; private set; } = 1;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            logger.LogWarning("No database configured: content edits will not survive a restart");
            return;
        }

        var resources = await db.Resources.AsNoTracking().ToListAsync(cancellationToken);
        if (resources.Count == 0)
        {
            logger.LogInformation("Content tables empty; seeding defaults");
            await PersistAsync(GameContent.Default, cancellationToken);
            return;
        }

        var buildings = await db.BuildingDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        lock (_gate)
        {
            Catalog = new ContentCatalog(
                resources.Select(r => r.ToDefinition()),
                buildings.Select(b => b.ToDefinition()));
        }

        logger.LogInformation(
            "Loaded content from database: {Resources} resources, {Buildings} buildings",
            resources.Count, buildings.Count);
    }

    /// <summary>
    /// Replace the whole content set. Returns validation errors (empty on success).
    /// </summary>
    public async Task<IReadOnlyList<string>> UpdateAsync(
        IReadOnlyList<ResourceDefinition> resources,
        IReadOnlyList<BuildingDefinition> buildings,
        CancellationToken cancellationToken = default)
    {
        var errors = Validate(resources, buildings);
        if (errors.Count > 0)
        {
            return errors;
        }

        var catalog = new ContentCatalog(resources, buildings);
        lock (_gate)
        {
            Catalog = catalog;
            Version++;
        }

        await PersistAsync(catalog, cancellationToken);
        return [];
    }

    public Task ResetToDefaultsAsync(CancellationToken cancellationToken = default) =>
        UpdateAsync(GameContent.Default.Resources, GameContent.Default.Buildings, cancellationToken);

    private async Task PersistAsync(ContentCatalog catalog, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetService<FactoryDbContext>();
        if (db is null)
        {
            return; // in-memory only
        }

        await db.Resources.ExecuteDeleteAsync(cancellationToken);
        await db.BuildingDefinitions.ExecuteDeleteAsync(cancellationToken);
        db.Resources.AddRange(catalog.Resources.Select(ResourceEntity.From));
        db.BuildingDefinitions.AddRange(catalog.Buildings.Select(BuildingDefinitionEntity.From));
        await db.SaveChangesAsync(cancellationToken);
    }

    private static List<string> Validate(
        IReadOnlyList<ResourceDefinition> resources,
        IReadOnlyList<BuildingDefinition> buildings)
    {
        var errors = new List<string>();
        var resourceIds = new HashSet<string>();

        foreach (var r in resources)
        {
            if (string.IsNullOrWhiteSpace(r.Id))
            {
                errors.Add($"Resource \"{r.Name}\" needs a non-empty id.");
            }
            else if (!resourceIds.Add(r.Id))
            {
                errors.Add($"Duplicate resource id \"{r.Id}\".");
            }

            if (r.BaseValue < 0)
            {
                errors.Add($"Resource \"{r.Id}\": value cannot be negative.");
            }
        }

        var buildingIds = new HashSet<string>();
        foreach (var b in buildings)
        {
            var label = string.IsNullOrWhiteSpace(b.Id) ? b.Name : b.Id;
            if (string.IsNullOrWhiteSpace(b.Id))
            {
                errors.Add($"Building \"{b.Name}\" needs a non-empty id.");
            }
            else if (!buildingIds.Add(b.Id))
            {
                errors.Add($"Duplicate building id \"{b.Id}\".");
            }

            var inputIds = new HashSet<string>();
            foreach (var input in b.Inputs)
            {
                if (!resourceIds.Contains(input.ResourceId))
                {
                    errors.Add($"Building \"{label}\": input resource \"{input.ResourceId}\" does not exist.");
                }
                else if (!inputIds.Add(input.ResourceId))
                {
                    errors.Add($"Building \"{label}\": resource \"{input.ResourceId}\" is listed as an input twice.");
                }

                if (input.Amount < 1)
                {
                    errors.Add($"Building \"{label}\": input amounts must be at least 1.");
                }

                if (input.ResourceId == b.OutputResourceId)
                {
                    errors.Add($"Building \"{label}\": cannot consume its own output.");
                }
            }

            if (!resourceIds.Contains(b.OutputResourceId))
            {
                errors.Add($"Building \"{label}\": output resource \"{b.OutputResourceId}\" does not exist.");
            }

            if (b.OutputAmount < 1)
            {
                errors.Add($"Building \"{label}\": output amount must be at least 1.");
            }

            if (b.ProductionTimeSeconds <= 0)
            {
                errors.Add($"Building \"{label}\": production time must be positive.");
            }

            if (b.Cost < 0)
            {
                errors.Add($"Building \"{label}\": cost cannot be negative.");
            }
        }

        return errors;
    }
}
