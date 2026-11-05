import { CartItem } from "./cart";

export class CartMemento {
    private readonly items: CartItem[];

    constructor(items: CartItem[]) {
        this.items = items.map((item) => ({ ...item }));
    }

    getItems(): CartItem[] {
        return this.items.map((item) => ({ ...item }));
    }
}
