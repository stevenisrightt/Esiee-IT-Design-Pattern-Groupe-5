import { Router } from "express";
import type { PaymentRepository } from "./payment-record.repository";

/** GET /payment-methods : moyens acceptés au checkout (US04). */
export function createPaymentMethodsRouter(
  availableMethodIds: () => readonly string[]
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ methods: availableMethodIds() });
  });

  return router;
}

/** GET /clients/:clientId/payments : paiements persistés d'un client (US04). */
export function createClientPaymentsRouter(
  payments: PaymentRepository
): Router {
  const router = Router();

  router.get("/:clientId/payments", async (req, res) => {
    const { clientId } = req.params;
    if (!clientId.trim()) {
      res.status(400).json({ error: "L'identifiant du client est obligatoire." });
      return;
    }

    const records = await payments.findByClientId(clientId);
    res.json({
      payments: [...records].sort(
        (left, right) => right.recordedAt.getTime() - left.recordedAt.getTime()
      )
    });
  });

  return router;
}
