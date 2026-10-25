import {parse} from 'pg-connection-string';
import {beautyProductionCaPath,verifyBeautyProductionCa} from '../../scripts/beauty-production-ca.mjs';
import {describe,expect,it,vi} from 'vitest';
import {musicBuildPreflight} from '../../scripts/music-release-preflight.mjs';
import {beautyDatabaseSelection} from '../../scripts/beauty-database-scope.mjs';
import {beautyProductionReleasePreflight,validateBeautyProductionRelease,beautyProductionFailureDiagnostic,beautyPrismaProductionPreflight} from '../../scripts/beauty-production-release-preflight.mjs';
const env={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres.qijlnhtpbintanzpxkvf:original@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=public',BEAUTY_DATABASE_MODE:'dedicated',BEAUTY_DATABASE_ROLE:'steamfoot_beauty_prod_20261025',BEAUTY_DATABASE_PASSWORD:'a'.repeat(64),BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',BEAUTY_CHARGE_RULES_STORE_IDS:''};
describe('reviewed production Beauty connection',()=>{
 it('validates module-wide rollout while retaining the separate emergency editing switch',()=>{
  expect(()=>validateBeautyProductionRelease({...env,BEAUTY_CHARGE_RULES_SCOPE:'module',BEAUTY_CHARGE_RULES_ENABLED:'1',BEAUTY_CHARGE_EDITING_ENABLED:'1'})).not.toThrow();
  expect(()=>validateBeautyProductionRelease({...env,BEAUTY_CHARGE_RULES_SCOPE:'module',BEAUTY_CHARGE_RULES_ENABLED:'1',BEAUTY_CHARGE_EDITING_ENABLED:'0'})).not.toThrow();
  expect(()=>validateBeautyProductionRelease({...env,BEAUTY_CHARGE_RULES_SCOPE:'module',BEAUTY_CHARGE_RULES_ENABLED:'0',BEAUTY_CHARGE_EDITING_ENABLED:'1'})).toThrow('scope');
  expect(()=>validateBeautyProductionRelease({...env,BEAUTY_CHARGE_RULES_SCOPE:'unknown'})).toThrow('scope');
 });

 it('checks the live Prisma adapter identity in a read-only transaction and disconnects',async()=>{
  const execute=vi.fn(),query=vi.fn().mockResolvedValueOnce([{role:env.BEAUTY_DATABASE_ROLE,database:'postgres'}]).mockResolvedValueOnce([]);
  const findMany=vi.fn().mockResolvedValue([]),disconnect=vi.fn(),factory=vi.fn(async()=>({$connect:vi.fn(),$transaction:async(work:(tx:unknown)=>Promise<unknown>)=>work({$executeRawUnsafe:execute,$queryRawUnsafe:query,beautySetting:{findMany}}),$disconnect:disconnect}));
  await expect(beautyPrismaProductionPreflight(env,factory)).resolves.toMatchObject({prisma:true,readonly:true});expect(execute).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');expect(disconnect).toHaveBeenCalledOnce();expect(findMany).toHaveBeenCalledWith({select:{storeId:true},take:1});
 });

 it('pins the public Supabase root and keeps strict verification for Prisma and pg',async()=>{
  expect(verifyBeautyProductionCa().ca).toBe(true);const u=new URL(beautyDatabaseSelection(env)!);
  expect(u.searchParams.get('sslcert')).toBe(beautyProductionCaPath());expect(u.searchParams.get('sslaccept')).toBe('strict');
  let captured='';const create=vi.fn(async(config:{connectionString:string})=>{captured=config.connectionString;return {connect:vi.fn().mockRejectedValue(Object.assign(new Error('secret URL must never be logged'),{code:'SELF_SIGNED_CERT_IN_CHAIN'})),end:vi.fn()};});
  let diagnostic='';try{await beautyProductionReleasePreflight(env,create);}catch(e){diagnostic=beautyProductionFailureDiagnostic(e);}
  expect(diagnostic).toContain('stage=connect code=SELF_SIGNED_CERT_IN_CHAIN');expect(diagnostic).not.toContain('secret URL');expect(diagnostic).not.toContain(env.BEAUTY_DATABASE_PASSWORD);
  const config=parse(captured);expect(new URL(captured).searchParams.has('sslcert')).toBe(false);expect(new URL(captured).searchParams.get('sslmode')).toBe('verify-full');expect(config.ssl).toMatchObject({ca:expect.stringContaining('BEGIN CERTIFICATE')});expect((config.ssl as {rejectUnauthorized?:boolean}).rejectUnauthorized).not.toBe(false);
 });

 it('blocks the actual build entry before database construction when a migration target leaks in',async()=>{await expect(musicBuildPreflight({...env,PRODUCTION_MIGRATION_TARGET:'unreviewed'})).rejects.toThrow('scope');});
 it('derives only the endpoint and uses distinct credentials without mutating the main URL',()=>{const before={...env};const u=new URL(beautyDatabaseSelection(env)!);expect(u.hostname).toBe(new URL(env.DATABASE_URL).hostname);expect(decodeURIComponent(u.username)).toBe('steamfoot_beauty_prod_20261025.qijlnhtpbintanzpxkvf');expect(u.password).toBe(env.BEAUTY_DATABASE_PASSWORD);expect(u.searchParams.get('sslmode')).toBe('require');expect(u.searchParams.get('pgbouncer')).toBe('true');expect(env).toEqual(before);});
 it('also derives a verified direct host',()=>{expect(new URL(beautyDatabaseSelection({...env,DATABASE_URL:'postgresql://postgres:original@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'})!).username).toBe(env.BEAUTY_DATABASE_ROLE);});
 it.each([{VERCEL_ENV:'preview'},{VERCEL_GIT_COMMIT_REF:'other'},{BEAUTY_DATABASE_ROLE:'postgres'},{BEAUTY_DATABASE_PASSWORD:'short'},{BEAUTY_DATABASE_URL:'postgresql://other:secret@host/postgres'},{DATABASE_URL:env.DATABASE_URL.replace('qijlnhtpbintanzpxkvf','ttworfzgwejdeolegkxl')},{DATABASE_URL:'postgresql://postgres:x@host.invalid/postgres'},{BEAUTY_DATABASE_PASSWORD:undefined}])('rejects unreviewed derived connection %j',patch=>expect(()=>beautyDatabaseSelection({...env,...patch})).toThrow());
 it.each([{PRODUCTION_MIGRATION_TARGET:'anything'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{BEAUTY_HOSTED_PREVIEW:'1'},{BEAUTY_CHARGE_RULES_STORE_IDS:'test-store'},{BEAUTY_DATABASE_MODE:'legacy'}])('blocks unsafe release flags %j',patch=>expect(()=>validateBeautyProductionRelease({...env,...patch})).toThrow());
 it('does not open a connection before validating the release scope',async()=>{const create=vi.fn();await expect(beautyProductionReleasePreflight({...env,PRODUCTION_MIGRATION_TARGET:'unrelated'},create)).rejects.toThrow();expect(create).not.toHaveBeenCalled();});
 it('uses read-only transactions and closes a verified runtime connection',async()=>{const query=vi.fn(async(sql:string)=>{if(sql.includes('current_user AS role'))return {rows:[{role:env.BEAUTY_DATABASE_ROLE,database:'postgres',tls:true}]};if(sql.includes('rolcanlogin'))return {rows:[{rolcanlogin:true}]};if(sql.includes('FROM pg_class'))return {rows:Array.from({length:14},()=>({}))};if(sql.includes('secret_read'))return {rows:[{secret_read:false,finance_write:false}]};return {rows:[]};});const end=vi.fn();await expect(beautyProductionReleasePreflight(env,async()=>({connect:vi.fn(),connection:{stream:{encrypted:true,authorized:true}},query,end}))).resolves.toMatchObject({readonly:true});expect(query).toHaveBeenCalledWith('BEGIN READ ONLY');expect(query).toHaveBeenCalledWith('ROLLBACK');expect(query.mock.calls.every(([s])=>/^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(s))).toBe(true);expect(end).toHaveBeenCalledOnce();});
 it('closes the client and rejects absent TLS',async()=>{const end=vi.fn();await expect(beautyProductionReleasePreflight(env,async()=>({connect:vi.fn(),query:vi.fn(async()=>({rows:[{role:env.BEAUTY_DATABASE_ROLE,database:'postgres',tls:false}]})),end}))).rejects.toThrow('TLS');expect(end).toHaveBeenCalledOnce();});
});
