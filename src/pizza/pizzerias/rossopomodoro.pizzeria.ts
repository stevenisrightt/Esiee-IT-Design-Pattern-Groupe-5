import { Pizza } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { MultiplicativeSizePricing } from "@/pizza/size-pricing";

export class RossopomodoroPizzeria extends Pizzeria {
    readonly id = "rossopomodoro";
    readonly name = "Rossopomodoro";
    protected readonly sizePricing = new MultiplicativeSizePricing({
        S: 0.8,
        M: 1,
        L: 1.3,
        XL: 1.5,
    });

    protected createMenu(): Pizza[] {
        return [
            new Pizza("supreme", "Supreme", 12, [
                "tomate",
                "mozzarella",
                "pepperoni",
                "poivrons",
                "oignons",
                "olives",
            ]),
            new Pizza("diavola", "Diavola", 11, [
                "tomate",
                "mozzarella",
                "salami piquant",
            ]),
            new Pizza("quattro-formaggi", "Quattro Formaggi", 13, [
                "mozzarella",
                "gorgonzola",
                "parmesan",
                "fontina",
            ]),
        ];
    }
}
