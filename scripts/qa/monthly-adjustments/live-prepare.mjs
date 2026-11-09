import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
if(existsSync('/tmp/monthly-live-env.json'))throw Error('Existing local QA configuration is preserved; remove it only after stopping its task-owned server/database.');
const password=randomBytes(24).toString('hex');
const env={NODE_ENV:'development',BEAUTY_SHARED_PAGES_LOCAL_QA:'1',BEAUTY_MODULE_ENABLED:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_URL:'http://localhost:3123',NEXTAUTH_URL:'http://localhost:3123',AUTH_TRUST_HOST:'true',AUTH_SECRET:randomBytes(32).toString('hex'),DATABASE_URL:`postgresql://beauty_shared_pages_app:${password}@127.0.0.1:32771/beauty_shared_pages_qa`,DIRECT_URL:`postgresql://beauty_shared_pages_app:${password}@127.0.0.1:32771/beauty_shared_pages_qa`};
writeFileSync('/tmp/monthly-live-env.json',JSON.stringify(env),{mode:0o600});
writeFileSync('/tmp/monthly-live-init.sql',`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE beauty_shared_pages_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; ALTER DATABASE beauty_shared_pages_qa OWNER TO beauty_shared_pages_app; GRANT CREATE ON SCHEMA public TO beauty_shared_pages_app;`,{mode:0o600});
console.log('Synthetic local configuration prepared; credentials remain in /tmp only.');
