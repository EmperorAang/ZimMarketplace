package com.zimmarket.payments.controller;

import com.zimmarket.payments.model.PaymentRequest;
import com.zimmarket.payments.model.PaymentResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
@CrossOrigin(origins = "*")
public class PaymentController {

    @PostMapping("/checkout")
    public PaymentResponse processTransaction(@RequestBody PaymentRequest request) {
        // Mocking integration checkout flow (e.g., EcoCash payload simulation)
        System.out.println("Processing transaction for item: " + request.getListingId());
        System.out.println("Amount: " + request.getAmount() + " " + request.getCurrency());
        
        return new PaymentResponse("SUCCESS", "TXN-" + System.currentTimeMillis(), "Payment settled successfully via ZimMarket Gateway.");
    }
}
