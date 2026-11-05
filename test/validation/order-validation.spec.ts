
import { describe, expect, it } from "vitest";
import type { IOrder } from "@/mock.model";

import {
  createOrderValidationChain,
  type OrderValidationContext,
  type ValidationRule
} from "@/validation/order-validation";

describe("US3 - Validation de commande", () => {
  const chain = createOrderValidationChain();

  // Commande valide utilisée comme base pour les tests
  function createContext(): OrderValidationContext {
    const order: IOrder = {
      items: [
        { name: "Pizza", unitPrice: 20, quantity: 1 }
      ],
      subtotal: () => 20
    };

    return {
      order,
      amountToPay: 20,
      isDeliveryZoneSupported: true,
      isRestaurantOpen: true,
      stockByItem: { Pizza: 2 }
    };
  }

  it("accepte une commande valide", () => {
    expect(chain.validate(createContext())).toEqual({
      valid: true
    });
  });

  const scenarios: {
    label: string;
    change: Partial<OrderValidationContext>;
    rule: ValidationRule;
  }[] = [
    {
      label: "refuse un panier vide",
      change: {
        order: { items: [], subtotal: () => 0 },
        amountToPay: 0
      },
      rule: "cart"
    },
    {
      label: "refuse un montant inférieur à 15 €",
      change: { amountToPay: 14.99 },
      rule: "minimum-amount"
    },
    {
      label: "refuse une zone de livraison non desservie",
      change: { isDeliveryZoneSupported: false },
      rule: "delivery-zone"
    },
    {
      label: "refuse une enseigne fermée",
      change: { isRestaurantOpen: false },
      rule: "restaurant-open"
    },
    {
      label: "refuse un stock insuffisant",
      change: { stockByItem: { Pizza: 0 } },
      rule: "stock"
    }
  ];

  for (const scenario of scenarios) {
    it(scenario.label, () => {
      const result = chain.validate({
        ...createContext(),
        ...scenario.change
      });

      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.rule).toBe(scenario.rule);
      }
    });
  }

  it("s'arrête à la première erreur", () => {
    const result = chain.validate({
      ...createContext(),
      amountToPay: 10,
      isDeliveryZoneSupported: false,
      isRestaurantOpen: false
    });

    expect(result).toMatchObject({
      valid: false,
      rule: "minimum-amount"
    });
  });

  it("accepte une commande de exactement 15 €", () => {
    const result = chain.validate({
      ...createContext(),
      amountToPay: 15
    });

    expect(result).toEqual({ valid: true });
  });
});
