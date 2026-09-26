const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const assert=require('assert');
const {buildWritePlan,executeWritePlan,verifyCompleted,undoCompleted,describePath}=require('../electron/services/file-explorer-service.cjs');
const {TransactionStore}=require('../electron/services/transaction-store.cjs');
(async()=>{
  if(process.platform!=='win32'){console.log('windows-file-explorer-v094.uat.cjs SKIP (Windows only)');return;}
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-explorer-uat-'));const root=path.join(base,'Workspace فارسی 🚀');const data=path.join(base,'AgentData');await fsp.mkdir(path.join(root,'A'),{recursive:true});await fsp.mkdir(data,{recursive:true});const txStore=new TransactionStore(data);
  const longDir=path.join('A',...Array.from({length:12},(_,i)=>`segment-${i}-${'x'.repeat(14)}`));await fsp.mkdir(path.join(root,longDir),{recursive:true});const sourceRel=path.join(longDir,'نمونه-فایل-🚀.txt');await fsp.writeFile(path.join(root,sourceRel),'Windows Explorer UAT');
  const props=await describePath(root,sourceRel);assert.strictEqual(props.type,'file');
  const copyRel=path.join('A','کپی-🚀.txt');const copyPlan=await buildWritePlan({action:'copy',root,sourceRelative:sourceRel,destinationRelative:copyRel});const copy=await executeWritePlan(copyPlan,{cycleId:'uat-copy',transactionStore:txStore});assert.strictEqual((await verifyCompleted(copy)).ok,true);assert.strictEqual((await undoCompleted(copy))[0].ok,true);
  const moveRel=path.join('A','منتقل-شده.txt');const movePlan=await buildWritePlan({action:'move',root,sourceRelative:sourceRel,destinationRelative:moveRel});const moved=await executeWritePlan(movePlan,{cycleId:'uat-move',transactionStore:txStore});assert.strictEqual((await verifyCompleted(moved)).ok,true);assert.strictEqual((await undoCompleted(moved))[0].ok,true);
  const renamePlan=await buildWritePlan({action:'rename',root,sourceRelative:sourceRel,newName:'تغییر-نام-🚀.txt'});const renamed=await executeWritePlan(renamePlan,{cycleId:'uat-rename',transactionStore:txStore});assert.strictEqual((await verifyCompleted(renamed)).ok,true);assert.strictEqual((await undoCompleted(renamed))[0].ok,true);
  const folderPlan=await buildWritePlan({action:'new-folder',root,destinationRelative:path.join('A','پوشه جدید')});const folder=await executeWritePlan(folderPlan,{cycleId:'uat-folder',transactionStore:txStore});assert.strictEqual((await verifyCompleted(folder)).ok,true);assert.strictEqual((await undoCompleted(folder))[0].ok,true);
  let junction='not-tested';try{const outside=path.join(base,'outside');await fsp.mkdir(outside);const link=path.join(root,'junction-out');await fsp.symlink(outside,link,'junction');await assert.rejects(()=>buildWritePlan({action:'new-folder',root,destinationRelative:path.join('junction-out','blocked')}),e=>e.code==='EXPLORER_REPARSE_PATH_BLOCKED');junction='blocked';}catch(e){if(!['EPERM','EACCES','UNKNOWN'].includes(e.code))throw e;junction='permission-skip';}
  await fsp.rm(base,{recursive:true,force:true});console.log('windows-file-explorer-v094.uat.cjs PASS',{unicode:true,longPath:props.path.length,junction});
})().catch(e=>{console.error(e);process.exit(1)});
