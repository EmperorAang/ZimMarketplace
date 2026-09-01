package com.zimmarket.payments.model;

public class PaymentRequest {
    private String listingId;
    private double amount;
    private String currency;

    // Getters and Setters
    public String getListingId() { return listingId; }
    public void setListingId(String id) { this.listingId = id; }
    public double getAmount() { return amount; }
    public void setAmount(double amt) { this.amount = amt; }
    public String getCurrency() { return currency; }
    public void setCurrency(String curr) { this.currency = curr; }
}
