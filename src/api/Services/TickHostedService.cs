namespace FactoryPhysics.Api.Services;

/// <summary>
/// Drives the simulation: ticks the factory once per second and auto-saves
/// once per minute. On startup, attempts to restore the last save.
/// </summary>
public sealed class TickHostedService(GameService game, ILogger<TickHostedService> logger)
    : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan SaveInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            var restored = await game.LoadAsync(stoppingToken);
            logger.LogInformation(restored ? "Restored saved factory" : "Starting a new factory");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to load saved game; starting fresh");
        }

        var lastTick = DateTime.UtcNow;
        var lastSave = DateTime.UtcNow;

        using var timer = new PeriodicTimer(TickInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTime.UtcNow;

            // Use measured wall-clock delta so slow ticks don't lose game time.
            game.Tick((now - lastTick).TotalSeconds);
            lastTick = now;

            if (now - lastSave >= SaveInterval)
            {
                lastSave = now;
                try
                {
                    await game.SaveAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Auto-save failed");
                }
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await game.SaveAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Save on shutdown failed");
        }

        await base.StopAsync(cancellationToken);
    }
}
