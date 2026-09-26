const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
let DatabaseSync=null;try{({DatabaseSync}=require('node:sqlite'));}catch{}
const {categoryFor}=require('./organizer.cjs');
const {assertReadableDirectory,SKIP_DIRS}=require('./file-indexer.cjs');
const {toFsPath,keyPath:stableKeyPath,inside:stableInside,normalizeDisplayPath}=require('./windows-path-utils.cjs');

const INDEX_SCHEMA_VERSION=3;
const DEFAULT_SKIP_NAMES=new Set([...SKIP_DIRS].map(x=>String(x).toLowerCase()));
function now(){return new Date().toISOString();}
function keyPath(p){return stableKeyPath(p);}
function inside(root,target){return stableInside(root,target);}
function safeJson(v,fallback={}){try{return JSON.parse(v)}catch{return fallback}}
function clamp(n,min,max,fallback){const v=Number(n);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;}
function likeLiteral(v=''){return String(v).replace(/[\\%_]/g,m=>`\\${m}`);}

class PersistentFileIndex{
  constructor(baseDir,{journal=null,dbPath=''}={}){
    this.dir=path.join(baseDir,'persistent-index');
    fs.mkdirSync(this.dir,{recursive:true});
    this.dbPath=dbPath||path.join(this.dir,'files.sqlite');
    this.journal=journal;this.activeScans=new Set();
    if(!DatabaseSync)throw Object.assign(new Error('Runtime فعلی node:sqlite را ندارد؛ Node/Electron جدیدتر لازم است.'),{code:'INDEX_SQLITE_UNAVAILABLE'});
    this.db=new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this._initSchema();
    this._prepare();
  }
  _initSchema(){
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS roots(
        root_key TEXT PRIMARY KEY,root TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'idle',
        started_at TEXT,completed_at TEXT,files_seen INTEGER NOT NULL DEFAULT 0,dirs_seen INTEGER NOT NULL DEFAULT 0,
        errors_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,last_error TEXT,pause_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS scan_queue(
        root_key TEXT NOT NULL,generation INTEGER NOT NULL,dir_key TEXT NOT NULL,dir_path TEXT NOT NULL,
        PRIMARY KEY(root_key,generation,dir_key)
      );
      CREATE TABLE IF NOT EXISTS files(
        root_key TEXT NOT NULL,path_key TEXT NOT NULL,root TEXT NOT NULL,path TEXT NOT NULL,relative_path TEXT NOT NULL,parent_path TEXT NOT NULL,
        name TEXT NOT NULL,ext TEXT NOT NULL,category TEXT NOT NULL,size INTEGER NOT NULL,mtime_ms REAL NOT NULL,ctime_ms REAL NOT NULL,
        generation INTEGER NOT NULL,indexed_at TEXT NOT NULL,
        PRIMARY KEY(root_key,path_key)
      );
      CREATE INDEX IF NOT EXISTS idx_files_root_mtime ON files(root_key,mtime_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_files_root_size ON files(root_key,size);
      CREATE INDEX IF NOT EXISTS idx_files_root_ext ON files(root_key,ext);
      CREATE INDEX IF NOT EXISTS idx_files_root_category ON files(root_key,category);
      CREATE INDEX IF NOT EXISTS idx_files_root_name ON files(root_key,name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_files_root_parent ON files(root_key,parent_path);
      CREATE TABLE IF NOT EXISTS scan_errors(
        id INTEGER PRIMARY KEY AUTOINCREMENT,root_key TEXT NOT NULL,generation INTEGER NOT NULL,path TEXT NOT NULL,code TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scan_errors_root_gen ON scan_errors(root_key,generation,id DESC);
      CREATE TABLE IF NOT EXISTS hash_cache(
        path_key TEXT PRIMARY KEY,path TEXT NOT NULL,size INTEGER NOT NULL,mtime_ms REAL NOT NULL,ctime_ms REAL NOT NULL DEFAULT 0,sha256 TEXT NOT NULL,hashed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS root_runtime(
        root_key TEXT PRIMARY KEY,available INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'unknown',identity_key TEXT NOT NULL DEFAULT '',
        volume_unique_id TEXT NOT NULL DEFAULT '',drive_letter TEXT NOT NULL DEFAULT '',file_system TEXT NOT NULL DEFAULT '',drive_type TEXT NOT NULL DEFAULT '',
        health_status TEXT NOT NULL DEFAULT '',last_probe_at TEXT,last_seen_at TEXT,unavailable_since TEXT,identity_changed INTEGER NOT NULL DEFAULT 0,
        rebind_candidate TEXT,last_code TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL
      );
    `);
    const hashCols=new Set(this.db.prepare('PRAGMA table_info(hash_cache)').all().map(x=>x.name));
    if(!hashCols.has('ctime_ms'))this.db.exec('ALTER TABLE hash_cache ADD COLUMN ctime_ms REAL NOT NULL DEFAULT 0');
    const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema_version');
    if(!row)this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema_version',String(INDEX_SCHEMA_VERSION));
    else if([1,2].includes(Number(row.value)))this.db.prepare('UPDATE meta SET value=? WHERE key=?').run(String(INDEX_SCHEMA_VERSION),'schema_version');
    else if(Number(row.value)!==INDEX_SCHEMA_VERSION)throw Object.assign(new Error(`Persistent index schema ${row.value} پشتیبانی نمی‌شود.`),{code:'INDEX_SCHEMA_UNSUPPORTED'});
  }
  _prepare(){
    this.st={
      rootGet:this.db.prepare('SELECT * FROM roots WHERE root_key=?'),
      rootUpsert:this.db.prepare(`INSERT INTO roots(root_key,root,generation,status,updated_at) VALUES(?,?,0,'idle',?) ON CONFLICT(root_key) DO UPDATE SET root=excluded.root,updated_at=excluded.updated_at`),
      queueOne:this.db.prepare('SELECT dir_path FROM scan_queue WHERE root_key=? AND generation=? ORDER BY rowid LIMIT 1'),
      queueInsert:this.db.prepare('INSERT OR IGNORE INTO scan_queue(root_key,generation,dir_key,dir_path) VALUES(?,?,?,?)'),
      queueDelete:this.db.prepare('DELETE FROM scan_queue WHERE root_key=? AND generation=? AND dir_key=?'),
      fileUpsert:this.db.prepare(`INSERT INTO files(root_key,path_key,root,path,relative_path,parent_path,name,ext,category,size,mtime_ms,ctime_ms,generation,indexed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(root_key,path_key) DO UPDATE SET root=excluded.root,path=excluded.path,relative_path=excluded.relative_path,parent_path=excluded.parent_path,name=excluded.name,ext=excluded.ext,category=excluded.category,size=excluded.size,mtime_ms=excluded.mtime_ms,ctime_ms=excluded.ctime_ms,generation=excluded.generation,indexed_at=excluded.indexed_at`),
      errorInsert:this.db.prepare('INSERT INTO scan_errors(root_key,generation,path,code,kind,at) VALUES(?,?,?,?,?,?)'),
      hashGet:this.db.prepare('SELECT sha256,hashed_at FROM hash_cache WHERE path_key=? AND size=? AND ABS(mtime_ms-?)<2 AND ABS(ctime_ms-?)<2'),
      hashMeta:this.db.prepare('SELECT size,mtime_ms,ctime_ms FROM hash_cache WHERE path_key=?'),
      hashDelete:this.db.prepare('DELETE FROM hash_cache WHERE path_key=?'),
      hashSet:this.db.prepare(`INSERT INTO hash_cache(path_key,path,size,mtime_ms,ctime_ms,sha256,hashed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(path_key) DO UPDATE SET path=excluded.path,size=excluded.size,mtime_ms=excluded.mtime_ms,ctime_ms=excluded.ctime_ms,sha256=excluded.sha256,hashed_at=excluded.hashed_at`),
      runtimeGet:this.db.prepare('SELECT * FROM root_runtime WHERE root_key=?'),
      runtimeSet:this.db.prepare(`INSERT INTO root_runtime(root_key,available,status,identity_key,volume_unique_id,drive_letter,file_system,drive_type,health_status,last_probe_at,last_seen_at,unavailable_since,identity_changed,rebind_candidate,last_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(root_key) DO UPDATE SET available=excluded.available,status=excluded.status,identity_key=excluded.identity_key,volume_unique_id=excluded.volume_unique_id,drive_letter=excluded.drive_letter,file_system=excluded.file_system,drive_type=excluded.drive_type,health_status=excluded.health_status,last_probe_at=excluded.last_probe_at,last_seen_at=excluded.last_seen_at,unavailable_since=excluded.unavailable_since,identity_changed=excluded.identity_changed,rebind_candidate=excluded.rebind_candidate,last_code=excluded.last_code,updated_at=excluded.updated_at`),
    };
  }
  _tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out;}catch(error){try{this.db.exec('ROLLBACK')}catch{}throw error;}}
  async _rootReadable(root){try{const st=await fsp.stat(toFsPath(root));return st.isDirectory();}catch{return false;}}
  _upsertFileBatch(rootKey,root,generation,batch=[]){if(!batch.length)return;this._tx(()=>{const stamp=now();for(const f of batch){const pk=keyPath(f.path);this.st.fileUpsert.run(rootKey,pk,root,f.path,path.relative(root,f.path),path.dirname(f.path),f.name,f.ext,categoryFor(f.ext),f.size,f.mtimeMs,f.ctimeMs,generation,stamp);const cache=this.st.hashMeta.get(pk);if(cache&&(Number(cache.size)!==f.size||Math.abs(Number(cache.mtime_ms)-f.mtimeMs)>=2||Math.abs(Number(cache.ctime_ms||0)-Number(f.ctimeMs||0))>=2))this.st.hashDelete.run(pk);}});}
  _ensureRoot(root){const rr=normalizeDisplayPath(String(root||''));const rk=keyPath(rr);this.st.rootUpsert.run(rk,rr,now());return{root:rr,rootKey:rk,row:this.st.rootGet.get(rk)};}
  _runtimeRow(rootKey){const r=this.st.runtimeGet.get(rootKey);if(!r)return null;let candidate=null;try{candidate=r.rebind_candidate?JSON.parse(r.rebind_candidate):null}catch{}return{available:Boolean(r.available),status:r.status||'unknown',identityKey:r.identity_key||'',volumeUniqueId:r.volume_unique_id||'',driveLetter:r.drive_letter||'',fileSystem:r.file_system||'',driveType:r.drive_type||'',healthStatus:r.health_status||'',lastProbeAt:r.last_probe_at||null,lastSeenAt:r.last_seen_at||null,unavailableSince:r.unavailable_since||null,identityChanged:Boolean(r.identity_changed),rebindCandidate:candidate,lastCode:r.last_code||''};}
  setRootRuntime(root,state={}){const rr=normalizeDisplayPath(String(root||'')),rk=keyPath(rr),at=now();this.st.runtimeSet.run(rk,state.available===false?0:1,String(state.status||'unknown'),String(state.identityKey||''),String(state.volumeUniqueId||''),String(state.driveLetter||''),String(state.fileSystem||''),String(state.driveType||''),String(state.healthStatus||''),state.lastProbeAt||at,state.lastSeenAt||null,state.unavailableSince||null,state.identityChanged?1:0,state.rebindCandidate?JSON.stringify(state.rebindCandidate):null,String(state.lastCode||''),at);return this._runtimeRow(rk);}
  rootRuntime(root){return this._runtimeRow(keyPath(normalizeDisplayPath(String(root||''))));}
  markStale(root,reason='RECONCILE_INCOMPLETE',details=null){const rr=normalizeDisplayPath(String(root||'')),rk=keyPath(rr);const row=this.st.rootGet.get(rk);if(!row)return{ok:false,code:'INDEX_ROOT_NOT_REGISTERED',root:rr};const code=String(reason||'RECONCILE_INCOMPLETE');this.db.prepare(`UPDATE roots SET status='stale',updated_at=?,pause_reason=?,last_error=? WHERE root_key=?`).run(now(),code,code,rk);this.journal?.append('INDEX_ROOT_STALE',{payload:{root:rr,reason:code,details:details||null}});return{ok:true,root:rr,status:'stale',reason:code};}
  async status(root=''){
    if(!root)return this.listRoots();
    const rr=normalizeDisplayPath(String(root));const rk=keyPath(rr);const row=this.st.rootGet.get(rk);const runtime=this._runtimeRow(rk);
    if(!row)return{schemaVersion:'persistent-index-v2',root:rr,status:'not-indexed',files:0,bytes:0,queue:0,generation:0,errors:0,runtime,dbPath:this.dbPath};
    const agg=this.db.prepare('SELECT COUNT(*) files,COALESCE(SUM(size),0) bytes,MAX(indexed_at) last_indexed_at FROM files WHERE root_key=?').get(rk);
    const q=this.db.prepare('SELECT COUNT(*) n FROM scan_queue WHERE root_key=? AND generation=?').get(rk,row.generation);
    return{schemaVersion:'persistent-index-v2',root:row.root,status:row.status,generation:row.generation,files:Number(agg.files||0),bytes:Number(agg.bytes||0),queue:Number(q.n||0),filesSeen:Number(row.files_seen||0),dirsSeen:Number(row.dirs_seen||0),errors:Number(row.errors_count||0),startedAt:row.started_at||null,completedAt:row.completed_at||null,updatedAt:row.updated_at||null,lastIndexedAt:agg.last_indexed_at||null,lastError:row.last_error||null,pauseReason:row.pause_reason||null,runtime,dbPath:this.dbPath};
  }
  listRoots(){return this.db.prepare(`SELECT r.root,r.root_key rootKey,r.status,r.generation,r.started_at startedAt,r.completed_at completedAt,r.updated_at updatedAt,r.pause_reason pauseReason,
      (SELECT COUNT(*) FROM files f WHERE f.root_key=r.root_key) files,
      (SELECT COALESCE(SUM(size),0) FROM files f WHERE f.root_key=r.root_key) bytes,
      (SELECT COUNT(*) FROM scan_queue q WHERE q.root_key=r.root_key AND q.generation=r.generation) queue
      FROM roots r ORDER BY r.updated_at DESC`).all().map(x=>{const runtime=this._runtimeRow(x.rootKey);delete x.rootKey;return{...x,files:Number(x.files||0),bytes:Number(x.bytes||0),queue:Number(x.queue||0),runtime}});}
  _freshScan(root,rootKey){
    const current=this.st.rootGet.get(rootKey);const generation=Number(current?.generation||0)+1;const at=now();
    this._tx(()=>{
      this.db.prepare('DELETE FROM scan_queue WHERE root_key=?').run(rootKey);
      this.db.prepare('DELETE FROM scan_errors WHERE root_key=?').run(rootKey);
      this.db.prepare(`UPDATE roots SET generation=?,status='scanning',started_at=?,completed_at=NULL,files_seen=0,dirs_seen=0,errors_count=0,updated_at=?,last_error=NULL,pause_reason=NULL WHERE root_key=?`).run(generation,at,at,rootKey);
      this.st.queueInsert.run(rootKey,generation,keyPath(root),root);
    });
    this.journal?.append('INDEX_SCAN_STARTED',{payload:{root,generation,resume:false}});
    return generation;
  }
  _resumeScan(root,rootKey,row){
    const generation=Number(row.generation||0);const queue=this.db.prepare('SELECT COUNT(*) n FROM scan_queue WHERE root_key=? AND generation=?').get(rootKey,generation);
    if(!generation||Number(queue.n||0)===0)return this._freshScan(root,rootKey);
    this.db.prepare(`UPDATE roots SET status='scanning',updated_at=?,last_error=NULL,pause_reason=NULL WHERE root_key=?`).run(now(),rootKey);
    this.journal?.append('INDEX_SCAN_RESUMED',{payload:{root,generation,queue:Number(queue.n||0)}});
    return generation;
  }
  async scan(root,options={}){const rr=normalizeDisplayPath(String(root||''));const rk=keyPath(rr);if(this.activeScans.has(rk))throw Object.assign(new Error('برای این Root یک اسکن Index از قبل در حال اجراست.'),{code:'INDEX_SCAN_ALREADY_RUNNING'});this.activeScans.add(rk);try{return await this._scan(root,options);}finally{this.activeScans.delete(rk);}}
  async _scan(root,{resume=true,includeHidden=false,skipDirNames=[],skipPathPrefixes=[],signal,onProgress,maxWallTimeMs=10*60*1000,maxFilesSession=0,maxDirsSession=0,dbBatchSize=1000}={}){
    const rr=await assertReadableDirectory(root);const {rootKey}=this._ensureRoot(rr);let row=this.st.rootGet.get(rootKey);
    const resumable=resume&&row&&['scanning','paused','failed'].includes(row.status);
    const generation=resumable?this._resumeScan(rr,rootKey,row):this._freshScan(rr,rootKey);
    const customSkip=new Set((skipDirNames||[]).map(x=>String(x).toLowerCase()));
    const skipPrefixes=(skipPathPrefixes||[]).map(x=>normalizeDisplayPath(String(x))).filter(Boolean);
    const start=Date.now();let sessionFiles=0,sessionDirs=0,sessionErrors=0,lastProgress=0;
    const pause=reason=>{const at=now();this.db.prepare(`UPDATE roots SET status='paused',updated_at=?,pause_reason=? WHERE root_key=?`).run(at,reason,rootKey);this.journal?.append('INDEX_SCAN_PAUSED',{payload:{root:rr,generation,reason,sessionFiles,sessionDirs,sessionErrors}});};
    while(true){
      const runtimeGuard=this._runtimeRow(rootKey);if(runtimeGuard?.identityChanged){pause('VOLUME_IDENTITY_CHANGED');break;}if(runtimeGuard?.available===false){pause('ROOT_UNAVAILABLE');break;}
      if(signal?.aborted){pause('SCAN_CANCELLED');break;}
      if(maxWallTimeMs>0&&Date.now()-start>=maxWallTimeMs){pause('MAX_WALL_TIME');break;}
      if(maxFilesSession>0&&sessionFiles>=maxFilesSession){pause('MAX_FILES_SESSION');break;}
      if(maxDirsSession>0&&sessionDirs>=maxDirsSession){pause('MAX_DIRS_SESSION');break;}
      const q=this.st.queueOne.get(rootKey,generation);if(!q)break;
      const current=q.dir_path;let dir;
      try{dir=await fsp.opendir(toFsPath(current));}
      catch(error){
        const code=error.code||'DIRECTORY_UNREADABLE';const rootReadable=await this._rootReadable(rr);if(!rootReadable){pause('ROOT_UNAVAILABLE');this.journal?.append('INDEX_ROOT_UNAVAILABLE',{payload:{root:rr,generation,current,error:code,queuePreserved:true}});break;}
        this._tx(()=>{this.st.errorInsert.run(rootKey,generation,current,code,'directory-unreadable',now());this.st.queueDelete.run(rootKey,generation,keyPath(current));this.db.prepare('UPDATE roots SET dirs_seen=dirs_seen+1,errors_count=errors_count+1,updated_at=? WHERE root_key=?').run(now(),rootKey);});
        sessionDirs+=1;sessionErrors+=1;continue;
      }
      let dirFiles=0,dirErrors=0;let fileBatch=[],childBatch=[],errorBatch=[];let streamError=null;
      const flushFiles=()=>{if(fileBatch.length){this._upsertFileBatch(rootKey,rr,generation,fileBatch);fileBatch=[];}};
      const flushChildren=()=>{if(!childBatch.length)return;this._tx(()=>{for(const child of childBatch)this.st.queueInsert.run(rootKey,generation,keyPath(child),child);});childBatch=[];};
      const flushErrors=()=>{if(!errorBatch.length)return;this._tx(()=>{for(const [p,code,kind] of errorBatch)this.st.errorInsert.run(rootKey,generation,p,String(code),String(kind),now());});errorBatch=[];};
      try{
        for await(const entry of dir){
          if(!includeHidden&&entry.name.startsWith('.'))continue;
          const full=path.join(current,entry.name);const lower=entry.name.toLowerCase();
          if(entry.isDirectory()&&(DEFAULT_SKIP_NAMES.has(lower)||customSkip.has(lower)||skipPrefixes.some(p=>inside(p,full))))continue;
          if(entry.isSymbolicLink()){errorBatch.push([full,'SYMLINK_SKIPPED','link-skipped']);dirErrors+=1;if(errorBatch.length>=200)flushErrors();continue;}
          if(entry.isDirectory()){childBatch.push(full);if(childBatch.length>=500)flushChildren();continue;}
          if(!entry.isFile())continue;
          try{const st=await fsp.stat(toFsPath(full));fileBatch.push({path:full,name:entry.name,ext:path.extname(entry.name).toLowerCase(),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),ctimeMs:Number(st.ctimeMs||0)});dirFiles+=1;if(fileBatch.length>=Math.max(1,dbBatchSize))flushFiles();}
          catch(error){errorBatch.push([full,error.code||'FILE_UNREADABLE','file-unreadable']);dirErrors+=1;if(errorBatch.length>=200)flushErrors();}
        }
      }catch(error){streamError=error;dirErrors+=1;errorBatch.push([current,error.code||'DIRECTORY_STREAM_FAILED','directory-stream-failed']);}
      finally{try{await dir.close();}catch{}}
      flushFiles();flushChildren();flushErrors();
      if(dirErrors>0&&!(await this._rootReadable(rr))){pause('ROOT_UNAVAILABLE');this.journal?.append('INDEX_ROOT_UNAVAILABLE',{payload:{root:rr,generation,current,error:streamError?.code||streamError?.message||'FILE_IO_ERRORS_DURING_ROOT_OUTAGE',queuePreserved:true,partialDirectory:true,dirErrors}});break;}
      this._tx(()=>{
        this.st.queueDelete.run(rootKey,generation,keyPath(current));
        this.db.prepare('UPDATE roots SET files_seen=files_seen+?,dirs_seen=dirs_seen+1,errors_count=errors_count+?,updated_at=? WHERE root_key=?').run(dirFiles,dirErrors,now(),rootKey);
      });
      sessionFiles+=dirFiles;sessionDirs+=1;sessionErrors+=dirErrors;
      if(streamError)this.journal?.append('INDEX_DIRECTORY_STREAM_ERROR',{payload:{root:rr,path:current,generation,error:streamError.code||streamError.message}});
      const t=Date.now();if(t-lastProgress>500){lastProgress=t;const qn=this.db.prepare('SELECT COUNT(*) n FROM scan_queue WHERE root_key=? AND generation=?').get(rootKey,generation);onProgress?.({root:rr,generation,sessionFiles,sessionDirs,sessionErrors,queue:Number(qn.n||0),current});}
    }
    row=this.st.rootGet.get(rootKey);
    const remaining=this.db.prepare('SELECT COUNT(*) n FROM scan_queue WHERE root_key=? AND generation=?').get(rootKey,generation);
    if(Number(remaining.n||0)===0&&['scanning','paused'].includes(row.status)){
      if(!(await this._rootReadable(rr))){this.st.queueInsert.run(rootKey,generation,keyPath(rr),rr);pause('ROOT_UNAVAILABLE_BEFORE_COMMIT');this.journal?.append('INDEX_COMMIT_DEFERRED_ROOT_UNAVAILABLE',{payload:{root:rr,generation}});return this.status(rr);}
      const runtimeGuard=this._runtimeRow(rootKey);if(runtimeGuard?.identityChanged){this.st.queueInsert.run(rootKey,generation,keyPath(rr),rr);pause('VOLUME_IDENTITY_CHANGED');return this.status(rr);}
      const at=now();let removed=0;
      this._tx(()=>{
        const r=this.db.prepare('DELETE FROM files WHERE root_key=? AND generation<>?').run(rootKey,generation);removed=Number(r.changes||0);
        this.db.prepare(`UPDATE roots SET status='completed',completed_at=?,updated_at=?,pause_reason=NULL,last_error=NULL WHERE root_key=?`).run(at,at,rootKey);
        this.db.prepare('DELETE FROM scan_queue WHERE root_key=? AND generation=?').run(rootKey,generation);
      });
      if(removed>0)this.db.prepare('DELETE FROM hash_cache WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.path_key=hash_cache.path_key)').run();
      this.journal?.append('INDEX_SCAN_COMPLETED',{payload:{root:rr,generation,sessionFiles,sessionDirs,sessionErrors,staleRemoved:removed}});
    }
    return this.status(rr);
  }
  async reconcilePath(root,target,{maxSubtreeFiles=25000,maxSubtreeDirs=10000}={}){
    const rr=normalizeDisplayPath(String(root||''));const full=normalizeDisplayPath(String(target||''));if(!inside(rr,full))return{ok:false,code:'INDEX_EVENT_OUTSIDE_ROOT'};
    const rootKey=keyPath(rr);const row=this.st.rootGet.get(rootKey);if(!row)return{ok:false,code:'INDEX_ROOT_NOT_REGISTERED'};
    const generation=Math.max(1,Number(row.generation||1));let st;
    try{st=await fsp.lstat(toFsPath(full));}catch(error){
      if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')return{ok:false,code:error.code||'INDEX_RECONCILE_STAT_FAILED'};
      const pk=keyPath(full),prefix=`${pk}${path.sep}`;const r=this.db.prepare('DELETE FROM files WHERE root_key=? AND (path_key=? OR substr(path_key,1,?)=?)').run(rootKey,pk,prefix.length,prefix);this.db.prepare('DELETE FROM hash_cache WHERE path_key=? OR substr(path_key,1,?)=?').run(pk,prefix.length,prefix);
      return{ok:true,kind:'removed',changes:Number(r.changes||0)};
    }
    if(st.isSymbolicLink())return{ok:true,kind:'symlink-skipped',changes:0};
    if(st.isFile()){
      const f={path:full,name:path.basename(full),ext:path.extname(full).toLowerCase(),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),ctimeMs:Number(st.ctimeMs||0)};
      this._upsertFileBatch(rootKey,rr,generation,[f]);
      return{ok:true,kind:'file-upserted',changes:1};
    }
    if(!st.isDirectory())return{ok:true,kind:'unsupported',changes:0};
    const stack=[full];let files=0,dirs=0,errors=0,truncated=false;
    while(stack.length&&files<maxSubtreeFiles&&dirs<maxSubtreeDirs){const current=stack.pop();dirs+=1;let dir;try{dir=await fsp.opendir(toFsPath(current));}catch{errors+=1;continue;}let batch=[];try{for await(const entry of dir){if(files>=maxSubtreeFiles){truncated=true;break;}if(entry.name.startsWith('.'))continue;const p=path.join(current,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory()){if(!DEFAULT_SKIP_NAMES.has(entry.name.toLowerCase()))stack.push(p);continue;}if(!entry.isFile())continue;try{const st=await fsp.stat(toFsPath(p));batch.push({path:p,name:entry.name,ext:path.extname(entry.name).toLowerCase(),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),ctimeMs:Number(st.ctimeMs||0)});files+=1;if(batch.length>=500){this._upsertFileBatch(rootKey,rr,generation,batch);batch=[];}}catch{errors+=1;}}}catch{errors+=1;}finally{try{await dir.close();}catch{}}if(batch.length)this._upsertFileBatch(rootKey,rr,generation,batch);}
    if(stack.length||files>=maxSubtreeFiles||dirs>=maxSubtreeDirs)truncated=true;
    const requiresFullRescan=Boolean(truncated||errors>0);if(requiresFullRescan)this.markStale(rr,truncated?'SUBTREE_RECONCILE_TRUNCATED':'SUBTREE_RECONCILE_ERRORS',{target:full,files,dirs,errors,truncated,maxSubtreeFiles,maxSubtreeDirs});
    return{ok:!requiresFullRescan,kind:'directory-reconciled',changes:files,dirs,errors,truncated,partial:requiresFullRescan,requiresFullRescan};
  }
  async reconcileBatch(events=[]){
    const results=[];let skipped=0;const staleRoots=new Set();for(const e of events.slice(0,500)){const rr=normalizeDisplayPath(String(e.root||''));if(!this.st.rootGet.get(keyPath(rr))){skipped+=1;continue;}try{const r=await this.reconcilePath(rr,e.path);results.push({eventId:e.id,root:rr,...r});if(r?.ok===false||r?.requiresFullRescan)staleRoots.add(rr);}catch(error){results.push({eventId:e.id,root:rr,ok:false,code:error.code||'INDEX_RECONCILE_FAILED',message:error.message,requiresFullRescan:true});staleRoots.add(rr);this.markStale(rr,error.code||'INDEX_RECONCILE_FAILED',{path:e.path,message:error.message});}}
    const failed=results.filter(x=>x.ok===false).length,requiresFullRescan=staleRoots.size>0;const summary={events:results.length,skipped,ok:results.filter(x=>x.ok).length,failed,changes:results.reduce((n,x)=>n+Number(x.changes||0),0),requiresFullRescan,staleRoots:[...staleRoots]};if(results.length)this.journal?.append('INDEX_WATCH_RECONCILED',{payload:summary});return{ok:!requiresFullRescan,requiresFullRescan,staleRoots:[...staleRoots],summary,results};
  }
  search({root='',query='',extensions=[],categories=[],minBytes=0,maxBytes=0,modifiedWithinDays=0,olderThanDays=0,limit=200,offset=0,nowMs=Date.now()}={}){
    const where=[],args=[];let rootKey='';if(root){rootKey=keyPath(root);where.push('root_key=?');args.push(rootKey);}
    const q=String(query||'').trim();if(q){const term=`%${likeLiteral(q)}%`;where.push("(name LIKE ? ESCAPE '\\' COLLATE NOCASE OR path LIKE ? ESCAPE '\\' COLLATE NOCASE)");args.push(term,term);}
    const exts=[...new Set((extensions||[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean).map(x=>x.startsWith('.')?x:`.${x}`))];if(exts.length){where.push(`ext IN (${exts.map(()=>'?').join(',')})`);args.push(...exts);}
    const cats=[...new Set((categories||[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))];if(cats.length){where.push(`lower(category) IN (${cats.map(()=>'?').join(',')})`);args.push(...cats);}
    if(Number(minBytes)>0){where.push('size>=?');args.push(Number(minBytes));}if(Number(maxBytes)>0){where.push('size<=?');args.push(Number(maxBytes));}
    if(Number(modifiedWithinDays)>0){where.push('mtime_ms>=?');args.push(nowMs-Number(modifiedWithinDays)*86400000);}if(Number(olderThanDays)>0){where.push('mtime_ms<?');args.push(nowMs-Number(olderThanDays)*86400000);}
    const ws=where.length?`WHERE ${where.join(' AND ')}`:'';const safeLimit=clamp(limit,1,1000,200),safeOffset=Math.max(0,Number(offset)||0);
    const agg=this.db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(size),0) totalBytes FROM files ${ws}`).get(...args);
    const rows=this.db.prepare(`SELECT path,name,ext,category,size,mtime_ms mtimeMs,ctime_ms ctimeMs,relative_path relativePath FROM files ${ws} ORDER BY mtime_ms DESC,size DESC LIMIT ? OFFSET ?`).all(...args,safeLimit,safeOffset).map(x=>({...x,size:Number(x.size||0),mtimeMs:Number(x.mtimeMs||0),ctimeMs:Number(x.ctimeMs||0)}));
    return{schemaVersion:'persistent-index-search-v1',root:root?normalizeDisplayPath(root):'',query:q,total:Number(agg.total||0),totalBytes:Number(agg.totalBytes||0),rows,limit:safeLimit,offset:safeOffset,hasMore:safeOffset+rows.length<Number(agg.total||0),filters:{extensions:exts,categories:cats,minBytes,maxBytes,modifiedWithinDays,olderThanDays}};
  }
  duplicateCandidates(root,{minBytes=1,maxGroups=10000}={}){
    const rk=keyPath(root),limit=clamp(maxGroups,1,50000,10000);const rows=this.db.prepare(`SELECT size,COUNT(*) count,(size*(COUNT(*)-1)) reclaimableBytes FROM files WHERE root_key=? AND size>=? GROUP BY size HAVING COUNT(*)>1 ORDER BY reclaimableBytes DESC LIMIT ?`).all(rk,Math.max(1,Number(minBytes)||1),limit);
    return rows.map(x=>({size:Number(x.size),count:Number(x.count),reclaimableBytes:Number(x.reclaimableBytes)}));
  }
  filesBySize(root,size){const rk=keyPath(root);return this.db.prepare('SELECT path,name,ext,size,mtime_ms mtimeMs,ctime_ms ctimeMs FROM files WHERE root_key=? AND size=? ORDER BY mtime_ms ASC').all(rk,Number(size)).map(x=>({...x,size:Number(x.size),mtimeMs:Number(x.mtimeMs),ctimeMs:Number(x.ctimeMs)}));}
  getCachedHash(file){if(!file?.path)return null;const row=this.st.hashGet.get(keyPath(file.path),Number(file.size||0),Number(file.mtimeMs||0),Number(file.ctimeMs||0));return row?{sha256:row.sha256,hashedAt:row.hashed_at}:null;}
  setCachedHash(file,sha256){if(!file?.path||!sha256)return;this.st.hashSet.run(keyPath(file.path),file.path,Number(file.size||0),Number(file.mtimeMs||0),Number(file.ctimeMs||0),String(sha256),now());}
  markFailed(root,error){const rr=normalizeDisplayPath(String(root||''));const rk=keyPath(rr);if(!this.st.rootGet.get(rk))return;const code=String(error?.code||error?.message||'INDEX_SCAN_FAILED');this.db.prepare(`UPDATE roots SET status='failed',updated_at=?,last_error=?,pause_reason='ERROR' WHERE root_key=?`).run(now(),code,rk);this.journal?.append('INDEX_SCAN_FAILED',{payload:{root:rr,error:code}});}

  health({deep=false}={}){
    const checkRows=this.db.prepare(deep?'PRAGMA integrity_check':'PRAGMA quick_check').all();
    const checkValues=checkRows.flatMap(row=>Object.values(row)).map(String);const ok=checkValues.length>0&&checkValues.every(x=>x.toLowerCase()==='ok');
    const pageCount=Number(Object.values(this.db.prepare('PRAGMA page_count').get()||{})[0]||0);const freePages=Number(Object.values(this.db.prepare('PRAGMA freelist_count').get()||{})[0]||0);const pageSize=Number(Object.values(this.db.prepare('PRAGMA page_size').get()||{})[0]||0);
    const roots=this.db.prepare("SELECT status,COUNT(*) n FROM roots GROUP BY status").all().reduce((a,x)=>(a[x.status]=Number(x.n||0),a),{});let dbBytes=0,walBytes=0;try{dbBytes=fs.statSync(this.dbPath).size}catch{}try{walBytes=fs.statSync(`${this.dbPath}-wal`).size}catch{}
    return{schemaVersion:'persistent-index-health-v1',ok,check:checkValues,deep:Boolean(deep),dbPath:this.dbPath,dbBytes,walBytes,pageCount,freePages,pageSize,freeBytes:freePages*pageSize,fragmentationRatio:pageCount?freePages/pageCount:0,activeScans:this.activeScans.size,roots};
  }
  maintain({deep=false,checkpoint=true,optimize=true,pruneErrors=true}={}){
    if(this.activeScans.size)throw Object.assign(new Error('Maintenance هنگام Full Scan فعال اجرا نمی‌شود.'),{code:'INDEX_MAINTENANCE_BUSY'});
    const before=this.health({deep});let orphanHashes=0,oldErrors=0,checkpointResult=null;
    this._tx(()=>{orphanHashes=Number(this.db.prepare('DELETE FROM hash_cache WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.path_key=hash_cache.path_key)').run().changes||0);if(pruneErrors)oldErrors=Number(this.db.prepare('DELETE FROM scan_errors WHERE id NOT IN (SELECT id FROM scan_errors ORDER BY id DESC LIMIT 10000)').run().changes||0);});
    if(optimize)this.db.exec('PRAGMA optimize;');if(checkpoint){const row=this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()||{};checkpointResult=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)]));}
    const after=this.health({deep:false});const result={schemaVersion:'persistent-index-maintenance-v1',ok:after.ok,before,after,orphanHashesRemoved:orphanHashes,oldErrorsRemoved:oldErrors,checkpoint:checkpointResult,optimize:Boolean(optimize),vacuum:false};this.journal?.append('INDEX_MAINTENANCE',{payload:{ok:result.ok,orphanHashesRemoved:orphanHashes,oldErrorsRemoved:oldErrors,checkpoint:checkpointResult}});return result;
  }
  recentErrors(root,{limit=200}={}){const row=this.st.rootGet.get(keyPath(root));if(!row)return[];return this.db.prepare('SELECT path,code,kind,at FROM scan_errors WHERE root_key=? AND generation=? ORDER BY id DESC LIMIT ?').all(keyPath(root),row.generation,clamp(limit,1,1000,200));}
  reset(root){const rr=normalizeDisplayPath(String(root||''));const rk=keyPath(rr);const out=this._tx(()=>{const f=this.db.prepare('DELETE FROM files WHERE root_key=?').run(rk);this.db.prepare('DELETE FROM scan_queue WHERE root_key=?').run(rk);this.db.prepare('DELETE FROM scan_errors WHERE root_key=?').run(rk);this.db.prepare('DELETE FROM root_runtime WHERE root_key=?').run(rk);this.db.prepare('DELETE FROM roots WHERE root_key=?').run(rk);return Number(f.changes||0);});this.journal?.append('INDEX_RESET',{payload:{root:rr,filesRemoved:out}});return{ok:true,filesRemoved:out};}
  close(){try{this.db.close()}catch{}}
}
module.exports={PersistentFileIndex,INDEX_SCHEMA_VERSION,keyPath,inside};
