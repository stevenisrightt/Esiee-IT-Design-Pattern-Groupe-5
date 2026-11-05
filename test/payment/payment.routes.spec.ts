import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPaymentRouter } from "../../src/payment/payment.routes";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/payments", createPaymentRouter());
  return app;
}

describe("Payment route", () => {
  it("does not accept an independently supplied amount", async () => {
    const response = await request(createTestApp())
      .post("/payments")
      .send({
        orderId: "order-1",
        clientId: "client-1",
        amountCents: 2590,
        preferredMethodId: "wallet"
      });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      checkoutEndpoint: "POST /carts/:id/checkout"
    });
  });

});
