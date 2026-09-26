const fs=require('fs');
const path=require('path');
let DatabaseSync=null;try{({DatabaseSync}=require('node:sqlite'));}catch{}
function now(){return new Date().toISOString();}
function j(v,d=null){try{return JSON.parse(v)}catch{return d}}
class ExplorerBatchStore{
  constructor(baseDir,{journal=null}={}){
    if(!DatabaseSync)throw Object.assign(new Error('Batch Explorer به node:sqlite نیاز دارد.'),{code:'EXPLORER_BATCH_SQLITE_UNAVAILABLE'});
    this.dir=path.join(baseDir,'explorer-batch');fs.mkdirSync(this.dir,{recursive:true});this.dbPath=path.join(this.dir,'jobs.sqlite');this.journal=journal;
    this.db=new DatabaseSync(this.dbPath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs(
        id TEXT PRIMARY KEY,cycle_id TEXT,root TEXT NOT NULL,source_root TEXT,destination_root TEXT,source_identity TEXT,destination_identity TEXT,operation TEXT NOT NULL,destination_dir TEXT NOT NULL,
        conflict_policy TEXT NOT NULL,duplicate_aware INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL,
        cursor INTEGER NOT NULL DEFAULT 0,total_items INTEGER NOT NULL DEFAULT 0,done_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,failed_items INTEGER NOT NULL DEFAULT 0,total_bytes INTEGER NOT NULL DEFAULT 0,
        done_bytes INTEGER NOT NULL DEFAULT 0,cancel_requested INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,finished_at TEXT,
        summary_json TEXT,reserve_bytes INTEGER NOT NULL DEFAULT 268435456,cross_volume INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS items(
        job_id TEXT NOT NULL,seq INTEGER NOT NULL,kind TEXT NOT NULL,source TEXT,destination TEXT NOT NULL,size INTEGER NOT NULL DEFAULT 0,
        mtime_ms REAL NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending',reason TEXT,source_hash TEXT,destination_hash TEXT,
        stage_path TEXT,backup_path TEXT,undo_json TEXT,meta_json TEXT,updated_at TEXT NOT NULL,
        PRIMARY KEY(job_id,seq),FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_explorer_batch_items_state ON items(job_id,state,seq);
    `);
    const cols=new Set(this.db.prepare('PRAGMA table_info(jobs)').all().map(x=>x.name));
    const add=(name,sql)=>{if(!cols.has(name)){this.db.exec(`ALTER TABLE jobs ADD COLUMN ${sql}`);cols.add(name);}};
    add('source_root','source_root TEXT');add('destination_root','destination_root TEXT');add('source_identity','source_identity TEXT');add('destination_identity','destination_identity TEXT');add('reserve_bytes','reserve_bytes INTEGER NOT NULL DEFAULT 268435456');add('cross_volume','cross_volume INTEGER NOT NULL DEFAULT 0');
    this.db.exec("UPDATE jobs SET source_root=COALESCE(source_root,root), destination_root=COALESCE(destination_root,root)");
    this.st={
      jobGet:this.db.prepare('SELECT * FROM jobs WHERE id=?'),
      itemGet:this.db.prepare('SELECT * FROM items WHERE job_id=? AND seq=?'),
      nextItems:this.db.prepare("SELECT * FROM items WHERE job_id=? AND state IN ('pending','processing','staged','backed-up','commit-ready','committed') ORDER BY seq LIMIT ?"),
      addItem:this.db.prepare('INSERT INTO items(job_id,seq,kind,source,destination,size,mtime_ms,state,meta_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'),
      updateItem:this.db.prepare('UPDATE items SET state=?,reason=?,source_hash=?,destination_hash=?,stage_path=?,backup_path=?,undo_json=?,meta_json=?,updated_at=? WHERE job_id=? AND seq=?'),
      counts:this.db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN state='done' THEN 1 ELSE 0 END) done,SUM(CASE WHEN state='skipped' THEN 1 ELSE 0 END) skipped,SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN state='done' THEN size ELSE 0 END) done_bytes FROM items WHERE job_id=?"),
      undoItems:this.db.prepare("SELECT * FROM items WHERE job_id=? AND undo_json IS NOT NULL AND state IN ('done','skipped','rollback-failed') ORDER BY seq DESC"),
    };
  }
  _row(row){if(!row)return null;return{...row,duplicate_aware:Boolean(row.duplicate_aware),cancel_requested:Boolean(row.cancel_requested),summary:j(row.summary_json,null)};}
  _item(row){if(!row)return null;return{...row,undo:j(row.undo_json,null),meta:j(row.meta_json,{})};}
  createJob({id,cycleId='',root,sourceRoot=root,destinationRoot=root,sourceIdentity='',destinationIdentity='',operation,destinationDir,conflictPolicy='skip',duplicateAware=true,reserveBytes=268435456,crossVolume=false,items=[]}){
    const stamp=now();this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO jobs(id,cycle_id,root,source_root,destination_root,source_identity,destination_identity,operation,destination_dir,conflict_policy,duplicate_aware,status,total_items,total_bytes,reserve_bytes,cross_volume,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,cycleId,root,sourceRoot,destinationRoot,sourceIdentity||null,destinationIdentity||null,operation,destinationDir,conflictPolicy,duplicateAware?1:0,'prepared',items.length,items.reduce((n,x)=>n+Number(x.size||0),0),Number(reserveBytes||268435456),crossVolume?1:0,stamp,stamp);
      let seq=0;for(const item of items)this.st.addItem.run(id,seq++,item.kind,item.source||null,item.destination,Number(item.size||0),Number(item.mtimeMs||0),'pending',JSON.stringify(item.meta||{}),stamp);
      this.db.exec('COMMIT');
    }catch(error){try{this.db.exec('ROLLBACK')}catch{}throw error;}
    this.journal?.append('EXPLORER_BATCH_PREPARED',{cycleId,payload:{jobId:id,operation,items:items.length,conflictPolicy,duplicateAware}});return this.get(id);
  }
  get(id){return this._row(this.st.jobGet.get(id));}

  list({limit=1000}={}){return this.db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT ?').all(Math.max(1,Math.min(10000,Number(limit)||1000))).map(x=>this._row(x));}
  jobsForCycles(cycleIds=[]){const ids=[...new Set((cycleIds||[]).map(String).filter(Boolean))];if(!ids.length)return[];const marks=ids.map(()=>'?').join(',');return this.db.prepare(`SELECT * FROM jobs WHERE cycle_id IN (${marks}) ORDER BY updated_at DESC`).all(...ids).map(x=>this._row(x));}
  reconcileInterruptedJobs({cycleIds=[]}={}){const ids=new Set((cycleIds||[]).map(String).filter(Boolean));let changed=0;const touched=[];for(const job of this.list({limit:10000})){const linked=ids.has(String(job.cycle_id||''));if(!linked&&job.status!=='running')continue;if(job.status==='running'){this.mark(job.id,{status:'interrupted',summary_json:{code:'PROCESS_RESTART_INTERRUPTED',message:'Batch execution was interrupted by app/process restart.'}});changed+=1;}touched.push(this.get(job.id)||job);}return{changed,jobs:touched};}
  item(id,seq){return this._item(this.st.itemGet.get(id,seq));}
  next(id,limit=20){return this.st.nextItems.all(id,Math.max(1,Math.min(200,Number(limit)||20))).map(x=>this._item(x));}
  updateItem(id,seq,patch={}){const cur=this.item(id,seq);if(!cur)return null;const next={...cur,...patch};this.st.updateItem.run(String(next.state||'pending'),next.reason||null,next.source_hash||next.sourceHash||null,next.destination_hash||next.destinationHash||null,next.stage_path||next.stagePath||null,next.backup_path||next.backupPath||null,next.undo?JSON.stringify(next.undo):next.undo_json||null,JSON.stringify(next.meta||{}),now(),id,seq);this.refresh(id);return this.item(id,seq);}
  mark(id,patch={}){const job=this.get(id);if(!job)return null;const fields=[],vals=[];const allowed=['status','cursor','cancel_requested','finished_at','summary_json'];for(const [k,v] of Object.entries(patch)){if(!allowed.includes(k))continue;fields.push(`${k}=?`);vals.push(k==='summary_json'&&typeof v!=='string'?JSON.stringify(v):v);}if(fields.length){fields.push('updated_at=?');vals.push(now(),id);this.db.prepare(`UPDATE jobs SET ${fields.join(',')} WHERE id=?`).run(...vals);}return this.refresh(id);}
  refresh(id){const c=this.st.counts.get(id)||{};const row=this.get(id);if(!row)return null;const cursorRow=this.db.prepare("SELECT MIN(seq) n FROM items WHERE job_id=? AND state NOT IN ('done','skipped','failed','rolled-back')").get(id);const cursor=cursorRow?.n==null?Number(row.total_items||0):Number(cursorRow.n);this.db.prepare('UPDATE jobs SET cursor=?,done_items=?,skipped_items=?,failed_items=?,done_bytes=?,updated_at=? WHERE id=?').run(cursor,Number(c.done||0),Number(c.skipped||0),Number(c.failed||0),Number(c.done_bytes||0),now(),id);return this.get(id);}
  requestCancel(id){const job=this.get(id);if(!job)return null;this.db.prepare('UPDATE jobs SET cancel_requested=1,updated_at=? WHERE id=?').run(now(),id);this.journal?.append('EXPLORER_BATCH_CANCEL_REQUESTED',{cycleId:job.cycle_id,payload:{jobId:id}});return this.get(id);}
  clearCancel(id){this.db.prepare('UPDATE jobs SET cancel_requested=0,updated_at=? WHERE id=?').run(now(),id);return this.get(id);}
  undoItems(id){return this.st.undoItems.all(id).map(x=>this._item(x));}
  status(id){const r=this.refresh(id);if(!r)return null;return{schemaVersion:'workspace-explorer-batch-status-v2',jobId:r.id,cycleId:r.cycle_id,operation:r.operation,status:r.status,sourceRoot:r.source_root||r.root,destinationRoot:r.destination_root||r.root,crossVolume:Boolean(r.cross_volume),reserveBytes:Number(r.reserve_bytes||0),totalItems:r.total_items,doneItems:r.done_items,skippedItems:r.skipped_items,failedItems:r.failed_items,totalBytes:r.total_bytes,doneBytes:r.done_bytes,cursor:r.cursor,cancelRequested:r.cancel_requested,conflictPolicy:r.conflict_policy,duplicateAware:r.duplicate_aware,createdAt:r.created_at,updatedAt:r.updated_at,finishedAt:r.finished_at};}
  close(){try{this.db.close()}catch{}}
}
module.exports={ExplorerBatchStore};
