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

                    // Move ended auctions into a three-day winner settlement window.
                    var expiredListings = await db.Listings
                        .Include(l => l.Bids)
                        .Where(l => l.Status == "Active" && l.EndTime.HasValue && l.EndTime.Value <= DateTime.UtcNow)
                        .ToListAsync(stoppingToken);

                    if (expiredListings.Any())
                    {
                        foreach (var listing in expiredListings)
                        {
                            listing.Status = listing.Bids.Count > 0 && listing.CurrentBid > listing.BasePrice
                                ? "AwaitingPayment"
                                : "Expired";
                            listing.PaymentDueDate = listing.Status == "AwaitingPayment"
                                ? DateTime.UtcNow.AddDays(3)
                                : null;
                            listing.RowVersion = Guid.NewGuid().ToByteArray();
                            _logger.LogInformation("Auction '{Title}' (ID: {ListingId}) automatically closed as {Status}.", listing.Title, listing.Id, listing.Status);
                        }

                        await db.SaveChangesAsync(stoppingToken);

                        // Broadcast to React UI live via SignalR
                        foreach (var listing in expiredListings)
                        {
                            await hub.Clients.Group($"item-{listing.Id}").SendAsync("AuctionEnded", new
                            {
                                itemId = listing.Id,
                                status = listing.Status
                            }, stoppingToken);
                        }

                        await hub.Clients.All.SendAsync("CatalogUpdated", cancellationToken: stoppingToken);
                    }

                    var defaultedListings = await db.Listings
                        .Where(l => l.Status == "AwaitingPayment" &&
                                    l.PaymentDueDate.HasValue &&
                                    l.PaymentDueDate.Value <= DateTime.UtcNow)
                        .ToListAsync(stoppingToken);

                    if (defaultedListings.Any())
                    {
                        foreach (var listing in defaultedListings)
                        {
                            listing.Status = "Active";
                            listing.CurrentBid = listing.BasePrice;
                            listing.PaymentDueDate = null;
                            listing.EndTime = DateTime.UtcNow.AddHours(24);
                            listing.RowVersion = Guid.NewGuid().ToByteArray();
                            _logger.LogInformation("Unpaid auction '{Title}' (ID: {ListingId}) was relisted.", listing.Title, listing.Id);
                        }

                        await db.SaveChangesAsync(stoppingToken);
                        foreach (var listing in defaultedListings)
                        {
                            await hub.Clients.Group($"item-{listing.Id}").SendAsync("AuctionRelisted", new
                            {
                                itemId = listing.Id,
                                message = "Buyer defaulted on payment. Item relisted."
                            }, stoppingToken);
                        }
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