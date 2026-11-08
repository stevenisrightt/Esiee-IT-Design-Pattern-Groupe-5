import { CartItem } from "./cart";

export class CartMemento {
    private readonly items: CartItem[];
    private readonly nextId: number;

    constructor(items: CartItem[], nextId: number) {
        this.items = items.map((item) => ({ ...item }));
        this.nextId = nextId;
    }

    getItems(): CartItem[] {
        return this.items.map((item) => ({ ...item }));
    }

    getNextId(): number {
        return this.nextId;
    }
}
