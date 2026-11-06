import {
    HappyHourDiscount,
    LoyaltyDiscount,
    PromoCodeDiscount,
} from "./discounts";
import { InMemoryPromoCodeRepository } from "./in-memory-promo-code.repository";
import { DiscountStorage } from "./pricing.storage";

/**
 * Point d'assemblage (composition root) du pricing : seul endroit qui
 * choisit les classes concrètes et branche les dépendances. Les stratégies,
 * elles, reçoivent tout par leur constructeur et n'importent rien d'ici.
 */
export const defaultPromoCodeRepository = new InMemoryPromoCodeRepository();

export const defaultDiscountStorage = new DiscountStorage([
    new HappyHourDiscount(),
    new LoyaltyDiscount(),
    new PromoCodeDiscount(defaultPromoCodeRepository),
]);
