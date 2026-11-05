import { Router, type Response } from "express";
import { Pizza, PizzaSize } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { CustomPizzaService } from "@/pizza/custom-pizza";
import { PizzeriaCustomPricingAdapter } from "@/pizza/pizzeria-custom-pricing.adapter";
import { validateOrder } from "@/routes/order-validation";
import { Cart } from "./cart";

interface StoredCart {
    id: number;
    pizzeria: Pizzeria;
    cart: Cart;
}

function toItems({ pizzeria, cart }: StoredCart) {
    return cart.getItems().map((item) => ({
        id: item.id,
        pizzaId: item.pizza.id,
        name: item.pizza.name,
        size: item.size,
        price: pizzeria.priceFor(item.pizza, item.size),
    }));
}

function toResponse(stored: StoredCart) {
    const items = toItems(stored);
    const total = items.reduce((sum, item) => sum + item.price, 0);

    return {
        id: stored.id,
        pizzeriaId: stored.pizzeria.id,
        items,
        total: Math.round(total * 100) / 100,
    };
}

// Format attendu par la validation (US3) : un OrderItem par article du panier
function toOrderItems(stored: StoredCart) {
    return toItems(stored).map((item) => ({
        name: `${item.name} (${item.size})`,
        unitPrice: item.price,
        quantity: 1,
    }));
}

function isAvailableSize(pizzeria: Pizzeria, size: unknown): size is PizzaSize {
    return pizzeria.availableSizes().includes(size as PizzaSize);
}

export function createCartRouter(pizzerias: Pizzeria[]): Router {
    const router = Router();
    const carts = new Map<number, StoredCart>();
    let nextId = 1;
    const customPizzaService = new CustomPizzaService(
        new PizzeriaCustomPricingAdapter(pizzerias),
    );

    function findCart(id: string, res: Response): StoredCart | undefined {
        const stored = carts.get(Number(id));
        if (!stored) res.status(404).json({ error: "Panier introuvable." });
        return stored;
    }

    function hasItem(stored: StoredCart, itemId: string, res: Response): boolean {
        const exists = stored.cart
            .getItems()
            .some((item) => item.id === Number(itemId));
        if (!exists) res.status(404).json({ error: "Article introuvable." });
        return exists;
    }

    router.post("/", (req, res) => {
        const pizzeria = pizzerias.find((p) => p.id === req.body?.pizzeriaId);
        if (!pizzeria) {
            res.status(404).json({ error: "Enseigne introuvable." });
            return;
        }

        const stored = { id: nextId++, pizzeria, cart: new Cart() };
        carts.set(stored.id, stored);
        res.status(201).json(toResponse(stored));
    });

    router.get("/:id", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (stored) res.json(toResponse(stored));
    });

    router.post("/:id/items", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored) return;

        const pizza = stored.pizzeria
            .getMenu()
            .find((p) => p.id === req.body?.pizzaId);
        if (!pizza) {
            res.status(400).json({ error: "Cette pizza n'est pas au menu." });
            return;
        }
        if (!isAvailableSize(stored.pizzeria, req.body?.size)) {
            res.status(400).json({ error: "Taille non disponible." });
            return;
        }

        stored.cart.addItem(pizza, req.body.size);
        res.status(201).json(toResponse(stored));
    });

    // US8 : pizza personnalisée ajoutée au panier
    router.post("/:id/custom-items", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored) return;

        if (!isAvailableSize(stored.pizzeria, req.body?.size)) {
            res.status(400).json({ error: "Taille non disponible." });
            return;
        }

        try {
            const custom = customPizzaService.create({
                brand: stored.pizzeria.name,
                base: req.body?.base,
                size: req.body.size,
                ingredients: req.body?.ingredients,
            });
            const toppings = custom.ingredients.length
                ? ` : ${custom.ingredients.join(", ")}`
                : "";
            const pizza = new Pizza(
                "custom",
                `Pizza personnalisée (${custom.base}${toppings})`,
                custom.priceBeforeSize,
                custom.ingredients,
            );

            stored.cart.addItem(pizza, req.body.size);
            res.status(201).json(toResponse(stored));
        } catch (error) {
            res.status(400).json({
                error: error instanceof Error ? error.message : "Requête invalide.",
            });
        }
    });

    router.patch("/:id/items/:itemId", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored || !hasItem(stored, req.params.itemId, res)) return;

        if (!isAvailableSize(stored.pizzeria, req.body?.size)) {
            res.status(400).json({ error: "Taille non disponible." });
            return;
        }

        stored.cart.changeSize(Number(req.params.itemId), req.body.size);
        res.json(toResponse(stored));
    });

    router.delete("/:id/items/:itemId", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored || !hasItem(stored, req.params.itemId, res)) return;

        stored.cart.removeItem(Number(req.params.itemId));
        res.json(toResponse(stored));
    });

    router.post("/:id/undo", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored) return;

        stored.cart.undo();
        res.json(toResponse(stored));
    });

    router.post("/:id/redo", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored) return;

        stored.cart.redo();
        res.json(toResponse(stored));
    });

    // US3 : le contenu du panier passe par la chaîne de validation
    router.post("/:id/validate", (req, res) => {
        const stored = findCart(req.params.id, res);
        if (!stored) return;

        const result = validateOrder({
            ...req.body,
            items: toOrderItems(stored),
        });
        res.status(result.status).json(result.body);
    });

    return router;
}
