using System.ComponentModel.DataAnnotations;

namespace ZimMarketplace.API.Models;

public class ExchangeRate
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(3)]
    public string BaseCurrency { get; set; } = "USD";

    [Required, MaxLength(3)]
    public string QuoteCurrency { get; set; } = "ZiG";

    public decimal Rate { get; set; }
    public DateTime EffectiveAt { get; set; } = DateTime.UtcNow;
}