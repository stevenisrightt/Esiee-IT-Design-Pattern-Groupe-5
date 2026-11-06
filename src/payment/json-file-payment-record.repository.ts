import { JsonFileStore, SerialQueue } from "@/persistence/json-file.store";
import { InMemoryPaymentRepository } from "./in-memory-payment-record.repository";
import type { PaymentRecord, PaymentRepository } from "./payment-record.repository";

type StoredPaymentRecord = Omit<PaymentRecord, "recordedAt"> & {
  recordedAt: string;
};

function toStored(record: PaymentRecord): StoredPaymentRecord {
  return { ...record, recordedAt: record.recordedAt.toISOString() };
}

function fromStored(value: unknown, filePath: string): PaymentRecord {
  const record = value as Record<string, unknown> | null;
  const valid =
    typeof record === "object" &&
    record !== null &&
    typeof record.orderId === "string" &&
    typeof record.clientId === "string" &&
    typeof record.amountCents === "number" &&
    typeof record.methodId === "string" &&
    typeof record.recordedAt === "string" &&
    !Number.isNaN(Date.parse(record.recordedAt)) &&
    ((record.status === "accepted" && typeof record.transactionId === "string") ||
      (record.status === "declined" && typeof record.reason === "string"));

  if (!valid) {
    throw new Error(`Paiement invalide dans ${filePath} : ${JSON.stringify(value)}.`);
  }

  const stored = record as unknown as StoredPaymentRecord;
  return { ...stored, recordedAt: new Date(stored.recordedAt) } as PaymentRecord;
}

/**
 * Adapter fichier JSON du port PaymentRepository : les paiements survivent
 * à un redémarrage du serveur.
 */
export class JsonFilePaymentRepository implements PaymentRepository {
  private readonly queue = new SerialQueue();

  private constructor(
    private readonly store: JsonFileStore<StoredPaymentRecord>,
    private readonly memory: InMemoryPaymentRepository
  ) {}

  static async open(filePath: string): Promise<JsonFilePaymentRepository> {
    const store = new JsonFileStore<StoredPaymentRecord>(filePath);
    const records = (await store.readAll()).map(value =>
      fromStored(value, filePath)
    );
    return new JsonFilePaymentRepository(
      store,
      new InMemoryPaymentRepository(records)
    );
  }

  save(record: PaymentRecord): Promise<void> {
    return this.queue.run(async () => {
      const next = new InMemoryPaymentRepository(this.memory.all());
      await next.save(record);

      // Écrire d'abord, puis mettre à jour la mémoire : en cas d'échec disque,
      // l'état en mémoire reste identique au fichier.
      await this.store.writeAll(next.all().map(toStored));
      await this.memory.save(record);
    });
  }

  findByOrderId(orderId: string): Promise<PaymentRecord | undefined> {
    return this.memory.findByOrderId(orderId);
  }

  findByClientId(clientId: string): Promise<readonly PaymentRecord[]> {
    return this.memory.findByClientId(clientId);
  }
}
