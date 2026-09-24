using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using ZimMarketplace.API.Hubs;
using ZimMarketplace.API.Models;

namespace ZimMarketplace.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ListingsController : ControllerBase
{
    private readonly MarketplaceDbContext _context;
    private readonly IHubContext<AuctionHub> _hubContext;

    public ListingsController(MarketplaceDbContext context, IHubContext<AuctionHub> hubContext)
    {
        _context = context;
        _hubContext = hubContext;
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                 ?? User.FindFirst("sub")?.Value 
                 ?? User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;

        return Guid.TryParse(claim, out var id) ? id : null;
    }

    // 1. GET: api/listings (Public Active Catalog)
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Listing>>> GetListings()
    {
        return await _context.Listings
            .Include(l => l.Seller)
            .Include(l => l.Bids)
            .Where(l => l.Status == "Active")
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();
    }

   // 2. GET: api/listings/my (User-Specific Seller Dashboard)
    [HttpGet("my")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Listing>>> GetMyListings()
    {
        // Extract the logged in user's ID from claims
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
            ?? User.FindFirst("sub")?.Value 
            ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out Guid userId))
        {
            return Unauthorized(new { message = "Invalid token or user ID." });
        }

        // Return ONLY listings where SellerId matches this user ID exactly
        var userListings = await _context.Listings
            .Include(l => l.Seller)
            .Include(l => l.Bids)
            .Where(l => l.SellerId == userId)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();

        return Ok(userListings);
    }

    [HttpGet("won")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Listing>>> GetWonAuctions()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized(new { message = "Invalid bidder token." });

        var wonListings = await _context.Listings
            .Include(l => l.Seller)
            .Include(l => l.Bids)
            .Where(l => l.Status == "AwaitingPayment" &&
                        l.Bids.OrderByDescending(b => b.Amount).ThenByDescending(b => b.BidTime)
                            .Select(b => (Guid?)b.BidderId).FirstOrDefault() == userId.Value)
            .OrderBy(l => l.PaymentDueDate)
            .ToListAsync();

        return Ok(wonListings);
    }

    [HttpGet("{id}/bids")]
    public async Task<ActionResult<IEnumerable<BidLogDto>>> GetBidHistory(Guid id)
    {
        var listingExists = await _context.Listings.AnyAsync(listing => listing.Id == id);
        if (!listingExists) return NotFound(new { message = "Listing not found." });

        var bids = await _context.Bids
            .AsNoTracking()
            .Include(bid => bid.Bidder)
            .Where(bid => bid.ListingId == id)
            .OrderByDescending(bid => bid.BidTime)
            .Select(bid => new BidLogDto
            {
                Id = bid.Id,
                BidderName = bid.Bidder == null ? "Verified Bidder" : bid.Bidder.FullName,
                Amount = bid.Amount,
                CreatedAt = bid.BidTime.UtcDateTime
            })
            .ToListAsync();

        return Ok(bids);
    }

    // 3. GET: api/listings/admin/all (Global Admin Platform Overview)
    [HttpGet("admin/all")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<object>> GetAdminOverview()
    {
        var listings = await _context.Listings
            .Include(l => l.Seller)
            .Include(l => l.Bids)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();

        var totalPlatformRevenue = listings.Where(l => l.Status == "Sold").Sum(l => l.CurrentBid);
        var activeListingsCount = listings.Count(l => l.Status == "Active");
        var totalUsersCount = await _context.Users.CountAsync();

        return Ok(new
        {
            totalPlatformRevenue,
            totalCreatedListings = listings.Count,
            activeListingsCount,
            totalUsersCount,
            listings
        });
    }

    // 4. DELETE: api/listings/admin/{id} (Admin Moderation Cancel)
    [HttpDelete("admin/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminCancelListing(Guid id)
    {
        var listing = await _context.Listings.FindAsync(id);
        if (listing == null) return NotFound();

        listing.Status = "CancelledByAdmin";
        await _context.SaveChangesAsync();

        await _hubContext.Clients.All.SendAsync("CatalogUpdated");
        return Ok(new { message = "Listing cancelled by Admin." });
    }

    // 5. POST: api/listings (Create Listing Bound to Logged-in User)
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<Listing>> CreateListing([FromBody] Listing listing)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized(new { message = "Invalid seller token." });

        listing.Id = Guid.NewGuid();
        listing.SellerId = userId.Value;
        listing.Seller = null;

        if (string.IsNullOrEmpty(listing.ListingType)) listing.ListingType = "Instant";

        if (listing.ListingType == "Auction" || listing.ListingType == "Hybrid")
        {
            listing.CurrentBid = listing.BasePrice;
            if (!listing.EndTime.HasValue) listing.EndTime = DateTime.UtcNow.AddHours(24);
        }

        listing.Status = "Active";
        listing.CreatedAt = DateTime.UtcNow;
        listing.RowVersion = Guid.NewGuid().ToByteArray();

        _context.Listings.Add(listing);
        await _context.SaveChangesAsync();

        await _hubContext.Clients.All.SendAsync("CatalogUpdated");
        return Ok(new { message = "Listing created successfully.", listing });
    }

    // 6. POST: api/listings/{id}/bid
    [HttpPost("{id}/bid")]
    [Authorize]
    public async Task<ActionResult<Listing>> PlaceBid(Guid id, [FromBody] BidDto bidDto)
    {
        var bidderId = GetCurrentUserId();
        if (bidderId == null) return Unauthorized(new { message = "Invalid bidder token." });

        var listing = await _context.Listings
            .Include(l => l.Bids)
            .FirstOrDefaultAsync(l => l.Id == id);

        if (listing == null || listing.Status != "Active")
        {
            return NotFound(new { message = "Listing is no longer active." });
        }

        if (bidDto.Amount <= listing.CurrentBid)
        {
            return BadRequest(new { message = $"Your bid of {bidDto.Amount} must be higher than current bid of {listing.CurrentBid}." });
        }

        var previousBid = listing.Bids.OrderByDescending(b => b.BidTime).FirstOrDefault();
        Guid? previousBidderId = previousBid?.BidderId;

        listing.CurrentBid = bidDto.Amount;
        if (listing.EndTime.HasValue && listing.EndTime.Value - DateTime.UtcNow < TimeSpan.FromMinutes(2))
        {
            listing.EndTime = DateTime.UtcNow.AddMinutes(2);
        }
        listing.RowVersion = Guid.NewGuid().ToByteArray();
        var bidder = await _context.Users.FindAsync(bidderId.Value);

        var newBidEntry = new Bid
        {
            ListingId = listing.Id,
            BidderId = bidderId.Value,
            Amount = bidDto.Amount,
            BidTime = DateTimeOffset.UtcNow
        };

        _context.Bids.Add(newBidEntry);
        _context.Entry(listing).State = EntityState.Modified;
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Another user placed a higher bid just now. Please try again." });
        }

        var bidUpdate = new
        {
            itemId = listing.Id,
            listingId = listing.Id,
            currentBid = listing.CurrentBid,
            newBid = listing.CurrentBid,
            bidderName = bidder?.FullName ?? "Verified Bidder",
            previousBidderId = previousBidderId,
            createdAt = newBidEntry.BidTime.UtcDateTime,
            endTime = listing.EndTime
        };

        await _hubContext.Clients.Group($"item-{listing.Id}").SendAsync("ReceiveBidUpdate", bidUpdate);
        await _hubContext.Clients.All.SendAsync("ReceiveNewBid", bidUpdate);

        return Ok(new { message = "Bid placed successfully!", currentBid = listing.CurrentBid, listingId = listing.Id });
    }

    // 7. POST: api/listings/{id}/buy
    [HttpPost("{id}/buy")]
    [Authorize]
    public async Task<IActionResult> MarkAsSold(Guid id)
    {
        var buyerId = GetCurrentUserId();
        if (buyerId == null) return Unauthorized(new { message = "Invalid buyer token." });

        var listing = await _context.Listings
            .Include(l => l.Bids)
            .FirstOrDefaultAsync(l => l.Id == id);
        if (listing == null) return NotFound();

        if (listing.Status == "AwaitingPayment")
        {
            var winningBidderId = listing.Bids
                .OrderByDescending(b => b.Amount)
                .ThenByDescending(b => b.BidTime)
                .Select(b => (Guid?)b.BidderId)
                .FirstOrDefault();

            if (winningBidderId != buyerId) return Forbid();
        }
        else if (listing.Status != "Active")
        {
            return Conflict(new { message = "Listing is no longer available for purchase." });
        }

        listing.Status = "Sold";
        listing.PaymentDueDate = null;
        listing.RowVersion = Guid.NewGuid().ToByteArray();
        _context.Entry(listing).State = EntityState.Modified;
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "This listing was purchased by another user just now." });
        }

        await _hubContext.Clients.All.SendAsync("CatalogUpdated");
        return Ok(new { message = "Item marked as sold." });
    }

    public class BidDto
    {
        public decimal Amount { get; set; }
    }
}