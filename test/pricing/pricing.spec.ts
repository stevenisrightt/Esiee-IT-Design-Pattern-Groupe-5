/**
 * Story 7 — Tests sur les stratégies de prix (pattern Strategy).
 *
 * API attendue, exportée par `src/pricing/index.ts` :
 *
 *   interface OrderItem { name: string; unitPrice: number; quantity: number }
 *   interface Order { items: OrderItem[] }
 *
 *   interface PricingStrategy { calculate(order: Order): number }
 *
 *   class StandardPricing  implements PricingStrategy   // prix normal
 *   class HappyHourPricing implements PricingStrategy   // -20 %
 *   class LoyaltyPricing   implements PricingStrategy   // -10 %
 *   class PromoCodePricing implements PricingStrategy   // réduction du code promo
 *     constructor(promo: PromoCode)
 *
 *   type PromoCode =
 *     | { type: "percentage"; value: number }  // ex. 15 => -15 %
 *     | { type: "fixed"; value: number }       // ex. 5  => -5 €, jamais sous 0 €
 */
import { describe, expect, it } from "vitest";
import {
    HappyHourDiscount,
    LoyaltyDiscount,
    PromoCodeDiscount,
} from "@/pricing/discounts";
import {
    DiscountStrategy,
    PromoCode,
    DiscountType,
} from "@/pricing/pricing.model";

import {
    makeOrder,
    makeCustomer,
    ORDER_SUBTOTAL,
} from "@test/pricing/order.fixture";
import { promoCodeStorage } from "@/app";

promoCodeStorage.addPromoCode(
    new PromoCode("PROMO15", DiscountType.Percentage, 15),
);
promoCodeStorage.addPromoCode(new PromoCode("PROMO5", DiscountType.Fixed, 5));

describe("Stratégies de prix", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-06-16T12:00:00")); // Simuler l'heure actuelle pour le test (ex. 12h)
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("Standard : applique le prix normal", () => {
        expect(
            makeOrder().calculateTotalWithDiscount(makeCustomer()),
        ).toBeCloseTo(ORDER_SUBTOTAL, 2); // 25.00 €
    });

    describe("Happy Hour : applique la réduction de 20 % entre 17h et 19h", () => {
        it("en dehors de l'happy hour : pas de réduction", () => {
            vi.setSystemTime(new Date("2024-06-16T15:00:00")); // Simuler l'heure actuelle pour le test (ex. 15h)
            console.log("Current time for test:", new Date().toString());

            expect(
                makeOrder().calculateTotalWithDiscount(makeCustomer()),
            ).toBeCloseTo(ORDER_SUBTOTAL, 2); // 25.00 €
        });

        it("pendant l'happy hour : applique -20 %", () => {
            vi.setSystemTime(new Date("2024-06-16T17:30:00")); // Simuler l'heure actuelle pour le test (ex. 17h30)
            console.log("Current time for test:", new Date().toString());

            const order = makeOrder();
            const customer = makeCustomer();

            expect(order.calculateTotalWithDiscount(customer)).toBeCloseTo(
                20, // 25.00 € - 20 %
                2,
            );
        });
    });

    describe("Code Promo : applique la réduction du code", () => {
        it("code promo invalide : pas de réduction", () => {
            const order = makeOrder();
            const customer = makeCustomer();
            order.setPromoCode("INVALID");

            expect(order.calculateTotalWithDiscount(customer)).toBeCloseTo(
                ORDER_SUBTOTAL,
                2,
            ); // 25.00 €
        });

        it("réduction en pourcentage", () => {
            const order2 = makeOrder();
            const customer = makeCustomer();
            order2.setPromoCode("PROMO15");

            expect(order2.calculateTotalWithDiscount(customer)).toBeCloseTo(
                21.25, // 25.00 € - 15 %
                2,
            );
        });

        it("réduction d'un montant fixe", () => {
            const order2 = makeOrder();
            const customer = makeCustomer();
            order2.setPromoCode("PROMO5");

            expect(order2.calculateTotalWithDiscount(customer)).toBeCloseTo(
                20, // 25.00 € - 5 €
                2,
            );
        });

        it("une réduction fixe ne rend jamais le total négatif", () => {
            const order2 = makeOrder();
            const customer = makeCustomer();
            order2.setPromoCode("PROMO5");

            // Simuler une commande avec un sous-total inférieur à 5 €
            order2.items = [
                { name: "Petit article", unitPrice: 3, quantity: 1 },
            ];

            expect(order2.calculateTotalWithDiscount(customer)).toBeCloseTo(
                0, // 3.00 € - 5 € => 0 €
                2,
            );
        });
    });

    describe("Fidélité : applique la réduction pour les clients fidèles", () => {
        it("Client fidèle : applique -10 %", () => {
            const order = makeOrder();
            const customerWithLoyaltyCard = makeCustomer(true);

            expect(
                order.calculateTotalWithDiscount(customerWithLoyaltyCard),
            ).toBeCloseTo(22.5, 2); // 25.00 € - 10 %
        });

        it("Client non fidèle : pas de réduction", () => {
            const order = makeOrder();
            const customerWithoutLoyaltyCard = makeCustomer();

            expect(
                order.calculateTotalWithDiscount(customerWithoutLoyaltyCard),
            ).toBeCloseTo(ORDER_SUBTOTAL, 2); // 25.00  €
        });
    });
});
