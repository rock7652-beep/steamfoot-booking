import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { isolatedDevelopmentSql } from './isolated-dev-schema.mjs';
import { assertIsolatedDevelopment, verifyIsolatedDevelopmentDatabase } from './isolated-dev-scope.mjs';

const manifest = resolve('work/isolated-dev.json');
const dockerEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'].includes(key)));
const docker = (...args) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], { encoding: 'utf8', env: dockerEnvironment });
const command = process.argv[2];
if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') throw new Error('Isolated development refuses inherited non-development NODE_ENV.');
if (process.argv.length !== 3) throw new Error('Only setup/check/start/clean are supported; host and port are fixed to localhost:3000.');
// Never substitute this mode for any provider release or inherited DB target.
for (const key of ['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','WORKERS_CI_BRANCH','CF_PAGES_BRANCH','DATABASE_URL','DIRECT_URL'])
  if (process.env[key]) throw new Error(`Unset inherited ${key} before using dedicated isolated development.`);
function load() {
  const data = JSON.parse(readFileSync(manifest, 'utf8'));
  const env = { ...process.env, ...data.env };
  assertIsolatedDevelopment(env);
  const inspected = JSON.parse(docker('inspect', data.container))[0];
  if (inspected.Config.Labels?.['steamfoot.isolated-dev'] !== env.STEAMFOOT_DEV_ID || !inspected.State.Running ||
      inspected.NetworkSettings.Networks.bridge.IPAddress !== env.STEAMFOOT_DEV_SERVER_ADDRESS ||
      inspected.NetworkSettings.Ports['5432/tcp']?.length !== 1 ||
      inspected.NetworkSettings.Ports['5432/tcp'][0].HostIp !== '127.0.0.1' ||
      inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort !== new URL(env.DATABASE_URL).port)
    throw new Error('Isolated development container destination mismatch.');
  return { ...data, env };
}
async function verify(env) {
  const client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try { await verifyIsolatedDevelopmentDatabase(client, env); } finally { await client.$disconnect(); }
}
if (command === 'setup') {
  if (existsSync(manifest)) throw new Error('Existing manifest retained; use check/start or explicitly clean it first.');
  mkdirSync(resolve('work'), { recursive: true, mode: 0o700 });
  const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex'), password = randomBytes(32).toString('hex');
  const name = `steamfoot_dev_${id}`, container = `steamfoot-dev-${id}`;
  // Fresh container, no host/previous volume mounts. Only loopback is published.
  const adminEnv = { ...dockerEnvironment, POSTGRES_PASSWORD: randomBytes(32).toString('hex') };
  execFileSync('docker', ['--host=unix:///var/run/docker.sock','run','-d','--name',container,'--label',`steamfoot.isolated-dev=${id}`,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD','postgres:16-alpine'], { env: adminEnv, stdio: 'ignore' });
  try {
    for (let i=0; i<60; i++) {
      try { docker('exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'); break; }
      catch { if (i===59) throw new Error('Fresh PostgreSQL did not become ready.'); await new Promise(r=>setTimeout(r,500)); }
    }
    const sql = `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE ${name} LOGIN PASSWORD '${password}'; CREATE DATABASE ${name} OWNER ${name};`;
    execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{env:dockerEnvironment,input:sql,stdio:['pipe','ignore','inherit']});
    const identity = `CREATE SCHEMA steamfoot_dev_guard; REVOKE ALL ON SCHEMA steamfoot_dev_guard FROM PUBLIC;
      CREATE TABLE steamfoot_dev_guard.identity (singleton boolean PRIMARY KEY CHECK(singleton), token text NOT NULL);
      INSERT INTO steamfoot_dev_guard.identity VALUES (true,'${token}');
      REVOKE ALL ON TABLE steamfoot_dev_guard.identity FROM PUBLIC;
      GRANT USAGE ON SCHEMA steamfoot_dev_guard TO ${name}; GRANT SELECT ON steamfoot_dev_guard.identity TO ${name};`;
    execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d',name,'-v','ON_ERROR_STOP=1'],{env:dockerEnvironment,input:identity,stdio:['pipe','ignore','inherit']});
    const inspected = JSON.parse(docker('inspect',container))[0];
    const address = inspected.NetworkSettings.Networks.bridge.IPAddress;
    const port = inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort;
    const url = `postgresql://${name}:${password}@127.0.0.1:${port}/${name}`;
    const env = { NODE_ENV:'development', STEAMFOOT_ISOLATED_DEV:'1', STEAMFOOT_DEV_ID:id,
      STEAMFOOT_DEV_TOKEN:token, STEAMFOOT_DEV_SERVER_ADDRESS:address, DATABASE_URL:url, DIRECT_URL:url,
      AUTH_SECRET:randomBytes(32).toString('hex'), AUTH_URL:'http://localhost:3000', NEXTAUTH_URL:'http://localhost:3000' };
    await verify(env);
    // Generate schema DDL from the three checked-in datamodels. This is not the
    // deployment migration runner and never reads an existing business DB.
    const client = new PrismaClient({ datasourceUrl:url });
    try {
      for (const schema of ['prisma','spa-prisma/schema.prisma','course-prisma/schema.prisma']) {
        const ddl = execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel',schema,'--script'],{encoding:'utf8',env:{...process.env,...env}});
        await verifyIsolatedDevelopmentDatabase(client,env);
        for (const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean)) await client.$executeRawUnsafe(statement);
      }
    } finally { await client.$disconnect(); }
    await verify(env);
    execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U',name,'-d',name,'-v','ON_ERROR_STOP=1'], {env:dockerEnvironment,input:isolatedDevelopmentSql(),stdio:['pipe','ignore','inherit']});
    writeFileSync(manifest,JSON.stringify({container,env},null,2),{mode:0o600});
    console.info('Fresh isolated development database provisioned and actual server identity verified.');
  } catch (error) {
    docker('rm','-fv',container);
    throw error;
  }
} else if (['start','check','clean'].includes(command)) {
  const data=load();
  await verify(data.env);
  if (command==='clean') {
    docker('rm','-fv',data.container); unlinkSync(manifest);
    if (existsSync('work/isolated-fixture.json')) unlinkSync('work/isolated-fixture.json');
    console.info('Only this labelled isolated database and its synthetic data removed.');
  } else if (command==='check') console.info('Isolated container, loopback destination, database, role and identity verified.');
  else {
    const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3000'],{env:data.env,stdio:'inherit'});
    for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>child.kill(signal));
    child.on('exit',code=>process.exit(code ?? 1));
  }
} else throw new Error('Use setup, check, start or clean.');
