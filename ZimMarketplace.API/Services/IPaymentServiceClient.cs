namespace ZimMarketplace.API.Services;

public sealed record InitiatePaymentRequest(
    Guid OrderId,
    decimal Amount,
    string Currency,
    string Provider,
    string PhoneNumber,
    string BuyerId);

public sealed record PaymentServiceResponse(
    string TransactionId,
    string Status,
    string Message);

public interface IPaymentServiceClient
{
    Task<PaymentServiceResponse?> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default);
    Task<PaymentServiceResponse?> ReleaseEscrowAsync(string transactionId, CancellationToken ct = default);
}