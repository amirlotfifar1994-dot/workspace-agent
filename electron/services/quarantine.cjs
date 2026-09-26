const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { assertWriteRoot, assertInsideRoot } = require('./path-policy.cjs');
const { hashFile } = require('./duplicate-finder.cjs');

function safeName(dest) {
  if (!fs.existsSync(dest)) return dest;
  const dir=path.dirname(dest), ext=path.extname(dest), base=path.basename(dest,ext); let i=2;
  while(fs.existsSync(path.join(dir,`${base} (${i})${ext}`))) i += 1;
  return path.join(dir,`${base} (${i})${ext}`);
}
function copyLikePenalty(name='') {
  const n=name.toLowerCase(); let penalty=0;
  if (/\bcopy\b|duplicate|backup|نسخه|کپی/.test(n)) penalty += 30;
  if (/\(\d+\)(\.[^.]+)?$/.test(n)) penalty += 12;
  if (/- copy|_copy| copy\d*/.test(n)) penalty += 20;
  return penalty;
}
function keeperScore(file) {
  const lower=String(file.path||'').toLowerCase(); let score=100-copyLikePenalty(file.name);
  if (/\\downloads\\|\/downloads\//.test(lower)) score -= 12;
  if (/\\temp\\|\/temp\/|\\tmp\\|\/tmp\//.test(lower)) score -= 20;
  score -= Math.max(0, String(file.path||'').split(/[\\/]/).length-4) * 0.5;
  return score;
}
function chooseKeeper(files=[]) {
  return [...files].sort((a,b)=>keeperScore(b)-keeperScore(a) || Number(a.mtimeMs||0)-Number(b.mtimeMs||0) || String(a.path).length-String(b.path).length)[0] || null;
}
function buildDuplicateReviewPlan(root, groups=[], { selectedGroupIds=null } = {}) {
  const resolvedRoot=assertWriteRoot(root); const selected = selectedGroupIds ? new Set(selectedGroupIds) : null;
  const review=[]; const operations=[];
  for (const group of groups) {
    if (selected && !selected.has(group.id)) continue;
    const files=(group.files||[]).filter(f=>f?.path); if (files.length<2) continue;
    const keeper=chooseKeeper(files); if (!keeper) continue;
    const quarantined=files.filter(f=>f.path!==keeper.path);
    review.push({ groupId:group.id, hash:group.hash, size:group.size, keeper, quarantined, reclaimableBytes:group.size*quarantined.length });
    for (const file of quarantined) {
      const source=assertInsideRoot(file.path,resolvedRoot); const rel=path.relative(resolvedRoot,source);
      operations.push({ kind:'quarantine', groupId:group.id, source, relativePath:rel, size:file.size, hash:file.hash });
    }
  }
  return { root:resolvedRoot, review, operations, reclaimableBytes:review.reduce((n,r)=>n+r.reclaimableBytes,0) };
}
async function preflightQuarantine(root,operations=[],review=[]) {
  for(const row of review){
    const keeper=assertInsideRoot(row.keeper?.path,root);
    const st=await fsp.stat(keeper);
    if(Number(st.size)!==Number(row.size)) throw Object.assign(new Error(`Keeper از زمان Preview تغییر کرده است: ${keeper}`),{code:'KEEPER_CHANGED_SINCE_PREVIEW'});
    const liveHash=await hashFile(keeper); if(liveHash!==row.hash) throw Object.assign(new Error(`Keeper دیگر با گروه Duplicate یکسان نیست: ${keeper}`),{code:'KEEPER_HASH_CHANGED_SINCE_PREVIEW'});
  }
  for(const op of operations){
    const source=assertInsideRoot(op.source,root); const st=await fsp.stat(source);
    if(Number(st.size)!==Number(op.size)) throw Object.assign(new Error(`فایل از زمان Preview تغییر کرده است: ${source}`),{code:'SOURCE_CHANGED_SINCE_PREVIEW'});
    const liveHash=await hashFile(source); if(liveHash!==op.hash) throw Object.assign(new Error(`محتوای فایل از زمان Preview تغییر کرده است: ${source}`),{code:'SOURCE_HASH_CHANGED_SINCE_PREVIEW'});
  }
}
async function executeQuarantine(root, cycleId, operations=[], review=[], options={}) {
  const resolvedRoot=assertWriteRoot(root);await preflightQuarantine(resolvedRoot,operations,review);const transactionStore=options.transactionStore||null;const base=path.join(resolvedRoot,'.workspace-agent-quarantine',String(cycleId).replace(/[^a-zA-Z0-9_-]/g,'_'));const actual=operations.map(op=>({...op,destination:safeName(path.join(base,op.relativePath))}));const tx=transactionStore?.create({kind:'duplicate-quarantine',cycleId,root:resolvedRoot,operations:actual})||null;const completed=[];
  try{transactionStore?.mark(tx.id,{status:'executing'});for (let i=0;i<actual.length;i++) {const op=actual[i],source=assertInsideRoot(op.source,resolvedRoot),destination=op.destination;await fsp.mkdir(path.dirname(destination),{recursive:true});const before=await fsp.stat(source);await fsp.rename(source,destination);const after=await fsp.stat(destination);completed.push({...op,before:{size:before.size,mtimeMs:before.mtimeMs},after:{size:after.size,mtimeMs:after.mtimeMs},undo:{kind:'restore',source:destination,destination:source}});transactionStore?.markOp(tx.id,i,{state:'committed'});}transactionStore?.mark(tx.id,{status:'completed'});
  }catch(error){const rollbackResults=await restoreQuarantine(completed);const rollbackOk=rollbackResults.every(x=>x?.ok!==false);transactionStore?.mark(tx.id,{status:rollbackOk?'rolled-back':'rollback-failed',error:error.code||error.message});throw Object.assign(new Error(`قرنطینه در میانه اجرا متوقف شد؛ نتیجه Rollback باید بررسی شود: ${error.message}`),{code:rollbackOk?'QUARANTINE_BATCH_FAILED_ROLLED_BACK':'QUARANTINE_BATCH_FAILED_ROLLBACK_INCOMPLETE',details:{cause:error.code||error.message,rollbackResults}});}return { base, completed };
}
async function verifyQuarantine(completed=[]) {
  const mismatches=[];
  for (const op of completed) {
    let destinationStat=null; try { destinationStat=await fsp.stat(op.destination); } catch {}
    const sourceExists=fs.existsSync(op.source);
    if (!destinationStat || sourceExists || Number(destinationStat?.size)!==Number(op.size)) mismatches.push({source:op.source,destination:op.destination,sourceExists,destinationExists:Boolean(destinationStat),expectedSize:op.size,actualSize:destinationStat?.size??null});
  }
  return { ok:mismatches.length===0,mismatches };
}
async function restoreQuarantine(completed=[]) {
  const results=[];
  for (const op of [...completed].reverse()) {
    const u=op.undo; if(!u) continue;
    try {
      if (!fs.existsSync(u.source)) { results.push({ok:false,...u,error:'QUARANTINE_SOURCE_MISSING'}); continue; }
      if(fs.existsSync(u.destination)){results.push({ok:false,...u,error:'UNDO_DESTINATION_EXISTS'});continue;}await fsp.mkdir(path.dirname(u.destination),{recursive:true}); await fsp.rename(u.source,u.destination); results.push({ok:true,...u,destination:u.destination,exact:true});
    } catch(error) { results.push({ok:false,...u,error:error.code||error.message}); }
  }
  return results;
}
module.exports = { chooseKeeper, buildDuplicateReviewPlan, preflightQuarantine, executeQuarantine, verifyQuarantine, restoreQuarantine, keeperScore };
