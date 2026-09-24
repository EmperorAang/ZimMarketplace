using System.ComponentModel.DataAnnotations;

namespace ZimMarketplace.API.Models;

public record UserProfileDto(
    Guid Id,
    string Username,
    string? FullName,
    string? PhoneNumber,
    string? City,
    string? PreferredPaymentProvider,
    string Role
);

public record UpdateUserProfileDto(
    [Required] string FullName,
    [Required]
    [RegularExpression(@"^(\+?263|0)7[1378]\d{7}$", ErrorMessage = "Invalid Zimbabwean mobile money phone number format.")]
    string PhoneNumber,
    string? City,
    string? PreferredPaymentProvider
);