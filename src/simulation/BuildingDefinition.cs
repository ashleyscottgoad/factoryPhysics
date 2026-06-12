namespace FactoryPhysics.Simulation;

/// <summary>One ingredient of a recipe: a resource and how many units a cycle consumes.</summary>
public sealed record RecipeInput(string ResourceId, int Amount);

/// <summary>
/// A purchasable production building ("recipe"). Consumes every entry in
/// <see cref="Inputs"/> (empty for raw extractors like the ore mine) and
/// produces <see cref="OutputResourceId"/> every <see cref="ProductionTimeSeconds"/>.
/// Shape is one of "box", "rounded", "pill" (rendered by the client).
/// </summary>
public sealed record BuildingDefinition(
    string Id,
    string Name,
    IReadOnlyList<RecipeInput>? Inputs,
    string OutputResourceId,
    int OutputAmount,
    double ProductionTimeSeconds,
    decimal Cost,
    string Color = "#1d2433",
    string Shape = "box",
    string Icon = "🏭",
    int SortOrder = 0)
{
    /// <summary>Never null — JSON without an "inputs" property means an extractor.</summary>
    public IReadOnlyList<RecipeInput> Inputs { get; init; } = Inputs ?? [];
}
