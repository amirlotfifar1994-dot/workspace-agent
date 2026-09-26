const assert=require('assert');const os=require('os');const fsp=require('fs').promises;const path=require('path');
const{CycleStore}=require('../electron/services/cycle-store.cjs');const{CycleEngine}=require('../electron/services/cycle-engine.cjs');const{AutomationStore}=require('../electron/services/automation-store.cjs');const{AutomationService}=require('../electron/services/automation-service.cjs');const{healthCycle}=require('../electron/services/file-cycles.cjs');const{windowsSystemCycle}=require('../electron/services/workspace-cycles.cjs');
(async()=>{
 const ws=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-auto-ws-'));const state=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-auto-state-'));await fsp.writeFile(path.join(ws,'a.txt'),'x');
 const store=new CycleStore(state),engine=new CycleEngine({store}),rules=new AutomationStore(state);engine.register('workspace-health',healthCycle());engine.register('windows-system',windowsSystemCycle());
 const rule=rules.create({root:ws,title:'health',cycleType:'workspace-health',intervalMinutes:1});assert.equal(rule.intervalMinutes,5);assert.equal(rules.list().length,1);
 const svc=new AutomationService({engine,ruleStore:rules,tickMs:999999});const r=await svc.runRule(rule.id,{manual:true});assert.equal(r.ok,true);assert.equal(r.cycle.status,'completed');assert.equal(rules.list()[0].lastStatus,'completed');
 const sys=engine.create('windows-system',{});const done=await engine.run(sys.id);assert.equal(done.status,'completed');assert.ok(done.result);
 let blocked=false;try{rules.create({root:ws,cycleType:'maintenance-cleanup'});}catch(e){blocked=e.code==='AUTOMATION_TYPE_BLOCKED'}assert.equal(blocked,true);
 console.log('automation-v04.test: OK');
})().catch(e=>{console.error(e);process.exit(1)});
