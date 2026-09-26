const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {EventEmitter}=require('events');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {RootResilienceService}=require('../electron/services/root-resilience-service.cjs');
const {SystemResilienceController}=require('../electron/services/system-resilience-controller.cjs');

(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-'));const root=path.join(base,'root');await fsp.mkdir(root);await fsp.writeFile(path.join(root,'a.txt'),'a');

 // v0.8.2 schema v1 must migrate additively to v2 without deleting the DB.
 const {DatabaseSync}=require('node:sqlite');const migrateBase=path.join(base,'migrate');await fsp.mkdir(path.join(migrateBase,'persistent-index'),{recursive:true});const migrateDb=path.join(migrateBase,'persistent-index','files.sqlite');const raw=new DatabaseSync(migrateDb);raw.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta(key,value) VALUES('schema_version','1');");raw.close();const migrated=new PersistentFileIndex(migrateBase);const ver=migrated.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();assert.strictEqual(String(ver.value),'3');assert.doesNotThrow(()=>migrated.db.prepare('SELECT COUNT(*) n FROM root_runtime').get());migrated.close();
 const index=new PersistentFileIndex(path.join(base,'state'));let st=await index.scan(root,{resume:false,maxWallTimeMs:30000});while(st.status!=='completed')st=await index.scan(root,{resume:true,maxWallTimeMs:30000});
 const watcher=new FileWatcherService(path.join(base,'watch'),{debounceMs:60000});watcher.add(root,{title:'Root'});
 let step=0;const probe=async()=>{step+=1;if(step===1)return{available:true,root,identityKey:'volume:A',driveLetter:'E',volume:{uniqueId:'A',driveLetter:'E',fileSystem:'NTFS',driveType:'Fixed',healthStatus:'Healthy'}};if(step===2)return{available:false,root,code:'ENOENT',identityKey:''};if(step===3)return{available:true,root,identityKey:'volume:A',driveLetter:'E',volume:{uniqueId:'A',driveLetter:'E',fileSystem:'NTFS',driveType:'Fixed',healthStatus:'Healthy'}};return{available:true,root,identityKey:'volume:B',driveLetter:'E',volume:{uniqueId:'B',driveLetter:'E',fileSystem:'NTFS',driveType:'Fixed',healthStatus:'Healthy'}};};
 const resilience=new RootResilienceService({watcherService:watcher,index,probe,locate:async()=>({found:false}),intervalMs:60000,platform:process.platform});
 await resilience.probeNow();let rs=resilience.status().roots[0];assert.strictEqual(rs.available,true);assert.strictEqual(rs.identityKey,'volume:A');assert.strictEqual(index.rootRuntime(root).volumeUniqueId,'A');
 await resilience.probeNow();rs=resilience.status().roots[0];assert.strictEqual(rs.available,false);assert.strictEqual(watcher.handles.size,0);assert.strictEqual(watcher.status().needsFullRescan,true);
 await resilience.probeNow();rs=resilience.status().roots[0];assert.strictEqual(rs.status,'reconnected');assert.strictEqual(watcher.handles.size,1);
 await resilience.probeNow();rs=resilience.status().roots[0];assert.strictEqual(rs.status,'identity-changed');assert.strictEqual(rs.identityChanged,true);assert.strictEqual(watcher.handles.size,0);assert.strictEqual(index.rootRuntime(root).identityChanged,true);assert.strictEqual(watcher.status().blockedRoots.length,1);watcher.suspendAll('TEST_SUSPEND');watcher.resumeAll();assert.strictEqual(watcher.handles.size,0,'blocked root must stay blocked across suspend/resume');
 // Fresh-reindex acknowledgement requires a successful availability probe and explicitly clears the identity-change latch.
 resilience.probe=async()=>({available:true,root,identityKey:'volume:B',driveLetter:'E',volume:{uniqueId:'B',driveLetter:'E',fileSystem:'NTFS',driveType:'Fixed',healthStatus:'Healthy'}});
 const ack=await resilience.acknowledgeRoot(root);assert.strictEqual(ack.ok,true);assert.strictEqual(index.rootRuntime(root).identityChanged,false);assert.strictEqual(watcher.handles.size,1);assert.strictEqual(watcher.status().needsFullRescan,false);

 // Relocation candidate must never auto-rebind.
 const fakeWatcher={configs:()=>[{id:'w',root:'E:\\Workspace',enabled:true}],stopRoot:()=>1,startRoot:()=>{throw new Error('must not auto-start relocated root')},_markDirty:()=>{},clearDirty:()=>true};
 const persisted={available:true,status:'available',identityKey:'volume:USB-A',volumeUniqueId:'USB-A',driveLetter:'E',identityChanged:false};
 const fakeIndex={listRoots:()=>[],rootRuntime:()=>persisted,setRootRuntime:()=>{}};
 const relocated=new RootResilienceService({watcherService:fakeWatcher,index:fakeIndex,platform:'win32',probe:async()=>({available:false,root:'E:\\Workspace',code:'ENOENT'}),locate:async()=>({found:true,driveRoot:'F:\\',volume:{driveLetter:'F',uniqueId:'USB-A'}})});
 await relocated.probeNow();const rel=relocated.status().roots[0];assert.strictEqual(rel.status,'relocated-candidate');assert.strictEqual(rel.rebindCandidate.root,'F:\\Workspace');

 // A volume that is not found at the first disconnect probe must still be discovered later on another drive letter.
 let locateCalls=0;let clock=100000;const laterWatcher={configs:()=>[{id:'later',root:'E:\\Archive',enabled:true}],blockRoot:()=>{},unblockRoot:()=>{},startRoot:()=>{throw new Error('must not auto-rebind later relocation')},_markDirty:()=>{}};const laterIndex={listRoots:()=>[],rootRuntime:()=>({available:false,status:'unavailable',identityKey:'volume:USB-LATER',volumeUniqueId:'USB-LATER',driveLetter:'E',identityChanged:false,lastSeenAt:null,unavailableSince:new Date().toISOString()}),setRootRuntime:()=>{}};const realNow=Date.now;Date.now=()=>clock;try{const later=new RootResilienceService({watcherService:laterWatcher,index:laterIndex,platform:'win32',deepIdentityIntervalMs:60000,probe:async()=>({available:false,root:'E:\\Archive',code:'ENOENT'}),locate:async()=>{locateCalls++;return locateCalls===1?{found:false}:{found:true,driveRoot:'G:\\',volume:{driveLetter:'G',uniqueId:'USB-LATER'}}}});await later.probeNow({forceIdentity:true});assert.strictEqual(later.status().roots[0].status,'unavailable');clock+=60001;await later.probeNow();const laterState=later.status().roots[0];assert.strictEqual(laterState.status,'relocated-candidate');assert.strictEqual(laterState.rebindCandidate.root,'G:\\Archive');assert(locateCalls>=2,'unavailable root must re-run UniqueId lookup after deep interval');}finally{Date.now=realNow;}

 // Periodic availability checks must not spawn a deep identity probe on every tick; write validation forces a fresh identity probe.
 let availabilityCalls=0,identityCalls=0;const cadenceWatcher={configs:()=>[{id:'c',root:'/cadence',enabled:true}],startRoot:()=>0,stopRoot:()=>0,blockRoot:()=>{},unblockRoot:()=>{},_markDirty:()=>{}};const cadence=new RootResilienceService({watcherService:cadenceWatcher,platform:'linux',deepIdentityIntervalMs:60000,availabilityProbe:async root=>{availabilityCalls++;return{available:true,root}},identityProbe:async root=>{identityCalls++;return{available:true,root,identityKey:'volume:CADENCE',volume:{uniqueId:'CADENCE'}}}});await cadence.probeRoot('/cadence',{forceIdentity:false});await cadence.probeRoot('/cadence',{forceIdentity:false});assert.strictEqual(identityCalls,1);assert(availabilityCalls>=2);const vg=await cadence.validateRoot('/cadence');assert.strictEqual(vg.ok,true);assert.strictEqual(identityCalls,2,'write validation must force fresh deep identity probe');

 // Suspend/resume controller must stop watchers, mark a gap, reprobe, then resume.
 const power=new EventEmitter();let suspended=0,resumed=0,gaps=0,probes=0;const fakeWatch2={suspendAll:()=>{suspended++},resumeAll:()=>{resumed++}};const fakeRoots={markSystemGap:()=>{gaps++},probeNow:async()=>{probes++}};
 const controller=new SystemResilienceController({powerMonitor:power,watcherService:fakeWatch2,rootResilienceService:fakeRoots,resumeDelayMs:1,setTimer:fn=>{const h=setTimeout(fn,1);return h},clearTimer:clearTimeout});controller.start();power.emit('suspend');power.emit('resume');await new Promise(r=>setTimeout(r,25));controller.stop();assert.strictEqual(suspended,1);assert.strictEqual(resumed,1);assert(gaps>=2);assert.strictEqual(probes,1);

 watcher.stopAll();index.close();await fsp.rm(base,{recursive:true,force:true});
 console.log('system-resilience-v083.test.cjs PASS',{disconnect:true,reconnect:true,identityChange:true,rebindCandidate:true,suspendResume:true});
})().catch(e=>{console.error(e);process.exit(1)});
