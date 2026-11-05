
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@/app";

describe("Integration US8 avec US1", () => {

  it("calcule le prix selon Rossopomodoro", async () => {

    const response = await request(createApp())
      .post("/pizzas/custom")
      .send({
        brand: "Rossopomodoro",
        base: "tomato",
        size: "L",
        ingredients: [
          "mozzarella",
          "pepperoni"
        ],
        quantity: 2
      });

    expect(response.status).toBe(201);
    expect(response.body.pizza.totalPrice).toBe(11.05);

    expect(response.body.orderItem).toMatchObject({
      unitPrice: 11.05,
      quantity: 2
    });
  });

  it("refuse la taille L chez Pizzium", async () => {

    const response = await request(createApp())
      .post("/pizzas/custom")
      .send({
        brand: "Pizzium",
        base: "cream",
        size: "L",
        ingredients: []
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("taille L");
  });

});
