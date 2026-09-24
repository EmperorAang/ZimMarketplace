namespace ZimMarketplace.API.Models;

public sealed class BidLogDto
{
    public Guid Id { get; set; }
    public string BidderName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime CreatedAt { get; set; }
}