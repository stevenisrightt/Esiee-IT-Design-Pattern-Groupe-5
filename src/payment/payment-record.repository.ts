/** Trace d'un paiement (US04) : accepté ou refusé, avec le moyen utilisé. */
export type PaymentRecord =
  | {
      readonly orderId: string;
      readonly clientId: string;
      readonly amountCents: number;
      readonly methodId: string;
      readonly status: "accepted";
      readonly transactionId: string;
      readonly recordedAt: Date;
    }
  | {
      readonly orderId: string;
      readonly clientId: string;
      readonly amountCents: number;
      readonly methodId: string;
      readonly status: "declined";
      readonly reason: string;
      readonly recordedAt: Date;
    };

/**
 * Port (architecture hexagonale) : ce dont le domaine a besoin pour
 * conserver les paiements. Les adapters (mémoire, fichier JSON) l'implémentent ;
 * le domaine ne dépend que de cette interface (Dependency Inversion).
 */
export interface PaymentRepository {
  save(record: PaymentRecord): Promise<void>;
  findByOrderId(orderId: string): Promise<PaymentRecord | undefined>;
  findByClientId(clientId: string): Promise<readonly PaymentRecord[]>;
}

export function copyPaymentRecord(record: PaymentRecord): PaymentRecord {
  return { ...record, recordedAt: new Date(record.recordedAt) };
}
