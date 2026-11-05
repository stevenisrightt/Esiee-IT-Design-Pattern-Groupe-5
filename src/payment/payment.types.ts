export interface PaymentRequest {
  readonly orderId: string;
  readonly clientId: string;
  readonly amountCents: number;
}

export type PaymentResult =
  | {
      readonly status: "accepted";
      readonly methodId: string;
      readonly transactionId: string;
    }
  | {
      readonly status: "declined";
      readonly methodId: string;
      readonly reason: string;
    };

export interface PaymentMethod {
  readonly id: string;
  pay(request: PaymentRequest): Promise<PaymentResult>;
}

export class InvalidPaymentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentRequestError";
  }
}

export class InvalidPaymentMethodError extends Error {
  constructor(methodId: string) {
    super(`Moyen de paiement inconnu ou indisponible : ${methodId}.`);
    this.name = "InvalidPaymentMethodError";
  }
}

export class PaymentTechnicalError extends Error {
  constructor(
    readonly methodId: string,
    message: string,
    readonly safeToRetry: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PaymentTechnicalError";
  }
}

export class PaymentOutcomeUnknownError extends PaymentTechnicalError {
  constructor(
    methodId: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(methodId, message, false, options);
    this.name = "PaymentOutcomeUnknownError";
  }
}

export interface PaymentAttemptFailure {
  readonly methodId: string;
  readonly message: string;
}

export class PaymentMethodsUnavailableError extends Error {
  constructor(readonly failures: readonly PaymentAttemptFailure[]) {
    super("Aucun moyen de paiement n'est actuellement disponible.");
    this.name = "PaymentMethodsUnavailableError";
  }
}
