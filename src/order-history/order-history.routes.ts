import { Router, type Request, type Response } from "express";
import { isOrderStatus } from "./order-history.model";
import { OrderHistoryService } from "./order-history.service";

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

  return router;
}
