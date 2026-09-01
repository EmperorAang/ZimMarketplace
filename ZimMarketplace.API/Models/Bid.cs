using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZimMarketplace.API.Models;

public class Bid
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ListingId { get; set; }
    
    [ForeignKey("ListingId")]
    public Listing? Listing { get; set; }

    [Required]
    public Guid BidderId { get; set; }

    [ForeignKey("BidderId")]
    public User? Bidder { get; set; }

    [Required]
    [Column(TypeName = "decimal(18,2)")]
    public decimal Amount { get; set; }

    public DateTimeOffset BidTime { get; set; } = DateTimeOffset.UtcNow;
}