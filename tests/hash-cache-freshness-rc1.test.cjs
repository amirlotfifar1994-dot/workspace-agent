const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
let DatabaseSync=null;try{({DatabaseSync}=require('node:sqlite'));}catch{}
const {PersistentFileIndex,INDEX_SCHEMA_VERSION}=require('../electron/services/persistent-file-index.cjs');
if(!DatabaseSync){console.log('hash-cache-freshness-rc1 SKIP node:sqlite unavailable');process.exit(0);}
assert.equal(INDEX_SCHEMA_VERSION,3);
const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-hash-fresh-'));
let idx=new PersistentFileIndex(base);
const f={path:path.join(base,'a.bin'),size:100,mtimeMs:1000,ctimeMs:2000};
idx.setCachedHash(f,'a'.repeat(64));assert.equal(idx.getCachedHash(f).sha256,'a'.repeat(64));
assert.equal(idx.getCachedHash({...f,ctimeMs:3000}),null,'ctime change must invalidate same-size same-mtime cache entry');
idx.close?.();

const base2=fs.mkdtempSync(path.join(os.tmpdir(),'wa-index-v2-migrate-'));const dir=path.join(base2,'persistent-index');fs.mkdirSync(dir,{recursive:true});const dbPath=path.join(dir,'files.sqlite');
const db=new DatabaseSync(dbPath);db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO meta(key,value) VALUES('schema_version','2');CREATE TABLE hash_cache(path_key TEXT PRIMARY KEY,path TEXT NOT NULL,size INTEGER NOT NULL,mtime_ms REAL NOT NULL,sha256 TEXT NOT NULL,hashed_at TEXT NOT NULL);`);db.close();
idx=new PersistentFileIndex(base2);const cols=idx.db.prepare('PRAGMA table_info(hash_cache)').all().map(x=>x.name);assert(cols.includes('ctime_ms'));assert.equal(idx.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value,'3');idx.close?.();
console.log('hash-cache-freshness-rc1 PASS');
