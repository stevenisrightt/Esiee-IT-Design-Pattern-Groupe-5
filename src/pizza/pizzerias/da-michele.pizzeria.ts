import { Pizza } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { AdditiveSizePricing } from "@/pizza/size-pricing";

export class DaMichelePizzeria extends Pizzeria {
    readonly id = "da-michele";
    readonly name = "Da Michele";
    protected readonly sizePricing = new AdditiveSizePricing({
        S: -2,
        M: 0,
        L: 3,
        XL: 5,
    });

    protected createMenu(): Pizza[] {
        return [
            new Pizza("margherita", "Margherita", 9, [
                "tomate",
                "fior di latte",
                "basilic",
            ]),
            new Pizza("marinara", "Marinara", 7, ["tomate", "ail", "origan"]),
        ];
    }
}
