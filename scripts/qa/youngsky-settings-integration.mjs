// Clean environment, exact existing local QA guard. Never loads deployed credentials.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { assertSportsLiveFlowQaEnvironment } from "../sports-live-flow-qa-scope.mjs";
const env = Object.fromEntries(["PATH","HOME","TMPDIR","HTTP_PROXY","HTTPS_PROXY","NO_PROXY","NODE_EXTRA_CA_CERTS","SSL_CERT_FILE","CODEX_PROXY_CERT"].flatMap(key => process.env[key] ? [[key,process.env[key]]] : []));
Object.assign(env,{ NODE_ENV:"development", SPORTS_LIVE_FLOW_QA:"1", DATABASE_URL:"postgresql://postgres@127.0.0.1:55438/sports_live_flow_test", DIRECT_URL:"postgresql://postgres@127.0.0.1:55438/sports_live_flow_test", AUTH_URL:"http://localhost:3107", NEXTAUTH_URL:"http://localhost:3107", AUTH_TRUST_HOST:"true", AUTH_SECRET:"youngsky-disposable-local-integration-secret" });
assertSportsLiveFlowQaEnvironment(env);
for (const name of [".env",".env.local",".env.development",".env.development.local"]) if (existsSync(name)) throw Error("Ambient env files forbidden");
const commands = { seed:["node_modules/tsx/dist/cli.mjs","scripts/qa/youngsky-settings-integration-seed.ts"], dev:["node_modules/next/dist/bin/next","dev","--hostname","localhost","--port","3107"], browser:["scripts/qa/youngsky-settings-integration-browser.mjs"], reads:["scripts/qa/youngsky-settings-integration-browser.mjs","--reads-only"] };
if(!commands[process.argv[2]])throw Error("Expected seed, dev or browser");
if(["browser","reads"].includes(process.argv[2]))env.QA_PLAYWRIGHT_MODULE=createRequire(import.meta.url).resolve("playwright");
const child=spawn(process.execPath,commands[process.argv[2]],{env,stdio:"inherit"});
child.on("exit",code=>process.exitCode=code??1);
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
