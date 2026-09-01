using Microsoft.EntityFrameworkCore;

namespace ZimMarketplace.API.Models;

public class MarketplaceDbContext : DbContext
{
    public MarketplaceDbContext(DbContextOptions<MarketplaceDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Listing> Listings => Set<Listing>();
    public DbSet<Bid> Bids => Set<Bid>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Custom performance indexing for localized searches
        modelBuilder.Entity<Listing>().HasIndex(l => l.Location);
        modelBuilder.Entity<Listing>().HasIndex(l => l.Status);
    }
}