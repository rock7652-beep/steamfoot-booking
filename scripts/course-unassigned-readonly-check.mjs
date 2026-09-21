/** Emit read-only SQL using the actual query implementation and synthetic CTEs.
 * No DB connection, credentials, DDL, or fixture writes. Run the emitted queries
 * on the isolated preview PostgreSQL project to validate its real SQL semantics.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const queryModule = { exports: {} };
const captured = [];
const source = readFileSync(new URL("../src/server/queries/course-unassigned-plans.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { module: queryModule, exports: queryModule.exports, require: name => {
  if (name === "server-only") return {};
  if (name === "@prisma/client") return require(name);
  if (name === "@/lib/db") return { prisma: { $queryRaw: async sql => { captured.push(sql); return [{ total: 0, page: 1, rows: [] }]; } } };
  throw new Error(`Unexpected dependency: ${name}`);
} });
await queryModule.exports.getCourseUnassignedPlanCount("a", null);
await queryModule.exports.getCourseUnassignedPlanPage("a", null, 1);
await queryModule.exports.getCourseUnassignedPlanPage("a", null, 999);
await queryModule.exports.getCourseUnassignedPlanPage("a", "manager", 1);
await queryModule.exports.getCourseUnassignedPlanPage("missing", null, 99);
const fixtures = readFileSync(new URL("../src/__tests__/helpers/course-unassigned-fixture.sql", import.meta.url), "utf8");
const literal = value => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return "'" + value.replaceAll("'", "''") + "'";
  throw new Error("Unsupported test parameter");
};
const queries = captured.map(query => {
  const sql = query.text.replace(/\$(\d+)/g, (_match, number) => literal(query.values[Number(number) - 1])).trim();
  return /^WITH\s/i.test(sql) ? `WITH ${fixtures}, ${sql.replace(/^WITH\s/i, "")}` : `WITH ${fixtures} ${sql}`;
});
process.stdout.write(JSON.stringify({ expected: { all: 40, manager: 39, lastPage: 2, lastPageRows: 10, empty: 0 }, queries }));
