export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderHistoryItem {
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export interface HistoricalOrder {
  readonly orderId: string;
  readonly clientId: string;
  readonly createdAt: Date;
  readonly status: OrderStatus;
  readonly restaurantName: string;
  readonly items: readonly OrderHistoryItem[];
  readonly totalCents: number;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}
