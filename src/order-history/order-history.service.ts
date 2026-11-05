import type {
  HistoricalOrder,
  OrderStatus
} from "./order-history.model";
import type { OrderHistoryRepository } from "./order-history.repository";

export class OrderHistoryService {
  constructor(private readonly repository: OrderHistoryRepository) {}

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
