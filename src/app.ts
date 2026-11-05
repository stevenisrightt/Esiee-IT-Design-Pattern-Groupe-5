
import express from "express";

import { healthRouter } from "@/routes/health";

import { customPizzaRouter } from "@/routes/custom-pizza";
import { orderValidationRouter } from "@/routes/order-validation";

import { createPizzeriaRouter } from "@/pizza/pizzeria.routes";
import { createCartRouter } from "@/cart/cart.routes";
import { DaMichelePizzeria } from "@/pizza/pizzerias/da-michele.pizzeria";
import { RossopomodoroPizzeria } from "@/pizza/pizzerias/rossopomodoro.pizzeria";
import { PizziumPizzeria } from "@/pizza/pizzerias/pizzium.pizzeria";

import {
  DiscountStorage,
  PromoCodeStorage
} from "@/pricing/pricing.storage";

import {
  HappyHourDiscount,
  LoyaltyDiscount,
  PromoCodeDiscount
} from "./pricing/discounts";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use("/health", healthRouter);

  // Tes routes US3 et US8
  app.use("/pizzas/custom", customPizzaRouter);
  app.use("/orders/validate", orderValidationRouter);

  // US1 et US6
  const pizzerias = [
    new DaMichelePizzeria(),
    new RossopomodoroPizzeria(),
    new PizziumPizzeria()
  ];
  app.use("/pizzerias", createPizzeriaRouter(pizzerias));
  app.use("/carts", createCartRouter(pizzerias));

  return app;
}

// Code d'Andy conservé
export let promoCodeStorage = new PromoCodeStorage();
export let discountStorage = new DiscountStorage();

discountStorage.addDiscountStrategy(new HappyHourDiscount());
discountStorage.addDiscountStrategy(new LoyaltyDiscount());
discountStorage.addDiscountStrategy(new PromoCodeDiscount());
