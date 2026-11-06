import {
  InvalidPaymentMethodError,
  InvalidPaymentRequestError,
  PaymentMethodsUnavailableError,
  PaymentOutcomeUnknownError,
  PaymentTechnicalError,
  type PaymentAttemptFailure,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentResult
} from "./payment.types";
import type { PaymentListener } from "./payment.listener";

export class PaymentOrchestrator {
  private readonly methodsById: ReadonlyMap<string, PaymentMethod>;
  private readonly configuredMethods: readonly PaymentMethod[];
  private listeners: PaymentListener[] = [];

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

  // Observer : abonnement des listeners notifiés à chaque paiement terminé.
  subscribe(listener: PaymentListener): void {
    if (!this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }

  unsubscribe(listener: PaymentListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
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
          await this.notify(request, result);
          return result;
        }

        throw new PaymentOutcomeUnknownError(
          method.id,
          `Résultat de paiement invalide pour ${method.id}.`
        );
      } catch (error) {
        if (error instanceof PaymentTechnicalError) {
          if (!error.safeToRetry) {
            throw error;
          }

          failures.push({
            methodId: method.id,
            message: error.message
          });
          continue;
        }

        throw new PaymentOutcomeUnknownError(
          method.id,
          error instanceof Error
            ? error.message
            : "Le résultat du paiement est inconnu.",
          { cause: error }
        );
      }
    }

    throw new PaymentMethodsUnavailableError(failures);
  }

  /**
   * Un listener en échec ne doit pas annuler un paiement déjà effectué :
   * l'erreur est journalisée et le résultat est quand même renvoyé.
   */
  private async notify(
    request: PaymentRequest,
    result: PaymentResult
  ): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.onPaymentCompleted(request, result);
      } catch (error) {
        console.error(
          `[paiement] Un listener a échoué pour la commande ${request.orderId}.`,
          error
        );
      }
    }
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
