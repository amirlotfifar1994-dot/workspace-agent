const assert=require('assert');
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {batchCycle}=require('../electron/services/explorer-batch-cycles.cjs');
const {buildBatchManifest}=require('../electron/services/explorer-batch-service.cjs');
const {registrySummary,validateSkillStep}=require('../electron/services/skill-registry.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
async function write(p,text){await fsp.mkdir(path.dirname(p),{recursive:true});await fsp.writeFile(p,text);}
async function runToEnd(engine,cycle){let c=cycle;while(c.status==='paused')c=await engine.resume(c.id);return c;}
(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v095-'));const root=path.join(base,'workspace');await fsp.mkdir(root,{recursive:true});
 const store=new CycleStore(base),batchStore=new ExplorerBatchStore(base);const engine=new CycleEngine({store,maxIterations:100,maxWallTimeMs:60000});
 engine.register('explorer-batch-copy',batchCycle({operation:'copy',store:batchStore,chunkSize:3}));engine.register('explorer-batch-move',batchCycle({operation:'move',store:batchStore,chunkSize:2}));
 // recursive copy + checkpoint/resume + undo
 await write(path.join(root,'src','a.txt'),'A');await write(path.join(root,'src','nested','b.txt'),'B');await write(path.join(root,'src','nested','deep','c.txt'),'C');await fsp.mkdir(path.join(root,'dest'));
 let c=engine.create('explorer-batch-copy',{root,sourcesRelative:['src'],destinationDirRelative:'dest',conflictPolicy:'rename',duplicateAware:true,chunkSize:2});c=await engine.run(c.id);assert.equal(c.status,'waiting-confirmation');assert(c.batchPlan.totalItems>=6);c=await engine.confirm(c.id,'approve');assert.equal(c.status,'paused');assert(c.batchProgress.doneItems+c.batchProgress.skippedItems>0);c=await runToEnd(engine,c);assert.equal(c.status,'completed');assert.equal(await fsp.readFile(path.join(root,'dest','src','nested','deep','c.txt'),'utf8'),'C');const rolled=await engine.rollback(c.id);assert(rolled.ok);assert(!fs.existsSync(path.join(root,'dest','src')));
 // duplicate-aware: identical destination is skipped, source retained
 await write(path.join(root,'one.txt'),'same');await write(path.join(root,'dest','one.txt'),'same');let d=engine.create('explorer-batch-copy',{root,sourcesRelative:['one.txt'],destinationDirRelative:'dest',conflictPolicy:'replace',duplicateAware:true,chunkSize:4});d=await engine.run(d.id);d=await engine.confirm(d.id,'approve');d=await runToEnd(engine,d);assert.equal(d.status,'completed');assert.equal(d.batchProgress.skippedItems,1);assert(fs.existsSync(path.join(root,'one.txt')));
 // conflict rename creates deterministic free target
 await write(path.join(root,'two.txt'),'new');await write(path.join(root,'dest','two.txt'),'old');let r=engine.create('explorer-batch-copy',{root,sourcesRelative:['two.txt'],destinationDirRelative:'dest',conflictPolicy:'rename',duplicateAware:true});r=await engine.run(r.id);r=await engine.confirm(r.id,'approve');r=await runToEnd(engine,r);assert.equal(await fsp.readFile(path.join(root,'dest','two (1).txt'),'utf8'),'new');
 // replace file + undo restores old destination
 await write(path.join(root,'replace.txt'),'NEW');await write(path.join(root,'dest','replace.txt'),'OLD');let x=engine.create('explorer-batch-copy',{root,sourcesRelative:['replace.txt'],destinationDirRelative:'dest',conflictPolicy:'replace',duplicateAware:false});x=await engine.run(x.id);x=await engine.confirm(x.id,'approve');x=await runToEnd(engine,x);assert.equal(await fsp.readFile(path.join(root,'dest','replace.txt'),'utf8'),'NEW');const xu=await engine.rollback(x.id);assert(xu.ok);assert.equal(await fsp.readFile(path.join(root,'dest','replace.txt'),'utf8'),'OLD');
 // cancel at safe checkpoint + partial rollback
 await fsp.mkdir(path.join(root,'cancel-src'));for(let i=0;i<12;i++)await write(path.join(root,'cancel-src',`f${i}.txt`),`v${i}`);let q=engine.create('explorer-batch-copy',{root,sourcesRelative:['cancel-src'],destinationDirRelative:'dest',conflictPolicy:'rename',chunkSize:2});q=await engine.run(q.id);q=await engine.confirm(q.id,'approve');assert.equal(q.status,'paused');const beforeCancel=q.batchProgress.doneItems;q=await engine.cancel(q.id);assert.equal(q.status,'cancelled');assert(beforeCancel>0);const qu=await engine.rollback(q.id);assert(qu.ok);assert.equal(qu.cycle.status,'rolled-back');
 // interrupted cycle can resume
 await fsp.mkdir(path.join(root,'resume-src'));for(let i=0;i<6;i++)await write(path.join(root,'resume-src',`x${i}.txt`),`x${i}`);let z=engine.create('explorer-batch-copy',{root,sourcesRelative:['resume-src'],destinationDirRelative:'dest',conflictPolicy:'rename',chunkSize:2});z=await engine.run(z.id);z=await engine.confirm(z.id,'approve');assert.equal(z.status,'paused');z.status='interrupted';z.finishedAt=new Date().toISOString();store.save(z);z=await engine.resume(z.id);z=await runToEnd(engine,z);assert.equal(z.status,'completed');
 // replace directory blocked
 await fsp.mkdir(path.join(root,'dirA'));await fsp.mkdir(path.join(root,'dest','dirA'));await assert.rejects(()=>buildBatchManifest({root,operation:'copy',sourcesRelative:['dirA'],destinationDirRelative:'dest',conflictPolicy:'replace'}),e=>e.code==='EXPLORER_BATCH_REPLACE_DIRECTORY_BLOCKED');
 // symlink source blocked where supported
 try{await fsp.symlink(path.join(root,'one.txt'),path.join(root,'link.txt'));await assert.rejects(()=>buildBatchManifest({root,operation:'copy',sourcesRelative:['link.txt'],destinationDirRelative:'dest'}),e=>e.code==='EXPLORER_BATCH_SOURCE_LINK_BLOCKED'||e.code==='EXPLORER_REPARSE_PATH_BLOCKED');}catch(e){if(!['EPERM','EACCES','ENOSYS'].includes(e.code))throw e;}
 const watcher=new FileWatcherService(base,{debounceMs:60000});const row={id:'w1',root};watcher.queue(row,'rename',path.join('.workspace-agent-batch','x.part'));assert.equal(watcher.status().received,0);watcher.queue(row,'rename','user-file.txt');assert.equal(watcher.status().received,1);watcher.stopAll();
 const reg=registrySummary();assert.equal(reg.total,34);assert.equal(validateSkillStep({skillId:'skill.explorer.batch-copy',type:'explorer-batch-copy'}).code,'SKILL_INTERACTIVE_ONLY');
 batchStore.close();await fsp.rm(base,{recursive:true,force:true});console.log('file-explorer-batch-v095.test.cjs PASS',{skills:reg.total,checkpoint:true,replaceUndo:true,cancelRollback:true});
})().catch(e=>{console.error(e);process.exit(1)});
