import { DiscountStrategy, PromoCode } from "./pricing.model";

export class PromoCodeStorage {
    private promoCodes: PromoCode[] = [];

    addPromoCode(promoCode: PromoCode): void {
        this.promoCodes.push(promoCode);
    }

    getPromoCode(code: string): PromoCode | undefined {
        return this.promoCodes.find((promo) => promo.code === code);
    }

    getAllPromoCodes(): PromoCode[] {
        return this.promoCodes;
    }
}

export class DiscountStorage {
    private discountStrategies: DiscountStrategy[] = [];

    addDiscountStrategy(strategy: DiscountStrategy): void {
        this.discountStrategies.push(strategy);
    }

    getAllDiscountStrategies(): DiscountStrategy[] {
        // Sort strategies by priority in descending order (higher priority first)
        return this.discountStrategies.sort(
            (a, b) => b.getPriority() - a.getPriority(),
        );
    }
}
