import { Router } from "express";

export function createPaymentRouter(): Router {
  const router = Router();

  router.post("/", (_req, res) => {
    res.status(410).json({
      error: "Le paiement doit être effectué via le checkout du panier.",
      checkoutEndpoint: "POST /carts/:id/checkout"
    });
  });

  return router;
}
