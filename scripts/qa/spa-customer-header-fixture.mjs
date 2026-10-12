// Run from the repository root: node scripts/qa/spa-customer-header-fixture.mjs
// Open the printed local URL in a browser attached to this same machine.
// No app routes, database, credentials, or external action calls are used.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const server = await createServer({
  root,
  configFile: false,
  cacheDir: path.join(os.tmpdir(), "spa-header-fixture-cache"),
  plugins: [react(), {
    name: "spa-header-isolated-fixture",
    resolveId(id, importer) {
      if (id === "next/navigation") return "\0spa-header-navigation";
      if (id === "./operation-guide-content" && importer?.endsWith("operation-guide-shell.tsx")) return "\0spa-header-guide-content";
    },
    load(id) {
      if (id === "\0spa-header-navigation") return 'export const usePathname = () => "/dashboard/customers";';
      if (id === "\0spa-header-guide-content") return "export const OperationGuideContent = () => null;";
    },
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) {
          res.setHeader("Content-Type", "text/html");
          s.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/spa-customer-header-fixture.tsx"></script></body></html>')
            .then(html => res.end(html))
            .catch(next);
        } else next();
      });
    },
  }],
  resolve: { alias: { "@": path.join(root, "src") } },
  css: { postcss: { plugins: [tailwind()] } },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
});
await server.listen();
console.log("Synthetic SPA header fixture: http://127.0.0.1:4175/");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => { await server.close(); process.exit(0); });
}
