import { createApp } from "./app";
import { JsonFileStorageFactory } from "@/persistence/storage.factory";

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR ?? "data";

// Persistance durable (US04 + US09) : la fabrique "fichiers JSON" fournit
// des repositories dont les données survivent à un redémarrage du serveur.
const storage = await JsonFileStorageFactory.open(DATA_DIR);

createApp(storage).listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}`);
    console.log(`Données persistées dans ${DATA_DIR}/`);
});
