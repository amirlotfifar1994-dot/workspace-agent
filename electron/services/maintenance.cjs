const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const {assertWriteRoot,assertInsideRoot}=require('./path-policy.cjs');

function safeDestination(dest){
  if(!fs.existsSync(dest)) return dest;
  const dir=path.dirname(dest),ext=path.extname(dest),base=path.basename(dest,ext);let i=2;
  while(fs.existsSync(path.join(dir,`${base} (${i})${ext}`))) i+=1;
  return path.join(dir,`${base} (${i})${ext}`);
}
function relativeSafe(root,source){
  const rel=path.relative(root,source);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel)) throw Object.assign(new Error('مسیر عملیات خارج از محدوده Workspace است.'),{code:'PATH_ESCAPE_BLOCKED'});
  return rel;
}
function ageDays(mtimeMs,nowMs=Date.now()){return Number(mtimeMs)>0?Math.floor((nowMs-Number(mtimeMs))/86400000):0;}

function buildMaintenancePlan(root,health,{
  includeLowRiskJunk=true,
  includeMediumRiskJunk=false,
  includeEmptyFolders=false,
  includeZeroByte=false,
  minJunkAgeDays=7,
  minZeroByteAgeDays=30,
  maxOperations=5000,
  selectedPaths=null,
}={}){
  const resolvedRoot=assertWriteRoot(root);
  const selected=Array.isArray(selectedPaths)&&selectedPaths.length?new Set(selectedPaths.map(p=>path.resolve(p))):null;
  const operations=[];const skipped=[];
  const push=(op)=>{if(operations.length>=maxOperations){skipped.push({reason:'MAX_OPERATIONS',path:op.source});return;} operations.push(op);};
  if(includeLowRiskJunk||includeMediumRiskJunk){
    for(const f of health?.junk||[]){
      if(!f?.path)continue;const source=assertInsideRoot(f.path,resolvedRoot);if(selected&&!selected.has(path.resolve(source)))continue;
      const risk=String(f.risk||'');if(risk==='low'&&!includeLowRiskJunk)continue;if(risk==='medium'&&!includeMediumRiskJunk)continue;if(!['low','medium'].includes(risk))continue;
      const age=ageDays(f.mtimeMs);if(age<minJunkAgeDays){skipped.push({reason:'TOO_RECENT_JUNK',path:source,ageDays:age});continue;}
      push({kind:'quarantine-file',reason:'junk',risk,source,relativePath:relativeSafe(resolvedRoot,source),size:Number(f.size||0),mtimeMs:Number(f.mtimeMs||0),ageDays:age});
    }
  }
  if(includeZeroByte){
    for(const f of health?.zeroByte?.rows||[]){
      if(!f?.path)continue;const source=assertInsideRoot(f.path,resolvedRoot);if(selected&&!selected.has(path.resolve(source)))continue;
      const age=ageDays(f.mtimeMs);if(age<minZeroByteAgeDays){skipped.push({reason:'TOO_RECENT_ZERO_BYTE',path:source,ageDays:age});continue;}
      if(operations.some(o=>path.resolve(o.source)===path.resolve(source)))continue;
      push({kind:'quarantine-file',reason:'zero-byte',risk:'medium',source,relativePath:relativeSafe(resolvedRoot,source),size:0,mtimeMs:Number(f.mtimeMs||0),ageDays:age});
    }
  }
  if(includeEmptyFolders){
    const rows=health?.emptyFolders||[];
    // deepest first so nested empty folders do not invalidate parent/child operations
    for(const p of [...rows].sort((a,b)=>String(b).length-String(a).length)){
      const source=assertInsideRoot(p,resolvedRoot);if(selected&&!selected.has(path.resolve(source)))continue;
      push({kind:'quarantine-dir',reason:'empty-folder',risk:'low',source,relativePath:relativeSafe(resolvedRoot,source)});
    }
  }
  return {root:resolvedRoot,operations,skipped,truncated:skipped.some(x=>x.reason==='MAX_OPERATIONS'),estimatedBytes:operations.reduce((n,o)=>n+Number(o.size||0),0)};
}

async function preflightMaintenance(root,operations=[]){
  for(const op of operations){
    const source=assertInsideRoot(op.source,root);
    const st=await fsp.stat(source);
    if(op.kind==='quarantine-dir'){
      if(!st.isDirectory())throw Object.assign(new Error(`پوشه دیگر پوشه نیست: ${source}`),{code:'DIRECTORY_CHANGED_SINCE_PREVIEW'});
      const entries=await fsp.readdir(source);if(entries.length!==0)throw Object.assign(new Error(`پوشه بعد از Preview دیگر خالی نیست: ${source}`),{code:'EMPTY_FOLDER_CHANGED_SINCE_PREVIEW'});
    }else{
      if(!st.isFile())throw Object.assign(new Error(`فایل دیگر فایل معمولی نیست: ${source}`),{code:'FILE_TYPE_CHANGED_SINCE_PREVIEW'});
      if(Number.isFinite(op.size)&&Number(st.size)!==Number(op.size))throw Object.assign(new Error(`اندازه فایل بعد از Preview تغییر کرده است: ${source}`),{code:'SOURCE_CHANGED_SINCE_PREVIEW'});
      if(Number.isFinite(op.mtimeMs)&&op.mtimeMs>0&&Math.abs(Number(st.mtimeMs)-Number(op.mtimeMs))>2)throw Object.assign(new Error(`فایل بعد از Preview ویرایش شده است: ${source}`),{code:'SOURCE_MTIME_CHANGED_SINCE_PREVIEW'});
    }
  }
}

async function executeMaintenance(root,cycleId,operations=[],options={}){
  const resolvedRoot=assertWriteRoot(root);await preflightMaintenance(resolvedRoot,operations);const transactionStore=options.transactionStore||null;const base=path.join(resolvedRoot,'.workspace-agent-quarantine',String(cycleId).replace(/[^a-zA-Z0-9_-]/g,'_'),'maintenance');const actual=operations.map(op=>({...op,destination:safeDestination(path.join(base,op.relativePath))}));const tx=transactionStore?.create({kind:'maintenance-quarantine',cycleId,root:resolvedRoot,operations:actual})||null;const completed=[];
  try{transactionStore?.mark(tx.id,{status:'executing'});for(let i=0;i<actual.length;i++){const op=actual[i],source=assertInsideRoot(op.source,resolvedRoot),destination=op.destination;await fsp.mkdir(path.dirname(destination),{recursive:true});const before=await fsp.stat(source);await fsp.rename(source,destination);const after=await fsp.stat(destination);completed.push({...op,before:{size:before.size,mtimeMs:before.mtimeMs,isDirectory:before.isDirectory()},after:{size:after.size,mtimeMs:after.mtimeMs,isDirectory:after.isDirectory()},undo:{kind:'restore',source:destination,destination:source}});transactionStore?.markOp(tx.id,i,{state:'committed'});}transactionStore?.mark(tx.id,{status:'completed'});
  }catch(error){const rollbackResults=await restoreMaintenance(completed);const rollbackOk=rollbackResults.every(x=>x?.ok!==false);transactionStore?.mark(tx.id,{status:rollbackOk?'rolled-back':'rollback-failed',error:error.code||error.message});throw Object.assign(new Error(`Cleanup در میانه اجرا متوقف شد؛ نتیجه Rollback باید بررسی شود: ${error.message}`),{code:rollbackOk?'MAINTENANCE_BATCH_FAILED_ROLLED_BACK':'MAINTENANCE_BATCH_FAILED_ROLLBACK_INCOMPLETE',details:{cause:error.code||error.message,rollbackResults}});}return {base,completed};
}
async function verifyMaintenance(completed=[]){
  const mismatches=[];
  for(const op of completed){
    let st=null;try{st=await fsp.stat(op.destination);}catch{}
    const sourceExists=fs.existsSync(op.source);const typeOk=op.kind==='quarantine-dir'?Boolean(st?.isDirectory()):Boolean(st?.isFile());const sizeOk=op.kind==='quarantine-dir'||Number(st?.size)===Number(op.size);
    if(!st||sourceExists||!typeOk||!sizeOk)mismatches.push({source:op.source,destination:op.destination,sourceExists,destinationExists:Boolean(st),typeOk,sizeOk});
  }
  return {ok:mismatches.length===0,mismatches};
}
async function restoreMaintenance(completed=[]){
  const results=[];
  for(const op of [...completed].reverse()){
    const u=op.undo;if(!u)continue;
    try{
      if(!fs.existsSync(u.source)){results.push({ok:false,...u,error:'QUARANTINE_SOURCE_MISSING'});continue;}
      if(fs.existsSync(u.destination)){results.push({ok:false,...u,error:'UNDO_DESTINATION_EXISTS'});continue;}await fsp.mkdir(path.dirname(u.destination),{recursive:true});await fsp.rename(u.source,u.destination);results.push({ok:true,...u,destination:u.destination,exact:true});
    }catch(error){results.push({ok:false,...u,error:error.code||error.message});}
  }
  return results;
}
module.exports={buildMaintenancePlan,preflightMaintenance,executeMaintenance,verifyMaintenance,restoreMaintenance,ageDays};
