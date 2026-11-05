import { describe, expect, it } from "vitest";
import {
  InMemoryOrderHistoryRepository
} from "../../src/order-history/in-memory-order-history.repository";
import {
  OrderHistoryConflictError
} from "../../src/order-history/order-history.repository";
import type { HistoricalOrder } from "../../src/order-history/order-history.model";

const order: HistoricalOrder = {
  orderId: "order-1",
  clientId: "client-1",
  createdAt: new Date("2026-03-01T10:00:00Z"),
  status: "confirmed",
  restaurantName: "Da Michele",
  items: [{ name: "Margherita", quantity: 1, unitPriceCents: 900 }],
  totalCents: 900
};

describe("InMemoryOrderHistoryRepository", () => {
  it("treats a concurrent repeated save as idempotent", async () => {
    const repository = new InMemoryOrderHistoryRepository();

    await Promise.all([
      repository.save(order),
      repository.save({
        ...order,
        createdAt: new Date(order.createdAt),
        items: order.items.map(item => ({ ...item }))
      })
    ]);

    await expect(repository.findByClientId("client-1")).resolves.toEqual([
      order
    ]);
  });

  it("rejects a conflicting snapshot without overwriting the existing order", async () => {
    const repository = new InMemoryOrderHistoryRepository([order]);
    const conflicting: HistoricalOrder = {
      ...order,
      totalCents: 1200,
      items: [{ name: "Different pizza", quantity: 1, unitPriceCents: 1200 }]
    };

    const results = await Promise.allSettled([
      repository.save(conflicting),
      repository.save(order)
    ]);

    expect(results[0].status).toBe("rejected");
    if (results[0].status === "rejected") {
      expect(results[0].reason).toBeInstanceOf(OrderHistoryConflictError);
    }
    await expect(repository.findByClientId("client-1")).resolves.toEqual([
      order
    ]);
  });
});
