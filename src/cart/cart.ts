import { randomUUID } from "node:crypto";
import { Pizza, PizzaSize } from "@/pizza/pizza.model";

export interface CartItem {
    readonly id: string;
    readonly pizza: Pizza;
    readonly size: PizzaSize;
}

export class CartItemNotFoundError extends Error {
    constructor(itemId: string) {
        super(`L'article ${itemId} n'est pas dans le panier`);
        this.name = "CartItemNotFoundError";
    }
}

export interface CartMemento {}

class CartSnapshot implements CartMemento {
    constructor(readonly items: readonly CartItem[]) {}
}

export class Cart {
    private items: readonly CartItem[] = [];

    getItems(): readonly CartItem[] {
        return this.items;
    }

    save(): CartMemento {
        return new CartSnapshot(this.items);
    }

    restore(memento: CartMemento): void {
        if (!(memento instanceof CartSnapshot)) {
            throw new Error("Ce snapshot ne provient pas d'un panier");
        }
        this.items = memento.items;
    }

    addItem(pizza: Pizza, size: PizzaSize): CartItem {
        const item = { id: randomUUID(), pizza, size };
        this.items = [...this.items, item];
        return item;
    }

    removeItem(itemId: string): void {
        this.findItem(itemId);
        this.items = this.items.filter((item) => item.id !== itemId);
    }

    changeSize(itemId: string, size: PizzaSize): void {
        this.findItem(itemId);
        this.items = this.items.map((item) =>
            item.id === itemId ? { ...item, size } : item,
        );
    }

    private findItem(itemId: string): CartItem {
        const item = this.items.find((i) => i.id === itemId);
        if (!item) throw new CartItemNotFoundError(itemId);
        return item;
    }
}
