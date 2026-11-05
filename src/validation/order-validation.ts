
import type { IOrder } from "@/mock.model";

export interface OrderValidationContext {
  order: IOrder;
  amountToPay: number;
  isDeliveryZoneSupported: boolean;
  isRestaurantOpen: boolean;
  stockByItem: Readonly<Record<string, number>>;
}

export type ValidationRule =
  | "cart"
  | "minimum-amount"
  | "delivery-zone"
  | "restaurant-open"
  | "stock";

export type ValidationResult =
  | { valid: true }
  | {
      valid: false;
      rule: ValidationRule;
      message: string;
    };

// Classe abstraite commune à toutes les validations
export abstract class ValidationHandler {
  private nextHandler?: ValidationHandler;

  setNext(handler: ValidationHandler): ValidationHandler {
    this.nextHandler = handler;
    return handler;
  }

  validate(context: OrderValidationContext): ValidationResult {
    const message = this.check(context);

    if (message !== null) {
      return {
        valid: false,
        rule: this.rule,
        message
      };
    }

    return this.nextHandler?.validate(context) ?? {
      valid: true
    };
  }

  protected abstract get rule(): ValidationRule;
  protected abstract check(
    context: OrderValidationContext
  ): string | null;
}

// 1. Panier non vide
export class NonEmptyCartHandler extends ValidationHandler {
  protected get rule(): ValidationRule {
    return "cart";
  }

  protected check({ order }: OrderValidationContext): string | null {
    return order.items.length === 0
      ? "Le panier est vide."
      : null;
  }
}

export class MinimumAmountHandler extends ValidationHandler {
  protected get rule(): ValidationRule {
    return "minimum-amount";
  }

  protected check({
    amountToPay
  }: OrderValidationContext): string | null {
    return !Number.isFinite(amountToPay) || amountToPay < 15
      ? "Le montant minimum est de 15 €."
      : null;
  }
}

export class DeliveryZoneHandler extends ValidationHandler {
  protected get rule(): ValidationRule {
    return "delivery-zone";
  }

  protected check({
    isDeliveryZoneSupported
  }: OrderValidationContext): string | null {
    return !isDeliveryZoneSupported
      ? "Zone de livraison non desservie."
      : null;
  }
}

export class RestaurantOpenHandler extends ValidationHandler {
  protected get rule(): ValidationRule {
    return "restaurant-open";
  }

  protected check({
    isRestaurantOpen
  }: OrderValidationContext): string | null {
    return !isRestaurantOpen
      ? "Enseigne fermée."
      : null;
  }
}

export class StockAvailableHandler extends ValidationHandler {
  protected get rule(): ValidationRule {
    return "stock";
  }

  protected check({
    order,
    stockByItem
  }: OrderValidationContext): string | null {

    const requested = new Map<string, number>();

    for (const item of order.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return `Quantité invalide pour ${item.name}.`;
      }

      requested.set(
        item.name,
        (requested.get(item.name) ?? 0) + item.quantity
      );
    }

    for (const [name, quantity] of requested) {
      const available =
        Object.prototype.hasOwnProperty.call(stockByItem, name)
          ? stockByItem[name]
          : undefined;

      if (
        available === undefined ||
        !Number.isInteger(available) ||
        available < quantity
      ) {
        return `Stock insuffisant pour ${name}.`;
      }
    }

    return null;
  }
}

export function createOrderValidationChain(): ValidationHandler {
  const first = new NonEmptyCartHandler();

  first
    .setNext(new MinimumAmountHandler())
    .setNext(new DeliveryZoneHandler())
    .setNext(new RestaurantOpenHandler())
    .setNext(new StockAvailableHandler());

  return first;
}
