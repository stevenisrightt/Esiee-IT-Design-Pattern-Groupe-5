import { Router, type Request, type Response } from "express";
import { isOrderStatus } from "./order-history.model";
import {
  OrderHistoryPersistenceError,
  OrderHistoryService,
  OrderStatusTransitionError
} from "./order-history.service";
import { OrderHistoryNotFoundError } from "./order-history.repository";

export function createOrderHistoryRouter(
  service: OrderHistoryService
): Router {
  const router = Router();

  router.get("/:clientId/orders", async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const statusQuery = req.query.status;

    if (typeof clientId !== "string" || !clientId.trim()) {
      res.status(400).json({ error: "L'identifiant du client est obligatoire." });
      return;
    }

    if (statusQuery !== undefined && typeof statusQuery !== "string") {
      res.status(400).json({ error: "Le statut doit être une valeur unique." });
      return;
    }

    if (typeof statusQuery === "string" && !isOrderStatus(statusQuery)) {
      res.status(400).json({ error: "Statut de commande invalide." });
      return;
    }

    const orders = await service.getOrders(
      clientId,
      typeof statusQuery === "string" ? statusQuery : undefined
    );

    res.status(200).json({ orders });
  });

  router.patch(
    "/:clientId/orders/:orderId/status",
    async (req: Request, res: Response) => {
      const { clientId, orderId } = req.params;
      const status = req.body?.status;

      if (
        typeof clientId !== "string" ||
        !clientId.trim() ||
        typeof orderId !== "string" ||
        !orderId.trim()
      ) {
        res.status(400).json({ error: "L'identifiant de la commande est obligatoire." });
        return;
      }

      if (typeof status !== "string" || !isOrderStatus(status)) {
        res.status(400).json({ error: "Statut de commande invalide." });
        return;
      }

      try {
        const order = await service.updateStatus(clientId, orderId, status);
        res.status(200).json({ order });
      } catch (error) {
        if (error instanceof OrderHistoryNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }

        if (error instanceof OrderStatusTransitionError) {
          res.status(409).json({ error: error.message });
          return;
        }

        if (error instanceof OrderHistoryPersistenceError) {
          res.status(503).json({ error: error.message });
          return;
        }

        throw error;
      }
    }
  );

  return router;
}
