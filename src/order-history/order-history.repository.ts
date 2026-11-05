import type { HistoricalOrder } from "./order-history.model";

export class OrderHistoryConflictError extends Error {
  constructor(orderId: string) {
    super(`Une commande différente existe déjà pour l'identifiant ${orderId}.`);
    this.name = "OrderHistoryConflictError";
  }
}

export interface OrderHistoryRepository {
  findByClientId(clientId: string): Promise<readonly HistoricalOrder[]>;
  save(order: HistoricalOrder): Promise<void>;
}
