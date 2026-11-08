import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { JsonFilePaymentRepository } from "@/payment/json-file-payment-record.repository";
import { PaymentOrchestrator } from "@/payment/payment-orchestrator";
import {
  PaymentJournalListener,
  type PaymentListener
} from "@/payment/payment.listener";
import type { PaymentMethod, PaymentResult } from "@/payment/payment.types";
import { JsonFileStorageFactory } from "@/persistence/storage.factory";

const paymentRequest = { orderId: "order-1", clientId: "client-1", amountCents: 1800 };
const recordedAt = new Date("2026-11-06T18:30:00.000Z");

function method(id: string, pay: PaymentMethod["pay"]): PaymentMethod {
  return { id, pay };
}

describe("Persistance des paiements (US04) — Observer", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "payments-"));
    filePath = join(dir, "payments.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("journalise un paiement accepté et le retrouve après un redémarrage", async () => {
    const accepted: PaymentResult = { status: "accepted", methodId: "card", transactionId: "tx-42" };
    const orchestrator = new PaymentOrchestrator([method("card", async () => accepted)]);
    orchestrator.subscribe(
      new PaymentJournalListener(await JsonFilePaymentRepository.open(filePath), () => recordedAt)
    );

    expect(await orchestrator.pay(paymentRequest)).toEqual(accepted);

    const reopened = await JsonFilePaymentRepository.open(filePath);
    expect(await reopened.findByOrderId("order-1")).toEqual({
      ...paymentRequest,
      methodId: "card",
      status: "accepted",
      transactionId: "tx-42",
      recordedAt
    });
  });

  it("journalise aussi les paiements refusés", async () => {
    const orchestrator = new PaymentOrchestrator([
      method("wallet", async () => ({ status: "declined", methodId: "wallet", reason: "Solde insuffisant" }))
    ]);
    orchestrator.subscribe(
      new PaymentJournalListener(await JsonFilePaymentRepository.open(filePath), () => recordedAt)
    );

    await orchestrator.pay(paymentRequest);

    const reopened = await JsonFilePaymentRepository.open(filePath);
    expect(await reopened.findByClientId("client-1")).toEqual([
      { ...paymentRequest, methodId: "wallet", status: "declined", reason: "Solde insuffisant", recordedAt }
    ]);
  });

  it("notifie tous les listeners abonnés, et plus ceux désabonnés", async () => {
    const orchestrator = new PaymentOrchestrator([
      method("card", async () => ({ status: "accepted", methodId: "card", transactionId: "tx" }))
    ]);
    const first: PaymentListener = { onPaymentCompleted: vi.fn() };
    const second: PaymentListener = { onPaymentCompleted: vi.fn() };
    orchestrator.subscribe(first);
    orchestrator.subscribe(second);
    orchestrator.unsubscribe(second);

    await orchestrator.pay(paymentRequest);

    expect(first.onPaymentCompleted).toHaveBeenCalledTimes(1);
    expect(second.onPaymentCompleted).not.toHaveBeenCalled();
  });

  it("un listener en échec n'annule pas un paiement déjà effectué", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const accepted: PaymentResult = { status: "accepted", methodId: "card", transactionId: "tx-1" };
    const orchestrator = new PaymentOrchestrator([method("card", async () => accepted)]);
    orchestrator.subscribe({
      onPaymentCompleted: async () => { throw new Error("disque plein"); }
    });

    expect(await orchestrator.pay(paymentRequest)).toEqual(accepted);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("createApp avec la fabrique de stockage JSON (Abstract Factory)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "app-storage-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("l'historique reste consultable avec une nouvelle instance de l'app", async () => {
    const first = await JsonFileStorageFactory.open(dir);
    await first.createOrderHistoryRepository().save({
      orderId: "order-1",
      clientId: "client-1",
      createdAt: new Date("2026-11-06T18:30:00.000Z"),
      status: "delivered",
      restaurantName: "Pizzium",
      items: [{ name: "Napolitaine (M)", quantity: 1, unitPriceCents: 1000 }],
      totalCents: 1000
    });

    // "Redémarrage" : nouvelle fabrique, fichiers relus depuis le disque.
    const app = createApp(await JsonFileStorageFactory.open(dir));
    const response = await request(app).get("/clients/client-1/orders");

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("order-1");
  });

  it("persiste les changements de statut de l'historique à travers le routeur et un redémarrage", async () => {
    const first = await JsonFileStorageFactory.open(dir);
    await first.createOrderHistoryRepository().save({
      orderId: "order-status",
      clientId: "client-1",
      createdAt: new Date("2026-11-06T18:30:00.000Z"),
      status: "confirmed",
      restaurantName: "Pizzium",
      items: [{ name: "Napolitaine (M)", quantity: 1, unitPriceCents: 1000 }],
      totalCents: 1000
    });

    const app = createApp(await JsonFileStorageFactory.open(dir));
    for (const status of [
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered"
    ] as const) {
      await request(app)
        .patch(`/clients/client-1/orders/order-status/status`)
        .send({ status })
        .expect(200);
    }

    const restartedApp = createApp(await JsonFileStorageFactory.open(dir));
    const response = await request(restartedApp)
      .get("/clients/client-1/orders");

    expect(response.status).toBe(200);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0]).toMatchObject({
      orderId: "order-status",
      clientId: "client-1",
      createdAt: "2026-11-06T18:30:00.000Z",
      status: "delivered",
      restaurantName: "Pizzium",
      items: [{ name: "Napolitaine (M)", quantity: 1, unitPriceCents: 1000 }],
      totalCents: 1000
    });
  });
});
