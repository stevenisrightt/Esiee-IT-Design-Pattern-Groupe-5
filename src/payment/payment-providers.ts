export type ProviderPaymentOutcome =
  | { readonly status: "accepted"; readonly transactionId: string }
  | { readonly status: "declined"; readonly reason: string };

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export interface CardProcessor {
  chargeCard(
    orderId: string,
    amountCents: number
  ): Promise<ProviderPaymentOutcome>;
}

export interface WalletProcessor {
  submitWalletPayment(input: {
    readonly walletOwnerId: string;
    readonly reference: string;
    readonly amount: number;
    readonly currency: "EUR";
  }): Promise<ProviderPaymentOutcome>;
}

export interface CashOnDeliveryProcessor {
  scheduleCashCollection(
    orderReference: string,
    amountCents: number,
    recipientId: string
  ): Promise<ProviderPaymentOutcome>;
}

export class SimulatedCardProcessor implements CardProcessor {
  async chargeCard(
    orderId: string,
    amountCents: number
  ): Promise<ProviderPaymentOutcome> {
    console.log(`Paiement carte simulé : ${orderId}, ${amountCents} centimes.`);
    return { status: "accepted", transactionId: `card-${orderId}` };
  }
}

export class SimulatedWalletProcessor implements WalletProcessor {
  async submitWalletPayment(input: {
    readonly walletOwnerId: string;
    readonly reference: string;
    readonly amount: number;
    readonly currency: "EUR";
  }): Promise<ProviderPaymentOutcome> {
    console.log(
      `Paiement portefeuille simulé : ${input.reference}, ` +
      `${input.amount} ${input.currency}, client ${input.walletOwnerId}.`
    );
    return { status: "accepted", transactionId: `wallet-${input.reference}` };
  }
}

export class SimulatedCashOnDeliveryProcessor
implements CashOnDeliveryProcessor {
  async scheduleCashCollection(
    orderReference: string,
    amountCents: number,
    recipientId: string
  ): Promise<ProviderPaymentOutcome> {
    console.log(
      `Paiement à la livraison simulé : ${orderReference}, ` +
      `${amountCents} centimes, client ${recipientId}.`
    );
    return { status: "accepted", transactionId: `cash-${orderReference}` };
  }
}
