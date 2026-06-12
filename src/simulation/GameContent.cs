namespace FactoryPhysics.Simulation;

/// <summary>
/// Default game content: the Ore → Metal → Parts → Machine chain. Used to
/// seed the database on first run and as the fallback when no database is
/// configured. Admins can edit content at runtime; "reset to defaults"
/// restores this catalog.
/// </summary>
public static class GameContent
{
    public static ContentCatalog Default { get; } = new(
        new[]
        {
            new ResourceDefinition("ore",     "Ore",     ResourceTier.Raw,          1m,  Color: "#8d6e63", Icon: "🪨", SortOrder: 0),
            new ResourceDefinition("metal",   "Metal",   ResourceTier.Intermediate, 4m,  Color: "#90a4ae", Icon: "🔩", SortOrder: 1),
            new ResourceDefinition("parts",   "Parts",   ResourceTier.Intermediate, 12m, Color: "#f0b35c", Icon: "⚙️", SortOrder: 2),
            new ResourceDefinition("machine", "Machine", ResourceTier.Finished,     40m, Color: "#4fc97e", Icon: "🤖", SortOrder: 3),
        },
        new[]
        {
            new BuildingDefinition("ore-mine", "Ore Mine",       null,    0, "ore",     1, ProductionTimeSeconds: 2,  Cost: 50m,   Color: "#4e342e", Shape: "box",     Icon: "⛏️", SortOrder: 0),
            new BuildingDefinition("smelter",  "Smelter",        "ore",   2, "metal",   1, ProductionTimeSeconds: 4,  Cost: 150m,  Color: "#7c3a1d", Shape: "rounded", Icon: "🔥", SortOrder: 1),
            new BuildingDefinition("workshop", "Parts Workshop", "metal", 2, "parts",   1, ProductionTimeSeconds: 6,  Cost: 400m,  Color: "#1f4e79", Shape: "box",     Icon: "🔧", SortOrder: 2),
            new BuildingDefinition("assembly", "Assembly Line",  "parts", 3, "machine", 1, ProductionTimeSeconds: 10, Cost: 1000m, Color: "#2f7d4f", Shape: "pill",    Icon: "🏭", SortOrder: 3),
        });

    /// <summary>
    /// A fresh factory. Only finished goods generate revenue, so starting cash
    /// must cover the full chain (1,600 with default content) — anything less
    /// is an economic dead end. Starts with one extractor if the catalog has one.
    /// </summary>
    public static FactoryState NewFactory(ContentCatalog catalog)
    {
        var state = new FactoryState { Cash = 2000m };

        var extractor = catalog.Buildings.FirstOrDefault(b => b.InputResourceId is null);
        if (extractor is not null)
        {
            state.Buildings.Add(new BuildingInstance { DefinitionId = extractor.Id });
        }

        return state;
    }
}
