using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using ZimMarketplace.API.Hubs;
using ZimMarketplace.API.Models;
using ZimMarketplace.API.Services;

namespace ZimMarketplace.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CheckoutController : ControllerBase
{
    private static readonly Regex ZimbabwePhoneRegex = new(@"^(\+?263|0)7[1378]\d{7}$", RegexOptions.Compiled);
    private readonly PaymentService _paymentService;
    private readonly IPaymentServiceClient _paymentServiceClient;
    private readonly MarketplaceDbContext _context;
    private readonly IHubContext<AuctionHub> _hubContext;
    private readonly IConfiguration _configuration;

    public CheckoutController(
        PaymentService paymentService,
        IPaymentServiceClient paymentServiceClient,
        MarketplaceDbContext context,
        IHubContext<AuctionHub> hubContext,
        IConfiguration configuration)
    {
        _paymentService = paymentService;
        _paymentServiceClient = paymentServiceClient;
        _context = context;
        _hubContext = hubContext;
        _configuration = configuration;
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<object>> CreateCheckout([FromBody] CheckoutRequest request, CancellationToken ct)
    {
        var payerId = GetCurrentUserId();
        if (payerId == null) return Unauthorized(new { message = "Invalid payer token." });
        if (request.Amount <= 0) return BadRequest(new { message = "Amount must be greater than zero." });

        var provider = request.Provider.Trim();
        if (!new[] { "EcoCash", "InnBucks", "ZimSwitch" }.Contains(provider, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "Provider must be EcoCash, InnBucks, or ZimSwitch." });

        var phoneNumber = request.PhoneNumber?.Trim();
        if (string.IsNullOrWhiteSpace(phoneNumber) || !ZimbabwePhoneRegex.IsMatch(phoneNumber))
            return BadRequest(new { status = "FAILED", transactionId = "", message = "Invalid Zimbabwean mobile money number format." });

        var listing = await _context.Listings.FirstOrDefaultAsync(item => item.Id == request.ListingId, ct);
        if (listing == null) return NotFound(new { message = "Listing not found." });

        var response = await _paymentServiceClient.InitiatePaymentAsync(new InitiatePaymentRequest(
            request.ListingId,
            request.Amount,
            request.Currency,
            provider,
            phoneNumber,
            payerId.Value.ToString()), ct);

        if (response?.Status == "Failed")
            return BadRequest(new { message = response.Message });

        var usedLocalFallback = response is null ||
            (response.Status == "Error" && _configuration.GetValue<bool>("PaymentService:AllowLocalMockFallback"));
        var transaction = usedLocalFallback
            ? _paymentService.Create(request.ListingId, payerId.Value, request.Amount, request.Currency, provider)
            : null;
        var transactionId = transaction?.TransactionId ?? response!.TransactionId;
        var status = transaction?.Status ?? NormalizeStatus(response!.Status);

        listing.PaymentTransactionId = transactionId;
        listing.EscrowStatus = status;
        listing.RowVersion = Guid.NewGuid().ToByteArray();
        await _context.SaveChangesAsync(ct);

        await BroadcastPaymentStatus(listing, transactionId, status, ct);
        return Ok(new
        {
            transactionId,
            status,
            message = transaction?.Status == "Pending" ? "Local mock payment created." : response?.Message,
            provider,
            external = !usedLocalFallback
        });
    }

    [HttpPost("batch")]
    [Authorize]
    public async Task<ActionResult<object>> CreateBatchCheckout([FromBody] BatchCheckoutRequest request, CancellationToken ct)
    {
        var buyerId = GetCurrentUserId();
        if (buyerId == null) return Unauthorized(new { message = "Invalid buyer token." });
        if (request.ListingIds == null || request.ListingIds.Count == 0)
            return BadRequest(new { message = "At least one listing is required." });

        var provider = request.Provider.Trim();
        if (!new[] { "EcoCash", "InnBucks", "ZimSwitch" }.Contains(provider, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "Provider must be EcoCash, InnBucks, or ZimSwitch." });

        var phoneNumber = request.PhoneNumber?.Trim();
        if (string.IsNullOrWhiteSpace(phoneNumber) || !ZimbabwePhoneRegex.IsMatch(phoneNumber))
            return BadRequest(new { status = "FAILED", message = "Invalid Zimbabwean mobile money number format." });

        var listingIds = request.ListingIds.Distinct().ToList();
        var listings = await _context.Listings
            .Include(listing => listing.Bids)
            .Where(listing => listingIds.Contains(listing.Id))
            .ToListAsync(ct);

        if (listings.Count != listingIds.Count)
        {
            var foundIds = listings.Select(listing => listing.Id).ToHashSet();
            var missingIds = listingIds.Where(id => !foundIds.Contains(id)).ToList();
            return BadRequest(new
            {
                message = "One or more listings could not be found.",
                staleIds = missingIds,
                unavailableListingIds = missingIds
            });
        }

        foreach (var listing in listings)
        {
            if (listing.Status == "AwaitingPayment")
            {
                var winningBidderId = listing.Bids
                    .OrderByDescending(bid => bid.Amount)
                    .ThenByDescending(bid => bid.BidTime)
                    .Select(bid => (Guid?)bid.BidderId)
                    .FirstOrDefault();

                if (winningBidderId != buyerId)
                    return Forbid();

                if (listing.PaymentDueDate.HasValue && listing.PaymentDueDate.Value <= DateTime.UtcNow)
                    return BadRequest(new
                    {
                        message = $"The payment grace period for '{listing.Title}' has expired.",
                        staleIds = new[] { listing.Id },
                        unavailableListingIds = new[] { listing.Id }
                    });
            }
            else if (listing.Status != "Active")
            {
                return Conflict(new
                {
                    message = $"Listing '{listing.Title}' is no longer available (Status: {listing.Status}).",
                    staleIds = new[] { listing.Id },
                    unavailableListingIds = new[] { listing.Id }
                });
            }
            else if (listing.ListingType == "Auction")
            {
                return BadRequest(new
                {
                    message = $"'{listing.Title}' is an auction-only listing and cannot be bought out.",
                    staleIds = new[] { listing.Id },
                    unavailableListingIds = new[] { listing.Id }
                });
            }
        }

        var completedTransactions = new List<string>();
        foreach (var listing in listings)
        {
            var amount = listing.Status == "AwaitingPayment"
                ? listing.CurrentBid
                : listing.ListingType == "Hybrid"
                    ? listing.InstantBuyPrice ?? listing.BasePrice
                    : listing.BasePrice;

            var paymentResponse = await _paymentServiceClient.InitiatePaymentAsync(new InitiatePaymentRequest(
                listing.Id,
                amount,
                listing.Currency,
                provider,
                phoneNumber,
                buyerId.Value.ToString()), ct);

            if (paymentResponse?.Status == "Failed")
                return BadRequest(new { message = paymentResponse.Message, completedTransactions });

            var usedLocalFallback = paymentResponse is null ||
                (paymentResponse.Status == "Error" && _configuration.GetValue<bool>("PaymentService:AllowLocalMockFallback"));
            var localTransaction = usedLocalFallback
                ? _paymentService.Create(listing.Id, buyerId.Value, amount, listing.Currency, provider)
                : null;
            var transactionId = localTransaction?.TransactionId ?? paymentResponse!.TransactionId;
            var escrowStatus = localTransaction?.Status ?? NormalizeStatus(paymentResponse!.Status);

            if (localTransaction != null)
            {
                var held = _paymentService.ApplyCallback(transactionId, true);
                escrowStatus = held?.Status ?? "EscrowHeld";
            }

            listing.PaymentTransactionId = transactionId;
            listing.EscrowStatus = escrowStatus;
            listing.Status = "Sold";
            listing.PaymentDueDate = null;
            listing.RowVersion = Guid.NewGuid().ToByteArray();
            await _context.SaveChangesAsync(ct);

            PaymentServiceResponse? releaseResponse;
            if (localTransaction != null)
            {
                releaseResponse = _paymentService.Release(transactionId) is { } released
                    ? new PaymentServiceResponse(released.TransactionId, released.Status, "Local payment released.")
                    : null;
            }
            else
            {
                releaseResponse = await _paymentServiceClient.ReleaseEscrowAsync(transactionId, ct);
            }

            if (releaseResponse == null || releaseResponse.Status is "Error" or "Failed")
                return StatusCode(StatusCodes.Status502BadGateway, new { message = releaseResponse?.Message ?? "Unable to release escrow.", completedTransactions });

            listing.EscrowStatus = NormalizeStatus(releaseResponse.Status);
            await _context.SaveChangesAsync(ct);
            completedTransactions.Add(transactionId);
            await BroadcastPaymentStatus(listing, transactionId, listing.EscrowStatus, ct);
        }

        await _hubContext.Clients.All.SendAsync("CatalogUpdated", ct);
        return Ok(new
        {
            status = "SUCCESS",
            transactionIds = completedTransactions,
            message = $"Paid {completedTransactions.Count} item(s) via {provider}. Funds released from escrow."
        });
    }

    [HttpGet("{transactionId}")]
    [Authorize]
    public async Task<ActionResult<object>> GetStatus(string transactionId, CancellationToken ct)
    {
        if (_paymentService.Get(transactionId) is { } localTransaction) return Ok(localTransaction);

        return await Task.FromResult<ActionResult<object>>(NotFound(new { message = "Payment transaction not found." }));
    }

    [HttpPost("{transactionId}/mock-callback")]
    public async Task<ActionResult<PaymentTransaction>> MockCallback(string transactionId, [FromBody] MockCallbackRequest request, CancellationToken ct)
    {
        var transaction = _paymentService.ApplyCallback(transactionId, request.Success);
        if (transaction == null) return NotFound();
        await UpdateListingPaymentStatus(transaction.ListingId, transaction.TransactionId, transaction.Status, ct);
        return Ok(transaction);
    }

    [HttpPost("{transactionId}/release")]
    [Authorize]
    public async Task<ActionResult<object>> Release(string transactionId, CancellationToken ct)
    {
        var localTransaction = _paymentService.Get(transactionId);
        PaymentServiceResponse? response;
        if (localTransaction != null)
        {
            var released = _paymentService.Release(transactionId);
            await UpdateListingPaymentStatus(released!.ListingId, transactionId, released.Status, ct);
            return Ok(released);
        }

        response = await _paymentServiceClient.ReleaseEscrowAsync(transactionId, ct);
        if (response == null || response.Status is "Error" or "Failed")
            return StatusCode(StatusCodes.Status502BadGateway, new { message = response?.Message ?? "Payment service unavailable." });

        var listing = await _context.Listings.FirstOrDefaultAsync(item => item.PaymentTransactionId == transactionId, ct);
        if (listing != null)
        {
            listing.EscrowStatus = NormalizeStatus(response.Status);
            listing.RowVersion = Guid.NewGuid().ToByteArray();
            await _context.SaveChangesAsync(ct);
            await BroadcastPaymentStatus(listing, transactionId, listing.EscrowStatus, ct);
        }

        return Ok(response);
    }

    private async Task UpdateListingPaymentStatus(Guid listingId, string transactionId, string status, CancellationToken ct)
    {
        var listing = await _context.Listings.FirstOrDefaultAsync(item => item.Id == listingId, ct);
        if (listing == null) return;
        listing.PaymentTransactionId = transactionId;
        listing.EscrowStatus = NormalizeStatus(status);
        listing.RowVersion = Guid.NewGuid().ToByteArray();
        await _context.SaveChangesAsync(ct);
        await BroadcastPaymentStatus(listing, transactionId, listing.EscrowStatus, ct);
    }

    private async Task BroadcastPaymentStatus(Listing listing, string transactionId, string? status, CancellationToken ct) =>
        await _hubContext.Clients.Group($"item-{listing.Id}").SendAsync("PaymentStatusUpdated", new
        {
            listingId = listing.Id,
            status,
            transactionId
        }, ct);

    private static string NormalizeStatus(string status) => status.ToUpperInvariant() switch
    {
        "ESCROW_HELD" => "EscrowHeld",
        "PAID" => "Paid",
        "RELEASED" => "Released",
        "FAILED" => "Failed",
        _ => status
    };

    private Guid? GetCurrentUserId()
    {
        var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed class CheckoutRequest
    {
        public Guid ListingId { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "USD";
        public string Provider { get; set; } = "EcoCash";
        public string PhoneNumber { get; set; } = string.Empty;
    }

    public sealed class BatchCheckoutRequest
    {
        public List<Guid> ListingIds { get; set; } = new();
        public string Provider { get; set; } = "EcoCash";
        public string PhoneNumber { get; set; } = string.Empty;
    }

    public sealed class MockCallbackRequest
    {
        public bool Success { get; set; } = true;
    }
}