import { describe, expect, it, vi } from "vitest";
import { InMemoryOrderHistoryRepository } from "../../src/order-history/in-memory-order-history.repository";
import { PaymentOrchestrator } from "../../src/payment/payment-orchestrator";
import {
  PaymentTechnicalError,
  type PaymentMethod,
  type PaymentResult
} from "../../src/payment/payment.types";
import {
  IdempotencyConflictError,
  OrderPlacementService,
  type CartCheckoutRequest,
  type OrderValidator
} from "../../src/orders/order-placement.service";

const request: CartCheckoutRequest = {
  cartId: "1",
  clientId: "client-1",
  idempotencyKey: "checkout-attempt-1",
  restaurantId: "da-michele",
  restaurantName: "Da Michele",
  items: [
    { name: "Margherita", size: "M", quantity: 1, unitPrice: 9 },
    {
      name: "Pizza personnalisée (tomato : mozzarella)",
      size: "M",
      quantity: 1,
      unitPrice: 6.5
    }
  ],
  validation: {
    isDeliveryZoneSupported: true,
    isRestaurantOpen: true,
    stockByItem: {
      "Margherita (M)": 1,
      "Pizza personnalisée (tomato : mozzarella) (M)": 1
    }
  }
};

function paymentMethod(
  pay: PaymentMethod["pay"]
): PaymentMethod {
  return { id: "card", pay };
}

function validator(
  valid = true,
  amountToPay = 15.5
): OrderValidator {
  return {
    validate: vi.fn(() => ({
      statusCode: valid ? 200 : 422,
      valid,
      amountToPay,
      response: valid
        ? { amountToPay, validation: { valid: true } }
        : {
            amountToPay,
            validation: {
              valid: false,
              rule: "stock",
              message: "Stock insuffisant."
            }
          }
    }))
  };
}

describe("OrderPlacementService", () => {
  it("saves a frozen history snapshot only after accepted payment", async () => {
    const validate = validator();
    const pay = vi.fn(async (paymentRequest): Promise<PaymentResult> => ({
      status: "accepted",
      methodId: "card",
      transactionId: `tx-${paymentRequest.orderId}`
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validate,
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const result = await service.placeOrder(request);

    expect(result.kind).toBe("placed");
    expect(pay).toHaveBeenCalledOnce();
    expect(pay.mock.calls[0][0]).toMatchObject({
      clientId: "client-1",
      amountCents: 1550
    });
    expect(validate.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { name: "Margherita (M)", unitPrice: 9, quantity: 1 },
          {
            name: "Pizza personnalisée (tomato : mozzarella) (M)",
            unitPrice: 6.5,
            quantity: 1
          }
        ]
      })
    );

    const orders = await history.findByClientId("client-1");
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderId: pay.mock.calls[0][0].orderId,
      clientId: "client-1",
      status: "confirmed",
      restaurantName: "Da Michele",
      totalCents: 1550,
      items: [
        { name: "Margherita (M)", unitPriceCents: 900 },
        {
          name: "Pizza personnalisée (tomato : mozzarella) (M)",
          unitPriceCents: 650
        }
      ]
    });
  });

  it("does not pay or save when validation fails", async () => {
    const pay = vi.fn(async () => ({
      status: "accepted" as const,
      methodId: "card",
      transactionId: "tx"
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(false),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const result = await service.placeOrder(request);

    expect(result.kind).toBe("validation-failed");
    expect(pay).not.toHaveBeenCalled();
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("does not save a declined payment", async () => {
    const pay = vi.fn(async (): Promise<PaymentResult> => ({
      status: "declined",
      methodId: "card",
      reason: "Refus banque simulé"
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const result = await service.placeOrder(request);

    expect(result.kind).toBe("payment-declined");
    expect(pay).toHaveBeenCalledOnce();
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("does not save an uncertain payment result or trigger another method", async () => {
    const fallbackPay = vi.fn(async () => ({
      status: "accepted" as const,
      methodId: "wallet",
      transactionId: "wallet-tx"
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([
        paymentMethod(async () => {
          throw new PaymentTechnicalError("card", "Résultat inconnu", false);
        }),
        { id: "wallet", pay: fallbackPay }
      ]),
      history
    );

    const result = await service.placeOrder(request);

    expect(result.kind).toBe("payment-uncertain");
    expect(fallbackPay).not.toHaveBeenCalled();
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("does not save when the requested payment method is not configured", async () => {
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([
        paymentMethod(async () => ({
          status: "accepted",
          methodId: "card",
          transactionId: "card-tx"
        }))
      ]),
      history
    );

    const result = await service.placeOrder({
      ...request,
      preferredMethodId: "unknown"
    });

    expect(result.kind).toBe("invalid-payment-method");
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("replays the same idempotent result without paying twice", async () => {
    const pay = vi.fn(async (paymentRequest): Promise<PaymentResult> => ({
      status: "accepted",
      methodId: "card",
      transactionId: paymentRequest.orderId
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const [first, duplicate] = await Promise.all([
      service.placeOrder(request),
      service.placeOrder({ ...request, idempotencyKey: "parallel-retry" })
    ]);
    const laterRetry = await service.placeOrder({
      ...request,
      idempotencyKey: "later-retry"
    });

    expect(first).toEqual(duplicate);
    expect(first).toEqual(laterRetry);
    expect(pay).toHaveBeenCalledOnce();
    expect(await history.findByClientId("client-1")).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with changed request data", async () => {
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([
        paymentMethod(async paymentRequest => ({
          status: "accepted",
          methodId: "card",
          transactionId: paymentRequest.orderId
        }))
      ]),
      new InMemoryOrderHistoryRepository()
    );

    await service.placeOrder(request);

    expect(() => service.placeOrder({
      ...request,
      items: request.items.slice(0, 1)
    })).toThrow(IdempotencyConflictError);
  });
});
