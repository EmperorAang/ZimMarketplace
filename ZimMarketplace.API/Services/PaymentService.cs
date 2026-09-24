using System.Collections.Concurrent;

namespace ZimMarketplace.API.Services;

public sealed record PaymentTransaction(
    string TransactionId,
    Guid ListingId,
    Guid PayerId,
    decimal Amount,
    string Currency,
    string Provider,
    string Status,
    DateTime CreatedAt);

public class PaymentService
{
    private readonly ConcurrentDictionary<string, PaymentTransaction> _transactions = new();

    public PaymentTransaction Create(Guid listingId, Guid payerId, decimal amount, string currency, string provider)
    {
        var transaction = new PaymentTransaction(
            $"TXN-{Guid.NewGuid():N}", listingId, payerId, amount, currency, provider, "Pending", DateTime.UtcNow);
        _transactions[transaction.TransactionId] = transaction;
        return transaction;
    }

    public PaymentTransaction? Get(string transactionId) =>
        _transactions.TryGetValue(transactionId, out var transaction) ? transaction : null;

    public PaymentTransaction? ApplyCallback(string transactionId, bool successful)
    {
        if (!_transactions.TryGetValue(transactionId, out var current)) return null;
        var paid = current with { Status = successful ? "Paid" : "Failed" };
        _transactions[transactionId] = paid;
        var updated = successful ? paid with { Status = "EscrowHeld" } : paid;
        _transactions[transactionId] = updated;
        return updated;
    }

    public PaymentTransaction? Release(string transactionId)
    {
        if (!_transactions.TryGetValue(transactionId, out var current)) return null;
        if (current.Status != "EscrowHeld") return current;
        var updated = current with { Status = "Released" };
        _transactions[transactionId] = updated;
        return updated;
    }
}