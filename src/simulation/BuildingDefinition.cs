namespace FactoryPhysics.Simulation;

/// <summary>
/// A purchasable production building. Consumes <see cref="InputResourceId"/>
/// (null for raw extractors like the ore mine) and produces
/// <see cref="OutputResourceId"/> every <see cref="ProductionTimeSeconds"/>.
/// </summary>
public sealed record BuildingDefinition(
    string Id,
    string Name,
    string? InputResourceId,
    int InputAmount,
    string OutputResourceId,
    int OutputAmount,
    double ProductionTimeSeconds,
    decimal Cost);
