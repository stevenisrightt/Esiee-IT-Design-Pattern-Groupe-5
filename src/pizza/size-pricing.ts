import { PizzaSize } from "./pizza.model";

export interface SizePricingStrategy {
    availableSizes(): PizzaSize[];
    priceFor(basePrice: number, size: PizzaSize): number;
}

export class SizeNotAvailableError extends Error {
    constructor(size: PizzaSize) {
        super(`La taille ${size} n'est pas disponible`);
        this.name = "SizeNotAvailableError";
    }
}

type SizeTable = Partial<Record<PizzaSize, number>>;

function valueForSize(table: SizeTable, size: PizzaSize): number {
    const value = table[size];
    if (value === undefined) throw new SizeNotAvailableError(size);
    return value;
}

export class AdditiveSizePricing implements SizePricingStrategy {
    constructor(private readonly adjustments: SizeTable) {}

    availableSizes(): PizzaSize[] {
        return Object.keys(this.adjustments) as PizzaSize[];
    }
    priceFor(basePrice: number, size: PizzaSize): number {
        return basePrice + valueForSize(this.adjustments, size);
    }
}

export class MultiplicativeSizePricing implements SizePricingStrategy {
    constructor(private readonly multipliers: SizeTable) {}

    availableSizes(): PizzaSize[] {
        return Object.keys(this.multipliers) as PizzaSize[];
    }
    priceFor(basePrice: number, size: PizzaSize): number {
        const price = basePrice * valueForSize(this.multipliers, size);
        return Math.round(price * 100) / 100; // 12 × 1.3 = 15.600000000000001 sans arrondi
    }
}

export class SingleSizePricing implements SizePricingStrategy {
    constructor(private readonly size: PizzaSize) {}

    availableSizes(): PizzaSize[] {
        return [this.size];
    }
    priceFor(basePrice: number, size: PizzaSize): number {
        if (size !== this.size) throw new SizeNotAvailableError(size);
        return basePrice;
    }
}
