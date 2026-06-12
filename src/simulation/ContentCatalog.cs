namespace FactoryPhysics.Simulation;

/// <summary>
/// An immutable snapshot of the game's content (resources + building recipes).
/// The engine processes buildings in <see cref="Buildings"/> order (sorted by
/// SortOrder), which is what lets goods flow through multiple chain steps in
/// one tick. Replaced wholesale when an admin edits content.
/// </summary>
public sealed class ContentCatalog
{
    public IReadOnlyList<ResourceDefinition> Resources { get; }

    public IReadOnlyList<BuildingDefinition> Buildings { get; }

    private readonly Dictionary<string, ResourceDefinition> _resourcesById;
    private readonly Dictionary<string, BuildingDefinition> _buildingsById;

    public ContentCatalog(
        IEnumerable<ResourceDefinition> resources,
        IEnumerable<BuildingDefinition> buildings)
    {
        Resources = resources.OrderBy(r => r.SortOrder).ToList();
        Buildings = buildings.OrderBy(b => b.SortOrder).ToList();
        _resourcesById = Resources.ToDictionary(r => r.Id);
        _buildingsById = Buildings.ToDictionary(b => b.Id);
    }

    public ResourceDefinition? FindResource(string id) =>
        _resourcesById.GetValueOrDefault(id);

    public BuildingDefinition? FindBuilding(string id) =>
        _buildingsById.GetValueOrDefault(id);
}
