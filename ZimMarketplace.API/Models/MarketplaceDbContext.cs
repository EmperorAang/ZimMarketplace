using Microsoft.EntityFrameworkCore;

namespace ZimMarketplace.API.Models;

public class MarketplaceDbContext : DbContext
{
    public MarketplaceDbContext(DbContextOptions<MarketplaceDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Listing> Listings => Set<Listing>();
    public DbSet<Bid> Bids => Set<Bid>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Custom performance indexing for localized searches
        modelBuilder.Entity<Listing>().HasIndex(l => l.Location);
        modelBuilder.Entity<Listing>().HasIndex(l => l.Status);
        modelBuilder.Entity<Listing>()
            .Property(l => l.RowVersion)
            .IsConcurrencyToken()
            .ValueGeneratedNever();
        modelBuilder.Entity<ExchangeRate>()
            .HasIndex(rate => new { rate.BaseCurrency, rate.QuoteCurrency, rate.EffectiveAt });
        modelBuilder.Entity<ExchangeRate>().HasData(new ExchangeRate
        {
            Id = new Guid("11111111-1111-1111-1111-111111111111"),
            BaseCurrency = "USD",
            QuoteCurrency = "ZiG",
            Rate = 25.5m,
            EffectiveAt = new DateTime(2026, 9, 9, 0, 0, 0, DateTimeKind.Utc)
        });
    }
}