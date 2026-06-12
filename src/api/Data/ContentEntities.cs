using System.Text.Json;
using FactoryPhysics.Simulation;

namespace FactoryPhysics.Api.Data;

// Admin-editable content rows (the CLAUDE.md v2 relational model).
// No FK constraints between these tables: the whole content set is replaced
// atomically by the app, which validates referential integrity itself —
// see db/migrations/002_create_content_tables.sql.

public sealed class ResourceEntity
{
    public string ResourceId { get; set; } = "";
    public string Name { get; set; } = "";
    public int Tier { get; set; }
    public decimal BaseValue { get; set; }
    public string Color { get; set; } = "";
    public string Icon { get; set; } = "";
    public int SortOrder { get; set; }

    public ResourceDefinition ToDefinition() =>
        new(ResourceId, Name, (ResourceTier)Tier, BaseValue, Color, Icon, SortOrder);

    public static ResourceEntity From(ResourceDefinition d) => new()
    {
        ResourceId = d.Id,
        Name = d.Name,
        Tier = (int)d.Tier,
        BaseValue = d.BaseValue,
        Color = d.Color,
        Icon = d.Icon,
        SortOrder = d.SortOrder,
    };
}

public sealed class BuildingDefinitionEntity
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public string BuildingId { get; set; } = "";
    public string Name { get; set; } = "";

    /// <summary>Recipe ingredients as a JSON array of {resourceId, amount}; "[]" = extractor.</summary>
    public string InputsJson { get; set; } = "[]";

    public string OutputResourceId { get; set; } = "";
    public int OutputAmount { get; set; }
    public double ProductionTimeSeconds { get; set; }
    public decimal Cost { get; set; }
    public string Color { get; set; } = "";
    public string Shape { get; set; } = "";
    public string Icon { get; set; } = "";
    public int SortOrder { get; set; }

    public BuildingDefinition ToDefinition() =>
        new(BuildingId, Name,
            JsonSerializer.Deserialize<List<RecipeInput>>(InputsJson, JsonOptions),
            OutputResourceId, OutputAmount,
            ProductionTimeSeconds, Cost, Color, Shape, Icon, SortOrder);

    public static BuildingDefinitionEntity From(BuildingDefinition d) => new()
    {
        BuildingId = d.Id,
        Name = d.Name,
        InputsJson = JsonSerializer.Serialize(d.Inputs, JsonOptions),
        OutputResourceId = d.OutputResourceId,
        OutputAmount = d.OutputAmount,
        ProductionTimeSeconds = d.ProductionTimeSeconds,
        Cost = d.Cost,
        Color = d.Color,
        Shape = d.Shape,
        Icon = d.Icon,
        SortOrder = d.SortOrder,
    };
}
