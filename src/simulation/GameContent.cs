namespace FactoryPhysics.Simulation;

/// <summary>
/// Default game content: five Capitalism 2–inspired production chains,
/// ordered cheap → expensive so there's a progression curve:
///
///   Bakery     Wheat → Flour → Bread            (starter; full chain ~$240)
///   Timber     Timber → Lumber → Furniture
///   Textiles   Cotton → Fabric → Apparel
///   Machinery  Ore → Metal → Parts → Machine
///   Petrochem  Crude Oil → Plastic → Toys       (endgame; full chain ~$3,100)
///
/// plus one multi-ingredient capstone that joins two chains:
///
///   Automotive Metal + Parts + Plastic → Car    (requires machinery + petrochem)
///
/// Used to seed the database on first run and as the fallback when no
/// database is configured. Admins can edit content at runtime; "reset to
/// defaults" restores this catalog.
/// </summary>
public static class GameContent
{
    public static ContentCatalog Default { get; } = new(
        new[]
        {
            // Bakery
            new ResourceDefinition("wheat",     "Wheat",     ResourceTier.Raw,          1m,   Color: "#d4b94e", Icon: "🌾", SortOrder: 0),
            new ResourceDefinition("flour",     "Flour",     ResourceTier.Intermediate, 3m,   Color: "#e8dcc0", Icon: "🥣", SortOrder: 1),
            new ResourceDefinition("bread",     "Bread",     ResourceTier.Finished,     7m,   Color: "#c98a4b", Icon: "🍞", SortOrder: 2),
            // Timber
            new ResourceDefinition("timber",    "Timber",    ResourceTier.Raw,          2m,   Color: "#6b8e5a", Icon: "🌲", SortOrder: 3),
            new ResourceDefinition("lumber",    "Lumber",    ResourceTier.Intermediate, 6m,   Color: "#c19a6b", Icon: "🧱", SortOrder: 4),
            new ResourceDefinition("furniture", "Furniture", ResourceTier.Finished,     26m,  Color: "#9c6b30", Icon: "🪑", SortOrder: 5),
            // Textiles
            new ResourceDefinition("cotton",    "Cotton",    ResourceTier.Raw,          2m,   Color: "#e8e4d8", Icon: "☁️", SortOrder: 6),
            new ResourceDefinition("fabric",    "Fabric",    ResourceTier.Intermediate, 7m,   Color: "#9b7fb8", Icon: "🧵", SortOrder: 7),
            new ResourceDefinition("apparel",   "Apparel",   ResourceTier.Finished,     32m,  Color: "#4f7ec9", Icon: "👕", SortOrder: 8),
            // Machinery
            new ResourceDefinition("ore",       "Ore",       ResourceTier.Raw,          1m,   Color: "#8d6e63", Icon: "⛰️", SortOrder: 9),
            new ResourceDefinition("metal",     "Metal",     ResourceTier.Intermediate, 4m,   Color: "#90a4ae", Icon: "🔩", SortOrder: 10),
            new ResourceDefinition("parts",     "Parts",     ResourceTier.Intermediate, 12m,  Color: "#f0b35c", Icon: "⚙️", SortOrder: 11),
            new ResourceDefinition("machine",   "Machine",   ResourceTier.Finished,     40m,  Color: "#4fc97e", Icon: "🤖", SortOrder: 12),
            // Petrochem
            new ResourceDefinition("crude-oil", "Crude Oil", ResourceTier.Raw,          3m,   Color: "#4a4a52", Icon: "🛢️", SortOrder: 13),
            new ResourceDefinition("plastic",   "Plastic",   ResourceTier.Intermediate, 10m,  Color: "#d977a8", Icon: "🧴", SortOrder: 14),
            new ResourceDefinition("toys",      "Toys",      ResourceTier.Finished,     120m, Color: "#e0533f", Icon: "🧸", SortOrder: 15),
            // Automotive (multi-ingredient capstone)
            new ResourceDefinition("car",       "Car",       ResourceTier.Finished,     320m, Color: "#d35454", Icon: "🚗", SortOrder: 16),
        },
        new[]
        {
            // Bakery — starter chain, cheap and quick
            new BuildingDefinition("wheat-farm",        "Wheat Farm",       [],                            "wheat",     1, ProductionTimeSeconds: 2,  Cost: 30m,   Color: "#55602b", Shape: "box",     Icon: "🚜", SortOrder: 0),
            new BuildingDefinition("grain-mill",        "Grain Mill",       [new("wheat", 2)],             "flour",     1, ProductionTimeSeconds: 3,  Cost: 60m,   Color: "#76683f", Shape: "rounded", Icon: "🌀", SortOrder: 1),
            new BuildingDefinition("bakery",            "Bakery",           [new("flour", 2)],             "bread",     1, ProductionTimeSeconds: 4,  Cost: 150m,  Color: "#8b5a2b", Shape: "pill",    Icon: "🥖", SortOrder: 2),
            // Timber
            new BuildingDefinition("logging-camp",      "Logging Camp",     [],                            "timber",    1, ProductionTimeSeconds: 3,  Cost: 80m,   Color: "#3f4d2e", Shape: "box",     Icon: "🪓", SortOrder: 3),
            new BuildingDefinition("sawmill",           "Sawmill",          [new("timber", 2)],            "lumber",    1, ProductionTimeSeconds: 4,  Cost: 200m,  Color: "#5d4a33", Shape: "rounded", Icon: "⚒️", SortOrder: 4),
            new BuildingDefinition("furniture-factory", "Furniture Factory", [new("lumber", 2)],           "furniture", 1, ProductionTimeSeconds: 7,  Cost: 500m,  Color: "#6e4e23", Shape: "pill",    Icon: "🛋️", SortOrder: 5),
            // Textiles
            new BuildingDefinition("cotton-farm",       "Cotton Farm",      [],                            "cotton",    1, ProductionTimeSeconds: 3,  Cost: 100m,  Color: "#4a5d3a", Shape: "box",     Icon: "🌱", SortOrder: 6),
            new BuildingDefinition("textile-mill",      "Textile Mill",     [new("cotton", 2)],            "fabric",    1, ProductionTimeSeconds: 5,  Cost: 250m,  Color: "#4b3f63", Shape: "rounded", Icon: "🧶", SortOrder: 7),
            new BuildingDefinition("apparel-factory",   "Apparel Factory",  [new("fabric", 2)],            "apparel",   1, ProductionTimeSeconds: 7,  Cost: 600m,  Color: "#2d4a73", Shape: "pill",    Icon: "👗", SortOrder: 8),
            // Machinery (ids unchanged from the original chain so old saves keep working)
            new BuildingDefinition("ore-mine",          "Ore Mine",         [],                            "ore",       1, ProductionTimeSeconds: 2,  Cost: 50m,   Color: "#4e342e", Shape: "box",     Icon: "⛏️", SortOrder: 9),
            new BuildingDefinition("smelter",           "Smelter",          [new("ore", 2)],               "metal",     1, ProductionTimeSeconds: 4,  Cost: 150m,  Color: "#7c3a1d", Shape: "rounded", Icon: "🔥", SortOrder: 10),
            new BuildingDefinition("workshop",          "Parts Workshop",   [new("metal", 2)],             "parts",     1, ProductionTimeSeconds: 6,  Cost: 400m,  Color: "#1f4e79", Shape: "box",     Icon: "🔧", SortOrder: 11),
            new BuildingDefinition("assembly",          "Assembly Line",    [new("parts", 3)],             "machine",   1, ProductionTimeSeconds: 10, Cost: 1000m, Color: "#2f7d4f", Shape: "pill",    Icon: "🏭", SortOrder: 12),
            // Petrochem — endgame margins
            new BuildingDefinition("oil-well",          "Oil Well",         [],                            "crude-oil", 1, ProductionTimeSeconds: 4,  Cost: 400m,  Color: "#26262e", Shape: "box",     Icon: "🏗️", SortOrder: 13),
            new BuildingDefinition("refinery",          "Refinery",         [new("crude-oil", 2)],         "plastic",   1, ProductionTimeSeconds: 6,  Cost: 900m,  Color: "#3a2f3f", Shape: "rounded", Icon: "⚗️", SortOrder: 14),
            new BuildingDefinition("toy-factory",       "Toy Factory",      [new("plastic", 3)],           "toys",      1, ProductionTimeSeconds: 12, Cost: 1800m, Color: "#6e2639", Shape: "pill",    Icon: "🧸", SortOrder: 15),
            // Automotive — multi-ingredient: pulls from machinery AND petrochem
            new BuildingDefinition("car-plant",         "Car Plant",
                [new("metal", 2), new("parts", 3), new("plastic", 2)],
                                                                            "car",       1, ProductionTimeSeconds: 15, Cost: 2500m, Color: "#5a2a2a", Shape: "pill",    Icon: "🚗", SortOrder: 16),
        });

    /// <summary>
    /// A fresh factory. Only finished goods generate revenue, so starting cash
    /// must cover at least one full chain — the bakery chain (~$240) is the
    /// intended opener, and $2,000 also keeps the machinery chain reachable.
    /// Starts with one of the cheapest extractor so something is moving.
    /// </summary>
    public static FactoryState NewFactory(ContentCatalog catalog)
    {
        var state = new FactoryState { Cash = 2000m };

        var extractor = catalog.Buildings
            .Where(b => b.Inputs.Count == 0)
            .OrderBy(b => b.Cost)
            .FirstOrDefault();
        if (extractor is not null)
        {
            state.Buildings.Add(new BuildingInstance { DefinitionId = extractor.Id });
        }

        return state;
    }
}
