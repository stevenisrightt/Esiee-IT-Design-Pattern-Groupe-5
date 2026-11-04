import express from "express";
import { healthRouter } from "@/routes/health";
import { DiscountStorage, PromoCodeStorage } from "@/pricing/pricing.storage";
import {
    HappyHourDiscount,
    LoyaltyDiscount,
    PromoCodeDiscount,
} from "./pricing/discounts";

export function createApp() {
    const app = express();

    app.use(express.json());

    app.use("/health", healthRouter);

    return app;
}

export let promoCodeStorage = new PromoCodeStorage();
export let discountStorage = new DiscountStorage();

discountStorage.addDiscountStrategy(new HappyHourDiscount());
discountStorage.addDiscountStrategy(new LoyaltyDiscount());
discountStorage.addDiscountStrategy(new PromoCodeDiscount());
