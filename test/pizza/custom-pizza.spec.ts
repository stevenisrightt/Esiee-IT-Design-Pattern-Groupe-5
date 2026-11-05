
import { describe, expect, it } from "vitest";

import { CustomPizzaService } from "@/pizza/custom-pizza";

import { CourseSizePricingDemo } from
  "@/pizza/course-size-pricing.demo";

import { AVAILABLE_INGREDIENTS } from
  "@/pizza/ingredients";

describe("US8 - Pizza personnalisée", () => {
  const service = new CustomPizzaService(
    new CourseSizePricingDemo()
  );

  it("propose les 6 ingrédients du professeur", () => {
    expect(AVAILABLE_INGREDIENTS).toHaveLength(6);
  });

  it("calcule une pizza Rossopomodoro en L", () => {
    const pizza = service.create({
      brand: "Rossopomodoro",
      base: "tomato",
      size: "L",
      ingredients: ["mozzarella", "pepperoni"]
    });

    expect(pizza.basePrice).toBe(5);
    expect(pizza.ingredientsPrice).toBe(3.5);
    expect(pizza.totalPrice).toBe(11.05);
  });

  it("accepte une base crème", () => {
    const pizza = service.create({
      brand: "Da Michele",
      base: "cream",
      size: "M",
      ingredients: []
    });

    expect(pizza.totalPrice).toBe(5);
  });

  it("applique le supplément XL de Da Michele", () => {
    const pizza = service.create({
      brand: "Da Michele",
      base: "tomato",
      size: "XL",
      ingredients: []
    });

    expect(pizza.totalPrice).toBe(10);
  });

  it("refuse une taille L chez Pizzium", () => {
    expect(() => service.create({
      brand: "Pizzium",
      base: "tomato",
      size: "L",
      ingredients: []
    })).toThrow();
  });

  it("crée un OrderItem compatible avec l'US2", () => {
    const pizza = service.create({
      brand: "Pizzium",
      base: "tomato",
      size: "M",
      ingredients: ["mozzarella"]
    });

    const item = service.toOrderItem(pizza, 2);

    expect(item.unitPrice).toBe(6.5);
    expect(item.quantity).toBe(2);
  });
});
