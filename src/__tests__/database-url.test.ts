import {afterEach,expect,it,vi} from 'vitest';
import {buildDatabaseUrl} from '@/lib/database-url';
afterEach(()=>vi.unstubAllEnvs());
it('uses transaction pooler compatibility with a bounded serverless pool',()=>{
 vi.stubEnv('VERCEL','1');const url=new URL(buildDatabaseUrl('postgresql://reader:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'));
 expect(url.searchParams.get('pgbouncer')).toBe('true');expect(url.searchParams.get('connection_limit')).toBe('1');expect(url.searchParams.get('pool_timeout')).toBe('10');
});
it('preserves explicit connection settings and isolated schema',()=>{
 vi.stubEnv('VERCEL','1');const url=new URL(buildDatabaseUrl('postgresql://reader:secret@host:6543/postgres?schema=qa&connection_limit=2&pool_timeout=7&pgbouncer=false&connect_timeout=8'));
 expect(Object.fromEntries(url.searchParams)).toEqual({schema:'qa',connection_limit:'2',pool_timeout:'7',pgbouncer:'false',connect_timeout:'8'});
});
it('keeps direct connections direct and local pool sizing unchanged',()=>{
 vi.stubEnv('VERCEL','');vi.stubEnv('VERCEL_ENV','');const url=new URL(buildDatabaseUrl('postgresql://reader:secret@db.example:5432/postgres'));
 expect(url.searchParams.has('pgbouncer')).toBe(false);expect(url.searchParams.get('connection_limit')).toBe('5');
});
it('accepts missing URLs without inventing a database',()=>expect(buildDatabaseUrl('')).toBe(''));
it('allows an explicit two-connection deployment trial without changing other URL settings',()=>{
 vi.stubEnv('DATABASE_CONNECTION_LIMIT','2');const url=new URL(buildDatabaseUrl('postgresql://reader:secret@host:6543/postgres?connection_limit=1&schema=qa&pool_timeout=7'));
 expect(Object.fromEntries(url.searchParams)).toMatchObject({connection_limit:'2',schema:'qa',pool_timeout:'7',pgbouncer:'true'});
});
it.each(['','0','3','100','two'])('rejects unbounded or malformed pool overrides (%s)',limit=>{
 vi.stubEnv('DATABASE_CONNECTION_LIMIT',limit);expect(()=>buildDatabaseUrl('postgresql://reader:secret@host:6543/postgres')).toThrow('DATABASE_CONNECTION_LIMIT must be 1 or 2');
});
it('reports only numeric original and effective limits',async()=>{
 const {databaseConnectionPoolInfo}=await import('@/lib/database-url');vi.stubEnv('VERCEL','1');vi.stubEnv('DATABASE_URL','postgresql://reader:secret@host:6543/postgres');vi.stubEnv('DATABASE_CONNECTION_LIMIT','2');
 expect(databaseConnectionPoolInfo()).toEqual({baseLimit:1,effectiveLimit:2});expect(JSON.stringify(databaseConnectionPoolInfo())).not.toContain('secret');
});
it('pins the bundled Supabase CA after checking the complete AI Preview scope',()=>{
 const connection='postgresql://steamfoot_ai_preview_20261125.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
 const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/ai-digital-butler-core',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',AI_DIGITAL_BUTLER_PREVIEW:'1',AI_EXTERNAL_DELIVERY_DISABLED:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_NOTIFICATIONS_ENABLED:'0',DATABASE_URL:connection,DIRECT_URL:connection};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const url=new URL(buildDatabaseUrl());
 expect(url.searchParams.get('sslaccept')).toBe('strict');
 expect(url.searchParams.get('sslmode')).toBe('require');
 expect(url.searchParams.get('sslcert')).toBe(process.cwd()+'/scripts/certs/supabase-root-2021.crt');
 expect(url.searchParams.get('pgbouncer')).toBe('true');
 vi.stubEnv('VERCEL_ENV','production');
 expect(()=>buildDatabaseUrl()).toThrow('AI Preview isolation');
});
