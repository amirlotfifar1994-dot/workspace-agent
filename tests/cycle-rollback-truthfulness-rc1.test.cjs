const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine,TERMINAL}=require('../electron/services/cycle-engine.cjs');
(async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rollback-truth-'));
  try{
    const store=new CycleStore(dir);
    let allow=false;
    const engine=new CycleEngine({store,maxIterations:4,maxWallTimeMs:10000});
    engine.register('truthful-undo',{
      allowPartialUndo:true,
      async next(){return{status:'completed',steps:[{id:'done',status:'completed',label:'done'}],undoStack:[{kind:'test'}]};},
      async undo(){return allow?[{ok:true,exact:true}]:[{ok:false,error:'DESTINATION_OCCUPIED'}];}
    });
    let c=engine.create('truthful-undo',{});c=await engine.run(c.id);assert.equal(c.status,'completed');
    let rb=await engine.rollback(c.id);assert.equal(rb.ok,false);assert.equal(rb.cycle.status,'rollback-failed');assert(TERMINAL.has('rollback-failed'));
    assert.equal(store.get(c.id).status,'rollback-failed');
    allow=true;rb=await engine.rollback(c.id);assert.equal(rb.ok,true);assert.equal(rb.cycle.status,'rolled-back');
    console.log('cycle-rollback-truthfulness-rc1.test.cjs PASS',{explicitFailure:true,retryAfterConflict:true});
  }finally{await fsp.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
