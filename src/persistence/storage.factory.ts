import { join } from "node:path";
import { InMemoryOrderHistoryRepository } from "@/order-history/in-memory-order-history.repository";
import { JsonFileOrderHistoryRepository } from "@/order-history/json-file-order-history.repository";
import type { OrderHistoryRepository } from "@/order-history/order-history.repository";
import { InMemoryPaymentRepository } from "@/payment/in-memory-payment-record.repository";
import { JsonFilePaymentRepository } from "@/payment/json-file-payment-record.repository";
import type { PaymentRepository } from "@/payment/payment-record.repository";

/**
 * Abstract Factory : crée une famille cohérente de repositories (commandes
 * US09 + paiements US04) sans que l'application connaisse les classes
 * concrètes. Changer de stockage = fournir une autre fabrique ; ajouter un
 * stockage (ex. base de données) = ajouter une classe, sans toucher createApp.
 */
export interface StorageFactory {
  createOrderHistoryRepository(): OrderHistoryRepository;
  createPaymentRepository(): PaymentRepository;
}

/** Famille "mémoire" : rien n'est conservé à l'arrêt (tests). */
export class InMemoryStorageFactory implements StorageFactory {
  createOrderHistoryRepository(): OrderHistoryRepository {
    return new InMemoryOrderHistoryRepository();
  }

  createPaymentRepository(): PaymentRepository {
    return new InMemoryPaymentRepository();
  }
}

/**
 * Famille "fichiers JSON" : persistance durable dans `dataDir`.
 * Les fichiers sont chargés une seule fois à l'ouverture, et chaque fichier
 * n'a qu'un seul repository propriétaire (toujours la même instance).
 */
export class JsonFileStorageFactory implements StorageFactory {
  private constructor(
    private readonly orderHistory: JsonFileOrderHistoryRepository,
    private readonly payments: JsonFilePaymentRepository
  ) {}

  static async open(dataDir: string): Promise<JsonFileStorageFactory> {
    const [orderHistory, payments] = await Promise.all([
      JsonFileOrderHistoryRepository.open(join(dataDir, "order-history.json")),
      JsonFilePaymentRepository.open(join(dataDir, "payments.json"))
    ]);
    return new JsonFileStorageFactory(orderHistory, payments);
  }

  createOrderHistoryRepository(): OrderHistoryRepository {
    return this.orderHistory;
  }

  createPaymentRepository(): PaymentRepository {
    return this.payments;
  }
}
