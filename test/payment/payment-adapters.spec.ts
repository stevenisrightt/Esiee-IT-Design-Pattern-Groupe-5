import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CardPaymentAdapter,
  CashOnDeliveryPaymentAdapter,
  WalletPaymentAdapter
} from "../../src/payment/payment-adapters";
import {
  ProviderUnavailableError,
  SimulatedCardProcessor,
  SimulatedCashOnDeliveryProcessor,
  SimulatedWalletProcessor
} from "../../src/payment/payment-providers";
import type { PaymentRequest } from "../../src/payment/payment.types";

const request: PaymentRequest = {
  orderId: "order-1",
  clientId: "client-1",
  amountCents: 2590
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Payment adapters", () => {
  it("adapts the card processor signature and accepted result", async () => {
    const chargeCard = vi.fn(async () => ({
      status: "accepted" as const,
      transactionId: "card-tx"
    }));
    const adapter = new CardPaymentAdapter({ chargeCard });

    await expect(adapter.pay(request)).resolves.toEqual({
      status: "accepted",
      methodId: "card",
      transactionId: "card-tx"
    });
    expect(chargeCard).toHaveBeenCalledWith("order-1", 2590);
  });

  it("adapts the wallet input shape and converts cents to euros", async () => {
    const submitWalletPayment = vi.fn(async () => ({
      status: "accepted" as const,
      transactionId: "wallet-tx"
    }));
    const adapter = new WalletPaymentAdapter({ submitWalletPayment });

    await expect(adapter.pay(request)).resolves.toMatchObject({
      status: "accepted",
      methodId: "wallet",
      transactionId: "wallet-tx"
    });
    expect(submitWalletPayment).toHaveBeenCalledWith({
      walletOwnerId: "client-1",
      reference: "order-1",
      amount: 25.9,
      currency: "EUR"
    });
  });

  it("adapts cash collection parameters and preserves a business refusal", async () => {
    const scheduleCashCollection = vi.fn(async () => ({
      status: "declined" as const,
      reason: "Livraison indisponible"
    }));
    const adapter = new CashOnDeliveryPaymentAdapter({
      scheduleCashCollection
    });

    await expect(adapter.pay(request)).resolves.toEqual({
      status: "declined",
      methodId: "cash-on-delivery",
      reason: "Livraison indisponible"
    });
    expect(scheduleCashCollection).toHaveBeenCalledWith(
      "order-1",
      2590,
      "client-1"
    );
  });

  it("maps a known provider outage to a safely retryable technical error", async () => {
    const processor = {
      chargeCard: vi.fn(async () => {
        throw new ProviderUnavailableError("Carte indisponible");
      })
    };

    await expect(
      new CardPaymentAdapter(processor).pay(request)
    ).rejects.toMatchObject({
      name: "PaymentTechnicalError",
      methodId: "card",
      safeToRetry: true
    });
  });

  it("provides three distinct simulated methods", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const card = new SimulatedCardProcessor();
    const wallet = new SimulatedWalletProcessor();
    const cash = new SimulatedCashOnDeliveryProcessor();

    await expect(card.chargeCard("order-1", 2590)).resolves.toMatchObject({
      status: "accepted"
    });
    await expect(wallet.submitWalletPayment({
      walletOwnerId: "client-1",
      reference: "order-1",
      amount: 25.9,
      currency: "EUR"
    })).resolves.toMatchObject({ status: "accepted" });
    await expect(
      cash.scheduleCashCollection("order-1", 2590, "client-1")
    ).resolves.toMatchObject({ status: "accepted" });

    expect(log).toHaveBeenCalledTimes(3);
  });
});
