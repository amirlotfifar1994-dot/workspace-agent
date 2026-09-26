const assert=require('assert');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');

(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-guard-'));const store=new CycleStore(base);let gateOpen=true,executed=0,undone=0,gateCalls=0;
 const engine=new CycleEngine({store,beforeRun:async(cycle,{phase})=>{gateCalls++;return gateOpen?{ok:true}:{ok:false,code:'VOLUME_IDENTITY_CHANGED',message:`blocked-${phase}`}}});
 engine.register('guarded-write',{next:async cycle=>{const approved=(cycle.steps||[]).some(s=>s.status==='approved');if(!approved)return{status:'waiting-confirmation',steps:[...(cycle.steps||[]),{id:'confirm',status:'waiting-confirmation'}]};executed++;return{status:'completed',steps:(cycle.steps||[]).map(s=>s.id==='confirm'?{...s,status:'completed'}:s),result:{ok:true}};},undo:async()=>{undone++;return[{ok:true}]}});
 const c=engine.create('guarded-write',{root:'/tmp/root'});let r=await engine.run(c.id);assert.strictEqual(r.status,'waiting-confirmation');assert.strictEqual(executed,0);
 gateOpen=false;r=await engine.confirm(c.id,'approve');assert.strictEqual(r.status,'failed');assert.strictEqual(executed,0,'write handler must not execute when volume changes after preview/confirmation');assert(r.evidence.some(e=>e.code==='VOLUME_IDENTITY_CHANGED'));
 gateOpen=true;const c2=engine.create('guarded-write',{root:'/tmp/root'});r=await engine.run(c2.id);r=await engine.confirm(c2.id,'approve');assert.strictEqual(r.status,'completed');assert.strictEqual(executed,1);
 gateOpen=false;const rb=await engine.rollback(c2.id);assert.strictEqual(rb.ok,false);assert.strictEqual(rb.code,'VOLUME_IDENTITY_CHANGED');assert.strictEqual(undone,0,'rollback must not write to an untrusted replacement volume');
 await fsp.rm(base,{recursive:true,force:true});console.log('cycle-root-guard-v083.test.cjs PASS',{guardCalls:gateCalls,postConfirmationGuard:true,rollbackGuard:true});
})().catch(e=>{console.error(e);process.exit(1)});
