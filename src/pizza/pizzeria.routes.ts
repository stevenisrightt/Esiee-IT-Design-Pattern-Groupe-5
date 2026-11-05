import { Router } from "express";
import { Pizzeria } from "./pizzeria";

export function createPizzeriaRouter(pizzerias: Pizzeria[]): Router {
    const router = Router();

    router.get("/", (_req, res) => {
        res.json(
            pizzerias.map((pizzeria) => ({
                id: pizzeria.id,
                name: pizzeria.name,
                menu: pizzeria.getMenu().map((pizza) => ({
                    id: pizza.id,
                    name: pizza.name,
                    ingredients: pizza.ingredients,
                    prices: Object.fromEntries(
                        pizzeria
                            .availableSizes()
                            .map((size) => [
                                size,
                                pizzeria.priceOf(pizza.id, size),
                            ]),
                    ),
                })),
            })),
        );
    });

    return router;
}
