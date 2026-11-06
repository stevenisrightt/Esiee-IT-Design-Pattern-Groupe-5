import type { PromoCode } from "./pricing.model";

/**
 * Port (architecture hexagonale) : là où PromoCodeDiscount trouve les codes
 * promo. La stratégie ne dépend que de cette interface (Dependency
 * Inversion) ; l'adapter concret lui est injecté par son constructeur.
 */
export interface PromoCodeRepository {
    findByCode(code: string): PromoCode | undefined;
    save(promoCode: PromoCode): void;
}
