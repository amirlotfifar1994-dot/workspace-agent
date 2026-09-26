const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {EventJournal}=require('../electron/services/event-journal.cjs');
const {TransactionStore}=require('../electron/services/transaction-store.cjs');
const {RecoveryService}=require('../electron/services/recovery-service.cjs');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {extractPdfText}=require('../electron/services/pdf-text-extractor.cjs');
const {readTextSample}=require('../electron/services/text-similarity.cjs');
const {AutomationStore}=require('../electron/services/automation-store.cjs');
const {ManagedZoneStore}=require('../electron/services/managed-zone-store.cjs');
const {ConfigurationService}=require('../electron/services/configuration-service.cjs');
const {executeRenames,verifyRenames}=require('../electron/services/renamer.cjs');
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v07-'));const workspace=path.join(base,'workspace');await fsp.mkdir(workspace);
 const journal=new EventJournal(base);const txStore=new TransactionStore(base,{journal});const recovery=new RecoveryService({transactionStore:txStore,journal});
 // Simulated crash after direct move committed -> rollback.
 const a=path.join(workspace,'a.txt'),b=path.join(workspace,'b.txt');await fsp.writeFile(a,'alpha');const tx1=txStore.create({kind:'test-direct',cycleId:'cycle-crash-1',root:workspace,operations:[{source:a,destination:b,size:5}]});txStore.mark(tx1.id,{status:'executing'});await fsp.rename(a,b);txStore.markOp(tx1.id,0,{state:'committed'});let rec=recovery.inspect().find(x=>x.id===tx1.id);assert(rec&&rec.recovery.rollbackAllowed&&rec.recovery.committed===1);let acted=await recovery.act(tx1.id,'rollback');assert(acted.ok&&fs.existsSync(a)&&!fs.existsSync(b));
 // Simulated crash in staging -> resume.
 const c=path.join(workspace,'c.txt'),d=path.join(workspace,'d.txt'),stage=path.join(workspace,'.stage-c');await fsp.writeFile(c,'charlie');const tx2=txStore.create({kind:'test-staged',cycleId:'cycle-crash-2',root:workspace,operations:[{source:c,destination:d,stage,size:7}]});txStore.mark(tx2.id,{status:'executing'});await fsp.rename(c,stage);txStore.markOp(tx2.id,0,{state:'staged'});rec=recovery.inspect().find(x=>x.id===tx2.id);assert(rec&&rec.recovery.resumeAllowed&&rec.recovery.staged===1);acted=await recovery.act(tx2.id,'resume');assert(acted.ok&&!fs.existsSync(c)&&!fs.existsSync(stage)&&fs.existsSync(d));
 // Transaction integration for rename.
 const r1=path.join(workspace,'old.txt'),r2=path.join(workspace,'new.txt');await fsp.writeFile(r1,'rename-me');const st=await fsp.stat(r1);const completed=await executeRenames([{kind:'rename',workspaceRoot:workspace,source:r1,destination:r2,newName:'new.txt',size:st.size,mtimeMs:st.mtimeMs}],{transactionStore:txStore,cycleId:'rename-cycle'});assert((await verifyRenames(completed)).ok);const renameTx=txStore.list().find(x=>x.cycleId==='rename-cycle');assert(renameTx&&renameTx.status==='completed');
 // Cycle restart reconciliation.
 const cycleStore=new CycleStore(base);cycleStore.save({id:'cycle-running',type:'organize',status:'running',steps:[],evidence:[],updatedAt:new Date().toISOString()});assert.strictEqual(cycleStore.reconcileInterrupted(),1);assert.strictEqual(cycleStore.get('cycle-running').status,'interrupted');
 // A file-committed transaction whose parent cycle was interrupted must still appear for local-state reconciliation.
 const lsSource=path.join(workspace,'ls-source.txt'),lsDest=path.join(workspace,'ls-dest.txt');await fsp.writeFile(lsDest,'localstate');cycleStore.save({id:'cycle-localstate',type:'recommendation-apply',status:'interrupted',steps:[],evidence:[],updatedAt:new Date().toISOString()});const lsTx=txStore.create({kind:'recommendation-apply',cycleId:'cycle-localstate',root:workspace,operations:[{kind:'move',source:lsSource,destination:lsDest,size:10,itemIds:['rq-1']}]});txStore.markOp(lsTx.id,0,{state:'committed'});txStore.mark(lsTx.id,{status:'completed'});let reconciled=null;const recoveryWithCycles=new RecoveryService({transactionStore:txStore,cycleStore,journal,onRecovered:async(tx,action)=>{reconciled={id:tx.id,action,itemIds:tx.operations[0].meta.itemIds}}});assert(recoveryWithCycles.inspect().some(x=>x.id===lsTx.id&&x.recovery.recommendation==='reconcile-or-rollback'));const lsAct=await recoveryWithCycles.act(lsTx.id,'resume');assert(lsAct.ok&&reconciled?.action==='resume'&&reconciled.itemIds[0]==='rq-1');
 // Journal chain integrity.
 journal.append('TEST_EVENT',{payload:{ok:true}});const integrity=journal.verify();assert(integrity.ok&&integrity.count>=1);
 // Ambiguous recovery state must be blocked.
 const ambSource=path.join(workspace,'amb-source.txt'),ambDest=path.join(workspace,'amb-dest.txt');await fsp.writeFile(ambSource,'s');await fsp.writeFile(ambDest,'d');const ambTx=txStore.create({kind:'ambiguous',cycleId:'cycle-amb',root:workspace,operations:[{source:ambSource,destination:ambDest,size:1}]});txStore.mark(ambTx.id,{status:'executing'});const amb=recovery.inspect().find(x=>x.id===ambTx.id);assert(amb&&amb.recovery.manualReview);const blocked=await recovery.act(ambTx.id,'resume');assert(!blocked.ok&&blocked.code==='RECOVERY_MANUAL_REVIEW_REQUIRED');txStore.mark(ambTx.id,{status:'abandoned'});
 // Tamper detection on an isolated journal.
 const tamperBase=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v07-journal-'));const tamperJournal=new EventJournal(tamperBase);tamperJournal.append('A',{payload:{n:1}});tamperJournal.append('B',{payload:{n:2}});const jf=path.join(tamperBase,'journal','events.ndjson');let jt=await fsp.readFile(jf,'utf8');jt=jt.replace('\"n\":1','\"n\":9');await fsp.writeFile(jf,jt,'utf8');assert.strictEqual(tamperJournal.verify().ok,false);await fsp.rm(tamperBase,{recursive:true,force:true});
 // PDF base intelligence + text integration.
 const pdf=path.join(workspace,'sample.pdf');const pdfRaw=`%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n2 0 obj<< /Type /Page >>endobj\n3 0 obj<< /Title (Quarterly PDF Review) /Author (Workspace Agent) >>endobj\n4 0 obj<< /Length 55 >>stream\nBT /F1 12 Tf 72 720 Td (Hello PDF Intelligence) Tj ET\nendstream\nendobj\n%%EOF`;
 await fsp.writeFile(pdf,pdfRaw,'latin1');const px=await extractPdfText(pdf);assert(px.text.includes('Hello PDF Intelligence'));assert.strictEqual(px.metadata.title,'Quarterly PDF Review');assert((await readTextSample(pdf,4096)).includes('Hello PDF Intelligence'));
 // Watcher produces read-only event history.
 const watcher=new FileWatcherService(base,{journal,debounceMs:150});const watch=watcher.add(workspace,{title:'Test Workspace'});await fsp.writeFile(path.join(workspace,'watched.txt'),'watch me');await sleep(700);watcher.flush();const ev=watcher.events(50);assert(ev.some(x=>x.watchId===watch.id));watcher.stopAll();
 // Config portability: export + import into a second local state.
 const auto1=new AutomationStore(base);auto1.create({title:'Health every hour',root:workspace,cycleType:'workspace-health',intervalMinutes:60});const zones1=new ManagedZoneStore(base);zones1.add({root:workspace,title:'Workspace'});const watcher1=new FileWatcherService(base,{journal});const config1=new ConfigurationService({automationStore:auto1,managedZoneStore:zones1,watcherService:watcher1,journal});const bundle=config1.exportBundle();assert(bundle.automationRules.length>=1&&bundle.managedZones.length>=1);
 const base2=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v07-import-'));const auto2=new AutomationStore(base2);const zones2=new ManagedZoneStore(base2);const watcher2=new FileWatcherService(base2);const config2=new ConfigurationService({automationStore:auto2,managedZoneStore:zones2,watcherService:watcher2});const report=config2.apply(bundle);assert(report.rules.added>=1&&report.zones.added>=1);watcher2.stopAll();
 console.log('production-hardening-v07.test PASS',{journalEvents:integrity.count,recoveryTransactions:2,watchEvents:ev.length,pdfChars:px.chars});
 await fsp.rm(base,{recursive:true,force:true});await fsp.rm(base2,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
