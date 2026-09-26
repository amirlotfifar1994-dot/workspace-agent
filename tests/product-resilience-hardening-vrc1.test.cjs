const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
const {TransactionStore}=require('../electron/services/transaction-store.cjs');
const {RecoveryService}=require('../electron/services/recovery-service.cjs');
const {undoRenames}=require('../electron/services/renamer.cjs');
const {undoMoves}=require('../electron/services/organizer.cjs');
const {restoreQuarantine}=require('../electron/services/quarantine.cjs');
const {restoreMaintenance}=require('../electron/services/maintenance.cjs');
function tmp(name){return fs.mkdtempSync(path.join(os.tmpdir(),`wa-${name}-`));}
(async()=>{
  // Waiting/paused wall clock must not consume active cycle budget.
  {
    const dir=tmp('resume-budget');const store=new CycleStore(dir);const engine=new CycleEngine({store,maxWallTimeMs:1000,maxIterations:10});
    engine.register('probe',{resumable:true,async next(){return{status:'completed',steps:[]};}});
    let c=engine.create('probe');c.status='paused';c.meta.runStartedAt=new Date(Date.now()-60_000).toISOString();c.meta.activeElapsedMs=0;store.save(c);
    c=await engine.resume(c.id);assert.equal(c.status,'completed');assert(!c.evidence.some(x=>x.code==='MAX_WALL_TIME'));assert(Number(c.meta.activeElapsedMs)>=0&&Number(c.meta.activeElapsedMs)<1000);
  }
  // Active/recoverable records are never pruned merely because retention count is exceeded.
  {
    const dir=tmp('cycle-prune');const store=new CycleStore(dir,{maxCycles:2});
    store.save({id:'active',status:'running',updatedAt:'2026-01-01T00:00:00.000Z',steps:[],evidence:[]});
    for(let i=0;i<4;i++)store.save({id:`done-${i}`,status:'completed',updatedAt:new Date(Date.now()+i).toISOString(),steps:[],evidence:[]});
    assert(store.get('active'),'active cycle was pruned');assert(store.list(20).filter(x=>x.status==='completed').length<=2);
  }
  {
    const dir=tmp('tx-prune');const store=new TransactionStore(dir,{maxTransactions:2});
    const active=store.create({kind:'probe',root:dir,operations:[]});
    for(let i=0;i<4;i++){const tx=store.create({kind:'probe',root:dir,operations:[]});store.mark(tx.id,{status:'completed'});}
    assert(store.get(active.id),'recoverable transaction was pruned');assert(store.list().filter(x=>x.status==='completed').length<=2);
  }
  // Undo conflict must not strand files in hidden temp names or silently restore under a different name.
  {
    const dir=tmp('rename-undo');const original=path.join(dir,'old.txt'),renamed=path.join(dir,'new.txt');fs.writeFileSync(original,'occupied');fs.writeFileSync(renamed,'moved');
    const rows=await undoRenames([{source:original,destination:renamed,workspaceRoot:dir,size:5}]);assert.equal(rows[0].ok,false);assert.equal(rows[0].error,'UNDO_DESTINATION_EXISTS');assert.equal(fs.readFileSync(original,'utf8'),'occupied');assert.equal(fs.readFileSync(renamed,'utf8'),'moved');assert(!fs.readdirSync(dir).some(x=>x.startsWith('.wa-rename-')));
  }
  for(const [name,fn] of [['organize',undoMoves],['duplicate',restoreQuarantine],['maintenance',restoreMaintenance]]){
    const dir=tmp(`${name}-undo`);const original=path.join(dir,'a.txt'),moved=path.join(dir,'moved.txt');fs.writeFileSync(original,'new-data');fs.writeFileSync(moved,'old-data');
    const kind=name==='organize'?'move':'restore';const rows=await fn([{undo:{kind,source:moved,destination:original}}]);assert.equal(rows[0].ok,false,`${name} conflict must fail exact restore`);assert.equal(rows[0].error,'UNDO_DESTINATION_EXISTS');assert.equal(fs.readFileSync(original,'utf8'),'new-data');assert.equal(fs.readFileSync(moved,'utf8'),'old-data');assert.deepEqual(fs.readdirSync(dir).sort(),['a.txt','moved.txt']);
  }
  // Crash recovery must never delete a same-size copy that no longer matches the source.
  {
    const dir=tmp('copy-recovery-mismatch'),src=path.join(dir,'src.bin'),dst=path.join(dir,'dst.bin'),stage=path.join(dir,'stage.part');fs.writeFileSync(src,'AAAA');fs.writeFileSync(dst,'BBBB');
    const store=new TransactionStore(dir);const tx=store.create({kind:'explorer-copy',root:dir,operations:[{kind:'explorer-copy-file',source:src,destination:dst,stage,size:4}]});store.mark(tx.id,{status:'executing'});store.markOp(tx.id,0,{state:'committed'});const recovery=new RecoveryService({transactionStore:store});const out=await recovery.act(tx.id,'rollback');assert.equal(out.ok,false);assert.equal(out.code,'RECOVERY_COPY_CONTENT_MISMATCH');assert.equal(fs.readFileSync(dst,'utf8'),'BBBB');assert.equal(store.get(tx.id).status,'recovery-failed');
  }
  {
    const dir=tmp('copy-recovery-match'),src=path.join(dir,'src.bin'),dst=path.join(dir,'dst.bin'),stage=path.join(dir,'stage.part');fs.writeFileSync(src,'SAME');fs.writeFileSync(dst,'SAME');
    const store=new TransactionStore(dir);const tx=store.create({kind:'explorer-copy',root:dir,operations:[{kind:'explorer-copy-file',source:src,destination:dst,stage,size:4}]});store.mark(tx.id,{status:'executing'});store.markOp(tx.id,0,{state:'committed'});const recovery=new RecoveryService({transactionStore:store});const out=await recovery.act(tx.id,'rollback');assert.equal(out.ok,true);assert(!fs.existsSync(dst));assert.equal(fs.readFileSync(src,'utf8'),'SAME');
  }
  console.log('product-resilience-hardening-vrc1.test.cjs PASS',{resumeBudget:true,retention:true,exactUndo:true,copyRecoveryHash:true});
})().catch(error=>{console.error(error);process.exit(1)});
