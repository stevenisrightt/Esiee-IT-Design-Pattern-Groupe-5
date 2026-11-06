import type { ICustomer } from "@/customers/customer.model";
import type { IOrder } from "@/orders/order.model";

export enum DiscountType {
    Percentage = "percentage",
    Fixed = "fixed",
}

export interface DiscountStrategy {
    appliesTo(order: IOrder, customer: ICustomer): boolean;
    getDiscount(order: IOrder, customer: ICustomer): number;
    getDiscountType(order: IOrder): DiscountType;
    getPriority(): number; // Higher number means it will be applied first
}

export class PromoCode {
    code: string;
    type: DiscountType;
    value: number;

    constructor(code: string, type: DiscountType, value: number) {
        this.code = code;
        this.type = type;
        this.value = value;
    }
}
