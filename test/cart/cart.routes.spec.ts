import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCartRouter } from "@/cart/cart.routes";
import { createPizzeriaRouter } from "@/pizza/pizzeria.routes";
import { DaMichelePizzeria } from "@/pizza/pizzerias/da-michele.pizzeria";
import { RossopomodoroPizzeria } from "@/pizza/pizzerias/rossopomodoro.pizzeria";
import { PizziumPizzeria } from "@/pizza/pizzerias/pizzium.pizzeria";

function createTestApp() {
    const pizzerias = [
        new DaMichelePizzeria(),
        new RossopomodoroPizzeria(),
        new PizziumPizzeria(),
    ];
    const app = express();
    app.use(express.json());
    app.use("/pizzerias", createPizzeriaRouter(pizzerias));
    app.use("/carts", createCartRouter(pizzerias));
    return app;
}

// Crée un panier et renvoie l'application et l'URL du panier
async function createCart(pizzeriaId: string) {
    const app = createTestApp();
    const response = await request(app).post("/carts").send({ pizzeriaId });
    return { app, url: `/carts/${response.body.id}` };
}

describe("US1 - GET /pizzerias", () => {
    it("liste les 3 enseignes avec leur menu et leurs prix", async () => {
        const response = await request(createTestApp()).get("/pizzerias");

        expect(response.status).toBe(200);
        expect(response.body.map((p: { id: string }) => p.id)).toEqual([
            "da-michele",
            "rossopomodoro",
            "pizzium",
        ]);
        expect(response.body[1].menu[0]).toMatchObject({
            id: "supreme",
            prices: { S: 9.6, M: 12, L: 15.6, XL: 18 },
        });
        expect(response.body[2].menu[0].prices).toEqual({ M: 10 });
    });
});

describe("US6 - Routes du panier", () => {
    it("crée un panier vide pour une enseigne", async () => {
        const response = await request(createTestApp())
            .post("/carts")
            .send({ pizzeriaId: "da-michele" });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            pizzeriaId: "da-michele",
            items: [],
            total: 0,
        });
    });

    it("refuse une enseigne inconnue", async () => {
        const response = await request(createTestApp())
            .post("/carts")
            .send({ pizzeriaId: "inconnue" });

        expect(response.status).toBe(404);
    });

    it("renvoie 404 pour un panier inconnu", async () => {
        const response = await request(createTestApp()).get("/carts/42");

        expect(response.status).toBe(404);
    });

    it("ajoute des pizzas et calcule le total", async () => {
        const { app, url } = await createCart("rossopomodoro");

        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "supreme", size: "L" });
        const response = await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "diavola", size: "S" });

        expect(response.status).toBe(201);
        expect(response.body.items).toHaveLength(2);
        expect(response.body.total).toBe(24.4);
    });

    it("refuse une pizza hors menu ou une taille indisponible", async () => {
        const { app, url } = await createCart("pizzium");

        const notInMenu = await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "supreme", size: "M" });
        const wrongSize = await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "napolitaine", size: "L" });

        expect(notInMenu.status).toBe(400);
        expect(wrongSize.status).toBe(400);
    });

    it("change la taille puis supprime un article", async () => {
        const { app, url } = await createCart("da-michele");
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "margherita", size: "M" });

        const patched = await request(app)
            .patch(`${url}/items/1`)
            .send({ size: "XL" });
        expect(patched.body.items[0]).toMatchObject({ size: "XL", price: 14 });

        const deleted = await request(app).delete(`${url}/items/1`);
        expect(deleted.body.items).toEqual([]);
    });

    it("renvoie 404 pour un article inconnu", async () => {
        const { app, url } = await createCart("da-michele");

        const response = await request(app)
            .patch(`${url}/items/99`)
            .send({ size: "L" });

        expect(response.status).toBe(404);
    });

    it("annule et rétablit une modification", async () => {
        const { app, url } = await createCart("da-michele");
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "margherita", size: "M" });
        await request(app).patch(`${url}/items/1`).send({ size: "L" });

        const undone = await request(app).post(`${url}/undo`);
        expect(undone.body.items[0].size).toBe("M");

        const redone = await request(app).post(`${url}/redo`);
        expect(redone.body.items[0].size).toBe("L");
    });

    it("une requête refusée n'est pas enregistrée dans l'historique", async () => {
        const { app, url } = await createCart("da-michele");
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "margherita", size: "M" });
        await request(app).patch(`${url}/items/99`).send({ size: "L" });

        const response = await request(app).post(`${url}/undo`);

        // L'undo annule l'ajout, pas la requête refusée
        expect(response.body.items).toEqual([]);
    });
});

describe("US8 dans le panier - POST /carts/:id/custom-items", () => {
    it("ajoute une pizza personnalisée au prix de l'enseigne", async () => {
        const { app, url } = await createCart("rossopomodoro");

        const response = await request(app)
            .post(`${url}/custom-items`)
            .send({ base: "tomato", size: "L", ingredients: ["mozzarella", "olives"] });

        // (5 + 1.5 + 1) × 1.3
        expect(response.status).toBe(201);
        expect(response.body.items[0].price).toBe(9.75);
    });

    it("le changement de taille et l'undo fonctionnent aussi", async () => {
        const { app, url } = await createCart("rossopomodoro");
        await request(app)
            .post(`${url}/custom-items`)
            .send({ base: "tomato", size: "L", ingredients: ["mozzarella", "olives"] });

        const patched = await request(app)
            .patch(`${url}/items/1`)
            .send({ size: "XL" });
        expect(patched.body.items[0].price).toBe(11.25);

        const undone = await request(app).post(`${url}/undo`);
        expect(undone.body.items[0].price).toBe(9.75);
    });

    it("refuse une base ou un ingrédient invalide", async () => {
        const { app, url } = await createCart("da-michele");

        const badBase = await request(app)
            .post(`${url}/custom-items`)
            .send({ base: "bbq", size: "M", ingredients: [] });
        const badIngredient = await request(app)
            .post(`${url}/custom-items`)
            .send({ base: "cream", size: "M", ingredients: ["ananas"] });

        expect(badBase.status).toBe(400);
        expect(badIngredient.status).toBe(400);
    });

    it("refuse une taille indisponible dans l'enseigne", async () => {
        const { app, url } = await createCart("pizzium");

        const response = await request(app)
            .post(`${url}/custom-items`)
            .send({ base: "cream", size: "L", ingredients: [] });

        expect(response.status).toBe(400);
    });
});

describe("US3 depuis le panier - POST /carts/:id/validate", () => {
    const context = {
        isDeliveryZoneSupported: true,
        isRestaurantOpen: true,
        stockByItem: { "Supreme (L)": 5, "Diavola (S)": 5 },
    };

    // Hors Happy Hour, pour que le montant ne dépende pas de l'heure réelle
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2024-06-16T12:00:00"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function createFilledCart() {
        const { app, url } = await createCart("rossopomodoro");
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "supreme", size: "L" });
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "diavola", size: "S" });
        return { app, url };
    }

    it("valide un panier correct", async () => {
        const { app, url } = await createFilledCart();

        const response = await request(app).post(`${url}/validate`).send(context);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            subtotal: 24.4,
            amountToPay: 24.4,
            validation: { valid: true },
        });
    });

    it("refuse un panier vide", async () => {
        const { app, url } = await createCart("rossopomodoro");

        const response = await request(app).post(`${url}/validate`).send(context);

        expect(response.status).toBe(422);
        expect(response.body.validation.rule).toBe("cart");
    });

    it("refuse un panier sous le montant minimum", async () => {
        const { app, url } = await createCart("pizzium");
        await request(app)
            .post(`${url}/items`)
            .send({ pizzaId: "napolitaine", size: "M" });

        const response = await request(app)
            .post(`${url}/validate`)
            .send({ ...context, stockByItem: { "Napolitaine (M)": 5 } });

        expect(response.status).toBe(422);
        expect(response.body.validation.rule).toBe("minimum-amount");
    });

    it("valide les articles du panier, pas ceux du corps de la requête", async () => {
        const { app, url } = await createCart("rossopomodoro");

        const response = await request(app)
            .post(`${url}/validate`)
            .send({
                ...context,
                items: [{ name: "Supreme (L)", unitPrice: 50, quantity: 1 }],
            });

        expect(response.body.validation.rule).toBe("cart");
    });

    it("refuse une requête sans contexte de livraison", async () => {
        const { app, url } = await createFilledCart();

        const response = await request(app).post(`${url}/validate`).send({});

        expect(response.status).toBe(400);
    });
});
