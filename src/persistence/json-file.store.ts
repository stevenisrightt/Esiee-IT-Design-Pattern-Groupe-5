import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Stocke une liste d'enregistrements dans un fichier JSON.
 *
 * - Un fichier absent équivaut à une liste vide (premier démarrage).
 * - L'écriture passe par un fichier temporaire puis un renommage : un arrêt
 *   brutal du serveur ne laisse jamais un fichier à moitié écrit.
 * - Un fichier illisible fait échouer le chargement au lieu d'être écrasé,
 *   pour ne jamais perdre des données existantes en silence.
 */
export class JsonFileStore<T> {
  constructor(readonly filePath: string) {}

  async readAll(): Promise<unknown[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Fichier de données JSON invalide : ${this.filePath}.`, {
        cause: error
      });
    }

    if (!Array.isArray(data)) {
      throw new Error(
        `Le fichier de données doit contenir un tableau JSON : ${this.filePath}.`
      );
    }

    return data;
  }

  async writeAll(records: readonly T[]): Promise<void> {
    const json = `${JSON.stringify(records, null, 2)}\n`;
    const temporaryPath = `${this.filePath}.tmp`;

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, json, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

/**
 * Exécute les opérations une par une, dans l'ordre d'arrivée.
 * Évite que deux sauvegardes simultanées lisent le même état puis
 * s'écrasent mutuellement dans le fichier.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
