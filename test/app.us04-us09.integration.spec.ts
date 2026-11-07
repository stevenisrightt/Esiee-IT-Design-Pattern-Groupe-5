
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import {
  InMemoryOrderHistoryRepository
} from "../src/order-history/in-memory-order-history.repository";
import {
  InMemoryStorageFactory
} from "../src/persistence/storage.factory";
import {
  DemoCheckoutFactsSource
} from "../src/cart/checkout-facts";

describe("US04 and US09 integration in the Express application", () => {

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes cart, validation, payment, and history for classic and custom pizzas", async () => {

    vi.spyOn(console, "log").mockImplementation(() => {});

    const app = createApp();

    const cartResponse = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    const cartId = cartResponse.body.id;

    await request(app)
      .post(`/carts/${cartId}/items`)
      .send({ pizzaId: "margherita", size: "M" })
      .expect(201);

    await request(app)
      .post(`/carts/${cartId}/items`)
      .send({ pizzaId: "margherita", size: "M" })
      .expect(201);

    await request(app)
      .post(`/carts/${cartId}/custom-items`)
      .send({
        base: "tomato",
        size: "M",
        ingredients: ["mozzarella"]
      })
      .expect(201);

    const validation = await request(app)
      .post(`/carts/${cartId}/validate`)
      .send({
        clientId: "client-1",
        deliveryPostalCode: "75001"
      });

    expect(validation.status).toBe(200);
    expect(validation.body.validation).toEqual({
      valid: true
    });

    const checkout = await request(app)
      .post(`/carts/${cartId}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "cart-checkout-1",
        preferredMethodId: "wallet",
        deliveryPostalCode: "75001"
      });

    expect(checkout.status).toBe(201);

    expect(checkout.body.payment).toMatchObject({
      status: "accepted",
      methodId: "wallet"
    });

    expect(checkout.body.order).toMatchObject({
      clientId: "client-1",
      status: "confirmed",
      restaurantName: "Da Michele",
      items: [
        {
          name: "Margherita (M)",
          unitPriceCents: 900
        },
        {
          name: "Margherita (M)",
          unitPriceCents: 900
        },
        {
          name: "Pizza personnalisée (tomato : mozzarella) (M)",
          unitPriceCents: 650
        }
      ]
    });

    expect([2450, 1960]).toContain(
      checkout.body.order.totalCents
    );

    const history = await request(app)
      .get("/clients/client-1/orders?status=confirmed");

    expect(history.status).toBe(200);
    expect(history.body.orders).toHaveLength(1);
    expect(history.body.orders[0].orderId)
      .toBe(checkout.body.order.orderId);
  });

  it.each(["card", "wallet", "cash-on-delivery"])(
    "completes checkout with the configured %s payment method",
    async preferredMethodId => {

      vi.spyOn(console, "log")
        .mockImplementation(() => {});

      const app = createApp();

      const cart = await request(app)
        .post("/carts")
        .send({ pizzeriaId: "da-michele" });

      const cartPath = `/carts/${cart.body.id}`;

      for (let index = 0; index < 3; index++) {
        await request(app)
          .post(`${cartPath}/items`)
          .send({
            pizzaId: "margherita",
            size: "M"
          })
          .expect(201);
      }

      const response = await request(app)
        .post(`${cartPath}/checkout`)
        .send({
          clientId: "client-1",
          idempotencyKey: `checkout-${preferredMethodId}`,
          preferredMethodId,
          deliveryPostalCode: "75001"
        });

      expect(response.status).toBe(201);
      expect(response.body.order.orderId)
        .not.toBe("untrusted-order-id");
      expect(response.body.payment.methodId)
        .toBe(preferredMethodId);
      expect([2700, 2160]).toContain(
        response.body.order.totalCents
      );
    }
  );

  it("uses the cart's server-calculated total, not a client amount", async () => {

    vi.spyOn(console, "log")
      .mockImplementation(() => {});

    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    const cartPath = `/carts/${cart.body.id}`;

    for (let index = 0; index < 3; index++) {
      await request(app)
        .post(`${cartPath}/items`)
        .send({
          pizzaId: "margherita",
          size: "M"
        })
        .expect(201);
    }

    const response = await request(app)
      .post(`${cartPath}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "client-amount-ignored",
        orderId: "untrusted-order-id",
        amountCents: 1,
        deliveryPostalCode: "75001"
      });

    expect(response.status).toBe(201);
    expect([2700, 2160]).toContain(
      response.body.order.totalCents
    );
  });

  it("replays an idempotent checkout without processing payment twice", async () => {

    const log = vi.spyOn(console, "log")
      .mockImplementation(() => {});

    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    const cartPath = `/carts/${cart.body.id}`;

    for (let index = 0; index < 3; index++) {
      await request(app)
        .post(`${cartPath}/items`)
        .send({
          pizzaId: "margherita",
          size: "M"
        })
        .expect(201);
    }

    const checkoutRequest = {
      clientId: "client-1",
      idempotencyKey: "replayed-checkout",
      preferredMethodId: "card",
      deliveryPostalCode: "75001"
    };

    const first = await request(app)
      .post(`${cartPath}/checkout`)
      .send(checkoutRequest);

    const duplicate = await request(app)
      .post(`${cartPath}/checkout`)
      .send(checkoutRequest);

    expect(first.body.order.orderId)
      .toBe(duplicate.body.order.orderId);

    expect(log).toHaveBeenCalledOnce();

    const history = await request(app)
      .get("/clients/client-1/orders");

    expect(history.body.orders).toHaveLength(1);
  });

  it("retries a failed history save without charging the customer again", async () => {

    const log = vi.spyOn(console, "log")
      .mockImplementation(() => {});

    const save = vi.spyOn(
      InMemoryOrderHistoryRepository.prototype,
      "save"
    ).mockImplementationOnce(async () => {
      throw new Error("Temporary history failure");
    });

    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    const cartPath = `/carts/${cart.body.id}`;

    for (let index = 0; index < 3; index++) {
      await request(app)
        .post(`${cartPath}/items`)
        .send({
          pizzaId: "margherita",
          size: "M"
        })
        .expect(201);
    }

    const checkoutRequest = {
      clientId: "client-1",
      idempotencyKey: "retry-history-save",
      preferredMethodId: "card",
      deliveryPostalCode: "75001"
    };

    const first = await request(app)
      .post(`${cartPath}/checkout`)
      .send(checkoutRequest)
      .expect(503);

    expect(first.body).toMatchObject({
      paymentOutcome: "accepted",
      historyRecorded: false,
      retryWithSameRequest: true,
      payment: {
        status: "accepted",
        methodId: "card"
      }
    });

    const retry = await request(app)
      .post(`${cartPath}/checkout`)
      .send(checkoutRequest)
      .expect(201);

    expect(retry.body.order.orderId)
      .toBe(first.body.orderId);

    expect(retry.body.payment.transactionId)
      .toBe(first.body.payment.transactionId);

    expect(save).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledOnce();

    const history = await request(app)
      .get("/clients/client-1/orders");

    expect(history.body.orders).toHaveLength(1);
  });

  it("does not allow direct payment of a client-supplied amount", async () => {

    const response = await request(createApp())
      .post("/payments")
      .send({
        orderId: "made-up-order",
        clientId: "client-1",
        amountCents: 1
      });

    expect(response.status).toBe(404);
  });

  it("does not add an order to history when checkout validation fails", async () => {

    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    await request(app)
      .post(`/carts/${cart.body.id}/items`)
      .send({
        pizzaId: "margherita",
        size: "M"
      })
      .expect(201);

    const checkout = await request(app)
      .post(`/carts/${cart.body.id}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "invalid-checkout-1",
        deliveryPostalCode: "75001"
      });

    expect(checkout.status).toBe(422);

    const history = await request(app)
      .get("/clients/client-1/orders");

    expect(history.body).toEqual({
      orders: []
    });
  });

  async function createThreeMargheritas(
    app: ReturnType<typeof createApp>
  ) {
    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" })
      .expect(201);

    const url = `/carts/${cart.body.id}`;

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`${url}/items`)
        .send({
          pizzaId: "margherita",
          size: "M"
        })
        .expect(201);
    }

    return url;
  }

  // SECURITE : zone non desservie
  it("refuse une zone hors livraison malgré une donnée falsifiée", async () => {

    const app = createApp();
    const url = await createThreeMargheritas(app);

    const response = await request(app)
      .post(`${url}/checkout`)
      .send({
        clientId: "client-zone",
        idempotencyKey: "spoofed-zone",
        deliveryPostalCode: "99999",
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: {
          "Margherita (M)": 999
        }
      });

    expect(response.status).toBe(422);
    expect(response.body.validation.rule)
      .toBe("delivery-zone");

    const history = await request(app)
      .get("/clients/client-zone/orders");

    expect(history.body.orders).toHaveLength(0);
  });

  // SECURITE : restaurant fermé
  it("refuse un restaurant fermé malgré le booléen du client", async () => {

    const facts = new DemoCheckoutFactsSource(
      {
        hoursByRestaurant: {
          "da-michele": {
            openHourUtc: 10,
            closeHourUtc: 12
          }
        }
      },
      () => new Date("2026-11-06T15:00:00Z")
    );

    const app = createApp(
      new InMemoryStorageFactory(),
      facts
    );

    const url = await createThreeMargheritas(app);

    const response = await request(app)
      .post(`${url}/checkout`)
      .send({
        clientId: "client-closed",
        idempotencyKey: "spoofed-hours",
        deliveryPostalCode: "75001",
        isRestaurantOpen: true
      });

    expect(response.status).toBe(422);
    expect(response.body.validation.rule)
      .toBe("restaurant-open");
  });

  // SECURITE : stock insuffisant
  it("refuse un stock insuffisant malgré le stock falsifié", async () => {

    const facts = new DemoCheckoutFactsSource({
      stockByRestaurant: {
        "da-michele": {
          "Margherita (M)": 0
        }
      }
    });

    const app = createApp(
      new InMemoryStorageFactory(),
      facts
    );

    const url = await createThreeMargheritas(app);

    const response = await request(app)
      .post(`${url}/checkout`)
      .send({
        clientId: "client-stock",
        idempotencyKey: "spoofed-stock",
        deliveryPostalCode: "75001",
        stockByItem: {
          "Margherita (M)": 999
        }
      });

    expect(response.status).toBe(422);
    expect(response.body.validation.rule).toBe("stock");
  });

  it("keeps existing health, menu and validation routes available", async () => {

    const app = createApp();

    const health = await request(app)
      .get("/health");

    const pizzerias = await request(app)
      .get("/pizzerias");

    const validation = await request(app)
      .post("/orders/validate")
      .send({
        items: [{
          name: "Pizza",
          unitPrice: 20,
          quantity: 1
        }],
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: {
          Pizza: 1
        }
      });

    expect(health.status).toBe(200);
    expect(pizzerias.status).toBe(200);
    expect(validation.status).toBe(200);
    expect(validation.body.validation).toEqual({
      valid: true
    });
  });

  it("keeps existing cart and custom-pizza routes available", async () => {

    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });

    const ingredients = await request(app)
      .get("/pizzas/custom/ingredients");

    expect(cart.status).toBe(201);
    expect(cart.body.pizzeriaId).toBe("da-michele");
    expect(ingredients.status).toBe(200);
    expect(ingredients.body.ingredients).toHaveLength(6);
  });
});
