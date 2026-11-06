import { defaultDiscountStorage } from "@/pricing/default-pricing";
import type { DiscountStorage } from "@/pricing/pricing.storage";
import { OrderStatus } from "@/order-history/order-history.model";
import { OrderStatusListener } from "@/notifications/order-status.listener";
import type { ICustomer } from "@/customers/customer.model";

export interface IOrder {
    items: IOrderItem[];
    enteredPromoCode?: string;

    subtotal(): number;
}

export class Order implements IOrder {
    items: OrderItem[];
    enteredPromoCode?: string;
    status: OrderStatus = "pending";
    private listeners: OrderStatusListener[] = [];

    constructor(items: OrderItem[], enteredPromoCode?: string) {
        this.items = items;
        this.enteredPromoCode = enteredPromoCode;
    }

    subscribe(listener: OrderStatusListener): void {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
        }
    }

    unsubscribe(listener: OrderStatusListener): void {
        this.listeners = this.listeners.filter((l) => l !== listener);
    }

    changeStatus(status: OrderStatus): void {
        if (status === this.status) return;

        this.status = status;
        for (const listener of this.listeners) {
            listener.update(status);
        }
    }

    setPromoCode(code: string): void {
        this.enteredPromoCode = code;
    }

    subtotal(): number {
        return this.items.reduce(
            (total, item) => total + item.unitPrice * item.quantity,
            0,
        );
    }

    // Les réductions sont injectables (tests, autre configuration) ; par
    // défaut, celles assemblées dans default-pricing.ts.
    calculateTotalWithDiscount(
        customer: ICustomer,
        discounts: DiscountStorage = defaultDiscountStorage,
    ): number {
        let subtotal = this.subtotal();

        for (const discount of discounts.getAllDiscountStrategies()) {
            if (discount.appliesTo(this, customer)) {
                const discountAmount = discount.getDiscount(this, customer);
                subtotal -= discountAmount;
                break; // Apply only the first applicable discount based on priority
            }
        }

        return subtotal;
    }
}

export interface IOrderItem {
    name: string;
    unitPrice: number;
    quantity: number;
}

export class OrderItem implements IOrderItem {
    name: string;
    unitPrice: number;
    quantity: number;

    constructor(name: string, unitPrice: number, quantity: number) {
        this.name = name;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
    }
}
