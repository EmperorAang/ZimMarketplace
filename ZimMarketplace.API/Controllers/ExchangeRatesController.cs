using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ZimMarketplace.API.Models;

namespace ZimMarketplace.API.Controllers;

[ApiController]
[Route("api/exchange-rates")]
public class ExchangeRatesController : ControllerBase
{
    private readonly MarketplaceDbContext _context;

    public ExchangeRatesController(MarketplaceDbContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<ExchangeRate>> GetLatest(string baseCurrency = "USD", string quoteCurrency = "ZiG")
    {
        var rate = await _context.ExchangeRates
            .Where(r => r.BaseCurrency.ToUpper() == baseCurrency.ToUpper() &&
                        r.QuoteCurrency.ToUpper() == quoteCurrency.ToUpper())
            .OrderByDescending(r => r.EffectiveAt)
            .FirstOrDefaultAsync();

        return rate == null
            ? NotFound(new { message = $"No exchange rate is configured for {baseCurrency}/{quoteCurrency}." })
            : Ok(rate);
    }
}