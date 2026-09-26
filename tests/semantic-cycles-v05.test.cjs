const assert=require('assert');const os=require('os');const fs=require('fs');const fsp=fs.promises;const path=require('path');
const {CycleStore}=require('../electron/services/cycle-store.cjs');const {CycleEngine}=require('../electron/services/cycle-engine.cjs');const {FingerprintStore}=require('../electron/services/fingerprint-store.cjs');
const {similarImagesCycle,similarTextsCycle,workspaceIntelligenceCycle}=require('../electron/services/workspace-cycles.cjs');
(async()=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v05-ws-'));const state=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v05-state-'));
 await fsp.writeFile(path.join(root,'a.jpg'),'A');await fsp.writeFile(path.join(root,'b.jpg'),'B');await fsp.writeFile(path.join(root,'c.jpg'),'C');
 await fsp.writeFile(path.join(root,'document.txt'),'Agent Architecture Review\ncycle safety verification rollback workspace agent file intelligence');await fsp.writeFile(path.join(root,'copy.txt'),'Agent Architecture Review\ncycle safety verification rollback workspace agent file intelligence updated');
 const p={};const grad=(flip=false)=>{const a=[];for(let y=0;y<8;y++)for(let x=0;x<9;x++)a.push(flip?20+x*20:220-x*18+y);return a;};p[path.join(root,'a.jpg')]=grad(false);p[path.join(root,'b.jpg')]=grad(false).map((v,i)=>i===12?v+3:v);p[path.join(root,'c.jpg')]=grad(true);
 const store=new CycleStore(state),fps=new FingerprintStore(state),engine=new CycleEngine({store,maxIterations:20});engine.register('similar-images',similarImagesCycle({fingerprintStore:fps,loadGray:async fp=>p[fp]}));engine.register('similar-texts',similarTextsCycle({fingerprintStore:fps}));engine.register('workspace-intelligence',workspaceIntelligenceCycle());
 let c=engine.create('similar-images',{root,threshold:6});c=await engine.run(c.id);assert.equal(c.status,'completed');assert.equal(c.result.groupsTotal,1);assert.equal(c.result.cache.misses,3);
 let c2=engine.create('similar-images',{root,threshold:6});c2=await engine.run(c2.id);assert.equal(c2.result.cache.hits,3);assert.equal(c2.result.cache.misses,0);
 let t=engine.create('similar-texts',{root,threshold:18});t=await engine.run(t.id);assert.equal(t.status,'completed');assert.ok(t.result.groupsTotal>=1);assert.ok(t.result.cache.misses>=2);
 let t2=engine.create('similar-texts',{root,threshold:18});t2=await engine.run(t2.id);assert.ok(t2.result.cache.hits>=2);
 let i=engine.create('workspace-intelligence',{root,minConfidence:.4});i=await engine.run(i.id);assert.equal(i.status,'completed');assert.equal(i.result.policy.autoApply,false);
 console.log('semantic-cycles-v05.test: OK');
})().catch(e=>{console.error(e);process.exit(1)});
