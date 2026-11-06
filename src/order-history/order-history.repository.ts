import type { HistoricalOrder, OrderStatus } from "./order-history.model";

export class OrderHistoryConflictError extends Error {
  constructor(orderId: string) {
    super(`Une commande différente existe déjà pour l'identifiant ${orderId}.`);
    this.name = "OrderHistoryConflictError";
  }
}

export class OrderHistoryNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Aucune commande n'existe dans l'historique pour l'identifiant ${orderId}.`);
    this.name = "OrderHistoryNotFoundError";
  }
}

export interface OrderHistoryRepository {
  findByClientId(clientId: string): Promise<readonly HistoricalOrder[]>;
  updateStatus(orderId: string, status: OrderStatus): Promise<HistoricalOrder>;
  save(order: HistoricalOrder): Promise<void>;
}
