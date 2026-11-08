import { describe, expect, it, vi } from "vitest";
import { InMemoryOrderHistoryRepository } from "../../src/order-history/in-memory-order-history.repository";
import type {
  HistoricalOrder,
  OrderStatus
} from "../../src/order-history/order-history.model";
import { OrderHistoryService } from "../../src/order-history/order-history.service";

function order(
  orderId: string,
  clientId: string,
  date: string,
  status: OrderStatus = "delivered"
): HistoricalOrder {
  return {
    orderId,
    clientId,
    createdAt: new Date(date),
    status,
    restaurantName: "Da Michele",
    items: [{ name: "Margherita", quantity: 1, unitPriceCents: 900 }],
    totalCents: 900
  };
}

describe("OrderHistoryService", () => {
  const repository = new InMemoryOrderHistoryRepository([
    order("older", "client-1", "2026-01-01T10:00:00Z", "delivered"),
    order("newer-cancelled", "client-1", "2026-03-01T10:00:00Z", "cancelled"),
    order("newer-delivered", "client-1", "2026-02-01T10:00:00Z", "delivered"),
    order("other-client", "client-2", "2026-04-01T10:00:00Z", "delivered")
  ]);
  const service = new OrderHistoryService(repository);

  it("returns only orders belonging to the requested client", async () => {
    const result = await service.getOrders("client-1");

    expect(result.map(item => item.orderId)).toEqual([
      "newer-cancelled",
      "newer-delivered",
      "older"
    ]);
  });

  it("sorts history from newest to oldest", async () => {
    const result = await service.getOrders("client-1");

    expect(result.map(item => item.createdAt.toISOString())).toEqual([
      "2026-03-01T10:00:00.000Z",
      "2026-02-01T10:00:00.000Z",
      "2026-01-01T10:00:00.000Z"
    ]);
  });

  it("filters by status and sorts the filtered results", async () => {
    const result = await service.getOrders("client-1", "delivered");

    expect(result.map(item => item.orderId)).toEqual([
      "newer-delivered",
      "older"
    ]);
  });

  it("returns an empty history for a client without orders", async () => {
    await expect(service.getOrders("no-orders")).resolves.toEqual([]);
  });

  it("does not expose repository objects that callers can mutate", async () => {
    const first = await service.getOrders("client-1");
    first[0].createdAt.setFullYear(2000);

    const second = await service.getOrders("client-1");
    expect(second.find(item => item.orderId === first[0].orderId)
      ?.createdAt.getFullYear()).toBe(2026);
  });

  it("keeps a persisted status change when a listener fails", async () => {
    const repository = new InMemoryOrderHistoryRepository([
      order("notify-error", "client-1", "2026-04-01T10:00:00Z", "confirmed")
    ]);
    const failedListener = {
      update: vi.fn(() => {
        throw new Error("notification failed");
      })
    };
    const nextListener = { update: vi.fn() };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new OrderHistoryService(
      repository,
      [failedListener, nextListener]
    );

    try {
      const updated = await service.updateStatus(
        "client-1",
        "notify-error",
        "preparing"
      );

      expect(updated.status).toBe("preparing");
      expect(await repository.findByClientId("client-1"))
        .toContainEqual(expect.objectContaining({
          orderId: "notify-error",
          status: "preparing"
        }));
      expect(failedListener.update).toHaveBeenCalledOnce();
      expect(nextListener.update).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledOnce();
    } finally {
      errorLog.mockRestore();
    }
  });
});
