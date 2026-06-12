namespace FactoryPhysics.Simulation;

public enum ResourceTier
{
    Raw,
    Intermediate,
    Finished
}

/// <summary>
/// A type of good that can exist in the factory (ore, metal, parts, machine).
/// Content is defined in <see cref="GameContent"/> for v1.
/// </summary>
public sealed record ResourceDefinition(
    string Id,
    string Name,
    ResourceTier Tier,
    decimal BaseValue);
