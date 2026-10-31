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
