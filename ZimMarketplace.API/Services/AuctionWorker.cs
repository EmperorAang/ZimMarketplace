using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using ZimMarketplace.API.Hubs;
using ZimMarketplace.API.Models;

namespace ZimMarketplace.API.Services;

public class AuctionWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AuctionWorker> _logger;

    public AuctionWorker(IServiceProvider serviceProvider, ILogger<AuctionWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Auction Closing Worker Started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using (var scope = _serviceProvider.CreateScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<MarketplaceDbContext>();
                    var hub = scope.ServiceProvider.GetRequiredService<IHubContext<AuctionHub>>();

                    // Find expired active auctions
                    var expiredListings = await db.Listings
                        .Include(l => l.Bids)
                        .Where(l => l.Status == "Active" && l.EndTime.HasValue && l.EndTime.Value <= DateTime.UtcNow)
                        .ToListAsync(stoppingToken);

                    if (expiredListings.Any())
                    {
                        foreach (var listing in expiredListings)
                        {
                            listing.Status = "Sold";
                            _logger.LogInformation($"Auction '{listing.Title}' (ID: {listing.Id}) automatically closed.");
                        }

                        await db.SaveChangesAsync(stoppingToken);

                        // Broadcast to React UI live via SignalR
                        await hub.Clients.All.SendAsync("CatalogUpdated", cancellationToken: stoppingToken);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while checking expired auctions.");
            }

            // Check every 10 seconds
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}