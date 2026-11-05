import { randomUUID } from "node:crypto";
import type { OrderHistoryRepository } from "@/order-history/order-history.repository";
import type { HistoricalOrder } from "@/order-history/order-history.model";
import type { PaymentRequest, PaymentResult } from "@/payment/payment.types";
import {
  InvalidPaymentMethodError,
  PaymentMethodsUnavailableError,
  PaymentTechnicalError
} from "@/payment/payment.types";

export interface PaymentPort {
  pay(
    request: PaymentRequest,
    preferredMethodId?: string
  ): Promise<PaymentResult>;
}

export interface CheckoutItem {
  readonly name: string;
  readonly size: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface CheckoutValidationInput {
  readonly items: readonly {
    readonly name: string;
    readonly unitPrice: number;
    readonly quantity: number;
  }[];
  readonly isDeliveryZoneSupported: boolean;
  readonly isRestaurantOpen: boolean;
  readonly stockByItem: Readonly<Record<string, number>>;
  readonly enteredPromoCode?: string;
  readonly customer?: {
    readonly name: string;
    readonly hasLoyaltyCard: boolean;
  };
}

export interface CheckoutValidationResult {
  readonly statusCode: number;
  readonly valid: boolean;
  readonly amountToPay?: number;
  readonly response: unknown;
}

export interface OrderValidator {
  validate(input: CheckoutValidationInput): CheckoutValidationResult;
}

export interface OrderPlacementPort {
  placeOrder(request: CartCheckoutRequest): Promise<OrderPlacementResult>;
}

export interface CartCheckoutRequest {
  readonly cartId: string;
  readonly clientId: string;
  readonly idempotencyKey: string;
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly items: readonly CheckoutItem[];
  readonly validation: Omit<CheckoutValidationInput, "items">;
  readonly preferredMethodId?: string;
}

export type OrderPlacementResult =
  | {
      readonly kind: "validation-failed";
      readonly statusCode: number;
      readonly response: unknown;
    }
  | {
      readonly kind: "payment-declined";
      readonly orderId: string;
      readonly payment: Extract<PaymentResult, { status: "declined" }>;
    }
  | {
      readonly kind: "invalid-payment-method";
      readonly orderId: string;
      readonly message: string;
    }
  | {
      readonly kind: "payment-unavailable";
      readonly orderId: string;
      readonly message: string;
      readonly failures: PaymentMethodsUnavailableError["failures"];
    }
  | {
      readonly kind: "payment-uncertain";
      readonly orderId: string;
      readonly message: string;
    }
  | {
      readonly kind: "history-save-failed";
      readonly orderId: string;
      readonly message: string;
    }
  | {
      readonly kind: "placed";
      readonly order: HistoricalOrder;
      readonly payment: Extract<PaymentResult, { status: "accepted" }>;
    };

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Cette clé d'idempotence a déjà été utilisée pour une autre requête.");
    this.name = "IdempotencyConflictError";
  }
}

export class OrderPlacementService {
  private readonly attempts = new Map<
    string,
    { fingerprint: string; result: Promise<OrderPlacementResult> }
  >();
  private readonly cartAttempts = new Map<
    string,
    { fingerprint: string; result: Promise<OrderPlacementResult> }
  >();

  constructor(
    private readonly validator: OrderValidator,
    private readonly payments: PaymentPort,
    private readonly history: OrderHistoryRepository
  ) {}

  placeOrder(request: CartCheckoutRequest): Promise<OrderPlacementResult> {
    const key = `${request.clientId}\u0000${request.idempotencyKey}`;
    const fingerprint = this.fingerprint(request);
    const existing = this.attempts.get(key);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError();
      }

      return existing.result;
    }

    const activeCartAttempt = this.cartAttempts.get(request.cartId);
    if (activeCartAttempt) {
      if (activeCartAttempt.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError();
      }

      this.attempts.set(key, activeCartAttempt);
      return activeCartAttempt.result;
    }

    let result: Promise<OrderPlacementResult>;
    result = Promise.resolve()
      .then(() => this.process(request))
      .then(
        placementResult => {
          if (
            placementResult.kind !== "placed" &&
            placementResult.kind !== "payment-uncertain" &&
            placementResult.kind !== "history-save-failed"
          ) {
            if (this.cartAttempts.get(request.cartId)?.result === result) {
              this.cartAttempts.delete(request.cartId);
            }
          }

          return placementResult;
        },
        error => {
          if (this.cartAttempts.get(request.cartId)?.result === result) {
            this.cartAttempts.delete(request.cartId);
          }

          throw error;
        }
      );
    const attempt = { fingerprint, result };
    this.cartAttempts.set(request.cartId, attempt);
    this.attempts.set(key, attempt);
    return result;
  }

  private async process(
    request: CartCheckoutRequest
  ): Promise<OrderPlacementResult> {
    const validation = this.validator.validate({
      ...request.validation,
      items: request.items.map(item => ({
        name: `${item.name} (${item.size})`,
        unitPrice: item.unitPrice,
        quantity: item.quantity
      }))
    });

    if (!validation.valid) {
      return {
        kind: "validation-failed",
        statusCode: validation.statusCode,
        response: validation.response
      };
    }

    if (
      validation.amountToPay === undefined ||
      !Number.isFinite(validation.amountToPay) ||
      validation.amountToPay <= 0
    ) {
      throw new Error("La validation n'a pas retourné un montant payable valide.");
    }

    const orderId = randomUUID();
    const amountCents = Math.round(
      (validation.amountToPay + Number.EPSILON) * 100
    );

    let payment: PaymentResult;
    try {
      payment = await this.payments.pay(
        {
          orderId,
          clientId: request.clientId,
          amountCents
        },
        request.preferredMethodId
      );
    } catch (error) {
      if (error instanceof InvalidPaymentMethodError) {
        return {
          kind: "invalid-payment-method",
          orderId,
          message: error.message
        };
      }

      if (error instanceof PaymentMethodsUnavailableError) {
        return {
          kind: "payment-unavailable",
          orderId,
          message: error.message,
          failures: error.failures
        };
      }

      if (error instanceof PaymentTechnicalError) {
        return {
          kind: "payment-uncertain",
          orderId,
          message: error.message
        };
      }

      return {
        kind: "payment-uncertain",
        orderId,
        message: "Le résultat du paiement est inconnu; ne réessayez pas avec une nouvelle clé."
      };
    }

    if (payment.status === "declined") {
      return {
        kind: "payment-declined",
        orderId,
        payment
      };
    }

    const order: HistoricalOrder = {
      orderId,
      clientId: request.clientId,
      createdAt: new Date(),
      status: "confirmed",
      restaurantName: request.restaurantName,
      items: request.items.map(item => ({
        name: `${item.name} (${item.size})`,
        quantity: item.quantity,
        unitPriceCents: Math.round(
          (item.unitPrice + Number.EPSILON) * 100
        )
      })),
      totalCents: amountCents
    };

    try {
      await this.history.save(order);
    } catch (error) {
      return {
        kind: "history-save-failed",
        orderId,
        message: error instanceof Error
          ? error.message
          : "Le paiement est accepté, mais l'historique n'a pas pu être enregistré."
      };
    }

    return {
      kind: "placed",
      order,
      payment
    };
  }

  private fingerprint(request: CartCheckoutRequest): string {
    const stockByItem = Object.fromEntries(
      Object.entries(request.validation.stockByItem)
        .sort(([left], [right]) => left.localeCompare(right))
    );

    return JSON.stringify({
      cartId: request.cartId,
      clientId: request.clientId,
      restaurantId: request.restaurantId,
      restaurantName: request.restaurantName,
      items: request.items,
      validation: {
        isDeliveryZoneSupported:
          request.validation.isDeliveryZoneSupported,
        isRestaurantOpen: request.validation.isRestaurantOpen,
        stockByItem,
        enteredPromoCode: request.validation.enteredPromoCode,
        customer: request.validation.customer
      },
      preferredMethodId: request.preferredMethodId
    });
  }
}
