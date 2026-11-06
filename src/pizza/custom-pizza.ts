
import type { IOrderItem } from "@/orders/order.model";
import { findIngredient, type IngredientId } from "./ingredients";

export type PizzaBase = "tomato" | "cream";
export type PizzaSize = "S" | "M" | "L" | "XL";

export interface CustomPizzaRequest {
  brand: string;
  base: PizzaBase;
  size: PizzaSize;
  ingredients: IngredientId[];
}

export interface SizePricePolicy {
  applySizePrice(
    brand: string,
    size: PizzaSize,
    priceBeforeSize: number
  ): number;
}

export interface CustomPizza {
  brand: string;
  base: PizzaBase;
  size: PizzaSize;
  ingredients: IngredientId[];
  basePrice: number;
  ingredientsPrice: number;
  priceBeforeSize: number;
  totalPrice: number;
}

export class CustomPizzaService {
  static readonly BASE_PRICE = 5;

  constructor(
    private readonly sizePricePolicy: SizePricePolicy
  ) {}

  create(request: CustomPizzaRequest): CustomPizza {
    if (typeof request?.brand !== "string" ||
        !request.brand.trim()) {
      throw new Error("Une enseigne est obligatoire.");
    }

    if (request.base !== "tomato" &&
        request.base !== "cream") {
      throw new Error("Base invalide : choisir tomato ou cream.");
    }

    if (!["S", "M", "L", "XL"].includes(request.size)) {
      throw new Error("Taille invalide : choisir S, M, L ou XL.");
    }

    if (!Array.isArray(request.ingredients)) {
      throw new Error("La liste des ingrédients est obligatoire.");
    }

    let ingredientsCents = 0;

    for (const id of request.ingredients) {
      const ingredient = findIngredient(id);

      if (!ingredient) {
        throw new Error(`Ingrédient inconnu : ${String(id)}.`);
      }

      ingredientsCents += Math.round(ingredient.price * 100);
    }

    const priceBeforeSize =
      (CustomPizzaService.BASE_PRICE * 100 + ingredientsCents) / 100;

    const calculated = this.sizePricePolicy.applySizePrice(
      request.brand,
      request.size,
      priceBeforeSize
    );

    if (!Number.isFinite(calculated) || calculated < 0) {
      throw new Error("Le prix retourné par l'enseigne est invalide.");
    }

    return {
      brand: request.brand,
      base: request.base,
      size: request.size,
      ingredients: [...request.ingredients],
      basePrice: CustomPizzaService.BASE_PRICE,
      ingredientsPrice: ingredientsCents / 100,
      priceBeforeSize,
      totalPrice: Math.round(
        (calculated + Number.EPSILON) * 100
      ) / 100,
    };
  }

  // Compatible avec le modèle OrderItem d'Andy
  
  toOrderItem(
    pizza: CustomPizza,
    quantity = 1
  ): IOrderItem {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("La quantité doit être un entier positif.");
    }

    const additions = pizza.ingredients.join(",") || "aucun";

    const name =
      `Pizza personnalisée / ${pizza.brand} / ` +
      `${pizza.base} / ${pizza.size} / ${additions}`;

    return {
      name,
      unitPrice: pizza.totalPrice,
      quantity
    };
  }

}
