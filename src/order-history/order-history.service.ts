import type {
  HistoricalOrder,
  OrderStatus
} from "./order-history.model";
import {
  OrderHistoryNotFoundError,
  type OrderHistoryRepository
} from "./order-history.repository";

export class OrderHistoryService {
  constructor(private readonly repository: OrderHistoryRepository) {}

  updateStatus(
    clientId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<HistoricalOrder> {
    if (!clientId.trim()) {
      throw new Error("L'identifiant du client est obligatoire.");
    }

    if (!orderId.trim()) {
      throw new Error("L'identifiant de la commande est obligatoire.");
    }

    return this.updateClientOrderStatus(clientId, orderId, status);
  }

  private async updateClientOrderStatus(
    clientId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<HistoricalOrder> {
    const orders = await this.repository.findByClientId(clientId);
    if (!orders.some(order => order.orderId === orderId)) {
      throw new OrderHistoryNotFoundError(orderId);
    }

    return this.repository.updateStatus(orderId, status);
  }

  async getOrders(
    clientId: string,
    status?: OrderStatus
  ): Promise<readonly HistoricalOrder[]> {
    if (!clientId.trim()) {
      throw new Error("L'identifiant du client est obligatoire.");
    }

    const orders = await this.repository.findByClientId(clientId);

    return orders
      .filter(order => status === undefined || order.status === status)
      .sort((left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime()
      );
  }
}
