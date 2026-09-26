const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const {LifecycleState}=require('../electron/services/lifecycle-state.cjs');
const {ResourcePressureGuard}=require('../electron/services/resource-pressure-guard.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v084-life-'));
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function waitFile(file,timeout=5000){const start=Date.now();while(Date.now()-start<timeout){if(fs.existsSync(file))return;await sleep(20);}throw new Error('ready timeout');}
(async()=>{
  const ready=path.join(tmp,'ready');
  const child=spawn(process.execPath,[path.join(__dirname,'fixtures','lifecycle-crash-child-v084.cjs'),tmp,ready],{stdio:'ignore'});
  await waitFile(ready);child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));
  const afterCrash=new LifecycleState(tmp,{heartbeatMs:5000});
  const start=afterCrash.beginSession({version:'test-parent'});
  assert.equal(start.previousUnclean,true,'forced process death must be detected as unclean');
  afterCrash.markCleanExit('test-clean');
  const next=new LifecycleState(tmp,{heartbeatMs:5000});
  const cleanStart=next.beginSession({version:'test-next'});
  assert.equal(cleanStart.previousUnclean,false,'clean exit must not be reported as unclean');
  next.markCleanExit('done');

  let sample={freeMemoryRatio:.5,freeMemoryBytes:500,totalMemoryBytes:1000,rssBytes:100,heapUsedBytes:50,eventLoopP95Ms:10,processCpuSharePercent:5,cpuCores:8};
  const guard=new ResourcePressureGuard({sampleProvider:()=>({...sample})});
  assert.equal(guard.sample().state,'normal');assert.equal(guard.recommendConcurrency(6),6);assert.equal(guard.tuneChunk({files:40000,dirs:2000,wallTimeMs:20000}).files,40000);
  sample={...sample,freeMemoryRatio:.08,eventLoopP95Ms:200,processCpuSharePercent:65};
  assert.equal(guard.sample().state,'warn');assert.equal(guard.recommendConcurrency(6),2);assert.equal(guard.tuneChunk({files:40000,dirs:2000,wallTimeMs:20000}).files,20000);
  sample={...sample,freeMemoryRatio:.03,eventLoopP95Ms:600,processCpuSharePercent:95};
  assert.equal(guard.sample().state,'critical');assert.equal(guard.recommendConcurrency(6),1);const tuned=guard.tuneChunk({files:40000,dirs:2000,wallTimeMs:20000});assert.equal(tuned.files,10000);assert.equal(tuned.dirs,500);assert.equal(tuned.wallTimeMs,5000);
  console.log('PASS lifecycle + resource pressure v0.8.4');
})().catch(e=>{console.error(e);process.exit(1)}).finally(()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}});
