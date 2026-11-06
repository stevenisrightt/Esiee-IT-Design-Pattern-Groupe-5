import type { ICustomer } from "@/customers/customer.model";
import type { IOrder } from "@/orders/order.model";
import { type DiscountStrategy, DiscountType } from "./pricing.model";
import type { PromoCodeRepository } from "./promo-code.repository";

export class HappyHourDiscount implements DiscountStrategy {
    getPriority(): number {
        return 2;
    }
    appliesTo(_: IOrder, __: ICustomer): boolean {
        const currentHour = new Date().getHours();
        return currentHour >= 17 && currentHour < 19; // Happy Hour between 17:00 and 19:00
    }
    getDiscount(order: IOrder, _: ICustomer): number {
        return order.subtotal() * 0.2; // 20% discount
    }
    getDiscountType(_: IOrder): DiscountType {
        return DiscountType.Percentage;
    }
}

export class LoyaltyDiscount implements DiscountStrategy {
    getPriority(): number {
        return 1;
    }
    appliesTo(_: IOrder, customer: ICustomer): boolean {
        return customer.hasLoyaltyCard;
    }
    getDiscount(order: IOrder, _: ICustomer): number {
        return order.subtotal() * 0.1; // 10% discount
    }
    getDiscountType(_: IOrder): DiscountType {
        return DiscountType.Percentage;
    }
}

export class PromoCodeDiscount implements DiscountStrategy {
    // Injection par le constructeur : la stratégie ne sait pas où sont
    // stockés les codes, elle ne connaît que le port PromoCodeRepository.
    constructor(private readonly promoCodes: PromoCodeRepository) {}

    appliesTo(order: IOrder, _: ICustomer): boolean {
        return (
            !!order.enteredPromoCode &&
            this.promoCodes.findByCode(order.enteredPromoCode) !== undefined
        );
    }
    getDiscount(order: IOrder, _: ICustomer): number {
        if (!order.enteredPromoCode) return 0;

        const promoCode = this.promoCodes.findByCode(order.enteredPromoCode);
        if (!promoCode) return 0;

        switch (promoCode.type) {
            case DiscountType.Percentage:
                return order.subtotal() * (promoCode.value / 100);
            case DiscountType.Fixed:
                return Math.min(promoCode.value, order.subtotal());
            default:
                return 0;
        }
    }
    getDiscountType(order: IOrder): DiscountType {
        if (!order.enteredPromoCode) return DiscountType.Percentage;

        const promoCode = this.promoCodes.findByCode(order.enteredPromoCode);
        if (!promoCode) return DiscountType.Percentage;

        return promoCode.type;
    }
    getPriority(): number {
        return 3;
    }
}
