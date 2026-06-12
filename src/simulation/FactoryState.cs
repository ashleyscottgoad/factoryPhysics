namespace FactoryPhysics.Simulation;

/// <summary>
/// The complete mutable state of one player's factory. This is what gets
/// serialized into the SaveGames table.
/// </summary>
public sealed class FactoryState
{
    public decimal Cash { get; set; }

    public decimal LifetimeRevenue { get; set; }

    /// <summary>Resource id → units on hand.</summary>
    public Dictionary<string, int> Inventory { get; set; } = new();

    public List<BuildingInstance> Buildings { get; set; } = new();

    /// <summary>Total simulated seconds since the factory was founded.</summary>
    public double ElapsedSeconds { get; set; }
}
