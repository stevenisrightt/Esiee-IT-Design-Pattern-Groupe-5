import type { PromoCode } from "./pricing.model";
import type { PromoCodeRepository } from "./promo-code.repository";

/** Adapter mémoire du port PromoCodeRepository. */
export class InMemoryPromoCodeRepository implements PromoCodeRepository {
    private readonly promoCodes = new Map<string, PromoCode>();

    constructor(initialPromoCodes: readonly PromoCode[] = []) {
        for (const promoCode of initialPromoCodes) {
            this.save(promoCode);
        }
    }

    findByCode(code: string): PromoCode | undefined {
        return this.promoCodes.get(code);
    }

    save(promoCode: PromoCode): void {
        this.promoCodes.set(promoCode.code, promoCode);
    }
}
