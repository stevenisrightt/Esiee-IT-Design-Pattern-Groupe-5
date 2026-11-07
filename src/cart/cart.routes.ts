import {
    Router,
    type NextFunction,
    type Request,
    type Response
} from "express";

import { Pizza, PizzaSize } from "@/pizza/pizza.model";
import { Pizzeria } from "@/pizza/pizzeria";
import { CustomPizzaService } from "@/pizza/custom-pizza";

import {
    PizzeriaCustomPricingAdapter
} from "@/pizza/pizzeria-custom-pricing.adapter";

import { validateOrder } from "@/routes/order-validation";

import {
    IdempotencyConflictError,
    type CartCheckoutRequest,
    type OrderPlacementPort
} from "@/orders/order-placement.service";

import { Cart } from "./cart";

import {
    DemoCheckoutFactsSource,
    type CheckoutFactsSource
} from "./checkout-facts";

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

    const total = items.reduce(
        (sum, item) => sum + item.price,
        0
    );

    return {
        id: stored.id,
        pizzeriaId: stored.pizzeria.id,
        items,
        total: Math.round(total * 100) / 100,
    };
}

// Format attendu par la validation US3
function toOrderItems(stored: StoredCart) {
    return toItems(stored).map((item) => ({
        name: `${item.name} (${item.size})`,
        unitPrice: item.price,
        quantity: 1,
    }));
}

function isAvailableSize(
    pizzeria: Pizzeria,
    size: unknown
): size is PizzaSize {
    return pizzeria.availableSizes().includes(
        size as PizzaSize
    );
}

type RequestObject = Record<string, unknown>;

function isRequestObject(
    value: unknown
): value is RequestObject {
    return typeof value === "object" &&
        value !== null &&
        !Array.isArray(value);
}

export function createCartRouter(
    pizzerias: Pizzeria[],
    orderPlacement?: OrderPlacementPort,
    checkoutFacts: CheckoutFactsSource =
        new DemoCheckoutFactsSource()
): Router {

    const router = Router();

    const carts = new Map<number, StoredCart>();

    let nextId = 1;

    const customPizzaService = new CustomPizzaService(
        new PizzeriaCustomPricingAdapter(pizzerias),
    );

    function findCart(
        id: string,
        res: Response
    ): StoredCart | undefined {

        const stored = carts.get(Number(id));

        if (!stored) {
            res.status(404).json({
                error: "Panier introuvable."
            });
        }

        return stored;
    }

    function hasItem(
        stored: StoredCart,
        itemId: string,
        res: Response
    ): boolean {

        const exists = stored.cart
            .getItems()
            .some(
                (item) => item.id === Number(itemId)
            );

        if (!exists) {
            res.status(404).json({
                error: "Article introuvable."
            });
        }

        return exists;
    }

    // US6 : création d'un panier
    router.post("/", (req, res) => {

        const pizzeria = pizzerias.find(
            (p) => p.id === req.body?.pizzeriaId
        );

        if (!pizzeria) {
            res.status(404).json({
                error: "Enseigne introuvable."
            });
            return;
        }

        const stored = {
            id: nextId++,
            pizzeria,
            cart: new Cart()
        };

        carts.set(stored.id, stored);

        res.status(201).json(toResponse(stored));
    });

    // US6 : consulter un panier
    router.get("/:id", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (stored) {
            res.json(toResponse(stored));
        }
    });

    // US6 : ajouter une pizza du catalogue
    router.post("/:id/items", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (!stored) return;

        const pizza = stored.pizzeria
            .getMenu()
            .find(
                (p) => p.id === req.body?.pizzaId
            );

        if (!pizza) {
            res.status(400).json({
                error: "Cette pizza n'est pas au menu."
            });
            return;
        }

        if (!isAvailableSize(
            stored.pizzeria,
            req.body?.size
        )) {
            res.status(400).json({
                error: "Taille non disponible."
            });
            return;
        }

        stored.cart.addItem(
            pizza,
            req.body.size
        );

        res.status(201).json(toResponse(stored));
    });

    // US8 : pizza personnalisée ajoutée au panier
    router.post("/:id/custom-items", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (!stored) return;

        if (!isAvailableSize(
            stored.pizzeria,
            req.body?.size
        )) {
            res.status(400).json({
                error: "Taille non disponible."
            });
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

            stored.cart.addItem(
                pizza,
                req.body.size
            );

            res.status(201).json(toResponse(stored));

        } catch (error) {

            res.status(400).json({
                error: error instanceof Error
                    ? error.message
                    : "Requête invalide.",
            });
        }
    });

    // US6 : modifier la taille
    router.patch("/:id/items/:itemId", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (
            !stored ||
            !hasItem(stored, req.params.itemId, res)
        ) {
            return;
        }

        if (!isAvailableSize(
            stored.pizzeria,
            req.body?.size
        )) {
            res.status(400).json({
                error: "Taille non disponible."
            });
            return;
        }

        stored.cart.changeSize(
            Number(req.params.itemId),
            req.body.size
        );

        res.json(toResponse(stored));
    });

    // US6 : supprimer un article
    router.delete("/:id/items/:itemId", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (
            !stored ||
            !hasItem(stored, req.params.itemId, res)
        ) {
            return;
        }

        stored.cart.removeItem(
            Number(req.params.itemId)
        );

        res.json(toResponse(stored));
    });

    // US6 : annuler une modification
    router.post("/:id/undo", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (!stored) return;

        stored.cart.undo();

        res.json(toResponse(stored));
    });

    // US6 : refaire une modification
    router.post("/:id/redo", (req, res) => {

        const stored = findCart(req.params.id, res);

        if (!stored) return;

        stored.cart.redo();

        res.json(toResponse(stored));
    });

    // US4 : le code postal doit avoir 5 chiffres
    function validPostalCode(
        value: unknown
    ): value is string {

        return typeof value === "string" &&
            /^\d{5}$/.test(value);
    }

    // US3 : validation avec des données issues du serveur
    router.post("/:id/validate", async (req, res, next) => {

        const stored = findCart(req.params.id, res);

        if (!stored) return;

        const body: unknown = req.body;

        if (
            !isRequestObject(body) ||
            !validPostalCode(body.deliveryPostalCode) ||
            (
                body.enteredPromoCode !== undefined &&
                typeof body.enteredPromoCode !== "string"
            )
        ) {
            res.status(400).json({
                error: "Code postal de livraison valide (5 chiffres) requis."
            });
            return;
        }

        try {

            const items = toOrderItems(stored);

            // Les données sensibles sont récupérées côté serveur
            const facts = await checkoutFacts.getFacts({
                restaurantId: stored.pizzeria.id,
                deliveryPostalCode: body.deliveryPostalCode,
                items
            });

            const result = validateOrder({
                items,
                ...facts,
                ...(
                    typeof body.enteredPromoCode === "string"
                        ? {
                            enteredPromoCode:
                                body.enteredPromoCode
                        }
                        : {}
                )
            });

            res.status(result.status).json(result.body);

        } catch (error) {
            next(error);
        }
    });

    // US4 : validation et paiement
    if (orderPlacement) {

        router.post("/:id/checkout", async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {

            const routeCartId =
                typeof req.params.id === "string"
                    ? req.params.id
                    : req.params.id[0] ?? "";

            const stored = findCart(routeCartId, res);

            if (!stored) return;

            const body: unknown = req.body;

            if (
                !isRequestObject(body) ||
                typeof body.clientId !== "string" ||
                !body.clientId.trim() ||
                typeof body.idempotencyKey !== "string" ||
                !body.idempotencyKey.trim() ||
                !validPostalCode(body.deliveryPostalCode) ||
                (
                    body.enteredPromoCode !== undefined &&
                    typeof body.enteredPromoCode !== "string"
                ) ||
                (
                    body.preferredMethodId !== undefined &&
                    typeof body.preferredMethodId !== "string"
                )
            ) {
                res.status(400).json({
                    error:
                        "Client, clé d'idempotence et code postal de livraison valides requis."
                });
                return;
            }

            try {

                // La zone, les horaires et le stock viennent du serveur.
                // Les valeurs falsifiées du client sont ignorées.
                const facts = await checkoutFacts.getFacts({
                    restaurantId: stored.pizzeria.id,
                    deliveryPostalCode: body.deliveryPostalCode,
                    items: toOrderItems(stored)
                });

                const validation: CartCheckoutRequest["validation"] = {
                    ...facts,
                    ...(
                        typeof body.enteredPromoCode === "string"
                            ? {
                                enteredPromoCode:
                                    body.enteredPromoCode
                            }
                            : {}
                    )
                };

                const checkoutRequest: CartCheckoutRequest = {
                    cartId: String(stored.id),
                    clientId: body.clientId,
                    idempotencyKey: body.idempotencyKey,
                    restaurantId: stored.pizzeria.id,
                    restaurantName: stored.pizzeria.name,

                    items: toItems(stored).map(item => ({
                        name: item.name,
                        size: item.size,
                        quantity: 1,
                        unitPrice: item.price
                    })),

                    validation,

                    ...(
                        typeof body.preferredMethodId === "string"
                            ? {
                                preferredMethodId:
                                    body.preferredMethodId
                            }
                            : {}
                    )
                };

                const result =
                    await orderPlacement.placeOrder(
                        checkoutRequest
                    );

                switch (result.kind) {

                    case "validation-failed":
                        res.status(result.statusCode)
                            .json(result.response);
                        return;

                    case "payment-declined":
                        res.status(402).json({
                            orderId: result.orderId,
                            payment: result.payment
                        });
                        return;

                    case "invalid-payment-method":
                        res.status(400).json({
                            orderId: result.orderId,
                            error: result.message
                        });
                        return;

                    case "payment-unavailable":
                        res.status(503).json({
                            orderId: result.orderId,
                            error: result.message,
                            failures: result.failures
                        });
                        return;

                    case "payment-uncertain":
                        res.status(503).json({
                            orderId: result.orderId,
                            methodId: result.methodId,
                            error: result.message,
                            paymentOutcome: "uncertain"
                        });
                        return;

                    case "history-save-failed":
                        res.status(503).json({
                            orderId: result.orderId,
                            error: result.message,
                            paymentOutcome: "accepted",
                            historyRecorded: false,
                            payment: result.payment,
                            retryWithSameRequest: true
                        });
                        return;

                    case "history-conflict":
                        res.status(409).json({
                            orderId: result.orderId,
                            error: result.message,
                            historyConflict: true
                        });
                        return;

                    case "placed":
                        res.status(201).json({
                            order: result.order,
                            payment: result.payment
                        });
                        return;
                }

            } catch (error) {

                if (error instanceof IdempotencyConflictError) {
                    res.status(409).json({
                        error: error.message
                    });
                    return;
                }

                next(error);
            }
        });
    }

    return router;
}