
import {
  type PizzaSize,
  type SizePricePolicy
} from "./custom-pizza";

export class CourseSizePricingDemo implements SizePricePolicy {

  applySizePrice(
    brand: string,
    size: PizzaSize,
    priceBeforeSize: number
  ): number {

    switch (brand) {
      case "Da Michele": {
        const adjustment: Record<PizzaSize, number> = {
          S: -2,
          M: 0,
          L: 3,
          XL: 5
        };

        return priceBeforeSize + adjustment[size];
      }

      case "Rossopomodoro": {
        const multiplier: Record<PizzaSize, number> = {
          S: 0.8,
          M: 1,
          L: 1.3,
          XL: 1.5
        };

        return priceBeforeSize * multiplier[size];
      }

      case "Pizzium":
        if (size !== "M") {
          throw new Error("Pizzium propose uniquement la taille M.");
        }

        return priceBeforeSize;

      default:
        throw new Error(`Enseigne inconnue : ${brand}.`);
    }
  }
}
