import { CartMemento } from "./cart.memento";

export class CartHistory {
    private undoStack: CartMemento[] = [];
    private redoStack: CartMemento[] = [];

    push(memento: CartMemento): void {
        this.undoStack.push(memento);
        if (this.undoStack.length > 10) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    undo(current: CartMemento): CartMemento | undefined {
        const previous = this.undoStack.pop();
        if (previous) this.redoStack.push(current);
        return previous;
    }

    redo(current: CartMemento): CartMemento | undefined {
        const next = this.redoStack.pop();
        if (next) this.undoStack.push(current);
        return next;
    }
}
