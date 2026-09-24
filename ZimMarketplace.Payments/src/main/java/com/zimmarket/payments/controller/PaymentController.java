package com.zimmarket.payments.controller;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Pattern;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zimmarket.payments.model.PaymentRequest;
import com.zimmarket.payments.model.PaymentResponse;

@RestController
@RequestMapping("/api/payments")
@CrossOrigin(origins = "*")
public class PaymentController {

    private static final Pattern ZIMBABWE_PHONE = Pattern.compile("^(\\+?263|0)7[1378]\\d{7}$");
    private static final ConcurrentMap<String, String> TRANSACTION_STATES = new ConcurrentHashMap<>();

    @PostMapping("/checkout")
    public PaymentResponse processTransaction(@RequestBody PaymentRequest request) {
        // Mocking integration checkout flow (e.g., EcoCash payload simulation)
        System.out.println("Processing transaction for item: " + request.getListingId());
        System.out.println("Amount: " + request.getAmount() + " " + request.getCurrency());
        
        return new PaymentResponse("SUCCESS", "TXN-" + System.currentTimeMillis(), "Payment settled successfully via ZimMarket Gateway.");
    }

    @PostMapping("/initiate")
    public ResponseEntity<PaymentResponse> initiatePayment(@RequestBody InitiatePaymentRequest request) {
        if (request.provider() == null || !SetOfProviders.contains(request.provider())) {
            return ResponseEntity.badRequest().body(new PaymentResponse("FAILED", "", "Unsupported payment provider."));
        }
        if (request.phoneNumber() == null || !ZIMBABWE_PHONE.matcher(request.phoneNumber().trim()).matches()) {
            return ResponseEntity.badRequest().body(new PaymentResponse("FAILED", "", "Invalid Zimbabwean mobile money number format."));
        }
        if (request.amount() <= 0 || request.currency() == null || !SetOfCurrencies.contains(request.currency().toUpperCase())) {
            return ResponseEntity.badRequest().body(new PaymentResponse("FAILED", "", "Amount must be positive and currency must be USD or ZiG."));
        }

        var transactionId = "TX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        TRANSACTION_STATES.put(transactionId, "ESCROW_HELD");
        return ResponseEntity.ok(new PaymentResponse(
            "ESCROW_HELD",
            transactionId,
            "Payment authorized via " + request.provider() + ". Funds placed in escrow."));
    }

    @PostMapping("/escrow/{transactionId}/release")
    public ResponseEntity<PaymentResponse> releaseEscrow(@PathVariable String transactionId) {
        var currentState = TRANSACTION_STATES.get(transactionId);
        if (currentState == null) {
            return ResponseEntity.notFound().build();
        }
        if (!"ESCROW_HELD".equals(currentState)) {
            return ResponseEntity.badRequest().body(new PaymentResponse("FAILED", transactionId, "Transaction is not held in escrow."));
        }

        TRANSACTION_STATES.put(transactionId, "RELEASED");
        return ResponseEntity.ok(new PaymentResponse("RELEASED", transactionId, "Escrow funds released to seller."));
    }

    private static final java.util.Set<String> SetOfProviders = java.util.Set.of("EcoCash", "InnBucks", "ZimSwitch");
    private static final java.util.Set<String> SetOfCurrencies = java.util.Set.of("USD", "ZIG");

    public record InitiatePaymentRequest(
        String orderId,
        double amount,
        String currency,
        String provider,
        String phoneNumber,
        String buyerId) {
    }
}
