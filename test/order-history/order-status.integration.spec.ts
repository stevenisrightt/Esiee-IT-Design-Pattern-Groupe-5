import { mkdtemp, mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app";
import { JsonFileOrderHistoryRepository } from "../../src/order-history/json-file-order-history.repository";
import {
  createOrderHistoryRouter
} from "../../src/order-history/order-history.routes";
import { OrderHistoryService } from "../../src/order-history/order-history.service";
import type { HistoricalOrder } from "../../src/order-history/order-history.model";
import { JsonFileStorageFactory } from "../../src/persistence/storage.factory";

describe("Order status and notification integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks out, persists a status change, and notifies once per real transition", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pizza-order-status-"));
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const storage = await JsonFileStorageFactory.open(dataDir);
      const app = createApp(storage);
      const cart = await request(app)
        .post("/carts")
        .send({ pizzeriaId: "da-michele" })
        .expect(201);
      const cartPath = `/carts/${cart.body.id}`;

      for (let index = 0; index < 3; index++) {
        await request(app)
          .post(`${cartPath}/items`)
          .send({ pizzaId: "margherita", size: "M" })
          .expect(201);
      }

      const checkout = await request(app)
        .post(`${cartPath}/checkout`)
        .send({
          clientId: "client-status",
          idempotencyKey: "status-integration-checkout",
          preferredMethodId: "card",
          deliveryPostalCode: "75001"
        })
        .expect(201);

      expect(checkout.body.order.status).toBe("confirmed");
      logs.mockClear();

      const statusChange = await request(app)
        .patch(
          `/clients/client-status/orders/${checkout.body.order.orderId}/status`
        )
        .send({ status: "preparing" })
        .expect(200);

      expect(statusChange.body.order.status).toBe("preparing");
      expect(logs).toHaveBeenCalledTimes(2);
      expect(logs).toHaveBeenCalledWith(
        "[Email] Votre commande est maintenant : preparing"
      );
      expect(logs).toHaveBeenCalledWith(
        "[SMS] Statut de votre commande : preparing"
      );

      await request(app)
        .patch(
          `/clients/client-status/orders/${checkout.body.order.orderId}/status`
        )
        .send({ status: "preparing" })
        .expect(200);
      expect(logs).toHaveBeenCalledTimes(2);

      const reloadedStorage = await JsonFileStorageFactory.open(dataDir);
      const reloadedApp = createApp(reloadedStorage);
      const history = await request(reloadedApp)
        .get("/clients/client-status/orders?status=preparing")
        .expect(200);

      expect(history.body.orders).toHaveLength(1);
      expect(history.body.orders[0].orderId)
        .toBe(checkout.body.order.orderId);
      expect(history.body.orders[0].status).toBe("preparing");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("does not mutate or notify when JSON status persistence fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pizza-order-status-fail-"));
    const filePath = join(dataDir, "orders.json");
    const listener = { update: vi.fn() };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const order: HistoricalOrder = {
      orderId: "persist-failure",
      clientId: "client-status",
      createdAt: new Date("2026-11-08T10:00:00Z"),
      status: "confirmed",
      restaurantName: "Da Michele",
      items: [{ name: "Margherita (M)", quantity: 1, unitPriceCents: 900 }],
      totalCents: 900
    };

    try {
      const repository = await JsonFileOrderHistoryRepository.open(filePath);
      await repository.save(order);
      await rename(filePath, join(dataDir, "saved-orders.json"));
      await mkdir(filePath);

      const service = new OrderHistoryService(repository, [listener]);
      const app = express();
      app.use(express.json());
      app.use("/clients", createOrderHistoryRouter(service));

      const response = await request(app)
        .patch("/clients/client-status/orders/persist-failure/status")
        .send({ status: "preparing" });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain("Impossible d'enregistrer");
      expect(listener.update).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledOnce();
      expect(await repository.findByClientId("client-status"))
        .toMatchObject([{ orderId: "persist-failure", status: "confirmed" }]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
