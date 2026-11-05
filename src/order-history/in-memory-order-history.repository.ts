import type { HistoricalOrder } from "./order-history.model";
import {
  OrderHistoryConflictError,
  type OrderHistoryRepository
} from "./order-history.repository";

function copyOrder(order: HistoricalOrder): HistoricalOrder {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    items: order.items.map(item => ({ ...item }))
  };
}

function sameOrder(left: HistoricalOrder, right: HistoricalOrder): boolean {
  return left.orderId === right.orderId &&
    left.clientId === right.clientId &&
    left.createdAt.getTime() === right.createdAt.getTime() &&
    left.status === right.status &&
    left.restaurantName === right.restaurantName &&
    left.totalCents === right.totalCents &&
    left.items.length === right.items.length &&
    left.items.every((item, index) => {
      const other = right.items[index];
      return item.name === other.name &&
        item.quantity === other.quantity &&
        item.unitPriceCents === other.unitPriceCents;
    });
}

export class InMemoryOrderHistoryRepository
implements OrderHistoryRepository {
  private readonly ordersById = new Map<string, HistoricalOrder>();

  constructor(initialOrders: readonly HistoricalOrder[] = []) {
    for (const order of initialOrders) {
      this.insert(order);
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
    this.insert(order);
  }

  private insert(order: HistoricalOrder): void {
    const existing = this.ordersById.get(order.orderId);
    if (existing) {
      if (!sameOrder(existing, order)) {
        throw new OrderHistoryConflictError(order.orderId);
      }
      return;
    }

    this.ordersById.set(order.orderId, copyOrder(order));
  }
}
