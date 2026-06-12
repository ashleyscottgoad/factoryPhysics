using Microsoft.EntityFrameworkCore;

namespace FactoryPhysics.Api.Data;

public sealed class FactoryDbContext(DbContextOptions<FactoryDbContext> options)
    : DbContext(options)
{
    public DbSet<SaveGame> SaveGames => Set<SaveGame>();

    public DbSet<ResourceEntity> Resources => Set<ResourceEntity>();

    public DbSet<BuildingDefinitionEntity> BuildingDefinitions => Set<BuildingDefinitionEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SaveGame>(entity =>
        {
            entity.ToTable("SaveGames");
            entity.HasKey(s => s.PlayerId);
            entity.Property(s => s.PlayerId).HasMaxLength(128);
            entity.Property(s => s.StateJson).IsRequired();
        });

        modelBuilder.Entity<ResourceEntity>(entity =>
        {
            entity.ToTable("Resources");
            entity.HasKey(r => r.ResourceId);
            entity.Property(r => r.ResourceId).HasMaxLength(64);
            entity.Property(r => r.Name).HasMaxLength(128);
            entity.Property(r => r.BaseValue).HasPrecision(18, 2);
            entity.Property(r => r.Color).HasMaxLength(16);
            entity.Property(r => r.Icon).HasMaxLength(16);
        });

        modelBuilder.Entity<BuildingDefinitionEntity>(entity =>
        {
            entity.ToTable("BuildingDefinitions");
            entity.HasKey(b => b.BuildingId);
            entity.Property(b => b.BuildingId).HasMaxLength(64);
            entity.Property(b => b.Name).HasMaxLength(128);
            entity.Property(b => b.InputResourceId).HasMaxLength(64);
            entity.Property(b => b.OutputResourceId).HasMaxLength(64);
            entity.Property(b => b.Cost).HasPrecision(18, 2);
            entity.Property(b => b.Color).HasMaxLength(16);
            entity.Property(b => b.Shape).HasMaxLength(16);
            entity.Property(b => b.Icon).HasMaxLength(16);
        });
    }
}
