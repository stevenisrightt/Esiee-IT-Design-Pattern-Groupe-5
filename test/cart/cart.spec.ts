import { describe, expect, it } from "vitest";

import { Cart } from "@/cart/cart";
import { Pizza, PizzaSize } from "@/pizza/pizza.model";

const margherita = new Pizza("margherita", "Margherita", 9, []);
const marinara = new Pizza("marinara", "Marinara", 7, []);

// Contenu du panier sous une forme lisible : ["Margherita M", ...]
function content(cart: Cart): string[] {
    return cart.getItems().map((item) => `${item.pizza.name} ${item.size}`);
}

describe("US6 - Panier", () => {
    it("ajoute, supprime et change la taille d'une pizza", () => {
        const cart = new Cart();

        cart.addItem(margherita, PizzaSize.M);
        cart.addItem(marinara, PizzaSize.S);
        cart.changeSize(1, PizzaSize.L);
        cart.removeItem(2);

        expect(content(cart)).toEqual(["Margherita L"]);
    });
});

describe("US6 - Annuler les modifications (Memento)", () => {
    it("annule un ajout", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);

        cart.undo();

        expect(content(cart)).toEqual([]);
    });

    it("annule une suppression", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);
        cart.removeItem(1);

        cart.undo();

        expect(content(cart)).toEqual(["Margherita M"]);
    });

    it("annule un changement de taille", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);
        cart.changeSize(1, PizzaSize.XL);

        cart.undo();

        expect(content(cart)).toEqual(["Margherita M"]);
    });

    it("annule plusieurs modifications dans l'ordre inverse", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);
        cart.changeSize(1, PizzaSize.L);
        cart.addItem(marinara, PizzaSize.S);

        cart.undo();
        expect(content(cart)).toEqual(["Margherita L"]);

        cart.undo();
        expect(content(cart)).toEqual(["Margherita M"]);
    });

    it("rétablit une annulation (redo)", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);
        cart.changeSize(1, PizzaSize.L);

        cart.undo();
        cart.redo();

        expect(content(cart)).toEqual(["Margherita L"]);
    });

    it("une nouvelle modification efface les redo possibles", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);
        cart.undo();
        cart.addItem(marinara, PizzaSize.S);

        cart.redo();

        expect(content(cart)).toEqual(["Marinara S"]);
    });

    it("garde au maximum les 10 dernières modifications", () => {
        const cart = new Cart();
        for (let i = 0; i < 11; i++) {
            cart.addItem(margherita, PizzaSize.M);
        }

        for (let i = 0; i < 15; i++) {
            cart.undo();
        }

        // La 1re modification n'est plus dans l'historique
        expect(content(cart)).toEqual(["Margherita M"]);
    });

    it("undo et redo sans historique ne font rien", () => {
        const cart = new Cart();
        cart.addItem(margherita, PizzaSize.M);

        cart.redo();
        expect(content(cart)).toEqual(["Margherita M"]);

        cart.undo();
        cart.undo();
        expect(content(cart)).toEqual([]);
    });
});
