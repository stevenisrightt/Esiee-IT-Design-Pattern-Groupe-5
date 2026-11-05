import { describe, expect, it, vi } from "vitest";
import { PaymentOrchestrator } from "../../src/payment/payment-orchestrator";
import {
  PaymentMethodsUnavailableError,
  PaymentTechnicalError,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentResult
} from "../../src/payment/payment.types";

const request: PaymentRequest = {
  orderId: "order-1",
  clientId: "client-1",
  amountCents: 2590
};

function method(
  id: string,
  pay: PaymentMethod["pay"]
): PaymentMethod {
  return { id, pay };
}

const accepted = (methodId: string): PaymentResult => ({
  status: "accepted",
  methodId,
  transactionId: `${methodId}-tx`
});

describe("PaymentOrchestrator", () => {
  it("selects the preferred method before configured fallbacks", async () => {
    const cardPay = vi.fn(async () => accepted("card"));
    const walletPay = vi.fn(async () => accepted("wallet"));
    const orchestrator = new PaymentOrchestrator([
      method("card", cardPay),
      method("wallet", walletPay)
    ]);

    await expect(orchestrator.pay(request, "wallet")).resolves.toEqual(
      accepted("wallet")
    );
    expect(walletPay).toHaveBeenCalledOnce();
    expect(cardPay).not.toHaveBeenCalled();
  });

  it("uses the next configured method only after a retryable technical error", async () => {
    const cardPay = vi.fn(async () => {
      throw new PaymentTechnicalError("card", "Provider offline", true);
    });
    const walletPay = vi.fn(async () => accepted("wallet"));
    const orchestrator = new PaymentOrchestrator([
      method("card", cardPay),
      method("wallet", walletPay)
    ]);

    await expect(orchestrator.pay(request)).resolves.toEqual(
      accepted("wallet")
    );
    expect(cardPay).toHaveBeenCalledOnce();
    expect(walletPay).toHaveBeenCalledOnce();
  });

  it("does not fall back after a business refusal", async () => {
    const cardPay = vi.fn(async (): Promise<PaymentResult> => ({
      status: "declined",
      methodId: "card",
      reason: "Card refused"
    }));
    const walletPay = vi.fn(async () => accepted("wallet"));
    const orchestrator = new PaymentOrchestrator([
      method("card", cardPay),
      method("wallet", walletPay)
    ]);

    await expect(orchestrator.pay(request)).resolves.toEqual({
      status: "declined",
      methodId: "card",
      reason: "Card refused"
    });
    expect(walletPay).not.toHaveBeenCalled();
  });

  it("does not call another method after success", async () => {
    const cardPay = vi.fn(async () => accepted("card"));
    const walletPay = vi.fn(async () => accepted("wallet"));
    const orchestrator = new PaymentOrchestrator([
      method("card", cardPay),
      method("wallet", walletPay)
    ]);

    await orchestrator.pay(request);

    expect(cardPay).toHaveBeenCalledOnce();
    expect(walletPay).not.toHaveBeenCalled();
  });

  it("reports all methods unavailable if every safe retry fails", async () => {
    const orchestrator = new PaymentOrchestrator([
      method("card", async () => {
        throw new PaymentTechnicalError("card", "offline", true);
      }),
      method("wallet", async () => {
        throw new PaymentTechnicalError("wallet", "timeout", true);
      })
    ]);

    await expect(orchestrator.pay(request)).rejects.toMatchObject({
      name: "PaymentMethodsUnavailableError",
      failures: [
        { methodId: "card", message: "offline" },
        { methodId: "wallet", message: "timeout" }
      ]
    } satisfies Partial<PaymentMethodsUnavailableError>);
  });

  it("does not retry a technical error with an uncertain payment outcome", async () => {
    const walletPay = vi.fn(async () => accepted("wallet"));
    const orchestrator = new PaymentOrchestrator([
      method("card", async () => {
        throw new PaymentTechnicalError("card", "Outcome unknown", false);
      }),
      method("wallet", walletPay)
    ]);

    await expect(orchestrator.pay(request)).rejects.toMatchObject({
      name: "PaymentTechnicalError",
      safeToRetry: false
    });
    expect(walletPay).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured preferred method without attempting payment", async () => {
    const pay = vi.fn(async () => accepted("card"));
    const orchestrator = new PaymentOrchestrator([method("card", pay)]);

    await expect(orchestrator.pay(request, "wallet")).rejects.toThrow(
      "Moyen de paiement inconnu"
    );
    expect(pay).not.toHaveBeenCalled();
  });
});
