namespace FactoryPhysics.Simulation;

public enum ResourceTier
{
    Raw,
    Intermediate,
    Finished
}

/// <summary>
/// A type of good that can exist in the factory (ore, metal, parts, machine).
/// Visual properties (color, icon) drive both the factory view and the admin
/// preview. Editable at runtime via the admin page; defaults in <see cref="GameContent"/>.
/// </summary>
public sealed record ResourceDefinition(
    string Id,
    string Name,
    ResourceTier Tier,
    decimal BaseValue,
    string Color = "#9aa4b8",
    string Icon = "📦",
    int SortOrder = 0);
