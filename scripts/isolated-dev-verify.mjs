import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {verifyIsolatedDevelopmentDatabase,assertIsolatedDevelopment} from './isolated-dev-scope.mjs';
const {env}=JSON.parse(readFileSync('work/isolated-dev.json','utf8'));
const db=new PrismaClient({datasourceUrl:env.DATABASE_URL});
try {
 await verifyIsolatedDevelopmentDatabase(db,env);
 await assert.rejects(verifyIsolatedDevelopmentDatabase(db,{...env,STEAMFOOT_DEV_TOKEN:'0'.repeat(64)}),/verification failed/);
 await assert.rejects(verifyIsolatedDevelopmentDatabase(db,{...env,STEAMFOOT_DEV_SERVER_ADDRESS:'172.17.255.254'}),/verification failed/);
 await assert.rejects(db.$executeRawUnsafe("UPDATE steamfoot_dev_guard.identity SET token=token"),/permission denied/);
 for(const mode of ['production','test'])assert.throws(()=>assertIsolatedDevelopment({...env,NODE_ENV:mode}));
 for(const target of ['db.example.invalid','localhost','127.1'])assert.throws(()=>assertIsolatedDevelopment({...env,DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1',target)}));
 console.info('PASS: actual PostgreSQL identity and destination, wrong-token/address rejection, read-only guard marker, remote/prod/test refusal.');
} finally{await db.$disconnect();}
