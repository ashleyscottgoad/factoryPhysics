using Microsoft.EntityFrameworkCore;

namespace FactoryPhysics.Api.Data;

public sealed class FactoryDbContext(DbContextOptions<FactoryDbContext> options)
    : DbContext(options)
{
    public DbSet<SaveGame> SaveGames => Set<SaveGame>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SaveGame>(entity =>
        {
            entity.ToTable("SaveGames");
            entity.HasKey(s => s.PlayerId);
            entity.Property(s => s.PlayerId).HasMaxLength(128);
            entity.Property(s => s.StateJson).IsRequired();
        });
    }
}
