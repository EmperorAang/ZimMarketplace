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

    // 3. GET: api/listings/admin/all (Global Admin Platform Overview)
    [HttpGet("admin/all")]
    [Authorize]
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
    [Authorize]
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
        await _context.SaveChangesAsync();

        await _hubContext.Clients.All.SendAsync("ReceiveNewBid", new
        {
            listingId = listing.Id,
            newBid = listing.CurrentBid,
            bidderName = bidder?.FullName ?? "Verified Bidder",
            previousBidderId = previousBidderId
        });

        return Ok(new { message = "Bid placed successfully!", currentBid = listing.CurrentBid, listingId = listing.Id });
    }

    // 7. POST: api/listings/{id}/buy
    [HttpPost("{id}/buy")]
    [Authorize]
    public async Task<IActionResult> MarkAsSold(Guid id)
    {
        var listing = await _context.Listings.FindAsync(id);
        if (listing == null) return NotFound();

        listing.Status = "Sold";
        _context.Entry(listing).State = EntityState.Modified;
        await _context.SaveChangesAsync();

        await _hubContext.Clients.All.SendAsync("CatalogUpdated");
        return Ok(new { message = "Item marked as sold." });
    }

    public class BidDto
    {
        public decimal Amount { get; set; }
    }
}