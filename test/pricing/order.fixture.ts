import { Customer } from "@/customers/customer.model";
import { Order } from "@/orders/order.model";

/**
 * Commande type et client utilisée par tous les tests de stratégies de prix.
 *
 *   2 x Burger  à 8.50 € = 17.00 €
 *   1 x Frites  à 3.00 € =  3.00 €
 *   2 x Boisson à 2.50 € =  5.00 €
 *                         --------
 *   Sous-total            = 25.00 €
 */
export const ORDER_SUBTOTAL = 25;

export function makeOrder(): Order {
    return new Order([
        { name: "Burger", unitPrice: 8.5, quantity: 2 },
        { name: "Frites", unitPrice: 3, quantity: 1 },
        { name: "Boisson", unitPrice: 2.5, quantity: 2 },
    ]);
}

export function makeCustomer(loyalty: boolean = false): Customer {
    return new Customer("Test", loyalty);
}
