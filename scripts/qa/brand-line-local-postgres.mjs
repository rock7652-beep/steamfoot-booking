// Disposable local PostgreSQL: Unix socket only, no published port or network.
import { execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
export async function brandLineLocalPostgres() {
  const name = `brand-line-${randomUUID()}`,
    dir = mkdtempSync(join(tmpdir(), "brand-line-"));
  chmodSync(dir, 0o777);
  const docker = (args) =>
    execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  let started = false,
    admin;
  const close = async () => {
    if (admin) await admin.end();
    if (started) docker(["rm", "-f", name]);
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    docker(["image", "inspect", "postgres:17.6-alpine"]);
    docker([
      "run",
      "-d",
      "--pull=never",
      "--name",
      name,
      "--network",
      "none",
      "--user",
      "postgres",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,uid=70,gid=70,mode=0700",
      "--mount",
      `type=bind,source=${dir},target=/qa`,
      "--entrypoint",
      "sh",
      "postgres:17.6-alpine",
      "-c",
      "initdb -D /var/lib/postgresql/data -A trust >/dev/null && exec postgres -D /var/lib/postgresql/data -c listen_addresses= -c unix_socket_directories=/qa",
    ]);
    started = true;
    for (let i = 0; ; i++) {
      try {
        docker(["exec", name, "pg_isready", "-h", "/qa", "-U", "postgres"]);
        break;
      } catch (error) {
        if (i > 100) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    admin = new pg.Client({
      host: dir,
      user: "postgres",
      database: "postgres",
    });
    await admin.connect();
    await admin.query(
      readFileSync(
        "prisma/migrations/20261127140000_brand_ai_reply_log/migration.sql",
        "utf8",
      ),
    );
    await admin.query(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
    );
    await admin.query(
      readFileSync(
        "prisma/migrations/20261128060000_brand_ai_conversation/migration.sql",
        "utf8",
      ),
    );
    await admin.query(`CREATE ROLE brand_line_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO brand_line_runtime;
      ALTER DATABASE postgres SET timezone='Asia/Taipei'`);
    await admin.query(
      readFileSync(
        "scripts/sql/brand-line-ai/preview-runtime.proposed.sql",
        "utf8",
      ).replaceAll("steamfoot_ai_preview_20261125", "brand_line_runtime"),
    );
    await admin.query(
      'GRANT SELECT,INSERT,UPDATE,DELETE ON "BrandAiConversation" TO brand_line_runtime; CREATE POLICY brand_memory_runtime ON "BrandAiConversation" TO brand_line_runtime USING(true) WITH CHECK(true);',
    );
    return {
      admin,
      url: `postgresql://brand_line_runtime@localhost/postgres?host=${encodeURIComponent(dir)}&connection_limit=1`,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
