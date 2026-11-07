import express from "express";

import { healthRouter } from "@/routes/health";

import { createCustomPizzaRouter } from "@/routes/custom-pizza";
import { orderValidationRouter } from "@/routes/order-validation";

import { createPizzeriaRouter } from "@/pizza/pizzeria.routes";
import { createCartRouter } from "@/cart/cart.routes";

import {
  DemoCheckoutFactsSource,
  type CheckoutFactsSource
} from "@/cart/checkout-facts";

import {
  DaMichelePizzeria
} from "@/pizza/pizzerias/da-michele.pizzeria";

import {
  RossopomodoroPizzeria
} from "@/pizza/pizzerias/rossopomodoro.pizzeria";

import {
  PizziumPizzeria
} from "@/pizza/pizzerias/pizzium.pizzeria";

import {
  createDefaultPaymentOrchestrator
} from "@/payment/create-default-payment-orchestrator";

import {
  OrderPlacementService,
  type CheckoutValidationInput,
  type CheckoutValidationResult
} from "@/orders/order-placement.service";

import {
  createOrderHistoryRouter
} from "@/order-history/order-history.routes";

import {
  OrderHistoryService
} from "@/order-history/order-history.service";

import {
  PaymentJournalListener
} from "@/payment/payment.listener";

import {
  createClientPaymentsRouter,
  createPaymentMethodsRouter
} from "@/payment/payment-query.routes";

import {
  createPromoCodeRouter
} from "@/pricing/promo-code.routes";

import {
  defaultPromoCodeRepository
} from "@/pricing/default-pricing";

import {
  InMemoryStorageFactory,
  type StorageFactory
} from "@/persistence/storage.factory";

import {
  validateOrder
} from "@/routes/order-validation";

/**
 * `storage` (Abstract Factory) choisit la famille
 * de stockage : mémoire par défaut (tests),
 * fichiers JSON pour le serveur (voir index.ts).
 */
export function createApp(
  storage: StorageFactory = new InMemoryStorageFactory(),
  checkoutFacts: CheckoutFactsSource = new DemoCheckoutFactsSource()
) {

  const app = express();

  app.use(express.json());

  app.use("/health", healthRouter);

  // US1 : instances des trois enseignes
  const pizzerias = [
    new DaMichelePizzeria(),
    new RossopomodoroPizzeria(),
    new PizziumPizzeria()
  ];

  const paymentOrchestrator =
    createDefaultPaymentOrchestrator();

  const paymentRepository =
    storage.createPaymentRepository();

  // Observer : chaque paiement terminé est journalisé
  paymentOrchestrator.subscribe(
    new PaymentJournalListener(paymentRepository)
  );

  const orderHistoryRepository =
    storage.createOrderHistoryRepository();

  const orderValidator = {

    validate(
      input: CheckoutValidationInput
    ): CheckoutValidationResult {

      const result = validateOrder(input);

      const response = result.body;

      if (
        typeof response !== "object" ||
        response === null
      ) {
        throw new Error(
          "La validation de commande a retourné une réponse invalide."
        );
      }

      const body = response as Record<string, unknown>;

      const validation = body.validation;

      const valid =
        typeof validation === "object" &&
        validation !== null &&
        "valid" in validation &&
        validation.valid === true;

      const amountToPay =
        typeof body.amountToPay === "number"
          ? body.amountToPay
          : undefined;

      return {
        statusCode: result.status,
        valid: result.status === 200 && valid,
        amountToPay,
        response
      };
    }
  };

  const orderPlacement = new OrderPlacementService(
    orderValidator,
    paymentOrchestrator,
    orderHistoryRepository
  );

  // US8 : pizzas personnalisées reliées à l'US1
  app.use(
    "/pizzas/custom",
    createCustomPizzaRouter(pizzerias)
  );

  // US3 : validation des commandes
  app.use(
    "/orders/validate",
    orderValidationRouter
  );

  // US1 et US6
  app.use(
    "/pizzerias",
    createPizzeriaRouter(pizzerias)
  );

  // Panier et checkout : données de validation côté serveur
  app.use(
    "/carts",
    createCartRouter(
      pizzerias,
      orderPlacement,
      checkoutFacts
    )
  );

  // US2 : codes promotionnels
  app.use(
    "/promo-codes",
    createPromoCodeRouter(defaultPromoCodeRepository)
  );

  // US4 : moyens de paiement
  app.use(
    "/payment-methods",
    createPaymentMethodsRouter(
      () => paymentOrchestrator.availableMethodIds()
    )
  );

  app.use(
    "/clients",
    createClientPaymentsRouter(paymentRepository)
  );

  // US4 checkout et US9 historique :
  // même dépôt de commandes
  app.use(
    "/clients",
    createOrderHistoryRouter(
      new OrderHistoryService(
        orderHistoryRepository
      )
    )
  );

  return app;
}