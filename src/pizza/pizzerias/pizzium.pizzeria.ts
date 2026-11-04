import { Pizza, PizzaSize } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { SingleSizePricing } from "@/pizza/size-pricing";

export class PizziumPizzeria extends Pizzeria {
    readonly id = "pizzium";
    readonly name = "Pizzium";
    protected readonly sizePricing = new SingleSizePricing(PizzaSize.M);

    protected createMenu(): Pizza[] {
        return [
            new Pizza("napolitaine", "Napolitaine", 10, [
                "tomate",
                "mozzarella",
                "anchois",
                "câpres",
                "origan",
            ]),
            new Pizza("margherita", "Margherita", 8, [
                "tomate",
                "mozzarella",
                "basilic",
            ]),
            new Pizza("calzone", "Calzone", 11, [
                "tomate",
                "mozzarella",
                "jambon",
                "champignons",
            ]),
        ];
    }
}
