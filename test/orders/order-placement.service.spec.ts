import { describe, expect, it, vi } from "vitest";
import { InMemoryOrderHistoryRepository } from "../../src/order-history/in-memory-order-history.repository";
import { OrderHistoryConflictError } from "../../src/order-history/order-history.repository";
import { PaymentOrchestrator } from "../../src/payment/payment-orchestrator";
import {
  PaymentOutcomeUnknownError,
  PaymentTechnicalError,
  type PaymentMethod,
  type PaymentResult
} from "../../src/payment/payment.types";
import type { HistoricalOrder } from "../../src/order-history/order-history.model";
import type { OrderHistoryRepository } from "../../src/order-history/order-history.repository";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    const retry = await service.placeOrder(request);

    expect(result.kind).toBe("payment-declined");
    expect(retry).toEqual(result);
    expect(pay).toHaveBeenCalledOnce();
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("releases the cart attempt after a safely retryable provider outage", async () => {
    const pay = vi.fn(async (paymentRequest): Promise<PaymentResult> => {
      if (pay.mock.calls.length === 1) {
        throw new PaymentTechnicalError("card", "Provider offline", true);
      }

      return {
        status: "accepted",
        methodId: "card",
        transactionId: paymentRequest.orderId
      };
    });
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      new InMemoryOrderHistoryRepository()
    );

    const unavailable = await service.placeOrder(request);
    const retry = await service.placeOrder({
      ...request,
      idempotencyKey: "retry-after-provider-outage"
    });

    expect(unavailable.kind).toBe("payment-unavailable");
    expect(retry.kind).toBe("placed");
    expect(pay).toHaveBeenCalledTimes(2);
  });

  it("does not save an uncertain payment result or trigger another method", async () => {
    const cardPay = vi.fn(async () => {
      throw new PaymentOutcomeUnknownError("card", "Résultat inconnu");
    });
    const fallbackPay = vi.fn(async () => ({
      status: "accepted" as const,
      methodId: "wallet",
      transactionId: "wallet-tx"
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([
        paymentMethod(cardPay),
        { id: "wallet", pay: fallbackPay }
      ]),
      history
    );

    const result = await service.placeOrder(request);
    const repeated = await service.placeOrder({
      ...request,
      idempotencyKey: "uncertain-retry"
    });

    expect(result.kind).toBe("payment-uncertain");
    expect(repeated).toEqual(result);
    expect(cardPay).toHaveBeenCalledOnce();
    expect(fallbackPay).not.toHaveBeenCalled();
    await expect(history.findByClientId("client-1")).resolves.toEqual([]);
  });

  it("retries only history persistence after an accepted payment", async () => {
    const pay = vi.fn(async (paymentRequest): Promise<PaymentResult> => ({
      status: "accepted",
      methodId: "card",
      transactionId: `tx-${paymentRequest.orderId}`
    }));
    const memoryHistory = new InMemoryOrderHistoryRepository();
    const retrySaveStarted = deferred<void>();
    const allowRetrySave = deferred<void>();
    let saveCount = 0;
    const history: OrderHistoryRepository = {
      findByClientId: clientId => memoryHistory.findByClientId(clientId),
      async save(order: HistoricalOrder) {
        saveCount += 1;
        if (saveCount === 1) {
          throw new Error("Temporary repository failure");
        }
        retrySaveStarted.resolve();
        await allowRetrySave.promise;
        await memoryHistory.save(order);
      }
    };
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const first = await service.placeOrder(request);
    expect(first.kind).toBe("history-save-failed");
    if (first.kind !== "history-save-failed") {
      throw new Error("Expected history persistence to fail.");
    }

    const retryPromise = service.placeOrder(request);
    await retrySaveStarted.promise;
    const concurrentRetry = service.placeOrder(request);
    expect(saveCount).toBe(2);
    allowRetrySave.resolve();
    const [retry, concurrentResult] = await Promise.all([
      retryPromise,
      concurrentRetry
    ]);
    expect(retry.kind).toBe("placed");
    if (retry.kind !== "placed") {
      throw new Error("Expected the retry to persist the order.");
    }

    const duplicate = await service.placeOrder(request);
    expect(concurrentResult).toEqual(retry);
    expect(duplicate).toEqual(retry);
    expect(first.payment.transactionId).toBe(retry.payment.transactionId);
    expect(first.orderId).toBe(retry.order.orderId);
    expect(pay).toHaveBeenCalledOnce();
    expect(saveCount).toBe(2);
    expect(await memoryHistory.findByClientId("client-1")).toHaveLength(1);
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
    const save = vi.spyOn(history, "save");
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
    expect(save).toHaveBeenCalledOnce();
    expect(await history.findByClientId("client-1")).toHaveLength(1);
  });

  it("waits for a concurrent request with the same idempotency key", async () => {
    const paymentStarted = deferred<void>();
    const paymentResult = deferred<PaymentResult>();
    const pay = vi.fn(() => {
      paymentStarted.resolve();
      return paymentResult.promise;
    });
    const history = new InMemoryOrderHistoryRepository();
    const save = vi.spyOn(history, "save");
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const first = service.placeOrder(request);
    await paymentStarted.promise;
    const concurrent = service.placeOrder(request);
    expect(pay).toHaveBeenCalledOnce();

    paymentResult.resolve({
      status: "accepted",
      methodId: "card",
      transactionId: "same-key-tx"
    });
    const [firstResult, concurrentResult] = await Promise.all([
      first,
      concurrent
    ]);

    expect(concurrentResult).toEqual(firstResult);
    expect(pay).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(await history.findByClientId("client-1")).toHaveLength(1);
  });

  it("does not double-pay a cart when concurrent requests use different keys", async () => {
    const paymentStarted = deferred<void>();
    const paymentResult = deferred<PaymentResult>();
    const pay = vi.fn(() => {
      paymentStarted.resolve();
      return paymentResult.promise;
    });
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      new InMemoryOrderHistoryRepository()
    );

    const first = service.placeOrder(request);
    await paymentStarted.promise;
    const concurrent = service.placeOrder({
      ...request,
      idempotencyKey: "different-key-same-cart"
    });
    expect(pay).toHaveBeenCalledOnce();

    paymentResult.resolve({
      status: "accepted",
      methodId: "card",
      transactionId: "same-cart-tx"
    });
    const [firstResult, concurrentResult] = await Promise.all([
      first,
      concurrent
    ]);

    expect(concurrentResult).toEqual(firstResult);
    expect(pay).toHaveBeenCalledOnce();
  });

  it("allows distinct carts with different keys to be processed independently", async () => {
    const pay = vi.fn(async paymentRequest => ({
      status: "accepted" as const,
      methodId: "card",
      transactionId: paymentRequest.orderId
    }));
    const history = new InMemoryOrderHistoryRepository();
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      history
    );

    const first = await service.placeOrder(request);
    const second = await service.placeOrder({
      ...request,
      cartId: "cart-2",
      idempotencyKey: "separate-checkout"
    });

    expect(first.kind).toBe("placed");
    expect(second.kind).toBe("placed");
    expect(pay).toHaveBeenCalledTimes(2);
    expect(await history.findByClientId("client-1")).toHaveLength(2);
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

  it("rejects reuse of an idempotency key by a different client", async () => {
    const pay = vi.fn(async paymentRequest => ({
      status: "accepted" as const,
      methodId: "card",
      transactionId: paymentRequest.orderId
    }));
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      new InMemoryOrderHistoryRepository()
    );

    await service.placeOrder(request);

    expect(() => service.placeOrder({
      ...request,
      cartId: "another-cart",
      clientId: "client-2"
    })).toThrow(IdempotencyConflictError);
    expect(pay).toHaveBeenCalledOnce();
  });

  it("rejects reuse of an idempotency key with a changed checkout amount", async () => {
    const pay = vi.fn(async paymentRequest => ({
      status: "accepted" as const,
      methodId: "card",
      transactionId: paymentRequest.orderId
    }));
    const service = new OrderPlacementService(
      validator(),
      new PaymentOrchestrator([paymentMethod(pay)]),
      new InMemoryOrderHistoryRepository()
    );

    await service.placeOrder(request);

    expect(() => service.placeOrder({
      ...request,
      cartId: "another-cart",
      items: request.items.map((item, index) =>
        index === 0 ? { ...item, unitPrice: 10 } : item
      )
    })).toThrow(IdempotencyConflictError);
    expect(pay).toHaveBeenCalledOnce();
  });

  it("does not overwrite a stored order when history reports an ID conflict", async () => {
    const existing = {
      orderId: "existing-order",
      clientId: "client-1",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      status: "confirmed" as const,
      restaurantName: "Da Michele",
      items: [{ name: "Original", quantity: 1, unitPriceCents: 900 }],
      totalCents: 900
    };
    const history = new InMemoryOrderHistoryRepository([existing]);
    const conflicting = {
      ...existing,
      totalCents: 1200
    };

    await expect(history.save(conflicting)).rejects.toBeInstanceOf(
      OrderHistoryConflictError
    );
    await expect(history.findByClientId("client-1")).resolves.toEqual([
      existing
    ]);
  });
});
