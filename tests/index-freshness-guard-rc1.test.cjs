const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {reconcilePathsForRoots}=require('../electron/services/index-freshness-guard.cjs');
const {RCSelfCheckService}=require('../electron/services/rc-self-check-service.cjs');
const {explorerSearch}=require('../electron/services/file-explorer-service.cjs');
const {indexedFileSearchCycle,indexedDuplicatesCycle}=require('../electron/services/persistent-index-cycles.cjs');

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rc1-index-freshness-')),root=path.join(base,'root');await fsp.mkdir(root,{recursive:true});
  await fsp.writeFile(path.join(root,'seed.txt'),'seed');
  const index=new PersistentFileIndex(path.join(base,'index'));
  let scan=await index.scan(root,{resume:false,maxDirsSession:100,maxWallTimeMs:10000});if(scan.status!=='completed')scan=await index.scan(root,{resume:true,maxDirsSession:100,maxWallTimeMs:10000});assert.equal(scan.status,'completed');
  const indexedSearch=await explorerSearch(root,{query:'seed',index,limit:20});assert.equal(indexedSearch.source,'persistent-index');

  // A bounded subtree reconcile that cannot cover the full directory must never leave the root claiming "completed".
  const large=path.join(root,'large');await fsp.mkdir(large);for(let i=0;i<7;i++)await fsp.writeFile(path.join(large,`f-${i}.txt`),String(i));
  const partial=await index.reconcilePath(root,large,{maxSubtreeFiles:2,maxSubtreeDirs:10});
  assert.equal(partial.ok,false);assert.equal(partial.requiresFullRescan,true);assert.equal((await index.status(root)).status,'stale');
  const fallbackSearch=await explorerSearch(root,{query:'seed',index,limit:20,maxFiles:1000});assert.equal(fallbackSearch.source,'bounded-scan');
  await assert.rejects(()=>indexedFileSearchCycle({index}).next({steps:[],evidence:[],input:{root,filters:{query:'seed'}}}),e=>e.code==='INDEX_NOT_FRESH');
  await assert.rejects(()=>indexedDuplicatesCycle({index}).next({steps:[],evidence:[],input:{root}}),e=>e.code==='INDEX_NOT_FRESH');

  // Verified-write reconciliation propagates partial truth to watcher dirty state instead of pretending index freshness.
  const watcher=new FileWatcherService(path.join(base,'watcher'),{debounceMs:60000});
  const guarded=await reconcilePathsForRoots({index,watcher,roots:[root],paths:[large],reason:'TEST_RECONCILE_GAP'});
  assert.equal(guarded.ok,false);assert.equal(guarded.requiresFullRescan,true);assert(watcher.status().dirtyRoots.some(x=>path.resolve(x.root)===path.resolve(root)));

  // Watch delivery that resolves with a partial result is itself a rescan gap, not a successful delivery claim.
  const watcher2=new FileWatcherService(path.join(base,'watcher2'),{onBatch:async batch=>({ok:false,requiresFullRescan:true,staleRoots:[root],summary:{failed:1}})});
  watcher2.deliveryQueue.push([{id:'e1',root,path:large}]);await watcher2._drain();
  assert.equal(watcher2.status().needsFullRescan,true);assert.equal(watcher2.status().reconcileWarnings,1);

  // RC self-check surfaces stale roots as a warning rather than a clean index PASS.
  const self=new RCSelfCheckService({userData:base,appVersion:'1.0.0-rc1',persistentFileIndex:index,watcherService:watcher});
  const report=self.run({deepIndex:false});
  const serialized=JSON.stringify(report);assert(serialized.includes('INDEX_STALE_ROOTS'),'stale index must be visible in self-check evidence');

  watcher.stopAll();watcher2.stopAll();index.close();await fsp.rm(base,{recursive:true,force:true});
  console.log('index-freshness-guard-rc1.test.cjs PASS',{partialTruth:true,indexFallback:true,staleIndexedSkillsBlocked:true,watcherDirty:true,selfCheckStale:true});
})().catch(e=>{console.error(e);process.exit(1)});
