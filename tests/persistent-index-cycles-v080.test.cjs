const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {persistentIndexScanCycle,indexedFileSearchCycle,indexedDuplicatesCycle}=require('../electron/services/persistent-index-cycles.cjs');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');

(async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v080-cycle-base-'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v080-cycle-root-'));
  try{
    for(let i=0;i<5;i++){const d=path.join(root,`d${i}`);fs.mkdirSync(d);fs.writeFileSync(path.join(d,`f${i}.txt`),i<2?'dup':'x'.repeat(i+1));}
    const index=new PersistentFileIndex(base);
    const store=new CycleStore(base);
    const engine=new CycleEngine({store,maxIterations:20,maxWallTimeMs:60000});
    engine.register('persistent-index-scan',persistentIndexScanCycle({index}));
    engine.register('indexed-file-search',indexedFileSearchCycle({index}));
    engine.register('indexed-duplicates',indexedDuplicatesCycle({index}));

    let c=engine.create('persistent-index-scan',{root,chunkDirs:1,chunkFiles:100,chunkWallTimeMs:10000},{budget:{maxIterations:20,maxWallTimeMs:60000}});
    c=await engine.run(c.id);assert.equal(c.status,'completed');assert.equal(c.result.status,'completed');assert.equal(c.result.files,5);assert(c.iteration>1,'chunked scan should take multiple cycle iterations');

    let s=engine.create('indexed-file-search',{root,filters:{query:'f'},limit:3});s=await engine.run(s.id);assert.equal(s.status,'completed');assert.equal(s.result.total,5);assert.equal(s.result.rows.length,3);
    let d=engine.create('indexed-duplicates',{root,maxCandidateFiles:1000});d=await engine.run(d.id);assert.equal(d.status,'completed');assert.equal(d.result.groupsTotal,1);assert.equal(d.result.duplicateFiles,1);
    const fallbackEngine=new CycleEngine({store:new CycleStore(path.join(base,'fallback')),maxIterations:3,maxWallTimeMs:10000});fallbackEngine.register('persistent-index-scan',persistentIndexScanCycle({index:null}));let unavailable=fallbackEngine.create('persistent-index-scan',{root});unavailable=await fallbackEngine.run(unavailable.id);assert.equal(unavailable.status,'failed');assert(unavailable.evidence.some(x=>x.code==='INDEX_SQLITE_UNAVAILABLE'));
    index.close();
    console.log('persistent-index-cycles-v080.test.cjs PASS',{scanIterations:c.iteration,searchTotal:s.result.total,duplicateGroups:d.result.groupsTotal});
  }finally{fs.rmSync(base,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
