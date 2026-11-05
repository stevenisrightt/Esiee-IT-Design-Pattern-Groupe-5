
import { Router } from "express";
import { CustomPizzaService } from "@/pizza/custom-pizza";
import { CourseSizePricingDemo } from "@/pizza/course-size-pricing.demo";
import { AVAILABLE_INGREDIENTS } from "@/pizza/ingredients";

export const customPizzaRouter = Router();

const service = new CustomPizzaService(
  new CourseSizePricingDemo()
);

customPizzaRouter.get("/ingredients", (_req, res) => {
  res.json({ ingredients: AVAILABLE_INGREDIENTS });
});

customPizzaRouter.post("/", (req, res) => {
  try {
    const pizza = service.create(req.body);
    const orderItem = service.toOrderItem(
      pizza,
      req.body?.quantity ?? 1
    );

    res.status(201).json({ pizza, orderItem });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error
        ? error.message
        : "Requête invalide."
    });
  }
});
