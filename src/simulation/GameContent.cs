namespace FactoryPhysics.Simulation;

/// <summary>
/// Static v1 game content: the Ore → Metal → Parts → Machine chain.
/// Moves to the database when content becomes data-driven (v2).
/// </summary>
public static class GameContent
{
    public static readonly IReadOnlyList<ResourceDefinition> Resources = new[]
    {
        new ResourceDefinition("ore",     "Ore",     ResourceTier.Raw,          1m),
        new ResourceDefinition("metal",   "Metal",   ResourceTier.Intermediate, 4m),
        new ResourceDefinition("parts",   "Parts",   ResourceTier.Intermediate, 12m),
        new ResourceDefinition("machine", "Machine", ResourceTier.Finished,     40m),
    };

    public static readonly IReadOnlyList<BuildingDefinition> Buildings = new[]
    {
        new BuildingDefinition("ore-mine",  "Ore Mine",       null,    0, "ore",     1, ProductionTimeSeconds: 2,  Cost: 50m),
        new BuildingDefinition("smelter",   "Smelter",        "ore",   2, "metal",   1, ProductionTimeSeconds: 4,  Cost: 150m),
        new BuildingDefinition("workshop",  "Parts Workshop", "metal", 2, "parts",   1, ProductionTimeSeconds: 6,  Cost: 400m),
        new BuildingDefinition("assembly",  "Assembly Line",  "parts", 3, "machine", 1, ProductionTimeSeconds: 10, Cost: 1000m),
    };

    public static ResourceDefinition GetResource(string id) =>
        Resources.First(r => r.Id == id);

    public static BuildingDefinition? FindBuilding(string id) =>
        Buildings.FirstOrDefault(b => b.Id == id);

    /// <summary>
    /// A fresh factory. Only finished goods generate revenue, so starting cash
    /// must cover the full chain (1,600) — anything less is an economic dead end.
    /// </summary>
    public static FactoryState NewFactory() => new()
    {
        Cash = 2000m,
        Buildings =
        {
            new BuildingInstance { DefinitionId = "ore-mine" },
        },
    };
}
