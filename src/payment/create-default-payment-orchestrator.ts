import {
  CardPaymentAdapter,
  CashOnDeliveryPaymentAdapter,
  WalletPaymentAdapter
} from "./payment-adapters";
import { PaymentOrchestrator } from "./payment-orchestrator";
import {
  SimulatedCardProcessor,
  SimulatedCashOnDeliveryProcessor,
  SimulatedWalletProcessor
} from "./payment-providers";

export function createDefaultPaymentOrchestrator(): PaymentOrchestrator {
  return new PaymentOrchestrator([
    new CardPaymentAdapter(new SimulatedCardProcessor()),
    new WalletPaymentAdapter(new SimulatedWalletProcessor()),
    new CashOnDeliveryPaymentAdapter(new SimulatedCashOnDeliveryProcessor())
  ]);
}
