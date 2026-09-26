const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {AutomationStore}=require('../electron/services/automation-store.cjs');
const {ManagedZoneStore}=require('../electron/services/managed-zone-store.cjs');

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rc1-watcher-config-'));
  const root1=path.join(base,'root1'),root2=path.join(base,'root2');
  await fsp.mkdir(root1,{recursive:true});await fsp.mkdir(root2,{recursive:true});

  // Watch-root capacity is explicit: reaching the limit must never silently evict an older root.
  const watcher=new FileWatcherService(base,{maxWatchRoots:1,debounceMs:60000});
  const first=watcher.add(root1,{title:'first'});
  assert.equal(watcher.configs().length,1);
  assert.throws(()=>watcher.add(root2,{title:'second'}),e=>e.code==='WATCH_ROOT_LIMIT_REACHED');
  assert.equal(watcher.configs().length,1);
  assert.equal(watcher.configs()[0].id,first.id);
  assert.equal(watcher.status().limits.maxWatchRoots,1);

  // A runtime watcher failure is a truthfulness gap: release the dead handle and force full rescan.
  const handle=watcher.handles.get(first.id);
  assert(handle,'watch handle should be active for test root');
  handle.emit('error',Object.assign(new Error('synthetic watcher failure'),{code:'SYNTHETIC_WATCH_ERROR'}));
  await new Promise(r=>setTimeout(r,10));
  assert.equal(watcher.handles.has(first.id),false);
  const status=watcher.status();
  assert.equal(status.needsFullRescan,true);
  assert(status.dirtyRoots.some(x=>path.resolve(x.root)===path.resolve(root1)&&x.reason==='WATCH_RUNTIME_ERROR'));
  watcher.stopAll();

  // Automation capacity must fail closed instead of silently deleting the oldest persisted rule.
  const automationBase=path.join(base,'automation-state');
  const rules=new AutomationStore(automationBase,{maxRules:1});
  const r1=rules.create({root:root1,title:'one',cycleType:'workspace-health'});
  assert.throws(()=>rules.create({root:root2,title:'two',cycleType:'workspace-health'}),e=>e.code==='AUTOMATION_RULE_LIMIT_REACHED');
  assert.deepEqual(rules.list().map(x=>x.id),[r1.id]);

  // Managed-zone capacity follows the same no-silent-eviction contract.
  const zoneBase=path.join(base,'zone-state');
  const zones=new ManagedZoneStore(zoneBase,{maxCustomZones:1});
  const z1=zones.add({root:root1,title:'one'});
  assert.throws(()=>zones.add({root:root2,title:'two'}),e=>e.code==='ZONE_LIMIT_REACHED');
  assert.deepEqual(zones.custom().map(x=>x.id),[z1.id]);

  await fsp.rm(base,{recursive:true,force:true});
  console.log('watcher-config-resilience-rc1.test.cjs PASS',{watcherDirty:true,noSilentEviction:true,explicitCapacity:true});
})().catch(e=>{console.error(e);process.exit(1)});
