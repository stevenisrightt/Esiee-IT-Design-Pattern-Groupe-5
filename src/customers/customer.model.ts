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
