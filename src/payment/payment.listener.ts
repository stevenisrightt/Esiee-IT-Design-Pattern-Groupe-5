import type { PaymentRequest, PaymentResult } from "./payment.types";
import type { PaymentRepository } from "./payment-record.repository";

/**
 * Observer : réagit à chaque paiement terminé (accepté ou refusé).
 * Le PaymentOrchestrator est le sujet ; on ajoute un comportement en
 * abonnant un listener, sans modifier l'orchestrateur (comme les
 * OrderStatusListener de l'US05).
 */
export interface PaymentListener {
  onPaymentCompleted(
    request: PaymentRequest,
    result: PaymentResult
  ): void | Promise<void>;
}

/** Listener de persistance : journalise chaque paiement dans le PaymentRepository. */
export class PaymentJournalListener implements PaymentListener {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async onPaymentCompleted(
    request: PaymentRequest,
    result: PaymentResult
  ): Promise<void> {
    const base = {
      orderId: request.orderId,
      clientId: request.clientId,
      amountCents: request.amountCents,
      methodId: result.methodId,
      recordedAt: this.now()
    };

    await this.repository.save(
      result.status === "accepted"
        ? { ...base, status: "accepted", transactionId: result.transactionId }
        : { ...base, status: "declined", reason: result.reason }
    );
  }
}
