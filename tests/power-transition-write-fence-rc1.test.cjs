const assert=require('assert');
const {EventEmitter}=require('events');
const {ExplorerOperationCoordinator}=require('../electron/services/explorer-operation-coordinator.cjs');
const {SystemResilienceController}=require('../electron/services/system-resilience-controller.cjs');

(async()=>{
  const coordinator=new ExplorerOperationCoordinator();
  const first=coordinator.acquire('job-a',{paths:[{path:process.cwd(),mode:'write'}]});
  assert.equal(first.ok,true);
  coordinator.pause('SYSTEM_SUSPEND');
  const blocked=coordinator.acquire('job-b',{paths:[{path:process.cwd(),mode:'read'}]});
  assert.equal(blocked.ok,false);assert.equal(blocked.code,'EXPLORER_SYSTEM_TRANSITION');
  assert.throws(()=>coordinator.assertLeaseCurrent(first.lease),e=>e.code==='EXPLORER_SYSTEM_TRANSITION');
  coordinator.resume('SYSTEM_RESUME_REVALIDATED');
  assert.throws(()=>coordinator.assertLeaseCurrent(first.lease),e=>e.code==='EXPLORER_OPERATION_FENCE_STALE');
  coordinator.release(first.lease);
  const fresh=coordinator.acquire('job-c',{paths:[{path:process.cwd(),mode:'write'}]});assert.equal(fresh.ok,true);coordinator.assertLeaseCurrent(fresh.lease);coordinator.release(fresh.lease);

  const power=new EventEmitter(),events=[],watch=[];let timerFn=null;
  const controller=new SystemResilienceController({
    powerMonitor:power,
    watcherService:{suspendAll:r=>watch.push(['suspend',r]),resumeAll:()=>watch.push(['resume'])},
    rootResilienceService:{markSystemGap:r=>events.push(['gap',r]),probeNow:async()=>events.push(['probe'])},
    operationCoordinator:coordinator,
    resumeDelayMs:250,
    setTimer:fn=>{timerFn=fn;return{unref(){}}},
    clearTimer:()=>{timerFn=null;}
  });
  controller.start();power.emit('suspend');assert(coordinator.status().barrier);assert.equal(watch[0][0],'suspend');power.emit('resume');assert(coordinator.status().barrier);assert(timerFn);await timerFn();assert.equal(coordinator.status().barrier,null);assert(watch.some(x=>x[0]==='resume'));assert(events.some(x=>x[0]==='probe'));controller.stop();
  console.log('power-transition-write-fence-rc1.test.cjs PASS',{barrier:true,staleLease:true,resumeProbe:true});
})().catch(e=>{console.error(e);process.exit(1)});
