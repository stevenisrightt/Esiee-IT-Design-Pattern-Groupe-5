import { Router } from "express";
import { Pizzeria } from "./pizzeria";

function toResponse(pizzeria: Pizzeria) {
    return {
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
    };
}

export function createPizzeriaRouter(pizzerias: Pizzeria[]): Router {
    const router = Router();

    router.get("/", (_req, res) => {
        res.json(pizzerias.map(toResponse));
    });

    // Menu et prix d'une seule enseigne (US1)
    router.get("/:id", (req, res) => {
        const pizzeria = pizzerias.find((p) => p.id === req.params.id);
        if (!pizzeria) {
            res.status(404).json({ error: "Enseigne introuvable." });
            return;
        }
        res.json(toResponse(pizzeria));
    });

    return router;
}
