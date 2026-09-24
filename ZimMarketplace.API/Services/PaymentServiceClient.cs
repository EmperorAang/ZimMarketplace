using System.Net.Http.Json;

namespace ZimMarketplace.API.Services;

public sealed class PaymentServiceClient : IPaymentServiceClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<PaymentServiceClient> _logger;

    public PaymentServiceClient(HttpClient httpClient, ILogger<PaymentServiceClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public Task<PaymentServiceResponse?> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default) =>
        SendAsync(() => _httpClient.PostAsJsonAsync("/api/payments/initiate", request, ct), request.OrderId.ToString(), ct);

    public Task<PaymentServiceResponse?> ReleaseEscrowAsync(string transactionId, CancellationToken ct = default) =>
        SendAsync(() => _httpClient.PostAsJsonAsync($"/api/payments/escrow/{transactionId}/release", new { }, ct), transactionId, ct);

    private async Task<PaymentServiceResponse?> SendAsync(
        Func<Task<HttpResponseMessage>> send,
        string operationId,
        CancellationToken ct)
    {
        try
        {
            using var response = await send();
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Payment service request failed for {OperationId}: {StatusCode} - {Body}", operationId, response.StatusCode, body);
                return new PaymentServiceResponse(string.Empty, "Failed", body);
            }

            return System.Text.Json.JsonSerializer.Deserialize<PaymentServiceResponse>(
                body,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            _logger.LogError("Payment service request timed out for {OperationId}", operationId);
            return new PaymentServiceResponse(string.Empty, "Error", "Payment service request timed out.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error communicating with payment service for {OperationId}", operationId);
            return new PaymentServiceResponse(string.Empty, "Error", "Payment service is unavailable.");
        }
    }
}