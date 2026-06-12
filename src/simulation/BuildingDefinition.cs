namespace FactoryPhysics.Simulation;

/// <summary>
/// A purchasable production building ("recipe"). Consumes <see cref="InputResourceId"/>
/// (null for raw extractors like the ore mine) and produces
/// <see cref="OutputResourceId"/> every <see cref="ProductionTimeSeconds"/>.
/// Shape is one of "box", "rounded", "pill" (rendered by the client).
/// </summary>
public sealed record BuildingDefinition(
    string Id,
    string Name,
    string? InputResourceId,
    int InputAmount,
    string OutputResourceId,
    int OutputAmount,
    double ProductionTimeSeconds,
    decimal Cost,
    string Color = "#1d2433",
    string Shape = "box",
    string Icon = "🏭",
    int SortOrder = 0);
