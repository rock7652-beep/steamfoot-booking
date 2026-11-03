// Isolated metadata rehearsal; never reads a connection URL or opens a network socket.
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 const setup=readFileSync('src/__tests__/store-notice-lifecycle.pg.test.ts','utf8').match(/await db.exec\(`(CREATE ROLE[\s\S]*?)`\);/)[1];
 await db.exec(setup);await db.exec(readFileSync('scripts/sql/store-notice-lifecycle-phase1.sql','utf8'));
 console.log(JSON.stringify((await db.query(readFileSync('scripts/qa/store-notice-lifecycle-schema-fingerprint.sql','utf8'))).rows));
}finally{await db.close();}
