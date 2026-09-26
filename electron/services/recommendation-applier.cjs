const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
const {assertWriteRoot,assertInsideRoot,comparable}=require('./path-policy.cjs');
function exists(p){try{return fs.existsSync(p);}catch{return false;}}
function uniqueTarget(candidate,reserved=new Set()){
  let dest=candidate;const parsed=path.parse(candidate);let i=2;
  while(exists(dest)||reserved.has(comparable(dest))){dest=path.join(parsed.dir,`${parsed.name} (${i++})${parsed.ext}`);}reserved.add(comparable(dest));return dest;
}

async function buildRecommendationPlan(root,items=[]){
  const rr=assertWriteRoot(root);const selected=items.filter(x=>x&&x.source&&['move','rename'].includes(x.actionType));if(!selected.length)throw Object.assign(new Error('هیچ پیشنهاد معتبری برای اجرا انتخاب نشده است.'),{code:'NO_RECOMMENDATIONS_SELECTED'});
  const grouped=new Map();for(const item of selected){const source=assertInsideRoot(item.source,rr);const k=comparable(source);const row=grouped.get(k)||{source,itemIds:[],suggestedFolder:null,suggestedName:null,confidence:1,evidence:[]};row.itemIds.push(item.id);row.confidence=Math.min(row.confidence,Number(item.confidence||0));row.evidence.push(...(item.evidence||[]));if(item.actionType==='move')row.suggestedFolder=assertInsideRoot(item.suggestedFolder,rr);if(item.actionType==='rename')row.suggestedName=String(item.suggestedName||'');grouped.set(k,row);}
  const reserved=new Set();const operations=[];
  for(const row of grouped.values()){
    const st=await fsp.stat(row.source);if(!st.isFile())throw Object.assign(new Error(`پیشنهاد فقط برای فایل معمولی قابل اجراست: ${row.source}`),{code:'RECOMMENDATION_SOURCE_NOT_FILE'});
    const folder=row.suggestedFolder||path.dirname(row.source);let name=row.suggestedName||path.basename(row.source);name=path.basename(name);if(!name||name==='.'||name==='..')throw Object.assign(new Error('نام پیشنهادی نامعتبر است.'),{code:'INVALID_RECOMMENDED_NAME'});
    let destination=assertInsideRoot(path.join(folder,name),rr);if(comparable(destination)===comparable(row.source))continue;destination=uniqueTarget(destination,reserved);
    operations.push({kind:row.suggestedFolder&&row.suggestedName?'move-rename':row.suggestedFolder?'move':'rename',source:row.source,destination,itemIds:row.itemIds,size:st.size,mtimeMs:st.mtimeMs,confidence:Number(row.confidence.toFixed(2)),evidence:[...new Set(row.evidence)].slice(0,8)});
  }
  if(!operations.length)throw Object.assign(new Error('پیشنهاد انتخابی تغییری در مسیر/نام ایجاد نمی‌کند.'),{code:'NO_EFFECTIVE_RECOMMENDATIONS'});
  return{root:rr,operations,bytes:operations.reduce((n,x)=>n+Number(x.size||0),0),items:selected.length};
}
async function preflightRecommendationPlan(root,operations=[]){
  const rr=assertWriteRoot(root);const destinations=new Set();
  for(const op of operations){const source=assertInsideRoot(op.source,rr);const destination=assertInsideRoot(op.destination,rr);if(destinations.has(comparable(destination)))throw Object.assign(new Error(`دو عملیات مقصد یکسان دارند: ${destination}`),{code:'RECOMMENDATION_TARGET_COLLISION'});destinations.add(comparable(destination));const st=await fsp.stat(source);if(!st.isFile()||Number(st.size)!==Number(op.size)||Math.abs(Number(st.mtimeMs)-Number(op.mtimeMs))>2)throw Object.assign(new Error(`فایل بعد از Preview تغییر کرده است: ${source}`),{code:'SOURCE_CHANGED_SINCE_PREVIEW'});if(exists(destination))throw Object.assign(new Error(`مقصد بعد از Preview اشغال شده است: ${destination}`),{code:'TARGET_OCCUPIED_SINCE_PREVIEW'});}
}
async function executeRecommendationPlan(root,cycleId,operations=[],options={}){
  const rr=assertWriteRoot(root);await preflightRecommendationPlan(rr,operations);const transactionStore=options.transactionStore||null;const stagingRoot=path.join(rr,'.workspace-agent-staging',String(cycleId).replace(/[^a-zA-Z0-9_-]/g,'_'));const prepared=operations.map(op=>({...op,stage:path.join(stagingRoot,`${crypto.randomBytes(8).toString('hex')}${path.extname(op.source)}`)}));const tx=transactionStore?.create({kind:'recommendation-apply',cycleId,root:rr,operations:prepared})||null;const staged=[];const completed=[];
  try{
    transactionStore?.mark(tx.id,{status:'executing'});await fsp.mkdir(stagingRoot,{recursive:true});
    for(let i=0;i<prepared.length;i++){const op=prepared[i];await fsp.rename(op.source,op.stage);staged.push(op);transactionStore?.markOp(tx.id,i,{state:'staged'});}
    for(let i=0;i<staged.length;i++){const op=staged[i];await fsp.mkdir(path.dirname(op.destination),{recursive:true});await fsp.rename(op.stage,op.destination);const st=await fsp.stat(op.destination);completed.push({...op,after:{size:st.size,mtimeMs:st.mtimeMs},undo:{source:op.destination,destination:op.source}});transactionStore?.markOp(tx.id,i,{state:'committed'});}
    try{await fsp.rm(stagingRoot,{recursive:true,force:true});}catch{}transactionStore?.mark(tx.id,{status:'completed'});return completed;
  }catch(error){
    const rollbackResults=[];
    for(const op of [...completed].reverse()){try{if(!exists(op.destination)){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:'ROLLBACK_SOURCE_MISSING'});continue;}if(exists(op.source)){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:'ROLLBACK_DESTINATION_EXISTS'});continue;}await fsp.mkdir(path.dirname(op.source),{recursive:true});await fsp.rename(op.destination,op.source);rollbackResults.push({ok:true,source:op.destination,destination:op.source});}catch(e){rollbackResults.push({ok:false,source:op.destination,destination:op.source,error:e.code||e.message});}}
    for(const op of [...staged].reverse()){try{if(!exists(op.stage))continue;if(exists(op.source)){rollbackResults.push({ok:false,source:op.stage,destination:op.source,error:'ROLLBACK_DESTINATION_EXISTS'});continue;}await fsp.mkdir(path.dirname(op.source),{recursive:true});await fsp.rename(op.stage,op.source);rollbackResults.push({ok:true,source:op.stage,destination:op.source});}catch(e){rollbackResults.push({ok:false,source:op.stage,destination:op.source,error:e.code||e.message});}}
    const rollbackOk=rollbackResults.every(x=>x.ok!==false);if(rollbackOk){try{await fsp.rm(stagingRoot,{recursive:true,force:true});}catch{}}transactionStore?.mark(tx.id,{status:rollbackOk?'rolled-back':'rollback-failed',error:error.code||error.message});
    throw Object.assign(new Error(`اجرای پیشنهادها متوقف شد؛ نتیجه Auto-Rollback باید بررسی شود: ${error.message}`),{code:rollbackOk?'RECOMMENDATION_BATCH_FAILED_ROLLED_BACK':'RECOMMENDATION_BATCH_FAILED_ROLLBACK_INCOMPLETE',details:{rollbackResults,stagingRoot:rollbackOk?null:stagingRoot}});
  }
}
async function verifyRecommendationPlan(completed=[]){const mismatches=[];for(const op of completed){let st=null;try{st=await fsp.stat(op.destination);}catch{}if(!st?.isFile()||exists(op.source)||Number(st.size)!==Number(op.size))mismatches.push({source:op.source,destination:op.destination,sourceExists:exists(op.source),destinationExists:Boolean(st),sizeOk:Number(st?.size)===Number(op.size)});}return{ok:mismatches.length===0,mismatches};}
async function undoRecommendationPlan(completed=[]){const results=[];for(const op of [...completed].reverse()){const u=op.undo;if(!u)continue;try{if(!exists(u.source)){results.push({ok:false,...u,error:'APPLIED_FILE_MISSING'});continue;}if(exists(u.destination)){results.push({ok:false,...u,error:'ORIGINAL_PATH_OCCUPIED'});continue;}await fsp.mkdir(path.dirname(u.destination),{recursive:true});await fsp.rename(u.source,u.destination);results.push({ok:true,...u});}catch(error){results.push({ok:false,...u,error:error.code||error.message});}}return results;}
module.exports={buildRecommendationPlan,preflightRecommendationPlan,executeRecommendationPlan,verifyRecommendationPlan,undoRecommendationPlan,uniqueTarget};
