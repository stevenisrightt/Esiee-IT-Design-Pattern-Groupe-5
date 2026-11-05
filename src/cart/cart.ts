import { Pizza, PizzaSize } from "@/pizza/pizza.model";
import { CartHistory } from "./cart.history";
import { CartMemento } from "./cart.memento";

export interface CartItem {
    id: number;
    pizza: Pizza;
    size: PizzaSize;
}

export class Cart {
    private items: CartItem[] = [];
    private nextId = 1;
    private history = new CartHistory();

    getItems(): CartItem[] {
        return this.items;
    }

    addItem(pizza: Pizza, size: PizzaSize): void {
        this.history.push(this.save());
        this.items.push({ id: this.nextId++, pizza, size });
    }

    removeItem(id: number): void {
        this.history.push(this.save());
        this.items = this.items.filter((item) => item.id !== id);
    }

    changeSize(id: number, size: PizzaSize): void {
        this.history.push(this.save());
        const item = this.items.find((item) => item.id === id);
        if (item) item.size = size;
    }

    undo(): void {
        const previous = this.history.undo(this.save());
        if (previous) this.restore(previous);
    }

    redo(): void {
        const next = this.history.redo(this.save());
        if (next) this.restore(next);
    }

    private save(): CartMemento {
        return new CartMemento(this.items);
    }

    private restore(memento: CartMemento): void {
        this.items = memento.getItems();
    }
}
