import {
  InvalidPaymentMethodError,
  InvalidPaymentRequestError,
  PaymentMethodsUnavailableError,
  PaymentTechnicalError,
  type PaymentAttemptFailure,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentResult
} from "./payment.types";

export class PaymentOrchestrator {
  private readonly methodsById: ReadonlyMap<string, PaymentMethod>;
  private readonly configuredMethods: readonly PaymentMethod[];

  constructor(methods: readonly PaymentMethod[]) {
    const methodsById = new Map<string, PaymentMethod>();

    for (const method of methods) {
      if (!method.id || methodsById.has(method.id)) {
        throw new Error(`Identifiant de moyen de paiement invalide : ${method.id}.`);
      }

      methodsById.set(method.id, method);
    }

    this.configuredMethods = [...methods];
    this.methodsById = methodsById;
  }

  async pay(
    request: PaymentRequest,
    preferredMethodId?: string
  ): Promise<PaymentResult> {
    this.validateRequest(request);

    const methods = this.selectMethods(preferredMethodId);
    const failures: PaymentAttemptFailure[] = [];

    for (const method of methods) {
      try {
        const result = await method.pay(request);

        if (result.status === "accepted" || result.status === "declined") {
          return result;
        }

        throw new Error(`Résultat de paiement invalide pour ${method.id}.`);
      } catch (error) {
        if (!(error instanceof PaymentTechnicalError)) {
          throw error;
        }

        if (!error.safeToRetry) {
          throw error;
        }

        failures.push({
          methodId: method.id,
          message: error.message
        });
      }
    }

    throw new PaymentMethodsUnavailableError(failures);
  }

  private selectMethods(preferredMethodId?: string): readonly PaymentMethod[] {
    if (preferredMethodId === undefined) {
      return this.configuredMethods;
    }

    const preferredMethod = this.methodsById.get(preferredMethodId);
    if (!preferredMethod) {
      throw new InvalidPaymentMethodError(preferredMethodId);
    }

    return [
      preferredMethod,
      ...this.configuredMethods.filter(method => method.id !== preferredMethodId)
    ];
  }

  private validateRequest(request: PaymentRequest): void {
    if (!request.orderId.trim() || !request.clientId.trim()) {
      throw new InvalidPaymentRequestError(
        "Les identifiants de commande et de client sont obligatoires."
      );
    }

    if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0) {
      throw new InvalidPaymentRequestError(
        "Le montant du paiement doit être un nombre entier positif de centimes."
      );
    }
  }
}
