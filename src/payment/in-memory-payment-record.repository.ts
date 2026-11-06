import {
  copyPaymentRecord,
  type PaymentRecord,
  type PaymentRepository
} from "./payment-record.repository";

/** Adapter mémoire du port PaymentRepository (tests, démo). */
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly recordsByOrderId = new Map<string, PaymentRecord>();

  constructor(initialRecords: readonly PaymentRecord[] = []) {
    for (const record of initialRecords) {
      this.recordsByOrderId.set(record.orderId, copyPaymentRecord(record));
    }
  }

  async save(record: PaymentRecord): Promise<void> {
    this.recordsByOrderId.set(record.orderId, copyPaymentRecord(record));
  }

  async findByOrderId(orderId: string): Promise<PaymentRecord | undefined> {
    const record = this.recordsByOrderId.get(orderId);
    return record && copyPaymentRecord(record);
  }

  async findByClientId(clientId: string): Promise<readonly PaymentRecord[]> {
    return [...this.recordsByOrderId.values()]
      .filter(record => record.clientId === clientId)
      .map(copyPaymentRecord);
  }

  all(): PaymentRecord[] {
    return [...this.recordsByOrderId.values()].map(copyPaymentRecord);
  }
}
