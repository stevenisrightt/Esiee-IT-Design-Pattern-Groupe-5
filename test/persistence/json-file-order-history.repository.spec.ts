import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileOrderHistoryRepository } from "@/order-history/json-file-order-history.repository";
import type { HistoricalOrder } from "@/order-history/order-history.model";
import { OrderHistoryConflictError } from "@/order-history/order-history.repository";

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
});
