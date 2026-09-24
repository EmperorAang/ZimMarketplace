using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using ZimMarketplace.API.Hubs;
using ZimMarketplace.API.Models;

namespace ZimMarketplace.API.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentController : ControllerBase
{
    private readonly MarketplaceDbContext _context;
    private readonly IHubContext<AuctionHub> _hubContext;

    public PaymentController(MarketplaceDbContext context, IHubContext<AuctionHub> hubContext)
    {
        _context = context;
        _hubContext = hubContext;
    }

    [HttpPost("webhook")]
    public async Task<IActionResult> HandlePaymentWebhook([FromBody] PaymentWebhookPayload payload, CancellationToken ct)
    {
        var listing = await _context.Listings.FirstOrDefaultAsync(item => item.Id == payload.ListingId, ct);
        if (listing == null) return NotFound(new { message = "Listing not found." });

        listing.PaymentTransactionId = payload.TransactionId;
        listing.EscrowStatus = NormalizeStatus(payload.Status);
        listing.RowVersion = Guid.NewGuid().ToByteArray();
        await _context.SaveChangesAsync(ct);

        await _hubContext.Clients.Group($"item-{listing.Id}").SendAsync("PaymentStatusUpdated", new
        {
            listingId = listing.Id,
            status = listing.EscrowStatus,
            transactionId = payload.TransactionId
        }, ct);

        return Ok(new { received = true });
    }

    private static string NormalizeStatus(string status) => status.ToUpperInvariant() switch
    {
        "ESCROW_HELD" => "EscrowHeld",
        "PAID" => "Paid",
        "RELEASED" => "Released",
        "FAILED" => "Failed",
        _ => status
    };
}

public sealed record PaymentWebhookPayload(Guid ListingId, string TransactionId, string Status);