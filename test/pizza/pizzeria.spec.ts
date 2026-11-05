import { describe, expect, it } from "vitest";

import { Pizza, PizzaSize } from "@/pizza/pizza.model";
import { Pizzeria, UnknownPizzaError } from "@/pizza/pizzeria";
import {
    AdditiveSizePricing,
    MultiplicativeSizePricing,
    SingleSizePricing,
    SizeNotAvailableError,
} from "@/pizza/size-pricing";
import { DaMichelePizzeria } from "@/pizza/pizzerias/da-michele.pizzeria";
import { RossopomodoroPizzeria } from "@/pizza/pizzerias/rossopomodoro.pizzeria";
import { PizziumPizzeria } from "@/pizza/pizzerias/pizzium.pizzeria";

describe("US1 - Règles de prix par taille (Strategy)", () => {
    it("additive : ajoute un montant selon la taille", () => {
        const pricing = new AdditiveSizePricing({ S: -2, M: 0, L: 3, XL: 5 });

        expect(pricing.priceFor(9, PizzaSize.S)).toBe(7);
        expect(pricing.priceFor(9, PizzaSize.XL)).toBe(14);
    });

    it("multiplicative : multiplie le prix et arrondit au centime", () => {
        const pricing = new MultiplicativeSizePricing({ S: 0.8, M: 1, L: 1.3 });

        expect(pricing.priceFor(12, PizzaSize.L)).toBe(15.6);
        expect(pricing.priceFor(12, PizzaSize.S)).toBe(9.6);
    });

    it("refuse une taille absente de la table", () => {
        const pricing = new MultiplicativeSizePricing({ S: 0.8, M: 1, L: 1.3 });

        expect(pricing.availableSizes()).toEqual([
            PizzaSize.S,
            PizzaSize.M,
            PizzaSize.L,
        ]);
        expect(() => pricing.priceFor(12, PizzaSize.XL)).toThrow(
            SizeNotAvailableError,
        );
    });

    it("taille unique : seule la taille prévue est acceptée", () => {
        const pricing = new SingleSizePricing(PizzaSize.M);

        expect(pricing.availableSizes()).toEqual([PizzaSize.M]);
        expect(pricing.priceFor(10, PizzaSize.M)).toBe(10);
        expect(() => pricing.priceFor(10, PizzaSize.L)).toThrow(
            SizeNotAvailableError,
        );
    });
});

describe("US1 - Enseignes et pizzas (Factory Method)", () => {
    it("Da Michele : S -2 €, L +3 €, XL +5 €", () => {
        const pizzeria = new DaMichelePizzeria();

        expect(pizzeria.priceOf("margherita", PizzaSize.S)).toBe(7);
        expect(pizzeria.priceOf("margherita", PizzaSize.M)).toBe(9);
        expect(pizzeria.priceOf("margherita", PizzaSize.L)).toBe(12);
        expect(pizzeria.priceOf("margherita", PizzaSize.XL)).toBe(14);
    });

    it("Rossopomodoro : S ×0.8, L ×1.3, XL ×1.5", () => {
        const pizzeria = new RossopomodoroPizzeria();

        expect(pizzeria.priceOf("supreme", PizzaSize.S)).toBe(9.6);
        expect(pizzeria.priceOf("supreme", PizzaSize.M)).toBe(12);
        expect(pizzeria.priceOf("supreme", PizzaSize.L)).toBe(15.6);
        expect(pizzeria.priceOf("supreme", PizzaSize.XL)).toBe(18);
    });

    it("Pizzium : taille unique M", () => {
        const pizzeria = new PizziumPizzeria();

        expect(pizzeria.availableSizes()).toEqual([PizzaSize.M]);
        expect(pizzeria.priceOf("napolitaine", PizzaSize.M)).toBe(10);
        expect(() => pizzeria.priceOf("napolitaine", PizzaSize.L)).toThrow(
            SizeNotAvailableError,
        );
    });

    it("chaque enseigne a son propre menu", () => {
        const ids = (pizzeria: Pizzeria) =>
            pizzeria.getMenu().map((pizza) => pizza.id);

        expect(ids(new DaMichelePizzeria())).toContain("margherita");
        expect(ids(new RossopomodoroPizzeria())).toContain("supreme");
        expect(ids(new PizziumPizzeria())).toContain("napolitaine");
        expect(ids(new DaMichelePizzeria())).not.toContain("supreme");
    });

    it("refuse une pizza absente du menu de l'enseigne", () => {
        expect(() =>
            new DaMichelePizzeria().priceOf("supreme", PizzaSize.M),
        ).toThrow(UnknownPizzaError);
    });

    it("priceFor applique la règle de l'enseigne à n'importe quelle pizza", () => {
        const custom = new Pizza("custom", "Personnalisée", 7.5, []);

        expect(new RossopomodoroPizzeria().priceFor(custom, PizzaSize.L)).toBe(
            9.75,
        );
    });

    it("ajouter une enseigne = ajouter une classe", () => {
        class TestPizzeria extends Pizzeria {
            readonly id = "test";
            readonly name = "Test";
            protected readonly sizePricing = new AdditiveSizePricing({
                M: 0,
                L: 4,
            });

            protected createMenu(): Pizza[] {
                return [new Pizza("regina", "Regina", 10, ["jambon"])];
            }
        }

        const pizzeria = new TestPizzeria();

        expect(pizzeria.getMenu().map((pizza) => pizza.name)).toEqual([
            "Regina",
        ]);
        expect(pizzeria.priceOf("regina", PizzaSize.L)).toBe(14);
    });
});
