import type { HistoricalOrder } from "./order-history.model";
import type { OrderHistoryRepository } from "./order-history.repository";

function copyOrder(order: HistoricalOrder): HistoricalOrder {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    items: order.items.map(item => ({ ...item }))
  };
}

export class InMemoryOrderHistoryRepository
implements OrderHistoryRepository {
  private readonly ordersById = new Map<string, HistoricalOrder>();

  constructor(initialOrders: readonly HistoricalOrder[] = []) {
    for (const order of initialOrders) {
      this.ordersById.set(order.orderId, copyOrder(order));
    }
  }

  async findByClientId(
    clientId: string
  ): Promise<readonly HistoricalOrder[]> {
    return [...this.ordersById.values()]
      .filter(order => order.clientId === clientId)
      .map(copyOrder);
  }

  async save(order: HistoricalOrder): Promise<void> {
    this.ordersById.set(order.orderId, copyOrder(order));
  }
}
