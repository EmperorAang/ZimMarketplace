using System;
using System.ComponentModel.DataAnnotations;

namespace ZimMarketplace.API.Models
{
    public class Listing
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal BasePrice { get; set; } // This is starting bid for auctions, or flat price for instant
        public string Currency { get; set; } = "USD";
        public string Location { get; set; } = "Harare";
        public string Status { get; set; } = "Active"; // Active, AwaitingPayment, Sold, Expired
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // --- UPDATED HYBRID AUCTION FIELDS ---
        public string ListingType { get; set; } = "Instant"; // "Instant", "Auction", or "Hybrid"
        public decimal CurrentBid { get; set; }
        public decimal? InstantBuyPrice { get; set; } // Nullable: only set if they want an instant buyout option
        public DateTime? EndTime { get; set; } // End timestamp for auctions
        public DateTime? PaymentDueDate { get; set; }
        public string? EscrowStatus { get; set; }
        public string? PaymentTransactionId { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = Guid.NewGuid().ToByteArray();

        public Guid SellerId { get; set; }
        public User? Seller { get; set; }

        // Navigation collection linking your Bid.cs model
        public List<Bid> Bids { get; set; } = new List<Bid>();
    }
}