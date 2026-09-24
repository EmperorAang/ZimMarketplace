using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZimMarketplace.API.Models;

namespace ZimMarketplace.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly MarketplaceDbContext _context;

    public ProfileController(MarketplaceDbContext context)
    {
        _context = context;
    }

    private Guid? GetCurrentUserId()
    {
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;

        return Guid.TryParse(idClaim, out var id) ? id : null;
    }

    [HttpGet]
    public async Task<ActionResult<UserProfileDto>> GetProfile()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized(new { message = "Invalid user token." });

        var user = await _context.Users.FindAsync(userId.Value);
        if (user == null) return NotFound(new { message = "User not found." });

        return Ok(new UserProfileDto(
            user.Id,
            user.Username,
            user.FullName,
            user.PhoneNumber,
            user.City ?? "Harare",
            user.PreferredPaymentProvider ?? "EcoCash",
            user.Role
        ));
    }

    [HttpPut]
    public async Task<ActionResult<UserProfileDto>> UpdateProfile([FromBody] UpdateUserProfileDto dto)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized(new { message = "Invalid user token." });

        var user = await _context.Users.FindAsync(userId.Value);
        if (user == null) return NotFound(new { message = "User not found." });

        user.FullName = dto.FullName.Trim();
        user.PhoneNumber = dto.PhoneNumber.Trim();
        user.City = string.IsNullOrWhiteSpace(dto.City) ? "Harare" : dto.City.Trim();
        user.PreferredPaymentProvider = string.IsNullOrWhiteSpace(dto.PreferredPaymentProvider)
            ? "EcoCash"
            : dto.PreferredPaymentProvider.Trim();

        await _context.SaveChangesAsync();

        return Ok(new UserProfileDto(
            user.Id,
            user.Username,
            user.FullName,
            user.PhoneNumber,
            user.City,
            user.PreferredPaymentProvider,
            user.Role
        ));
    }
}
