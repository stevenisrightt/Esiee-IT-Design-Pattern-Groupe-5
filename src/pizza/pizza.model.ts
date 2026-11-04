export enum PizzaSize {
    S = "S",
    M = "M",
    L = "L",
    XL = "XL",
}

export class Pizza {
    readonly id: string;
    readonly name: string;
    readonly basePrice: number;
    readonly ingredients: readonly string[];

    constructor(
        id: string,
        name: string,
        basePrice: number,
        ingredients: string[],
    ) {
        this.id = id;
        this.name = name;
        this.basePrice = basePrice;
        this.ingredients = [...ingredients];
    }
}
