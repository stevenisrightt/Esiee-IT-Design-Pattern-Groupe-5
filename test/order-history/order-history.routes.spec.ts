import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { InMemoryOrderHistoryRepository } from "../../src/order-history/in-memory-order-history.repository";
import type {
  HistoricalOrder,
  OrderStatus
} from "../../src/order-history/order-history.model";
import { createOrderHistoryRouter } from "../../src/order-history/order-history.routes";
import { OrderHistoryService } from "../../src/order-history/order-history.service";

function createApp() {
  const orders: HistoricalOrder[] = [
    {
      orderId: "order-old",
      clientId: "client-1",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      status: "delivered",
      restaurantName: "Da Michele",
      items: [{ name: "Margherita", quantity: 1, unitPriceCents: 900 }],
      totalCents: 900
    },
    {
      orderId: "order-new",
      clientId: "client-1",
      createdAt: new Date("2026-02-01T10:00:00Z"),
      status: "cancelled",
      restaurantName: "Pizzium",
      items: [{ name: "Napolitaine", quantity: 1, unitPriceCents: 1000 }],
      totalCents: 1000
    },
    {
      orderId: "other-client-order",
      clientId: "client-2",
      createdAt: new Date("2026-03-01T10:00:00Z"),
      status: "delivered" as OrderStatus,
      restaurantName: "Rossopomodoro",
      items: [{ name: "Supreme", quantity: 1, unitPriceCents: 1200 }],
      totalCents: 1200
    }
  ];
  const app = express();
  app.use(express.json());
  app.use("/clients", createOrderHistoryRouter(
    new OrderHistoryService(new InMemoryOrderHistoryRepository(orders))
  ));
  return app;
}

describe("Order history route", () => {
  it("returns a client's orders in descending date order", async () => {
    const response = await request(createApp())
      .get("/clients/client-1/orders");

    expect(response.status).toBe(200);
    expect(response.body.orders.map((item: HistoricalOrder) => item.orderId))
      .toEqual(["order-new", "order-old"]);
    expect(response.body.orders[0].createdAt).toBe("2026-02-01T10:00:00.000Z");
  });

  it("filters by a valid status", async () => {
    const response = await request(createApp())
      .get("/clients/client-1/orders?status=delivered");

    expect(response.status).toBe(200);
    expect(response.body.orders.map((item: HistoricalOrder) => item.orderId))
      .toEqual(["order-old"]);
  });

  it("rejects an unknown status", async () => {
    const response = await request(createApp())
      .get("/clients/client-1/orders?status=unknown");

    expect(response.status).toBe(400);
  });

  it("returns an empty list for a client without orders", async () => {
    const response = await request(createApp())
      .get("/clients/missing/orders");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ orders: [] });
  });

  it("keeps the client histories isolated", async () => {
    const response = await request(createApp())
      .get("/clients/client-2/orders");

    expect(response.body.orders.map((item: HistoricalOrder) => item.orderId))
      .toEqual(["other-client-order"]);
  });

  it("updates an existing order status without creating another history entry", async () => {
    const app = createApp();
    const before = await request(app).get("/clients/client-1/orders");

    const updated = await request(app)
      .patch("/clients/client-1/orders/order-old/status")
      .send({ status: "preparing" });
    const after = await request(app).get("/clients/client-1/orders");

    expect(updated.status).toBe(200);
    expect(updated.body.order).toMatchObject({
      ...before.body.orders.find((order: HistoricalOrder) =>
        order.orderId === "order-old"
      ),
      status: "preparing"
    });
    expect(after.body.orders).toHaveLength(2);
    expect(after.body.orders.find((order: HistoricalOrder) =>
      order.orderId === "order-old"
    ).status).toBe("preparing");
  });

  it("returns 404 for an order absent from the requested client's history", async () => {
    const response = await request(createApp())
      .patch("/clients/client-1/orders/unknown/status")
      .send({ status: "preparing" });

    expect(response.status).toBe(404);
  });

  it("rejects an invalid status", async () => {
    const response = await request(createApp())
      .patch("/clients/client-1/orders/order-old/status")
      .send({ status: "in-kitchen" });

    expect(response.status).toBe(400);
  });
});
