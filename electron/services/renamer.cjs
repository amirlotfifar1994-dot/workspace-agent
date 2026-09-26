const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
const {assertWriteRoot,assertInsideRoot}=require('./path-policy.cjs');

const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
function validateFilename(name=''){
  const n=String(name||'');
  if(!n||n==='.'||n==='..')return{ok:false,code:'EMPTY_NAME'};
  if(/[<>:"/\\|?*\x00-\x1F]/.test(n))return{ok:false,code:'ILLEGAL_WINDOWS_CHARACTER'};
  if(/[. ]$/.test(n))return{ok:false,code:'TRAILING_DOT_OR_SPACE'};
  if(RESERVED.test(n))return{ok:false,code:'WINDOWS_RESERVED_NAME'};
  if(n.length>180)return{ok:false,code:'FILENAME_TOO_LONG'};
  return{ok:true};
}
function transformName(file,{find='',replace='',prefix='',suffix='',sequence=false,start=1,pad=3}={},index=0){
  const ext=path.extname(file.name);let base=path.basename(file.name,ext);
  if(find)base=base.split(String(find)).join(String(replace||''));
  base=`${prefix||''}${base}${suffix||''}`;
  if(sequence)base=`${base}-${String(Number(start||1)+index).padStart(Math.max(1,Math.min(8,Number(pad||3))),'0')}`;
  return `${base}${ext}`;
}
function planRename(root,files=[],options={}){
  const resolved=assertWriteRoot(root);const candidates=files.filter(f=>f?.path&&path.dirname(path.resolve(f.path))===resolved).sort((a,b)=>String(a.name).localeCompare(String(b.name)));const operations=[];const skipped=[];const destSeen=new Set();
  candidates.forEach((file,index)=>{
    const source=assertInsideRoot(file.path,resolved);const newName=transformName(file,options,index);const valid=validateFilename(newName);if(!valid.ok){skipped.push({path:source,reason:valid.code,newName});return;}
    const destination=assertInsideRoot(path.join(resolved,newName),resolved);if(path.resolve(destination)===path.resolve(source)){skipped.push({path:source,reason:'NO_CHANGE',newName});return;}
    const key=process.platform==='win32'?destination.toLowerCase():destination;if(destSeen.has(key)){skipped.push({path:source,reason:'PLAN_COLLISION',newName});return;}destSeen.add(key);
    if(fs.existsSync(destination)&&path.resolve(destination)!==path.resolve(source)){skipped.push({path:source,reason:'DESTINATION_EXISTS',newName});return;}
    operations.push({kind:'rename',workspaceRoot:resolved,source,destination,newName,size:Number(file.size||0),mtimeMs:Number(file.mtimeMs||0)});
  });
  return{root:resolved,operations,skipped};
}
async function preflightRenames(operations=[]){
  for(const op of operations){const source=assertInsideRoot(op.source,op.workspaceRoot);const dest=assertInsideRoot(op.destination,op.workspaceRoot);const st=await fsp.stat(source);if(!st.isFile())throw Object.assign(new Error(`منبع Rename فایل نیست: ${source}`),{code:'RENAME_SOURCE_NOT_FILE'});if(Number(st.size)!==Number(op.size)||Math.abs(Number(st.mtimeMs)-Number(op.mtimeMs))>2)throw Object.assign(new Error(`فایل از زمان Preview تغییر کرده است: ${source}`),{code:'SOURCE_CHANGED_SINCE_PREVIEW'});if(fs.existsSync(dest)&&path.resolve(dest)!==path.resolve(source))throw Object.assign(new Error(`مقصد Rename ایجاد شده است: ${dest}`),{code:'RENAME_DESTINATION_NOW_EXISTS'});}
}
function tempName(op){return path.join(path.dirname(op.source),`.wa-rename-${crypto.randomBytes(8).toString('hex')}.tmp`);}
async function executeRenames(operations=[],options={}){
  await preflightRenames(operations);const transactionStore=options.transactionStore||null;const cycleId=options.cycleId||null;const prepared=operations.map(op=>({...op,temp:tempName(op)}));const root=operations[0]?.workspaceRoot||process.cwd();const tx=transactionStore?.create({kind:'bulk-rename',cycleId,root,operations:prepared.map(op=>({...op,stage:op.temp}))})||null;const staged=[];const completed=[];
  try{
    transactionStore?.mark(tx.id,{status:'executing'});
    for(let i=0;i<prepared.length;i++){const op=prepared[i];await fsp.rename(op.source,op.temp);staged.push(op);transactionStore?.markOp(tx.id,i,{state:'staged'});}
    for(let i=0;i<staged.length;i++){const op=staged[i];await fsp.rename(op.temp,op.destination);completed.push({...op,undo:{kind:'rename',source:op.destination,destination:op.source}});transactionStore?.markOp(tx.id,i,{state:'committed'});}
    transactionStore?.mark(tx.id,{status:'completed'});
  }catch(error){
    const rollbackResults=[];
    for(const op of [...completed].reverse()){try{if(!fs.existsSync(op.destination)){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:'ROLLBACK_SOURCE_MISSING'});continue;}if(fs.existsSync(op.source)){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:'ROLLBACK_DESTINATION_EXISTS'});continue;}await fsp.rename(op.destination,op.source);rollbackResults.push({ok:true,source:op.destination,destination:op.source});}catch(e){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:e.code||e.message});}}
    for(const op of [...staged].reverse()){try{if(!fs.existsSync(op.temp))continue;if(fs.existsSync(op.source)){rollbackResults.push({ok:false,source:op.temp,destination:op.source,error:'ROLLBACK_DESTINATION_EXISTS'});continue;}await fsp.rename(op.temp,op.source);rollbackResults.push({ok:true,source:op.temp,destination:op.source});}catch(e){rollbackResults.push({ok:false,source:op.temp,destination:op.source,error:e.code||e.message});}}
    const rollbackOk=rollbackResults.every(x=>x.ok!==false);transactionStore?.mark(tx.id,{status:rollbackOk?'rolled-back':'rollback-failed',error:error.code||error.message});throw Object.assign(new Error(`Bulk Rename متوقف شد؛ نتیجه Rollback باید بررسی شود: ${error.message}`),{code:rollbackOk?'RENAME_BATCH_FAILED_ROLLED_BACK':'RENAME_BATCH_FAILED_ROLLBACK_INCOMPLETE',details:{rollbackResults}});
  }
  return completed;
}
async function verifyRenames(completed=[]){const mismatches=[];for(const op of completed){let st=null;try{st=await fsp.stat(op.destination);}catch{}if(!st||fs.existsSync(op.source)||Number(st.size)!==Number(op.size))mismatches.push({source:op.source,destination:op.destination});}return{ok:mismatches.length===0,mismatches};}
async function undoRenames(completed=[]){
  const results=[];
  for(const op of [...completed].reverse()){
    const source=op.destination,destination=op.source;
    try{
      if(!fs.existsSync(source)){results.push({ok:false,source,destination,error:'UNDO_SOURCE_MISSING'});continue;}
      if(fs.existsSync(destination)){results.push({ok:false,source,destination,error:'UNDO_DESTINATION_EXISTS'});continue;}
      await fsp.mkdir(path.dirname(destination),{recursive:true});await fsp.rename(source,destination);results.push({ok:true,source,destination,exact:true});
    }catch(error){results.push({ok:false,source,destination,error:error.code||error.message});}
  }
  return results;
}

module.exports={validateFilename,transformName,planRename,preflightRenames,executeRenames,verifyRenames,undoRenames};
