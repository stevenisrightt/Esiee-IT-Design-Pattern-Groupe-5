import type {
  HistoricalOrder,
  OrderStatus
} from "./order-history.model";
import { Order, OrderItem } from "@/orders/order.model";
import type { OrderStatusListener } from "@/notifications/order-status.listener";
import { SerialQueue } from "@/persistence/json-file.store";
import {
  OrderHistoryNotFoundError,
  type OrderHistoryRepository
} from "./order-history.repository";

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: []
};

export class OrderStatusTransitionError extends Error {
  constructor(current: OrderStatus, requested: OrderStatus) {
    super(`Transition de statut interdite : ${current} vers ${requested}.`);
    this.name = "OrderStatusTransitionError";
  }
}

export class OrderHistoryPersistenceError extends Error {
  constructor(orderId: string, cause: unknown) {
    super(`Impossible d'enregistrer le statut de la commande ${orderId}.`, {
      cause
    });
    this.name = "OrderHistoryPersistenceError";
  }
}

export class OrderHistoryService {
  private readonly statusQueue = new SerialQueue();

  constructor(
    private readonly repository: OrderHistoryRepository,
    private readonly statusListeners: readonly OrderStatusListener[] = []
  ) {}

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

    return this.statusQueue.run(() =>
      this.updateClientOrderStatus(clientId, orderId, status)
    );
  }

  private async updateClientOrderStatus(
    clientId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<HistoricalOrder> {
    const orders = await this.repository.findByClientId(clientId);
    const existing = orders.find(order => order.orderId === orderId);
    if (!existing) {
      throw new OrderHistoryNotFoundError(orderId);
    }

    if (existing.status === status) {
      return existing;
    }

    if (!ALLOWED_STATUS_TRANSITIONS[existing.status].includes(status)) {
      throw new OrderStatusTransitionError(existing.status, status);
    }

    let updated: HistoricalOrder;
    try {
      updated = await this.repository.updateStatus(orderId, status);
    } catch (error) {
      console.error(
        `[historique] Échec de persistance du statut de la commande ${orderId}.`,
        error
      );
      throw new OrderHistoryPersistenceError(orderId, error);
    }

    const order = new Order(
      existing.items.map(item => new OrderItem(
        item.name,
        item.unitPriceCents / 100,
        item.quantity
      )),
      undefined,
      { orderId: existing.orderId, status: existing.status }
    );
    for (const listener of this.statusListeners) {
      order.subscribe(listener);
    }
    order.changeStatus(updated.status);

    return updated;
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
