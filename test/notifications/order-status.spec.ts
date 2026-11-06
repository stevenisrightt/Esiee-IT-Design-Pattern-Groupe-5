import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Order } from "@/orders/order.model";
import {
    EmailListener,
    OrderStatusListener,
    SmsListener,
} from "@/notifications/order-status.listener";
import { OrderStatus } from "@/order-history/order-history.model";

describe("US5 - Notifications (Observer)", () => {
    let log: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        log = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        log.mockRestore();
    });

    it("une nouvelle commande est en attente", () => {
        expect(new Order([]).status).toBe("pending");
    });

    it("plusieurs listeners réagissent au changement de statut", () => {
        const order = new Order([]);
        order.subscribe(new EmailListener());
        order.subscribe(new SmsListener());

        order.changeStatus("confirmed");

        expect(order.status).toBe("confirmed");
        expect(log).toHaveBeenCalledTimes(2);
    });

    it("chaque listener fait un console.log différent", () => {
        const order = new Order([]);
        order.subscribe(new EmailListener());
        order.subscribe(new SmsListener());

        order.changeStatus("preparing");

        expect(log).toHaveBeenCalledWith(
            "[Email] Votre commande est maintenant : preparing",
        );
        expect(log).toHaveBeenCalledWith(
            "[SMS] Statut de votre commande : preparing",
        );
    });

    it("ajouter un listener ne modifie pas la classe Order", () => {
        const received: OrderStatus[] = [];
        class PushListener implements OrderStatusListener {
            update(status: OrderStatus): void {
                received.push(status);
            }
        }
        const order = new Order([]);
        order.subscribe(new PushListener());

        order.changeStatus("delivered");

        expect(received).toEqual(["delivered"]);
    });

    it("désactive puis réactive un listener dynamiquement", () => {
        const order = new Order([]);
        const sms = new SmsListener();
        order.subscribe(new EmailListener());
        order.subscribe(sms);

        order.unsubscribe(sms);
        order.changeStatus("confirmed");
        expect(log).toHaveBeenCalledTimes(1);

        order.subscribe(sms);
        order.changeStatus("preparing");
        expect(log).toHaveBeenCalledTimes(3);
    });

    it("n'abonne pas deux fois le même listener", () => {
        const order = new Order([]);
        const email = new EmailListener();
        order.subscribe(email);
        order.subscribe(email);

        order.changeStatus("confirmed");

        expect(log).toHaveBeenCalledTimes(1);
    });

    it("ne notifie personne si le statut ne change pas", () => {
        const order = new Order([]);
        order.subscribe(new EmailListener());

        order.changeStatus("pending");

        expect(log).not.toHaveBeenCalled();
    });
});
