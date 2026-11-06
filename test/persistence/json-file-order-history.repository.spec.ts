import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileOrderHistoryRepository } from "@/order-history/json-file-order-history.repository";
import type { HistoricalOrder } from "@/order-history/order-history.model";
import { JsonFileStore } from "@/persistence/json-file.store";
import {
  OrderHistoryConflictError,
  OrderHistoryNotFoundError
} from "@/order-history/order-history.repository";

function makeOrder(overrides: Partial<HistoricalOrder> = {}): HistoricalOrder {
  return {
    orderId: "order-1",
    clientId: "client-1",
    createdAt: new Date("2026-11-06T18:30:00.000Z"),
    status: "confirmed",
    restaurantName: "Da Michele",
    items: [{ name: "Margherita (M)", quantity: 2, unitPriceCents: 900 }],
    totalCents: 1800,
    ...overrides
  };
}

describe("JsonFileOrderHistoryRepository", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "order-history-"));
    filePath = join(dir, "nested", "order-history.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("démarre vide quand le fichier n'existe pas encore", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);

    expect(await repository.findByClientId("client-1")).toEqual([]);
  });

  it("retrouve les commandes après un redémarrage", async () => {
    const first = await JsonFileOrderHistoryRepository.open(filePath);
    await first.save(makeOrder());
    await first.save(makeOrder({ orderId: "order-2", clientId: "client-2" }));

    const reopened = await JsonFileOrderHistoryRepository.open(filePath);
    const orders = await reopened.findByClientId("client-1");

    expect(orders).toEqual([makeOrder()]);
    expect(orders[0].createdAt).toBeInstanceOf(Date);
  });

  it("ignore une deuxième sauvegarde identique", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);
    await repository.save(makeOrder());
    await repository.save(makeOrder());

    const stored = JSON.parse(await readFile(filePath, "utf8"));
    expect(stored).toHaveLength(1);
  });

  it("refuse une commande différente avec le même identifiant", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);
    await repository.save(makeOrder());

    await expect(
      repository.save(makeOrder({ totalCents: 9999 }))
    ).rejects.toBeInstanceOf(OrderHistoryConflictError);
  });

  it("n'écrase pas de commande quand plusieurs sauvegardes arrivent en même temps", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);

    await Promise.all(
      ["a", "b", "c", "d"].map(id => repository.save(makeOrder({ orderId: id })))
    );

    const reopened = await JsonFileOrderHistoryRepository.open(filePath);
    expect(await reopened.findByClientId("client-1")).toHaveLength(4);
  });

  it("refuse de démarrer sur un fichier corrompu au lieu de l'écraser", async () => {
    const corrupted = join(dir, "corrupted.json");
    await writeFile(corrupted, "{ pas du json", "utf8");

    await expect(JsonFileOrderHistoryRepository.open(corrupted)).rejects.toThrow(
      /JSON invalide/
    );
    expect(await readFile(corrupted, "utf8")).toBe("{ pas du json");
  });

  it("met à jour le statut successivement en préservant la commande sans doublon", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);
    await repository.save(makeOrder());

    for (const status of ["preparing", "ready", "delivered"] as const) {
      const updated = await repository.updateStatus("order-1", status);
      expect(updated).toEqual(makeOrder({ status }));
      await expect(repository.findByClientId("client-1"))
        .resolves.toEqual([makeOrder({ status })]);
    }

    expect(JSON.parse(await readFile(filePath, "utf8"))).toHaveLength(1);
  });

  it("retourne une erreur explicite quand la commande n'existe pas", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);

    await expect(repository.updateStatus("missing", "preparing"))
      .rejects.toBeInstanceOf(OrderHistoryNotFoundError);
  });

  it("remonte une erreur d'écriture sans modifier l'état mémoire ou le fichier", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);
    await repository.save(makeOrder());
    const before = await readFile(filePath, "utf8");
    vi.spyOn(JsonFileStore.prototype, "writeAll")
      .mockRejectedValueOnce(new Error("Disque indisponible"));

    await expect(repository.updateStatus("order-1", "preparing"))
      .rejects.toThrow("Disque indisponible");

    expect(await readFile(filePath, "utf8")).toBe(before);
    const reopened = await JsonFileOrderHistoryRepository.open(filePath);
    await expect(reopened.findByClientId("client-1"))
      .resolves.toEqual([makeOrder()]);
  });

  it("sérialise deux mises à jour successives et persiste le dernier statut", async () => {
    const repository = await JsonFileOrderHistoryRepository.open(filePath);
    await repository.save(makeOrder());

    await Promise.all([
      repository.updateStatus("order-1", "preparing"),
      repository.updateStatus("order-1", "ready")
    ]);

    const reopened = await JsonFileOrderHistoryRepository.open(filePath);
    await expect(reopened.findByClientId("client-1"))
      .resolves.toEqual([makeOrder({ status: "ready" })]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toHaveLength(1);
  });
});
