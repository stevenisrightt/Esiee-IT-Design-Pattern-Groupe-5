import type {
  PaymentMethod,
  PaymentRequest,
  PaymentResult
} from "./payment.types";
import {
  ProviderUnavailableError,
  type CardProcessor,
  type CashOnDeliveryProcessor,
  type ProviderPaymentOutcome,
  type WalletProcessor
} from "./payment-providers";
import {
  PaymentOutcomeUnknownError,
  PaymentTechnicalError
} from "./payment.types";

function adaptOutcome(
  methodId: string,
  outcome: ProviderPaymentOutcome
): PaymentResult {
  if (
    outcome.status === "accepted" &&
    typeof outcome.transactionId === "string" &&
    outcome.transactionId.trim().length > 0
  ) {
    return {
      status: "accepted",
      methodId,
      transactionId: outcome.transactionId
    };
  }

  if (outcome.status === "declined" && typeof outcome.reason === "string") {
    return { status: "declined", methodId, reason: outcome.reason };
  }

  throw new PaymentOutcomeUnknownError(
    methodId,
    `Réponse invalide du prestataire ${methodId}.`
  );
}

async function callProvider(
  methodId: string,
  operation: () => Promise<ProviderPaymentOutcome>
): Promise<PaymentResult> {
  try {
    return adaptOutcome(methodId, await operation());
  } catch (error) {
    if (error instanceof ProviderUnavailableError) {
      throw new PaymentTechnicalError(
        methodId,
        error.message,
        true,
        { cause: error }
      );
    }

    if (error instanceof PaymentTechnicalError) {
      throw error;
    }

    throw new PaymentOutcomeUnknownError(
      methodId,
      error instanceof Error
        ? error.message
        : "Le résultat du paiement est inconnu.",
      { cause: error }
    );
  }
}

export class CardPaymentAdapter implements PaymentMethod {
  readonly id = "card";

  constructor(private readonly processor: CardProcessor) {}

  pay(request: PaymentRequest): Promise<PaymentResult> {
    return callProvider(
      this.id,
      () => this.processor.chargeCard(request.orderId, request.amountCents)
    );
  }
}

export class WalletPaymentAdapter implements PaymentMethod {
  readonly id = "wallet";

  constructor(private readonly processor: WalletProcessor) {}

  pay(request: PaymentRequest): Promise<PaymentResult> {
    return callProvider(this.id, () =>
      this.processor.submitWalletPayment({
        walletOwnerId: request.clientId,
        reference: request.orderId,
        amount: request.amountCents / 100,
        currency: "EUR"
      })
    );
  }
}

export class CashOnDeliveryPaymentAdapter implements PaymentMethod {
  readonly id = "cash-on-delivery";

  constructor(private readonly processor: CashOnDeliveryProcessor) {}

  pay(request: PaymentRequest): Promise<PaymentResult> {
    return callProvider(
      this.id,
      () => this.processor.scheduleCashCollection(
        request.orderId,
        request.amountCents,
        request.clientId
      )
    );
  }
}
