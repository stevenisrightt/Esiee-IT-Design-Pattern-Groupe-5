
import express from "express";

import { healthRouter } from "@/routes/health";

import { customPizzaRouter } from "@/routes/custom-pizza";
import { orderValidationRouter } from "@/routes/order-validation";

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

  return app;
}

// Code d'Andy conservé
export let promoCodeStorage = new PromoCodeStorage();
export let discountStorage = new DiscountStorage();

discountStorage.addDiscountStrategy(new HappyHourDiscount());
discountStorage.addDiscountStrategy(new LoyaltyDiscount());
discountStorage.addDiscountStrategy(new PromoCodeDiscount());
