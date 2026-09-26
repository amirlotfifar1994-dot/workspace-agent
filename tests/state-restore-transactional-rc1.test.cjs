const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {AutomationStore}=require('../electron/services/automation-store.cjs');
const {ManagedZoneStore}=require('../electron/services/managed-zone-store.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {ConfigurationService}=require('../electron/services/configuration-service.cjs');
const {StateBackupService,INTENT_SCHEMA}=require('../electron/services/state-backup-service.cjs');

const clone=v=>JSON.parse(JSON.stringify(v));
const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-state-restore-'));
const rootA=path.join(base,'A'),rootB=path.join(base,'B');fs.mkdirSync(rootA);fs.mkdirSync(rootB);
const automationStore=new AutomationStore(base,{maxRules:10});
const managedZoneStore=new ManagedZoneStore(base,{knownFolders:{},maxCustomZones:10});
const watcherService=new FileWatcherService(base,{maxWatchRoots:10});
const configurationService=new ConfigurationService({automationStore,managedZoneStore,watcherService,journal:{append:()=>{}}});
const cfgA={schemaVersion:'workspace-agent-config-v1',automationRules:[{id:'rule-A',title:'A',root:rootA,cycleType:'workspace-health',input:{},condition:{},intervalMinutes:60,enabled:true}],managedZones:[{id:'zone-A',title:'ZA',root:rootA,type:'custom',builtIn:false,managed:true}],watchRoots:[{id:'watch-A',title:'WA',root:rootA,enabled:false,createdAt:'2026-08-16T00:00:00.000Z'}]};
const cfgB={schemaVersion:'workspace-agent-config-v1',automationRules:[{id:'rule-B',title:'B',root:rootB,cycleType:'duplicates',input:{},condition:{},intervalMinutes:120,enabled:false}],managedZones:[{id:'zone-B',title:'ZB',root:rootB,type:'custom',builtIn:false,managed:true}],watchRoots:[{id:'watch-B',title:'WB',root:rootB,enabled:false,createdAt:'2026-08-16T00:00:00.000Z'}]};
configurationService.replaceExact(cfgA);
let ai={schemaVersion:'workspace-local-ai-config-v2',enabled:true,baseUrl:'http://127.0.0.1:8080/v1',model:'model-A'};let failNext=false;
const localAIService={settings:()=>clone(ai),replaceSettings(v){if(failNext){failNext=false;throw Object.assign(new Error('injected'),{code:'INJECTED_AI_FAILURE'});}ai=clone(v);return clone(ai);}};
const staleRoots=[];const persistentFileIndex={listRoots:()=>[],markStale:(root,reason)=>{staleRoots.push({root:path.resolve(root),reason});return{ok:true,root,status:'stale',reason};}};
const svc=new StateBackupService(base,{appVersion:'1.0.0-rc1',configurationService,localAIService,persistentFileIndex,journal:{append:()=>{}}});
const backupA=svc.create({reason:'A'});
configurationService.replaceExact(cfgB);ai={...ai,enabled:false,model:'model-B'};
const ok=svc.restore(backupA.file,{createPreRestore:false});assert(ok.ok);assert.strictEqual(ok.report.requiresFullRescan,true);assert(staleRoots.some(x=>x.root===path.resolve(rootA)));assert(staleRoots.some(x=>x.root===path.resolve(rootB)));assert(ok.report.freshnessInvalidation?.ok);assert.strictEqual(configurationService.exportBundle().automationRules[0].id,'rule-A');assert.strictEqual(configurationService.exportBundle().managedZones.find(x=>!x.builtIn).id,'zone-A');assert.strictEqual(configurationService.exportBundle().watchRoots[0].id,'watch-A');assert.strictEqual(ai.model,'model-A');

// Mid-restore failure must roll back every state domain to B and remove the intent marker.
configurationService.replaceExact(cfgB);ai={...ai,enabled:false,model:'model-B'};failNext=true;
assert.throws(()=>svc.restore(backupA.file,{createPreRestore:false}),e=>e.code==='STATE_RESTORE_FAILED'&&e.details?.rolledBack===true);
assert.strictEqual(configurationService.exportBundle().automationRules[0].id,'rule-B');assert.strictEqual(configurationService.exportBundle().watchRoots[0].id,'watch-B');assert.strictEqual(ai.model,'model-B');assert.strictEqual(fs.existsSync(path.join(base,'backups','restore-intent.json')),false);

// Crash intent on startup must restore the previous state before runtime continues.
configurationService.replaceExact(cfgA);ai={...ai,enabled:true,model:'model-A'};
const marker=path.join(base,'backups','restore-intent.json');fs.writeFileSync(marker,JSON.stringify({schemaVersion:INTENT_SCHEMA,restoreId:'crash-1',stage:'configuration-applied',previous:{configuration:cfgB,localAI:{...ai,enabled:false,model:'model-B'}}},null,2));
const recovered=new StateBackupService(base,{appVersion:'1.0.0-rc1',configurationService,localAIService,persistentFileIndex,journal:{append:()=>{}}});
assert.strictEqual(recovered.recoveryStatus.recovered,true);assert.strictEqual(configurationService.exportBundle().automationRules[0].id,'rule-B');assert.strictEqual(ai.model,'model-B');assert.strictEqual(fs.existsSync(marker),false);
watcherService.stopAll();
console.log('state-restore-transactional-rc1.test.cjs PASS',{exactReplacement:true,rollback:true,crashRecovery:true,indexFreshnessInvalidated:true});
