namespace FactoryPhysics.Simulation;

/// <summary>
/// Advances a <see cref="FactoryState"/> through time. Pure logic: no I/O,
/// no clocks — the caller decides how much time has passed and supplies the
/// content catalog (which an admin may have edited since the last tick).
/// </summary>
public static class SimulationEngine
{
    /// <summary>
    /// Advance the factory by <paramref name="deltaSeconds"/>. Each building:
    /// consumes its inputs to start a cycle, accumulates progress, and on
    /// completion emits output. Finished-tier goods auto-sell at base value.
    /// Buildings are processed in chain order so goods can flow through
    /// multiple steps across consecutive ticks (bottlenecks back up naturally).
    /// </summary>
    public static void Tick(FactoryState state, double deltaSeconds, ContentCatalog catalog)
    {
        if (deltaSeconds <= 0)
        {
            return;
        }

        state.ElapsedSeconds += deltaSeconds;

        foreach (var building in state.Buildings)
        {
            var def = catalog.FindBuilding(building.DefinitionId);
            if (def is null)
            {
                continue; // definition deleted or renamed by an admin; idle rather than crash
            }

            var remaining = deltaSeconds;

            // A single large delta (e.g. catching up after a stall) may complete
            // multiple cycles; loop until time or inputs run out.
            while (remaining > 0)
            {
                if (!building.CycleActive)
                {
                    if (!TryConsumeInputs(state, def))
                    {
                        break; // starved — wait for upstream
                    }

                    building.CycleActive = true;
                    building.ProgressSeconds = 0;
                }

                var needed = def.ProductionTimeSeconds - building.ProgressSeconds;
                if (remaining < needed)
                {
                    building.ProgressSeconds += remaining;
                    remaining = 0;
                }
                else
                {
                    remaining -= needed;
                    building.CycleActive = false;
                    building.ProgressSeconds = 0;
                    Produce(state, def, catalog);
                }
            }
        }
    }

    /// <summary>Buy a building if the player can afford it. Returns false otherwise.</summary>
    public static bool TryPurchaseBuilding(FactoryState state, string definitionId, ContentCatalog catalog)
    {
        var def = catalog.FindBuilding(definitionId);
        if (def is null || state.Cash < def.Cost)
        {
            return false;
        }

        state.Cash -= def.Cost;
        state.Buildings.Add(new BuildingInstance { DefinitionId = definitionId });
        return true;
    }

    private static bool TryConsumeInputs(FactoryState state, BuildingDefinition def)
    {
        if (def.InputResourceId is null)
        {
            return true; // raw extractor
        }

        if (state.Inventory.GetValueOrDefault(def.InputResourceId) < def.InputAmount)
        {
            return false;
        }

        state.Inventory[def.InputResourceId] -= def.InputAmount;
        return true;
    }

    private static void Produce(FactoryState state, BuildingDefinition def, ContentCatalog catalog)
    {
        var resource = catalog.FindResource(def.OutputResourceId);
        if (resource is null)
        {
            return; // output resource deleted by an admin; drop the goods
        }

        if (resource.Tier == ResourceTier.Finished)
        {
            // v1: fixed market pricing, instant auto-sell.
            var revenue = resource.BaseValue * def.OutputAmount;
            state.Cash += revenue;
            state.LifetimeRevenue += revenue;
        }
        else
        {
            state.Inventory[def.OutputResourceId] =
                state.Inventory.GetValueOrDefault(def.OutputResourceId) + def.OutputAmount;
        }
    }
}
