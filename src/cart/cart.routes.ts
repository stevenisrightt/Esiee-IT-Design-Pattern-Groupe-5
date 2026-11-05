import { Router, type Response } from "express";
import { PizzaSize } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { Cart } from "./cart";

interface StoredCart {
    id: number;
    pizzeria: Pizzeria;
    cart: Cart;
}

function toResponse({ id, pizzeria, cart }: StoredCart) {
    const items = cart.getItems().map((item) => ({
        id: item.id,
        pizzaId: item.pizza.id,
        name: item.pizza.name,
        size: item.size,
        price: pizzeria.priceOf(item.pizza.id, item.size),
    }));
    const total = items.reduce((sum, item) => sum + item.price, 0);

    return {
        id,
        pizzeriaId: pizzeria.id,
        items,
        total: Math.round(total * 100) / 100,
    };
}

function isAvailableSize(pizzeria: Pizzeria, size: unknown): size is PizzaSize {
    return pizzeria.availableSizes().includes(size as PizzaSize);
}

export function createCartRouter(pizzerias: Pizzeria[]): Router {
    const router = Router();
    const carts = new Map<number, StoredCart>();
    let nextId = 1;

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

    return router;
}
