const assert=require('assert');
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {ExplorerOperationCoordinator}=require('../electron/services/explorer-operation-coordinator.cjs');
const {batchCycle}=require('../electron/services/explorer-batch-cycles.cjs');
const {explorerWriteCycle}=require('../electron/services/file-explorer-cycles.cjs');
async function write(p,text){await fsp.mkdir(path.dirname(p),{recursive:true});await fsp.writeFile(p,text);}
async function resumeToEnd(engine,c){let x=c;for(let i=0;i<30&&x.status==='paused';i++)x=await engine.resume(x.id);return x;}
(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-concurrency-cycle-')),root=path.join(base,'workspace'),dest=path.join(root,'dest');await fsp.mkdir(dest,{recursive:true});
  const cycles=new CycleStore(base),batches=new ExplorerBatchStore(base),coordinator=new ExplorerOperationCoordinator();const engine=new CycleEngine({store:cycles,maxIterations:100,maxWallTimeMs:60000});
  engine.register('explorer-batch-copy',batchCycle({operation:'copy',store:batches,chunkSize:4,operationCoordinator:coordinator}));
  engine.register('explorer-copy',explorerWriteCycle({action:'copy',operationCoordinator:coordinator}));
  await write(path.join(root,'batch.txt'),'BATCH');
  let c=engine.create('explorer-batch-copy',{root,sourcesRelative:['batch.txt'],destinationDirRelative:'dest',conflictPolicy:'skip',chunkSize:4});c=await engine.run(c.id);assert.equal(c.status,'waiting-confirmation');
  const held=coordinator.acquire('external-writer',{paths:[{path:dest,mode:'write'}]});assert(held.ok);c=await engine.confirm(c.id,'approve');assert.equal(c.status,'paused');assert.equal(c.batchBlocker.code,'EXPLORER_OPERATION_BUSY');assert(!fs.existsSync(path.join(dest,'batch.txt')),'busy lease must block mutation');coordinator.release(held.lease);
  c=await resumeToEnd(engine,c);assert.equal(c.status,'completed');assert.equal(await fsp.readFile(path.join(dest,'batch.txt'),'utf8'),'BATCH');

  await write(path.join(root,'single.txt'),'SINGLE');
  let s=engine.create('explorer-copy',{root,sourceRelative:'single.txt',destinationRelative:path.join('dest','single.txt')});s=await engine.run(s.id);assert.equal(s.status,'waiting-confirmation');
  const held2=coordinator.acquire('batch-like-writer',{paths:[{path:dest,mode:'write'}]});assert(held2.ok);s=await engine.confirm(s.id,'approve');assert.equal(s.status,'paused');assert.equal(s.writeBlocker.code,'EXPLORER_OPERATION_BUSY');assert(!fs.existsSync(path.join(dest,'single.txt')));coordinator.release(held2.lease);
  s=await engine.resume(s.id);assert.equal(s.status,'completed');assert.equal(await fsp.readFile(path.join(dest,'single.txt'),'utf8'),'SINGLE');

  batches.close();coordinator.close();await fsp.rm(base,{recursive:true,force:true});console.log('explorer-concurrency-cycle-rc1.test.cjs PASS',{batchPauseResume:true,singleWritePauseResume:true});
})().catch(e=>{console.error(e);process.exit(1)});
