import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../../", import.meta.url));
const actions = fileURLToPath(new URL("./actions.ts", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)), plugins: [react()],
  resolve: { alias: [
    { find: "@/server/actions/booking-participants", replacement: actions },
    { find: "@/server/actions/wallet", replacement: actions },
    { find: "@", replacement: source },
  ] },
  server: { host: "127.0.0.1", port: 4182, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } },
});
