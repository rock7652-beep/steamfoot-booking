import {beautyProductionCaPath,verifyBeautyProductionCa} from '../../scripts/beauty-production-ca.mjs';
import {buildDatabaseUrl} from './database-url';

export class AddOnsDatabaseConfigurationError extends Error {
 constructor(){super('附加項目專用連線尚未完成設定');this.name='AddOnsDatabaseConfigurationError';}
}

/** No fallback to DATABASE_URL: these credentials belong only to shared add-ons. */
export function addOnsDatabaseSelection(env:Record<string,string|undefined>=process.env){
 const fail=()=>new AddOnsDatabaseConfigurationError();
 const value=env.ADDONS_DATABASE_URL,role=env.ADDONS_DATABASE_ROLE,project=env.ADDONS_DATABASE_PROJECT_REF;
 if(!value||!role||!/^steamfoot_addons_[a-z0-9_]+$/.test(role)||!project||!/^[a-z0-9]{20}$/.test(project))throw fail();
 let url:URL;try{url=new URL(value);}catch{throw fail();}
 let user:string;try{user=decodeURIComponent(url.username);}catch{throw fail();}
 const direct=url.hostname===`db.${project}.supabase.co`&&user===role;
 const pooled=/^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname)&&user===`${role}.${project}`;
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.pathname!=='/postgres'||!['','5432','6543'].includes(url.port)||(!direct&&!pooled))throw fail();
 // A project label supplied alongside a URL is not production isolation evidence.
 if(env.VERCEL_ENV==='production'&&project!=='qijlnhtpbintanzpxkvf')throw fail();
 const allowed=new Set(['schema','sslmode','sslaccept','pgbouncer','connection_limit','pool_timeout','connect_timeout','statement_cache_size','application_name']);
 if([...url.searchParams.keys()].some(key=>!allowed.has(key))||url.searchParams.has('schema')&&url.searchParams.get('schema')!=='public')throw fail();
 if(url.searchParams.has('sslmode')&&!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')!))throw fail();
 if(url.searchParams.has('sslaccept')&&url.searchParams.get('sslaccept')!=='strict')throw fail();
 url.searchParams.set('sslmode',url.searchParams.get('sslmode')??'require');
 url.searchParams.set('sslaccept','strict');
 if(env.VERCEL_ENV==='production'){verifyBeautyProductionCa();url.searchParams.set('sslcert',beautyProductionCaPath());}
 const effective=new URL(buildDatabaseUrl(url.toString()));
 effective.searchParams.set('connection_limit','1');
 effective.searchParams.set('pool_timeout','10');
 effective.searchParams.set('connect_timeout','10');
 if(pooled||url.port==='6543')effective.searchParams.set('pgbouncer','true');
 return {url:effective.toString(),role};
}

