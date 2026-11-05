import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPaymentRouter } from "../../src/payment/payment.routes";
import { PaymentOrchestrator } from "../../src/payment/payment-orchestrator";
import {
  CardPaymentAdapter,
  WalletPaymentAdapter
} from "../../src/payment/payment-adapters";
import {
  SimulatedCardProcessor,
  SimulatedWalletProcessor
} from "../../src/payment/payment-providers";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/payments", createPaymentRouter(new PaymentOrchestrator([
    new CardPaymentAdapter(new SimulatedCardProcessor()),
    new WalletPaymentAdapter(new SimulatedWalletProcessor())
  ])));
  return app;
}

describe("Payment route", () => {
  it("accepts a valid payment and honors the preferred method", async () => {
    const response = await request(createTestApp())
      .post("/payments")
      .send({
        orderId: "order-1",
        clientId: "client-1",
        amountCents: 2590,
        preferredMethodId: "wallet"
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "accepted",
      methodId: "wallet"
    });
  });

  it("rejects invalid payment input", async () => {
    const response = await request(createTestApp())
      .post("/payments")
      .send({
        orderId: "order-1",
        clientId: "client-1",
        amountCents: 0
      });

    expect(response.status).toBe(400);
  });
});
