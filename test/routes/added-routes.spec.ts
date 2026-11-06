import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";

// Le dépôt de codes promo par défaut est partagé : codes uniques par test.
let counter = 0;
const uniqueCode = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

describe("GET /pizzerias/:id (US1)", () => {
  it("renvoie le menu d'une seule enseigne", async () => {
    const response = await request(createApp()).get("/pizzerias/da-michele");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("da-michele");
    expect(response.body.menu.length).toBeGreaterThan(0);
  });

  it("renvoie la même forme que la liste", async () => {
    const app = createApp();
    const list = await request(app).get("/pizzerias");
    const single = await request(app).get("/pizzerias/pizzium");

    expect(single.body).toEqual(list.body.find((p: { id: string }) => p.id === "pizzium"));
  });

  it("404 pour une enseigne inconnue", async () => {
    const response = await request(createApp()).get("/pizzerias/inconnue");
    expect(response.status).toBe(404);
  });
});

describe("/promo-codes (US2)", () => {
  it("crée un code puis le retrouve", async () => {
    const app = createApp();
    const code = uniqueCode("PROMO");

    const created = await request(app)
      .post("/promo-codes")
      .send({ code, type: "percentage", value: 10 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ code, type: "percentage", value: 10 });

    const found = await request(app).get(`/promo-codes/${code}`);
    expect(found.status).toBe(200);
    expect(found.body.value).toBe(10);
  });

  it("le code créé est appliqué par la validation de commande", async () => {
    const app = createApp();
    const code = uniqueCode("FIXE");
    await request(app).post("/promo-codes").send({ code, type: "fixed", value: 5 }).expect(201);

    const validation = await request(app).post("/orders/validate").send({
      items: [{ name: "Margherita", unitPrice: 20, quantity: 1 }],
      isDeliveryZoneSupported: true,
      isRestaurantOpen: true,
      stockByItem: { Margherita: 5 },
      enteredPromoCode: code
    });

    expect(validation.status).toBe(200);
    expect(validation.body.amountToPay).toBe(15);
  });

  it.each<[Record<string, unknown>, string]>([
    [{ type: "percentage", value: 10 }, "code manquant"],
    [{ code: "X", type: "inconnu", value: 10 }, "type invalide"],
    [{ code: "X", type: "fixed", value: 0 }, "valeur nulle"],
    [{ code: "X", type: "percentage", value: 150 }, "pourcentage > 100"]
  ])("400 si %o (%s)", async (body, _reason) => {
    const response = await request(createApp()).post("/promo-codes").send(body);
    expect(response.status).toBe(400);
  });

  it("409 si le code existe déjà", async () => {
    const app = createApp();
    const code = uniqueCode("DOUBLE");
    await request(app).post("/promo-codes").send({ code, type: "fixed", value: 2 }).expect(201);

    const again = await request(app).post("/promo-codes").send({ code, type: "fixed", value: 3 });
    expect(again.status).toBe(409);
  });

  it("404 pour un code inconnu", async () => {
    const response = await request(createApp()).get("/promo-codes/NEXISTEPAS");
    expect(response.status).toBe(404);
  });
});

describe("Paiements (US4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /payment-methods liste les moyens utilisables au checkout", async () => {
    const response = await request(createApp()).get("/payment-methods");

    expect(response.status).toBe(200);
    expect(response.body.methods).toEqual(["card", "wallet", "cash-on-delivery"]);
  });

  it("GET /clients/:id/payments renvoie le paiement fait au checkout", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const app = createApp();
    const cart = await request(app).post("/carts").send({ pizzeriaId: "da-michele" });
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post(`/carts/${cart.body.id}/items`)
        .send({ pizzaId: "margherita", size: "M" })
        .expect(201);
    }

    const checkout = await request(app).post(`/carts/${cart.body.id}/checkout`).send({
      clientId: "client-payments",
      idempotencyKey: "payments-route-1",
      preferredMethodId: "card",
      isDeliveryZoneSupported: true,
      isRestaurantOpen: true,
      stockByItem: { "Margherita (M)": 2 }
    });
    expect(checkout.body.payment.status).toBe("accepted");

    const response = await request(app).get("/clients/client-payments/payments");

    expect(response.status).toBe(200);
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.payments[0]).toMatchObject({
      clientId: "client-payments",
      methodId: "card",
      status: "accepted",
      amountCents: 1800
    });
  });

  it("l'historique des commandes reste accessible sur le même préfixe /clients", async () => {
    const response = await request(createApp()).get("/clients/personne/orders");
    expect(response.status).toBe(200);
    expect(response.body.orders).toEqual([]);
  });
});
