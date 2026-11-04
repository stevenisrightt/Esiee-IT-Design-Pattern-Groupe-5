import { discountStorage } from "@/app";

export interface IOrder {
    items: IOrderItem[];
    enteredPromoCode?: string;

    subtotal(): number;
}

export class Order implements IOrder {
    items: OrderItem[];
    enteredPromoCode?: string;

    constructor(items: OrderItem[], enteredPromoCode?: string) {
        this.items = items;
        this.enteredPromoCode = enteredPromoCode;
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

    calculateTotalWithDiscount(customer: ICustomer): number {
        let subtotal = this.subtotal();

        for (const discount of discountStorage.getAllDiscountStrategies()) {
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

export interface ICustomer {
    name: string;
    hasLoyaltyCard: boolean;
}

export class Customer implements ICustomer {
    name: string;
    hasLoyaltyCard: boolean;

    constructor(name: string, hasLoyaltyCard: boolean) {
        this.name = name;
        this.hasLoyaltyCard = hasLoyaltyCard;
    }
}
