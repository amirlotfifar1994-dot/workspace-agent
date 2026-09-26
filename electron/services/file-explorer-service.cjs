const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
const {assertWriteRoot,assertInsideRoot,normalize,comparable}=require('./path-policy.cjs');
const {canonicalNameKey}=require('./windows-path-utils.cjs');
const {validateFilename}=require('./renamer.cjs');
const {scanTree}=require('./file-indexer.cjs');
const {searchFiles}=require('./file-search.cjs');

const SCHEMA_VERSION='workspace-file-explorer-service-v1';
const WRITE_ACTIONS=new Set(['new-folder','copy','move','rename']);
function now(){return new Date().toISOString();}
function exists(p){try{return fs.existsSync(p);}catch{return false;}}
function err(code,message,details=null){return Object.assign(new Error(message),{code,details});}
function clone(v){return JSON.parse(JSON.stringify(v));}
function isAbsoluteLike(v=''){const s=String(v||'');return path.isAbsolute(s)||/^[a-zA-Z]:/.test(s)||/^\\\\/.test(s)||/^\\\?\\/.test(s);}
function cleanRelative(v=''){
  const raw=String(v||'').trim();
  if(!raw||raw==='.')return'';
  if(raw.includes('\0')||isAbsoluteLike(raw))throw err('EXPLORER_RELATIVE_PATH_REQUIRED','مسیر File Explorer باید نسبت به Workspace باشد.');
  const normalized=path.normalize(raw);
  if(normalized==='..'||normalized.startsWith(`..${path.sep}`))throw err('EXPLORER_PATH_ESCAPE_BLOCKED','مسیر نسبی از Workspace خارج می‌شود.');
  return normalized.replace(/^\.[\\/]/,'');
}
function rootForRead(root){const rr=normalize(String(root||''));if(!rr)throw err('ROOT_REQUIRED','Workspace مشخص نشده است.');return rr;}
function resolveRead(root,relativePath=''){const rr=rootForRead(root);const rel=cleanRelative(relativePath);return{root:rr,relativePath:rel,path:assertInsideRoot(path.resolve(rr,rel||'.'),rr)};}
function resolveWrite(root,relativePath=''){const rr=assertWriteRoot(root);const rel=cleanRelative(relativePath);return{root:rr,relativePath:rel,path:assertInsideRoot(path.resolve(rr,rel||'.'),rr)};}
async function lstatMaybe(p){try{return await fsp.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function assertNoLinkChain(root,target,{includeTarget=true}={}){
  const rr=path.resolve(root),tt=path.resolve(target);assertInsideRoot(tt,rr);
  const rel=path.relative(rr,tt);const parts=rel?rel.split(path.sep).filter(Boolean):[];let current=rr;
  const upto=includeTarget?parts.length:Math.max(0,parts.length-1);
  const rootSt=await lstatMaybe(rr);if(rootSt?.isSymbolicLink())throw err('EXPLORER_REPARSE_ROOT_BLOCKED','Workspace روی symlink/junction برای Write پشتیبانی نمی‌شود.',{path:rr});
  for(let i=0;i<upto;i++){
    current=path.join(current,parts[i]);const st=await lstatMaybe(current);if(!st)break;if(st.isSymbolicLink())throw err('EXPLORER_REPARSE_PATH_BLOCKED','Write از مسیر symlink/junction عبور نمی‌کند.',{path:current});
  }
  return true;
}
function statType(st){if(!st)return'missing';if(st.isFile())return'file';if(st.isDirectory())return'directory';if(st.isSymbolicLink())return'link';return'other';}
function statSnapshot(st){return st?{type:statType(st),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),atimeMs:Number(st.atimeMs||0),ctimeMs:Number(st.ctimeMs||0),birthtimeMs:Number(st.birthtimeMs||0),dev:Number(st.dev||0),ino:Number(st.ino||0),nlink:Number(st.nlink||1),mode:Number(st.mode||0)}:null;}
function sameSnapshot(st,snap,{allowMtimeDriftMs=2}={}){
  if(!st||!snap)return false;if(statType(st)!==snap.type)return false;
  if(snap.type==='file'&&Number(st.size)!==Number(snap.size))return false;
  if(Math.abs(Number(st.mtimeMs||0)-Number(snap.mtimeMs||0))>allowMtimeDriftMs)return false;
  if(Number(snap.dev||0)&&Number(st.dev||0)&&Number(snap.dev)!==Number(st.dev))return false;
  if(Number(snap.ino||0)&&Number(st.ino||0)&&Number(snap.ino)!==Number(st.ino))return false;
  return true;
}
function samePathIdentity(st,snap){if(!st||!snap)return false;if(statType(st)!==String(snap.type||''))return false;if(Number(snap.dev||0)&&Number(st.dev||0)&&Number(snap.dev)!==Number(st.dev))return false;if(Number(snap.ino||0)&&Number(st.ino||0)&&Number(snap.ino)!==Number(st.ino))return false;return true;}
function isCaseOnlyPathChange(source='',destination='',{platform=process.platform}={}){if(platform!=='win32')return false;const a=path.win32.normalize(String(source||'')),b=path.win32.normalize(String(destination||''));return Boolean(a&&b&&a!==b&&a.toLocaleLowerCase('en-US')===b.toLocaleLowerCase('en-US'));}

async function canonicalSiblingCollision(destination,{ignorePath=null,platform=process.platform}={}){
  if(platform!=='win32')return null;const parent=path.dirname(destination),targetName=path.basename(destination),targetKey=canonicalNameKey(targetName,{platform});let names;try{names=await fsp.readdir(parent);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  for(const name of names){if(canonicalNameKey(name,{platform})!==targetKey)continue;const candidate=path.join(parent,name);if(ignorePath&&comparable(candidate)===comparable(ignorePath))continue;if(comparable(candidate)===comparable(destination)&&name===targetName)continue;return{path:candidate,name,targetName};}
  return null;
}
async function assertCanonicalSiblingAvailable(destination,{ignorePath=null,platform=process.platform}={}){const hit=await canonicalSiblingCollision(destination,{ignorePath,platform});if(hit)throw err('EXPLORER_UNICODE_CANONICAL_COLLISION','نام مقصد با یک فایل/پوشه موجود از نظر Unicode/Case معادل است و برای جلوگیری از نام‌های مبهم مسدود شد.',hit);return true;}
function localStagePath(destination,cycleId=''){const parent=path.dirname(destination);return path.join(parent,`.workspace-agent-stage-${safeCycleId(cycleId||Date.now())}-${crypto.randomBytes(8).toString('hex')}.part`);}
function isUnicodeCanonicalOnlyNameChange(source,destination,{platform=process.platform}={}){
  if(platform!=='win32')return false;
  const a=path.win32.basename(String(source||'')),b=path.win32.basename(String(destination||''));
  if(!a||!b||a===b)return false;
  if(canonicalNameKey(a,{platform})!==canonicalNameKey(b,{platform}))return false;
  return !isCaseOnlyPathChange(source,destination,{platform});
}

async function assertDestinationParentStable(root,destination,parentSnapshot=null){const parent=path.dirname(destination);await assertNoLinkChain(root,parent,{includeTarget:true});const st=await lstatMaybe(parent);if(!st?.isDirectory())throw err('EXPLORER_DESTINATION_PARENT_CHANGED','پوشه والد مقصد دیگر پوشه معتبر نیست.',{parent});if(parentSnapshot&&!samePathIdentity(st,parentSnapshot))throw err('EXPLORER_DESTINATION_PARENT_CHANGED','هویت پوشه والد مقصد بعد از Preview تغییر کرده است.',{parent});return st;}
async function describePath(root,relativePath=''){
  const r=resolveRead(root,relativePath);const st=await lstatMaybe(r.path);if(!st)throw err('EXPLORER_ITEM_NOT_FOUND','فایل/پوشه پیدا نشد.',{relativePath:r.relativePath});
  return{schemaVersion:'workspace-file-explorer-properties-v1',root:r.root,relativePath:r.relativePath,path:r.path,name:path.basename(r.path),type:statType(st),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),ctimeMs:Number(st.ctimeMs||0),birthtimeMs:Number(st.birthtimeMs||0),mode:Number(st.mode||0),isSymbolicLink:st.isSymbolicLink(),readOnly:false};
}
async function explorerSearch(root,{query='',limit=100,index=null,maxFiles=100000}={}){
  const rr=rootForRead(root);const q=String(query||'').trim();if(!q)throw err('EXPLORER_SEARCH_QUERY_REQUIRED','عبارت جست‌وجو لازم است.');
  if(index){try{const status=await index.status(rr);if(status&&status.status==='completed'){const out=index.search({root:rr,query:q,limit:Math.max(1,Math.min(500,Number(limit)||100))});return{...out,source:'persistent-index'};}}catch{}
  }
  const scan=await scanTree(rr,{maxFiles:Math.max(1000,Math.min(250000,Number(maxFiles)||100000))});const out=searchFiles(scan.files,{query:q,maxResults:Math.max(1,Math.min(500,Number(limit)||100))});return{schemaVersion:'workspace-file-explorer-search-v1',root:rr,source:'bounded-scan',scan:{files:scan.files.length,dirs:scan.dirs,truncated:scan.truncated,errors:scan.errors.length},...out};
}
function canonicalPlan(plan){return JSON.stringify({action:plan.action,root:comparable(plan.root),source:plan.source?comparable(plan.source):'',destination:plan.destination?comparable(plan.destination):'',sourceSnapshot:plan.sourceSnapshot||null,destinationParentSnapshot:plan.destinationParentSnapshot||null,caseOnlyRename:Boolean(plan.caseOnlyRename)});}
function planHash(plan){return crypto.createHash('sha256').update(canonicalPlan(plan)).digest('hex');}
async function buildWritePlan({action,root,sourceRelative='',destinationRelative='',newName=''}={}){
  const a=String(action||'');if(!WRITE_ACTIONS.has(a))throw err('EXPLORER_WRITE_ACTION_BLOCKED','File Explorer Write action ثبت نشده است.');
  const base=resolveWrite(root,'');await assertNoLinkChain(base.root,base.root);
  let source=null,destination=null,sourceSnapshot=null,destinationParentSnapshot=null,caseOnlyRename=false;
  if(a==='new-folder'){
    const d=resolveWrite(base.root,destinationRelative);if(!d.relativePath)throw err('EXPLORER_FOLDER_NAME_REQUIRED','نام/مسیر پوشه جدید لازم است.');destination=d.path;await assertNoLinkChain(base.root,path.dirname(destination),{includeTarget:true});const parent=await lstatMaybe(path.dirname(destination));if(!parent?.isDirectory())throw err('EXPLORER_DESTINATION_PARENT_MISSING','پوشه والد مقصد وجود ندارد.');destinationParentSnapshot=statSnapshot(parent);await assertCanonicalSiblingAvailable(destination);if(exists(destination))throw err('EXPLORER_DESTINATION_EXISTS','مقصد از قبل وجود دارد.',{destination});
  }else{
    const s=resolveWrite(base.root,sourceRelative);if(!s.relativePath)throw err('EXPLORER_SOURCE_REQUIRED','منبع File Explorer لازم است.');source=s.path;await assertNoLinkChain(base.root,source,{includeTarget:true});const st=await lstatMaybe(source);if(!st)throw err('EXPLORER_SOURCE_MISSING','منبع پیدا نشد.',{source});if(st.isSymbolicLink())throw err('EXPLORER_SOURCE_LINK_BLOCKED','عملیات Write روی symlink/junction مجاز نیست.');if(!st.isFile()&&!st.isDirectory())throw err('EXPLORER_SOURCE_TYPE_BLOCKED','نوع منبع برای این Skill پشتیبانی نمی‌شود.');sourceSnapshot=statSnapshot(st);
    if(a==='rename'){
      const valid=validateFilename(newName);if(!valid.ok)throw err('EXPLORER_RENAME_INVALID',`نام جدید معتبر نیست: ${valid.code}`);destination=assertInsideRoot(path.join(path.dirname(source),String(newName)),base.root);caseOnlyRename=isCaseOnlyPathChange(source,destination);
    }else{
      const d=resolveWrite(base.root,destinationRelative);if(!d.relativePath)throw err('EXPLORER_DESTINATION_REQUIRED','مقصد File Explorer لازم است.');destination=d.path;
    }
    await assertNoLinkChain(base.root,path.dirname(destination),{includeTarget:true});const parent=await lstatMaybe(path.dirname(destination));if(!parent?.isDirectory())throw err('EXPLORER_DESTINATION_PARENT_MISSING','پوشه والد مقصد وجود ندارد.');destinationParentSnapshot=statSnapshot(parent);if(a==='rename'&&isUnicodeCanonicalOnlyNameChange(source,destination))throw err('EXPLORER_UNICODE_CANONICAL_RENAME_BLOCKED','تغییر نامی که فقط در نرمال‌سازی Unicode تفاوت دارد روی ویندوز برای جلوگیری از نام مبهم مسدود شد.',{source,destination});await assertCanonicalSiblingAvailable(destination,{ignorePath:caseOnlyRename?source:null});if(comparable(source)===comparable(destination)&&!caseOnlyRename)throw err('EXPLORER_NOOP','مبدأ و مقصد یکسان هستند.');if(exists(destination)&&!caseOnlyRename)throw err('EXPLORER_DESTINATION_EXISTS','مقصد از قبل وجود دارد.',{destination});
    if(a==='copy'&&sourceSnapshot.type!=='file')throw err('EXPLORER_COPY_DIRECTORY_DEFERRED','در v0.9.4 کپی recursive پوشه عمداً غیرفعال است؛ Copy فقط برای فایل معمولی فعال است.');
    if(a==='rename'&&path.dirname(source)!==path.dirname(destination))throw err('EXPLORER_RENAME_SAME_PARENT_REQUIRED','Rename باید داخل همان پوشه انجام شود.');
  }
  const plan={schemaVersion:'workspace-file-explorer-write-plan-v1',action:a,root:base.root,source,destination,sourceSnapshot,destinationParentSnapshot,caseOnlyRename,createdAt:now()};plan.planHash=planHash(plan);return plan;
}
async function preflightPlan(plan){
  if(!plan||plan.schemaVersion!=='workspace-file-explorer-write-plan-v1')throw err('EXPLORER_PLAN_INVALID','Explorer plan نامعتبر است.');if(planHash(plan)!==plan.planHash)throw err('EXPLORER_PLAN_TAMPERED','Explorer plan بعد از Preview تغییر کرده است.');const rr=assertWriteRoot(plan.root);if(comparable(rr)!==comparable(plan.root))throw err('EXPLORER_PLAN_ROOT_CHANGED','Workspace plan تغییر کرده است.');
  if(plan.source){assertInsideRoot(plan.source,rr);await assertNoLinkChain(rr,plan.source,{includeTarget:true});const st=await lstatMaybe(plan.source);if(!sameSnapshot(st,plan.sourceSnapshot))throw err('EXPLORER_SOURCE_CHANGED_SINCE_PREVIEW','منبع از زمان Preview تغییر کرده است.',{source:plan.source});}
  assertInsideRoot(plan.destination,rr);await assertDestinationParentStable(rr,plan.destination,plan.destinationParentSnapshot||null);await assertCanonicalSiblingAvailable(plan.destination,{ignorePath:plan.caseOnlyRename?plan.source:null});if(exists(plan.destination)&&!plan.caseOnlyRename)throw err('EXPLORER_DESTINATION_NOW_EXISTS','مقصد بعد از Preview ایجاد شده است.',{destination:plan.destination});return true;
}
async function sha256File(file){return await new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');const s=fs.createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}
function safeCycleId(v=''){return String(v||'cycle').replace(/[^a-zA-Z0-9_-]/g,'_');}
async function executeWritePlan(plan,{cycleId='',transactionStore=null,commitGuard=null}={}){
  await preflightPlan(plan);const rr=plan.root;const completed={action:plan.action,root:rr,source:plan.source,destination:plan.destination,sourceSnapshot:clone(plan.sourceSnapshot),planHash:plan.planHash,at:now(),undo:null,verificationHint:null};
  if(plan.action==='new-folder'){
    await assertDestinationParentStable(rr,plan.destination,plan.destinationParentSnapshot||null);if(commitGuard)await commitGuard({phase:'before-mkdir',plan});await fsp.mkdir(plan.destination,{recursive:false});const st=await fsp.lstat(plan.destination);if(!st.isDirectory())throw err('EXPLORER_MKDIR_VERIFY_FAILED','پوشه جدید بعد از ساخت تأیید نشد.');completed.after=statSnapshot(st);completed.undo={kind:'remove-empty-directory',path:plan.destination,after:completed.after};return completed;
  }
  if(plan.action==='copy'){
    const stage=assertInsideRoot(localStagePath(plan.destination,cycleId),rr);await assertDestinationParentStable(rr,plan.destination,plan.destinationParentSnapshot||null);const tx=transactionStore?.create({kind:'explorer-copy',cycleId,root:rr,operations:[{kind:'explorer-copy-file',source:plan.source,destination:plan.destination,stage,size:plan.sourceSnapshot.size}]})||null;
    let destinationCommitted=false,committedHash='';try{transactionStore?.mark(tx.id,{status:'executing'});await fsp.copyFile(plan.source,stage,fs.constants.COPYFILE_EXCL);transactionStore?.markOp(tx.id,0,{state:'staged'});const sourceAfter=await fsp.lstat(plan.source);if(!sameSnapshot(sourceAfter,plan.sourceSnapshot))throw err('EXPLORER_SOURCE_CHANGED_DURING_COPY','منبع حین Copy تغییر کرد؛ مقصد commit نشد.');const fh=await fsp.open(stage,'r+');try{await fh.sync();}finally{await fh.close();}const [sourceHash,stageHash]=await Promise.all([sha256File(plan.source),sha256File(stage)]);if(sourceHash!==stageHash)throw err('EXPLORER_COPY_STAGE_HASH_MISMATCH','Hash فایل Stage با منبع قبل از Commit برابر نیست.');if(commitGuard)await commitGuard({phase:'before-copy-commit',plan,sourceHash,stageHash});await assertDestinationParentStable(rr,plan.destination,plan.destinationParentSnapshot||null);await assertCanonicalSiblingAvailable(plan.destination);if(exists(plan.destination))throw err('EXPLORER_DESTINATION_RACE','مقصد هنگام Copy ایجاد شد؛ برای جلوگیری از overwrite عملیات متوقف شد.',{destination:plan.destination});await fsp.rename(stage,plan.destination);destinationCommitted=true;committedHash=stageHash;transactionStore?.markOp(tx.id,0,{state:'committed',recoveryHash:stageHash});const destinationHash=await sha256File(plan.destination);if(destinationHash!==stageHash)throw err('EXPLORER_COPY_HASH_MISMATCH','SHA-256 مقصد Copy با Hash Stage ثبت‌شده برابر نیست.');const st=await fsp.lstat(plan.destination);completed.after=statSnapshot(st);completed.sha256=destinationHash;completed.undo={kind:'remove-copied-file',path:plan.destination,sha256:destinationHash,size:Number(st.size||0)};transactionStore?.mark(tx.id,{status:'completed'});return completed;}catch(error){let cleanupOk=true;try{if(exists(stage))await fsp.rm(stage,{force:true});}catch{cleanupOk=false;}if(destinationCommitted&&exists(plan.destination)){try{const currentHash=await sha256File(plan.destination);if(committedHash&&currentHash===committedHash)await fsp.rm(plan.destination,{force:false});else{cleanupOk=false;error.details={...(error.details||{}),destinationPreserved:true,destinationChangedAfterCommit:true,currentHash,committedHash:committedHash||null};}}catch{cleanupOk=false;}}cleanupOk=cleanupOk&&!exists(stage)&&(!destinationCommitted||!exists(plan.destination))&&exists(plan.source);transactionStore?.mark(tx.id,{status:cleanupOk?'rolled-back':'rollback-failed',error:error.code||error.message});if(!cleanupOk)error.details={...(error.details||{}),rollbackIncomplete:true,stageExists:exists(stage),destinationExists:exists(plan.destination),sourceExists:exists(plan.source)};throw error;}
  }
  const opKind=plan.sourceSnapshot.type==='directory'?'explorer-move-dir':'explorer-move-file';const caseStage=plan.caseOnlyRename?assertInsideRoot(path.join(path.dirname(plan.source),`.workspace-agent-case-${crypto.randomBytes(8).toString('hex')}.tmp`),rr):null;const tx=transactionStore?.create({kind:plan.action==='rename'?'explorer-rename':'explorer-move',cycleId,root:rr,operations:[{kind:opKind,source:plan.source,destination:plan.destination,stage:caseStage,size:plan.sourceSnapshot.size}]})||null;
  let stagedCase=false;try{transactionStore?.mark(tx.id,{status:'executing'});const sourceNow=await lstatMaybe(plan.source);if(!sameSnapshot(sourceNow,plan.sourceSnapshot))throw err('EXPLORER_SOURCE_CHANGED_SINCE_PREFLIGHT','منبع بین Preflight و Commit تغییر کرده است.',{source:plan.source});if(commitGuard)await commitGuard({phase:'before-move-commit',plan});await assertDestinationParentStable(rr,plan.destination,plan.destinationParentSnapshot||null);await assertCanonicalSiblingAvailable(plan.destination,{ignorePath:plan.caseOnlyRename?plan.source:null});if(plan.caseOnlyRename){if(exists(caseStage))throw err('EXPLORER_CASE_RENAME_STAGE_COLLISION','مسیر موقت Case-only Rename اشغال است.',{stage:caseStage});await fsp.rename(plan.source,caseStage);stagedCase=true;transactionStore?.markOp(tx.id,0,{state:'staged'});if(commitGuard)await commitGuard({phase:'before-case-rename-finalize',plan});if(exists(plan.destination))throw err('EXPLORER_CASE_RENAME_DESTINATION_RACE','مقصد Case-only Rename بعد از Stage اشغال شد.',{destination:plan.destination});await fsp.rename(caseStage,plan.destination);stagedCase=false;}else{if(exists(plan.destination))throw err('EXPLORER_DESTINATION_RACE','مقصد در آخرین لحظه قبل از Move/Rename ایجاد شد؛ برای جلوگیری از overwrite عملیات متوقف شد.',{destination:plan.destination});await fsp.rename(plan.source,plan.destination);}transactionStore?.markOp(tx.id,0,{state:'committed'});const st=await fsp.lstat(plan.destination);completed.after=statSnapshot(st);completed.caseOnlyRename=Boolean(plan.caseOnlyRename);completed.externalMutation=!sameSnapshot(st,plan.sourceSnapshot);completed.undo=plan.caseOnlyRename?{kind:'case-rename-back',source:plan.destination,destination:plan.source,after:completed.after}:{kind:'move-back',source:plan.destination,destination:plan.source,after:completed.after};transactionStore?.mark(tx.id,{status:'completed'});return completed;}catch(error){let rolledBack=false;if(stagedCase&&caseStage&&exists(caseStage)&&!exists(plan.source)){try{await fsp.rename(caseStage,plan.source);stagedCase=false;}catch{}}rolledBack=exists(plan.source)&&!exists(caseStage||'')&&(plan.caseOnlyRename||!exists(plan.destination));transactionStore?.mark(tx.id,{status:rolledBack?'rolled-back':'rollback-failed',error:error.code||error.message});if(!rolledBack)error.details={...(error.details||{}),rollbackIncomplete:true,sourceExists:exists(plan.source),stageExists:caseStage?exists(caseStage):false,destinationExists:exists(plan.destination)};throw error;}
}
async function verifyCompleted(completed){
  const mismatches=[];if(completed.action==='new-folder'){const st=await lstatMaybe(completed.destination);if(!st?.isDirectory())mismatches.push({code:'FOLDER_MISSING',path:completed.destination});return{ok:!mismatches.length,mismatches,mode:'directory-exists'};}
  if(completed.action==='copy'){const st=await lstatMaybe(completed.destination);if(!st?.isFile())mismatches.push({code:'COPY_DESTINATION_MISSING'});else if(Number(st.size)!==Number(completed.sourceSnapshot?.size))mismatches.push({code:'COPY_SIZE_MISMATCH'});else{const h=await sha256File(completed.destination);if(completed.sha256&&h!==completed.sha256)mismatches.push({code:'COPY_HASH_MISMATCH'});}if(!exists(completed.source))mismatches.push({code:'COPY_SOURCE_MISSING'});return{ok:!mismatches.length,mismatches,mode:'source-retained+sha256'};}
  const dst=await lstatMaybe(completed.destination);if(!dst)mismatches.push({code:'DESTINATION_MISSING'});if(!completed.caseOnlyRename&&exists(completed.source))mismatches.push({code:'SOURCE_STILL_EXISTS'});if(dst&&completed.sourceSnapshot?.type!==statType(dst))mismatches.push({code:'TYPE_MISMATCH'});if(dst?.isFile()&&Number(dst.size)!==Number(completed.sourceSnapshot?.size))mismatches.push({code:'SIZE_MISMATCH'});if(dst&&completed.sourceSnapshot&&!sameSnapshot(dst,completed.sourceSnapshot))mismatches.push({code:'DESTINATION_MUTATED_AROUND_MOVE'});return{ok:!mismatches.length,mismatches,mode:completed.caseOnlyRename?'case-rename-identity':'move-identity'};
}
async function undoCompleted(completed){
  if(!completed?.undo)return[{ok:false,error:'EXPLORER_UNDO_MISSING'}];const u=completed.undo;
  try{
    if(u.kind==='remove-empty-directory'){
      const st=await lstatMaybe(u.path);if(!st)return[{ok:true,kind:u.kind,path:u.path,alreadyGone:true}];if(!st.isDirectory())return[{ok:false,kind:u.kind,path:u.path,error:'UNDO_TARGET_TYPE_CHANGED'}];const entries=await fsp.readdir(u.path);if(entries.length)return[{ok:false,kind:u.kind,path:u.path,error:'UNDO_FOLDER_NOT_EMPTY'}];await fsp.rmdir(u.path);return[{ok:true,kind:u.kind,path:u.path}];
    }
    if(u.kind==='remove-copied-file'){
      const st=await lstatMaybe(u.path);if(!st)return[{ok:true,kind:u.kind,path:u.path,alreadyGone:true}];if(!st.isFile()||Number(st.size)!==Number(u.size))return[{ok:false,kind:u.kind,path:u.path,error:'UNDO_COPY_TARGET_CHANGED'}];const h=await sha256File(u.path);if(h!==u.sha256)return[{ok:false,kind:u.kind,path:u.path,error:'UNDO_COPY_HASH_CHANGED'}];await fsp.rm(u.path,{force:false});return[{ok:true,kind:u.kind,path:u.path}];
    }
    if(u.kind==='case-rename-back'){
      const st=await lstatMaybe(u.source);if(!st)return[{ok:false,...u,error:'UNDO_SOURCE_MISSING'}];if(!sameSnapshot(st,u.after,{allowMtimeDriftMs:2}))return[{ok:false,...u,error:'UNDO_TARGET_CHANGED'}];const stage=path.join(path.dirname(u.source),`.workspace-agent-case-undo-${crypto.randomBytes(8).toString('hex')}.tmp`);try{await fsp.rename(u.source,stage);await fsp.rename(stage,u.destination);return[{ok:true,...u,caseOnly:true}];}catch(error){try{if(exists(stage)&&!exists(u.source))await fsp.rename(stage,u.source);}catch{}return[{ok:false,...u,error:error.code||'UNDO_CASE_RENAME_FAILED'}];}
    }
    if(u.kind==='move-back'){
      if(!exists(u.source))return[{ok:false,...u,error:'UNDO_SOURCE_MISSING'}];if(exists(u.destination))return[{ok:false,...u,error:'UNDO_DESTINATION_EXISTS'}];const st=await fsp.lstat(u.source);if(!sameSnapshot(st,u.after,{allowMtimeDriftMs:2}))return[{ok:false,...u,error:'UNDO_TARGET_CHANGED'}];await fsp.rename(u.source,u.destination);return[{ok:true,...u}];
    }
  }catch(error){return[{ok:false,kind:u.kind,error:error.code||error.message}];}
  return[{ok:false,error:'EXPLORER_UNDO_KIND_UNKNOWN'}];
}

module.exports={SCHEMA_VERSION,WRITE_ACTIONS,cleanRelative,resolveRead,resolveWrite,assertNoLinkChain,assertDestinationParentStable,canonicalSiblingCollision,assertCanonicalSiblingAvailable,localStagePath,describePath,explorerSearch,buildWritePlan,preflightPlan,executeWritePlan,verifyCompleted,undoCompleted,sha256File,statSnapshot,sameSnapshot,samePathIdentity,isCaseOnlyPathChange,isUnicodeCanonicalOnlyNameChange};
