import type { HistoricalOrder } from "./order-history.model";

export interface OrderHistoryRepository {
  findByClientId(clientId: string): Promise<readonly HistoricalOrder[]>;
  save(order: HistoricalOrder): Promise<void>;
}
