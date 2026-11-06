import type { DiscountStrategy } from "./pricing.model";

export class DiscountStorage {
    private discountStrategies: DiscountStrategy[] = [];

    // Les stratégies sont injectées à la construction (voir default-pricing.ts).
    constructor(strategies: readonly DiscountStrategy[] = []) {
        for (const strategy of strategies) {
            this.addDiscountStrategy(strategy);
        }
    }

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
