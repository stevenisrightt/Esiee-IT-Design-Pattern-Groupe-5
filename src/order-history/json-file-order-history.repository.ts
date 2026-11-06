import { JsonFileStore, SerialQueue } from "@/persistence/json-file.store";
import {
  isOrderStatus,
  type HistoricalOrder,
  type OrderStatus
} from "./order-history.model";
import {
  OrderHistoryConflictError,
  type OrderHistoryRepository
} from "./order-history.repository";

/** Forme d'une commande dans le fichier JSON (la date devient une chaîne ISO). */
interface StoredOrder {
  orderId: string;
  clientId: string;
  createdAt: string;
  status: OrderStatus;
  restaurantName: string;
  items: { name: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
}

function toStored(order: HistoricalOrder): StoredOrder {
  return {
    orderId: order.orderId,
    clientId: order.clientId,
    createdAt: order.createdAt.toISOString(),
    status: order.status,
    restaurantName: order.restaurantName,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents
    })),
    totalCents: order.totalCents
  };
}

function fromStored(order: StoredOrder): HistoricalOrder {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    items: order.items.map(item => ({ ...item }))
  };
}

function parseStored(value: unknown, filePath: string): StoredOrder {
  const order = value as Partial<StoredOrder> | null;
  const valid =
    typeof order === "object" &&
    order !== null &&
    typeof order.orderId === "string" &&
    typeof order.clientId === "string" &&
    typeof order.createdAt === "string" &&
    !Number.isNaN(Date.parse(order.createdAt)) &&
    typeof order.status === "string" &&
    isOrderStatus(order.status) &&
    typeof order.restaurantName === "string" &&
    typeof order.totalCents === "number" &&
    Array.isArray(order.items);

  if (!valid) {
    throw new Error(`Commande invalide dans ${filePath} : ${JSON.stringify(value)}.`);
  }

  return toStored(fromStored(order as StoredOrder));
}

/**
 * Adapter fichier JSON du port OrderHistoryRepository (architecture
 * hexagonale) : l'historique des commandes (US09) survit aux redémarrages.
 * OrderHistoryService et OrderPlacementService ne dépendent que du port, ils
 * n'ont pas changé (Dependency Inversion).
 *
 * Même contrat que InMemoryOrderHistoryRepository : enregistrer deux fois la
 * même commande ne fait rien, une commande différente avec le même id est
 * refusée.
 */
export class JsonFileOrderHistoryRepository implements OrderHistoryRepository {
  private readonly ordersById = new Map<string, StoredOrder>();
  private readonly queue = new SerialQueue();

  private constructor(
    private readonly store: JsonFileStore<StoredOrder>,
    initialOrders: readonly StoredOrder[]
  ) {
    for (const order of initialOrders) {
      this.ordersById.set(order.orderId, order);
    }
  }

  static async open(filePath: string): Promise<JsonFileOrderHistoryRepository> {
    const store = new JsonFileStore<StoredOrder>(filePath);
    const orders = (await store.readAll()).map(value =>
      parseStored(value, filePath)
    );
    return new JsonFileOrderHistoryRepository(store, orders);
  }

  async findByClientId(
    clientId: string
  ): Promise<readonly HistoricalOrder[]> {
    return [...this.ordersById.values()]
      .filter(order => order.clientId === clientId)
      .map(fromStored);
  }

  save(order: HistoricalOrder): Promise<void> {
    return this.queue.run(async () => {
      const record = toStored(order);
      const existing = this.ordersById.get(record.orderId);

      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) {
          throw new OrderHistoryConflictError(record.orderId);
        }
        return;
      }

      // Écrire d'abord : si le disque échoue, la commande n'est pas
      // considérée comme enregistrée et une nouvelle tentative réécrira.
      await this.store.writeAll([...this.ordersById.values(), record]);
      this.ordersById.set(record.orderId, record);
    });
  }
}
