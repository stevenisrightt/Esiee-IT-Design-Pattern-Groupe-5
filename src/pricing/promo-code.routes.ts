import { Router } from "express";
import { DiscountType, PromoCode } from "./pricing.model";
import type { PromoCodeRepository } from "./promo-code.repository";

const DISCOUNT_TYPES = Object.values(DiscountType) as string[];

function toResponse(promoCode: PromoCode) {
    return {
        code: promoCode.code,
        type: promoCode.type,
        value: promoCode.value,
    };
}

/**
 * Codes promo (US2) : création (POST) et vérification (GET).
 * Sans cette route, le dépôt de codes est vide et la stratégie
 * PromoCodeDiscount ne s'applique jamais via l'API.
 */
export function createPromoCodeRouter(promoCodes: PromoCodeRepository): Router {
    const router = Router();

    router.post("/", (req, res) => {
        const { code, type, value } = (req.body ?? {}) as Record<string, unknown>;

        if (typeof code !== "string" || !code.trim()) {
            res.status(400).json({ error: "Le code est obligatoire." });
            return;
        }
        if (typeof type !== "string" || !DISCOUNT_TYPES.includes(type)) {
            res.status(400).json({
                error: `Le type doit être l'un de : ${DISCOUNT_TYPES.join(", ")}.`,
            });
            return;
        }
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            res.status(400).json({ error: "La valeur doit être un nombre positif." });
            return;
        }
        if (type === DiscountType.Percentage && value > 100) {
            res.status(400).json({ error: "Un pourcentage ne peut pas dépasser 100." });
            return;
        }

        const normalizedCode = code.trim();
        if (promoCodes.findByCode(normalizedCode)) {
            res.status(409).json({ error: "Ce code promo existe déjà." });
            return;
        }

        const promoCode = new PromoCode(normalizedCode, type as DiscountType, value);
        promoCodes.save(promoCode);
        res.status(201).json(toResponse(promoCode));
    });

    router.get("/:code", (req, res) => {
        const promoCode = promoCodes.findByCode(req.params.code);
        if (!promoCode) {
            res.status(404).json({ error: "Code promo inconnu." });
            return;
        }
        res.json(toResponse(promoCode));
    });

    return router;
}
