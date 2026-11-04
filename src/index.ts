import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 3000;

createApp().listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}`);
});
