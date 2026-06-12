namespace FactoryPhysics.Simulation;

/// <summary>
/// A building the player owns. Tracks its current production cycle.
/// </summary>
public sealed class BuildingInstance
{
    public required string DefinitionId { get; set; }

    /// <summary>Seconds elapsed in the current production cycle. Negative-free.</summary>
    public double ProgressSeconds { get; set; }

    /// <summary>True once inputs for the current cycle have been consumed.</summary>
    public bool CycleActive { get; set; }
}
