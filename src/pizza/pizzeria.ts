
import { Pizza, PizzaSize } from "./pizza.model";
import { SizePricingStrategy } from "./size-pricing";

export class UnknownPizzaError extends Error {
    constructor(pizzeriaId: string, pizzaId: string) {
        super(`La pizza ${pizzaId} n'est pas au menu de ${pizzeriaId}`);
        this.name = "UnknownPizzaError";
    }
}

export abstract class Pizzeria {
    abstract readonly id: string;
    abstract readonly name: string;
    protected abstract readonly sizePricing: SizePricingStrategy;

    private menu?: Pizza[];

    protected abstract createMenu(): Pizza[];

    getMenu(): readonly Pizza[] {
        this.menu ??= this.createMenu();
        return this.menu;
    }

    availableSizes(): PizzaSize[] {
        return this.sizePricing.availableSizes();
    }

    priceOf(pizzaId: string, size: PizzaSize): number {
        return this.sizePricing.priceFor(
            this.findPizza(pizzaId).basePrice,
            size
        );
    }

    // US8 : appliquer les tarifs de l'US1
    // aux pizzas personnalisees
    priceForCustomPizza(
        basePrice: number,
        size: PizzaSize
    ): number {
        return this.sizePricing.priceFor(basePrice, size);
    }

    private findPizza(pizzaId: string): Pizza {
        const pizza = this.getMenu().find(
            (p) => p.id === pizzaId
        );

        if (!pizza) {
            throw new UnknownPizzaError(this.id, pizzaId);
        }

        return pizza;
    }
}
