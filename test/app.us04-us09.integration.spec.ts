import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

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
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: {
          "Margherita (M)": 2,
          "Pizza personnalisée (tomato : mozzarella) (M)": 1
        }
      });

    expect(validation.status).toBe(200);
    expect(validation.body.validation).toEqual({ valid: true });

    const checkout = await request(app)
      .post(`/carts/${cartId}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "cart-checkout-1",
        preferredMethodId: "wallet",
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: {
          "Margherita (M)": 2,
          "Pizza personnalisée (tomato : mozzarella) (M)": 1
        }
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
        { name: "Margherita (M)", unitPriceCents: 900 },
        { name: "Margherita (M)", unitPriceCents: 900 },
        {
          name: "Pizza personnalisée (tomato : mozzarella) (M)",
          unitPriceCents: 650
        }
      ]
    });
    expect([2450, 1960]).toContain(checkout.body.order.totalCents);

    const history = await request(app)
      .get("/clients/client-1/orders?status=confirmed");
    expect(history.status).toBe(200);
    expect(history.body.orders).toHaveLength(1);
    expect(history.body.orders[0].orderId).toBe(checkout.body.order.orderId);
  });

  it.each(["card", "wallet", "cash-on-delivery"])(
    "completes checkout with the configured %s payment method",
    async preferredMethodId => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const app = createApp();
      const cart = await request(app)
        .post("/carts")
        .send({ pizzeriaId: "da-michele" });
      const cartPath = `/carts/${cart.body.id}`;

      for (let index = 0; index < 3; index++) {
        await request(app)
          .post(`${cartPath}/items`)
          .send({ pizzaId: "margherita", size: "M" })
          .expect(201);
      }

      const response = await request(app)
        .post(`${cartPath}/checkout`)
        .send({
          clientId: "client-1",
          idempotencyKey: `checkout-${preferredMethodId}`,
          preferredMethodId,
          isDeliveryZoneSupported: true,
          isRestaurantOpen: true,
          stockByItem: { "Margherita (M)": 3 }
        });

      expect(response.status).toBe(201);
      expect(response.body.order.orderId).not.toBe("untrusted-order-id");
      expect(response.body.payment.methodId).toBe(preferredMethodId);
      expect([2700, 2160]).toContain(response.body.order.totalCents);
    }
  );

  it("uses the cart's server-calculated total, not a client amount", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const app = createApp();
    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });
    const cartPath = `/carts/${cart.body.id}`;

    for (let index = 0; index < 3; index++) {
      await request(app)
        .post(`${cartPath}/items`)
        .send({ pizzaId: "margherita", size: "M" })
        .expect(201);
    }

    const response = await request(app)
      .post(`${cartPath}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "client-amount-ignored",
        orderId: "untrusted-order-id",
        amountCents: 1,
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: { "Margherita (M)": 3 }
      });

    expect(response.status).toBe(201);
    expect([2700, 2160]).toContain(response.body.order.totalCents);
  });

  it("replays an idempotent checkout without processing payment twice", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = createApp();
    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });
    const cartPath = `/carts/${cart.body.id}`;

    for (let index = 0; index < 3; index++) {
      await request(app)
        .post(`${cartPath}/items`)
        .send({ pizzaId: "margherita", size: "M" })
        .expect(201);
    }

    const checkoutRequest = {
      clientId: "client-1",
      idempotencyKey: "replayed-checkout",
      preferredMethodId: "card",
      isDeliveryZoneSupported: true,
      isRestaurantOpen: true,
      stockByItem: { "Margherita (M)": 3 }
    };
    const first = await request(app).post(`${cartPath}/checkout`)
      .send(checkoutRequest);
    const duplicate = await request(app).post(`${cartPath}/checkout`)
      .send(checkoutRequest);

    expect(first.body.order.orderId).toBe(duplicate.body.order.orderId);
    expect(log).toHaveBeenCalledOnce();
    expect((await request(app).get("/clients/client-1/orders")).body.orders)
      .toHaveLength(1);
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
      .send({ pizzaId: "margherita", size: "M" })
      .expect(201);

    const checkout = await request(app)
      .post(`/carts/${cart.body.id}/checkout`)
      .send({
        clientId: "client-1",
        idempotencyKey: "invalid-checkout-1",
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: { "Margherita (M)": 1 }
      });

    expect(checkout.status).toBe(422);
    const history = await request(app).get("/clients/client-1/orders");
    expect(history.body).toEqual({ orders: [] });
  });

  it("keeps the existing health, menu, and order-validation routes available", async () => {
    const app = createApp();

    const health = await request(app).get("/health");
    const pizzerias = await request(app).get("/pizzerias");
    const validation = await request(app)
      .post("/orders/validate")
      .send({
        items: [{ name: "Pizza", unitPrice: 20, quantity: 1 }],
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: { Pizza: 1 }
      });

    expect(health.status).toBe(200);
    expect(pizzerias.status).toBe(200);
    expect(validation.status).toBe(200);
    expect(validation.body.validation).toEqual({ valid: true });
  });

  it("keeps the existing cart and custom-pizza routes available", async () => {
    const app = createApp();

    const cart = await request(app)
      .post("/carts")
      .send({ pizzeriaId: "da-michele" });
    const ingredients = await request(app).get("/pizzas/custom/ingredients");

    expect(cart.status).toBe(201);
    expect(cart.body.pizzeriaId).toBe("da-michele");
    expect(ingredients.status).toBe(200);
    expect(ingredients.body.ingredients).toHaveLength(6);
  });
});
