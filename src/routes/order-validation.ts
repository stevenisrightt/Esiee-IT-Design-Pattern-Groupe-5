
import { Router } from "express";
import { Customer, Order, OrderItem } from "@/mock.model";
import { createOrderValidationChain } from "@/validation/order-validation";

export const orderValidationRouter = Router();
const validationChain = createOrderValidationChain();

type RecordObject = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordObject =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

export interface OrderValidationResponse {
  status: number;
  body: unknown;
}

// Réutilisée par POST /orders/validate et POST /carts/:id/validate
export function validateOrder(body: unknown): OrderValidationResponse {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return {
      status: 400,
      body: { error: "Le champ items doit être un tableau." }
    };
  }

  if (
    typeof body.isDeliveryZoneSupported !== "boolean" ||
    typeof body.isRestaurantOpen !== "boolean" ||
    !isRecord(body.stockByItem)
  ) {
    return {
      status: 400,
      body: {
        error: "Informations de livraison, d'enseigne ou de stock manquantes."
      }
    };
  }

  if (
    body.items.some((item: unknown) =>
      !isRecord(item) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      typeof item.unitPrice !== "number" ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0 ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
  ) {
    return {
      status: 400,
      body: {
        error: "Chaque article doit avoir un nom, un prix et une quantité valides."
      }
    };
  }

  if (
    body.enteredPromoCode !== undefined &&
    typeof body.enteredPromoCode !== "string"
  ) {
    return {
      status: 400,
      body: { error: "Le code promo doit être une chaîne de caractères." }
    };
  }

  const items = (
    body.items as {
      name: string;
      unitPrice: number;
      quantity: number;
    }[]
  ).map(
    item => new OrderItem(
      item.name,
      item.unitPrice,
      item.quantity
    )
  );

  const order = new Order(
    items,
    body.enteredPromoCode as string | undefined
  );

  const customer = isRecord(body.customer)
    ? new Customer(
        typeof body.customer.name === "string"
          ? body.customer.name
          : "Client",
        body.customer.hasLoyaltyCard === true
      )
    : new Customer("Client", false);

  const amountToPay = order.calculateTotalWithDiscount(customer);

  const validation = validationChain.validate({
    order,
    amountToPay,
    isDeliveryZoneSupported: body.isDeliveryZoneSupported,
    isRestaurantOpen: body.isRestaurantOpen,
    stockByItem: body.stockByItem as Record<string, number>
  });

  return {
    status: validation.valid ? 200 : 422,
    body: {
      subtotal: order.subtotal(),
      amountToPay,
      validation
    }
  };
}

orderValidationRouter.post("/", (req, res) => {
  const result = validateOrder(req.body);
  res.status(result.status).json(result.body);
});
