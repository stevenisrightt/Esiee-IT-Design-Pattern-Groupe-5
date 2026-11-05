import { OrderStatus } from "@/order-history/order-history.model";

export interface OrderStatusListener {
    update(status: OrderStatus): void;
}

export class EmailListener implements OrderStatusListener {
    update(status: OrderStatus): void {
        console.log(`[Email] Votre commande est maintenant : ${status}`);
    }
}

export class SmsListener implements OrderStatusListener {
    update(status: OrderStatus): void {
        console.log(`[SMS] Statut de votre commande : ${status}`);
    }
}
