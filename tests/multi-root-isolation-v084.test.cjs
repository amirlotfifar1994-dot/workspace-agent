const assert=require('assert');
const path=require('path');
const {RootResilienceService}=require('../electron/services/root-resilience-service.cjs');
class FakeWatcher{
 constructor(roots){this.rows=roots.map((root,i)=>({id:`w${i}`,root,enabled:true}));this.blocked=new Map();this.started=[];this.dirty=[];}
 configs(){return this.rows} blockRoot(root,reason){this.blocked.set(root,reason)} unblockRoot(root){return this.blocked.delete(root)} startRoot(root){this.started.push(root);return 1} stopRoot(){return 1} _markDirty(root,reason){this.dirty.push({root,reason})} clearDirty(){} isRootBlocked(root){return this.blocked.has(root)}
}
(async()=>{
 const A=path.resolve('/tmp/wa-drive-A'),B=path.resolve('/tmp/wa-drive-B');const watcher=new FakeWatcher([A,B]);const runtime=[];const index={listRoots:()=>[],setRootRuntime:(root,state)=>runtime.push({root,state}),rootRuntime:()=>null};
 const identities={A:{available:true,identityKey:'volume:A',volume:{uniqueId:'A'},driveLetter:'E'},B:{available:true,identityKey:'volume:B',volume:{uniqueId:'B'},driveLetter:'F'}};const which=root=>String(root).toLowerCase().includes('drive-a')?'A':'B';
 const svc=new RootResilienceService({watcherService:watcher,index,platform:'win32',probe:async root=>({...identities[which(root)]}),locate:async()=>({found:false}),intervalMs:1000,deepIdentityIntervalMs:1000});
 await svc.probeNow({forceIdentity:true});assert.equal(svc.status().roots.length,2);assert.equal(watcher.blocked.size,0);
 identities.A={available:true,identityKey:'volume:C',volume:{uniqueId:'C'},driveLetter:'E'};await svc.probeRoot(A,{forceIdentity:true});
 assert.ok([...watcher.blocked.keys()].some(x=>String(x).toLowerCase().includes('drive-a')),'changed root A must be blocked');assert.ok(![...watcher.blocked.keys()].some(x=>String(x).toLowerCase().includes('drive-b')),'root B must stay unblocked');
 const b=await svc.probeRoot(B,{forceIdentity:true});assert.equal(b.identityChanged,false);assert.equal(b.available,true);
 identities.A={available:false,identityKey:'',volume:null,driveLetter:'E'};await svc.probeRoot(A,{forceIdentity:true});const status=svc.status();const br=status.roots.find(x=>String(x.root).toLowerCase().includes('drive-b'));assert.equal(br.available,true);assert.notEqual(br.status,'identity-changed');
 console.log('PASS multi-root isolation v0.8.4');
})().catch(e=>{console.error(e);process.exit(1)});
