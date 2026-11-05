
import type { SizePricePolicy } from "./custom-pizza";
import { PizzaSize } from "./pizza.model";
import type { Pizzeria } from "./pizzeria";

export class PizzeriaCustomPricingAdapter
    implements SizePricePolicy {

    constructor(
        private readonly pizzerias: readonly Pizzeria[]
    ) {}

    applySizePrice(
        brand: string,
        size: "S" | "M" | "L" | "XL",
        basePrice: number
    ): number {

        const pizzeria = this.pizzerias.find(
            (p) => p.name === brand
        );

        if (!pizzeria) {
            throw new Error(
                `Enseigne inconnue : ${brand}.`
            );
        }

        return pizzeria.priceForCustomPizza(
            basePrice,
            size as PizzaSize
        );
    }
}
