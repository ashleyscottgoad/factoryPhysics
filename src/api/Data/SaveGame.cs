namespace FactoryPhysics.Api.Data;

/// <summary>
/// One row per player. The factory state is stored as JSON for v1 — see
/// db/migrations/001_create_save_games.sql for the matching schema.
/// </summary>
public sealed class SaveGame
{
    public string PlayerId { get; set; } = "";

    public string StateJson { get; set; } = "";

    public DateTime UpdatedAtUtc { get; set; }
}
