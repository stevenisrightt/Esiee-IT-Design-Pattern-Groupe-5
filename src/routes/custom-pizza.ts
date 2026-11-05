
import { Router } from "express";

import { CustomPizzaService } from "@/pizza/custom-pizza";
import { PizzeriaCustomPricingAdapter } from "@/pizza/pizzeria-custom-pricing.adapter";
import { AVAILABLE_INGREDIENTS } from "@/pizza/ingredients";
import type { Pizzeria } from "@/pizza/pizzeria";

export function createCustomPizzaRouter(
  pizzerias: readonly Pizzeria[]
): Router {

  const router = Router();

  const service = new CustomPizzaService(
    new PizzeriaCustomPricingAdapter(pizzerias)
  );

  router.get("/ingredients", (_req, res) => {
    res.json({
      ingredients: AVAILABLE_INGREDIENTS
    });
  });

  router.post("/", (req, res) => {
    try {

      const pizza = service.create(req.body);

      const orderItem = service.toOrderItem(
        pizza,
        req.body?.quantity ?? 1
      );

      res.status(201).json({
        pizza,
        orderItem
      });

    } catch (error) {

      res.status(400).json({
        error: error instanceof Error
          ? error.message
          : "Requête invalide."
      });

    }
  });

  return router;
}
