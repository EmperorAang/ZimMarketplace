using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace ZimMarketplace.API.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100)]
    public string FullName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [Required, EmailAddress, MaxLength(150)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    public string PhoneNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string City { get; set; } = "Harare";

    [MaxLength(50)]
    public string PreferredPaymentProvider { get; set; } = "EcoCash";

    [Required, MaxLength(30)]
    public string Role { get; set; } = "User";

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [Required, MaxLength(30)]
    public string VerificationStatus { get; set; } = "Unverified";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Navigation Property
    [JsonIgnore]
    public ICollection<Listing> Listings { get; set; } = new List<Listing>();
}