import { Router, type NextFunction, type Request, type Response } from "express";
import { PaymentOrchestrator } from "./payment-orchestrator";
import {
  InvalidPaymentMethodError,
  InvalidPaymentRequestError,
  PaymentMethodsUnavailableError
} from "./payment.types";

type RequestObject = Record<string, unknown>;

function isRequestObject(value: unknown): value is RequestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createPaymentRouter(orchestrator: PaymentOrchestrator): Router {
  const router = Router();

  router.post("/", async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const body: unknown = req.body;

    if (
      !isRequestObject(body) ||
      typeof body.orderId !== "string" ||
      typeof body.clientId !== "string" ||
      typeof body.amountCents !== "number" ||
      (body.preferredMethodId !== undefined &&
        typeof body.preferredMethodId !== "string")
    ) {
      res.status(400).json({
        error: "Les champs orderId, clientId et amountCents sont obligatoires."
      });
      return;
    }

    try {
      const result = await orchestrator.pay(
        {
          orderId: body.orderId,
          clientId: body.clientId,
          amountCents: body.amountCents
        },
        body.preferredMethodId as string | undefined
      );

      res.status(result.status === "accepted" ? 200 : 402).json(result);
    } catch (error) {
      if (
        error instanceof InvalidPaymentRequestError ||
        error instanceof InvalidPaymentMethodError
      ) {
        res.status(400).json({ error: error.message });
        return;
      }

      if (error instanceof PaymentMethodsUnavailableError) {
        res.status(503).json({
          error: error.message,
          failures: error.failures
        });
        return;
      }

      next(error);
    }
  });

  return router;
}
