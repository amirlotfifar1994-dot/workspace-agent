const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const {computeReleaseIdentity}=require('./release-identity.cjs');
const root=path.resolve(__dirname,'..');
const SCHEMA='workspace-agent-rc1-execution-handoff-v3';
const POINTER_SCHEMAS={primary:'workspace-agent-rc1-primary-pointer-v1',peer:'workspace-agent-rc1-peer-pointer-v1'};
const POINTER_REFS={
  primary:['certificationReport','evidenceBundle','releaseManifest','sha256Sums','manualEvidenceTemplate','packageLock'],
  peer:['certificationReport','evidenceBundle','packageLock']
};
function arg(name){const p=`--${name}=`;const v=process.argv.find(x=>x.startsWith(p));return v?v.slice(p.length):''}
function has(name){return process.argv.includes(`--${name}`)}
function fail(code,message,extra={}){const e={ok:false,code,message,...extra};console.error(JSON.stringify(e,null,2));if(require.main===module)process.exit(1);return e}
function shaFile(file){const h=crypto.createHash('sha256');const fd=fs.openSync(file,'r');try{const buf=Buffer.allocUnsafe(1024*1024);let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}finally{fs.closeSync(fd)}return h.digest('hex')}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const o={};for(const k of Object.keys(value).sort())o[k]=canonical(value[k]);return o}return value}
function stable(v){return JSON.stringify(canonical(v))}
function insideOrSame(base,target){const rel=path.relative(path.resolve(base),path.resolve(target));return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))}
function inside(base,target){const rel=path.relative(path.resolve(base),path.resolve(target));return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
function lstatOrdinary(abs,rel,{directory=false}={}){
  const st=fs.lstatSync(abs);
  if(st.isSymbolicLink()){const e=new Error(`HANDOFF_REPARSE_OR_SYMLINK_FORBIDDEN:${rel}`);e.code='HANDOFF_REPARSE_OR_SYMLINK_FORBIDDEN';throw e;}
  if(directory&&!st.isDirectory()){const e=new Error(`HANDOFF_DIRECTORY_REQUIRED:${rel}`);e.code='HANDOFF_DIRECTORY_REQUIRED';throw e;}
  if(!directory&&!st.isFile()&&!st.isDirectory()){const e=new Error(`HANDOFF_SPECIAL_FILE_FORBIDDEN:${rel}`);e.code='HANDOFF_SPECIAL_FILE_FORBIDDEN';throw e;}
  return st;
}
function assertContainedReal(rootDir,abs,rel){const rootReal=fs.realpathSync.native?fs.realpathSync.native(rootDir):fs.realpathSync(rootDir);const real=fs.realpathSync.native?fs.realpathSync.native(abs):fs.realpathSync(abs);if(!insideOrSame(rootReal,real)){const e=new Error(`HANDOFF_REALPATH_ESCAPE:${rel}`);e.code='HANDOFF_REALPATH_ESCAPE';throw e;}return real}
function walk(dir,base='',rootDir=dir){
  if(base===''){lstatOrdinary(dir,'.',{directory:true});assertContainedReal(dir,dir,'.');}
  const rows=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const abs=path.join(dir,e.name);const rel=path.posix.join(base,e.name);const st=lstatOrdinary(abs,rel);assertContainedReal(rootDir,abs,rel);
    if(st.isDirectory())rows.push(...walk(abs,rel,rootDir));
    else if(st.isFile()&&e.name!=='handoff-manifest.json')rows.push({abs,rel});
  }
  return rows;
}
function sourceFingerprint(){return JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'}))}
function packageLockMeta(lockPath=''){const p=path.resolve(lockPath||path.join(root,'package-lock.json'));if(!fs.existsSync(p))return null;const st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isFile()){const e=new Error('HANDOFF_PACKAGE_LOCK_REGULAR_FILE_REQUIRED');e.code='HANDOFF_PACKAGE_LOCK_REGULAR_FILE_REQUIRED';throw e;}const s=fs.statSync(p);return{path:p,bytes:s.size,sha256:shaFile(p)}}
function fileRows(dir){return walk(path.resolve(dir)).map(({abs,rel})=>{const s=fs.statSync(abs);return{path:rel,bytes:s.size,sha256:shaFile(abs)}})}
function aggregateRows(rows){const h=crypto.createHash('sha256');for(const r of rows){h.update(r.path);h.update('\0');h.update(String(r.bytes));h.update('\0');h.update(r.sha256);h.update('\n')}return h.digest('hex')}
function validatePointerFile(dir,pointer){const base=path.resolve(dir),p=path.resolve(pointer);if(!inside(base,p)){const e=new Error('HANDOFF_POINTER_OUTSIDE_DIRECTORY');e.code='HANDOFF_POINTER_OUTSIDE_DIRECTORY';throw e}const st=lstatOrdinary(p,path.relative(base,p)||'.');if(!st.isFile()){const e=new Error('HANDOFF_POINTER_NOT_REGULAR_FILE');e.code='HANDOFF_POINTER_NOT_REGULAR_FILE';throw e}assertContainedReal(base,p,path.relative(base,p)||'.');return p}
function normalizePointerRef(value,label){const raw=String(value||'').replace(/\\/g,'/');if(!raw||raw.includes('\0')||raw.startsWith('/')||raw.startsWith('//')||/^[A-Za-z]:/.test(raw)){const e=new Error(`HANDOFF_POINTER_REF_INVALID:${label}`);e.code='HANDOFF_POINTER_REF_INVALID';throw e;}const parts=raw.split('/');if(parts.some(x=>!x||x==='.'||x==='..')){const e=new Error(`HANDOFF_POINTER_REF_INVALID:${label}`);e.code='HANDOFF_POINTER_REF_INVALID';throw e;}const norm=path.posix.normalize(raw);if(norm!==raw||norm.startsWith('../')||norm==='..'){const e=new Error(`HANDOFF_POINTER_REF_INVALID:${label}`);e.code='HANDOFF_POINTER_REF_INVALID';throw e;}return norm}
function validatePointerDocument({dir,pointerPath,role,executionId,rows}){
  const base=path.resolve(dir),p=validatePointerFile(base,pointerPath);let doc;try{doc=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''))}catch{const e=new Error('HANDOFF_POINTER_JSON_INVALID');e.code='HANDOFF_POINTER_JSON_INVALID';throw e}
  if(String(doc.schemaVersion||'')!==POINTER_SCHEMAS[role]){const e=new Error('HANDOFF_POINTER_SCHEMA_MISMATCH');e.code='HANDOFF_POINTER_SCHEMA_MISMATCH';throw e}
  if(String(doc.executionId||'')!==String(executionId||'')){const e=new Error('HANDOFF_POINTER_EXECUTION_ID_MISMATCH');e.code='HANDOFF_POINTER_EXECUTION_ID_MISMATCH';throw e}
  const amap=new Map(rows.map(x=>[x.path,x]));const refs={};
  for(const key of POINTER_REFS[role]){const rel=normalizePointerRef(doc[key],key);const abs=path.join(base,...rel.split('/'));const st=lstatOrdinary(abs,rel);if(!st.isFile()){const e=new Error(`HANDOFF_POINTER_REF_NOT_FILE:${key}`);e.code='HANDOFF_POINTER_REF_NOT_FILE';throw e}assertContainedReal(base,abs,rel);if(!amap.has(rel)){const e=new Error(`HANDOFF_POINTER_REF_NOT_DECLARED:${key}`);e.code='HANDOFF_POINTER_REF_NOT_DECLARED';throw e}refs[key]=rel;}
  if(role==='peer'){if(!['Windows10','Windows11'].includes(String(doc.windowsFamily||''))||!['Windows10','Windows11'].includes(String(doc.primaryWindowsFamily||''))||String(doc.windowsFamily)===String(doc.primaryWindowsFamily)){const e=new Error('HANDOFF_POINTER_WINDOWS_PAIR_INVALID');e.code='HANDOFF_POINTER_WINDOWS_PAIR_INVALID';throw e}}
  return{doc,refs};
}
function createHandoff({dir,out,role,executionId,pointer=''}){
  dir=path.resolve(dir);lstatOrdinary(dir,'.',{directory:true});assertContainedReal(dir,dir,'.');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(!['primary','peer'].includes(role))throw new Error('HANDOFF_ROLE_INVALID');
  if(!pointer)throw new Error('HANDOFF_POINTER_REQUIRED');
  const fp=sourceFingerprint(),lock=packageLockMeta();if(!lock)throw new Error('HANDOFF_PACKAGE_LOCK_REQUIRED');const identity=computeReleaseIdentity(root);
  const rows=fileRows(dir);const aggregateSha256=aggregateRows(rows);
  const p=validatePointerFile(dir,pointer);const rel=path.relative(dir,p).replace(/\\/g,'/');const row=rows.find(x=>x.path===rel);if(!row)throw new Error('HANDOFF_POINTER_NOT_DECLARED_FILE');const semantic=validatePointerDocument({dir,pointerPath:p,role,executionId,rows});const pointerMeta={path:rel,bytes:row.bytes,sha256:row.sha256,schemaVersion:semantic.doc.schemaVersion,refs:semantic.refs};
  const manifest={schemaVersion:SCHEMA,version:pkg.version,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision||null,featureFreeze:pkg.workspaceAgentRelease?.featureFreeze===true,createdAt:new Date().toISOString(),role,executionId:String(executionId||''),sourceFingerprint:{sha256:fp.sha256,files:fp.files},packageLock:{bytes:lock.bytes,sha256:lock.sha256},releaseIdentitySha256:identity.releaseIdentitySha256,pathPolicy:{symlinkReparse:'FORBIDDEN_FAIL_CLOSED',specialFiles:'FORBIDDEN_FAIL_CLOSED',realpathEscape:'FORBIDDEN_FAIL_CLOSED',pointerReferences:'DECLARED_CONTAINED_REGULAR_FILES_ONLY'},pointer:pointerMeta,files:rows.length,aggregateSha256,entries:rows};
  manifest.handoffId=crypto.createHash('sha256').update(stable(manifest)).digest('hex');
  const target=path.resolve(out||path.join(dir,'handoff-manifest.json'));if(!insideOrSame(dir,target))throw new Error('HANDOFF_MANIFEST_OUTSIDE_DIRECTORY');fs.writeFileSync(target,JSON.stringify(manifest,null,2));return{ok:true,manifest:target,handoffId:manifest.handoffId,role,executionId:manifest.executionId,files:rows.length,aggregateSha256,sourceFingerprint:fp.sha256,packageLockSha256:lock.sha256,releaseIdentitySha256:identity.releaseIdentitySha256};
}
function verifyHandoff({dir,manifestPath,requireCurrentSource=true,lockPath=''}){
  const target=path.resolve(manifestPath||path.join(dir||'.','handoff-manifest.json'));if(!fs.existsSync(target))return{ok:false,errors:['HANDOFF_MANIFEST_MISSING']};
  const base=path.resolve(dir||path.dirname(target));const errors=[];
  try{lstatOrdinary(base,'.',{directory:true});assertContainedReal(base,base,'.');const mst=lstatOrdinary(target,'handoff-manifest.json');if(!mst.isFile())errors.push('HANDOFF_MANIFEST_NOT_REGULAR_FILE');assertContainedReal(base,target,'handoff-manifest.json');if(!insideOrSame(base,target))errors.push('HANDOFF_MANIFEST_OUTSIDE_DIRECTORY')}catch(e){errors.push(String(e.code||e.message||'HANDOFF_PATH_POLICY_FAILED'))}
  let m;try{m=JSON.parse(fs.readFileSync(target,'utf8').replace(/^\uFEFF/,''))}catch{return{ok:false,errors:[...errors,'HANDOFF_MANIFEST_INVALID_JSON']}}
  if(m.schemaVersion!==SCHEMA)errors.push('HANDOFF_SCHEMA_MISMATCH');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(String(m.version)!==String(pkg.version))errors.push('HANDOFF_VERSION_MISMATCH');
  if(String(m.toolingRevision)!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('HANDOFF_TOOLING_MISMATCH');
  if(m.featureFreeze!==true)errors.push('HANDOFF_FEATURE_FREEZE_MISMATCH');
  if(!['primary','peer'].includes(String(m.role||'')))errors.push('HANDOFF_ROLE_INVALID');
  if(String(m.pathPolicy?.symlinkReparse||'')!=='FORBIDDEN_FAIL_CLOSED'||String(m.pathPolicy?.pointerReferences||'')!=='DECLARED_CONTAINED_REGULAR_FILES_ONLY')errors.push('HANDOFF_PATH_POLICY_MISSING');
  let actual=[];try{actual=fileRows(base)}catch(e){errors.push(String(e.code||e.message||'HANDOFF_TREE_SCAN_FAILED'))}
  const declared=Array.isArray(m.entries)?m.entries:[];const amap=new Map(actual.map(x=>[x.path,x]));const seen=new Set();
  if(Number(m.files)!==declared.length||declared.length!==actual.length)errors.push('HANDOFF_FILE_COUNT_MISMATCH');
  for(const r of declared){const rp=String(r.path||'');if(!rp||path.posix.isAbsolute(rp)||rp.split('/').includes('..')||path.posix.normalize(rp)!==rp){errors.push(`HANDOFF_DECLARED_PATH_INVALID:${rp}`);continue}if(seen.has(rp)){errors.push(`HANDOFF_DECLARED_DUPLICATE:${rp}`);continue}seen.add(rp);const a=amap.get(rp);if(!a)errors.push(`HANDOFF_FILE_MISSING:${rp}`);else if(Number(r.bytes)!==a.bytes||String(r.sha256).toLowerCase()!==a.sha256)errors.push(`HANDOFF_FILE_TAMPERED:${rp}`)}
  for(const a of actual){if(!seen.has(a.path))errors.push(`HANDOFF_UNDECLARED_FILE:${a.path}`)}
  if(aggregateRows(actual)!==String(m.aggregateSha256||''))errors.push('HANDOFF_AGGREGATE_MISMATCH');
  if(m.pointer){try{const pp=validatePointerFile(base,path.join(base,...normalizePointerRef(m.pointer.path,'pointer.path').split('/')));const rel=path.relative(base,pp).replace(/\\/g,'/');const a=amap.get(rel);if(!a)errors.push('HANDOFF_POINTER_NOT_DECLARED_FILE');else{if(Number(m.pointer.bytes)!==a.bytes)errors.push('HANDOFF_POINTER_BYTES_MISMATCH');if(String(m.pointer.sha256||'').toLowerCase()!==a.sha256)errors.push('HANDOFF_POINTER_SHA256_MISMATCH')}const semantic=validatePointerDocument({dir:base,pointerPath:pp,role:String(m.role||''),executionId:String(m.executionId||''),rows:actual});if(String(m.pointer.schemaVersion||'')!==String(semantic.doc.schemaVersion||''))errors.push('HANDOFF_POINTER_SCHEMA_BINDING_MISMATCH');const declaredRefs=m.pointer.refs||{};for(const [k,v] of Object.entries(semantic.refs))if(String(declaredRefs[k]||'')!==String(v))errors.push(`HANDOFF_POINTER_REF_BINDING_MISMATCH:${k}`)}catch(e){errors.push(String(e.code||e.message||'HANDOFF_POINTER_INVALID'))}}else errors.push('HANDOFF_POINTER_REQUIRED');
  const copy={...m};delete copy.handoffId;const id=crypto.createHash('sha256').update(stable(copy)).digest('hex');if(id!==String(m.handoffId||''))errors.push('HANDOFF_ID_MISMATCH');
  if(requireCurrentSource){let fp;try{fp=sourceFingerprint()}catch{fp=null}let lock=null;try{lock=packageLockMeta(lockPath)}catch(e){errors.push(String(e.code||'HANDOFF_CURRENT_LOCK_INVALID'))}let identity=null;try{identity=computeReleaseIdentity(root,{lockPath:lockPath||path.join(root,'package-lock.json')})}catch{}if(!fp||String(m.sourceFingerprint?.sha256||'')!==String(fp.sha256||''))errors.push('HANDOFF_CURRENT_SOURCE_FINGERPRINT_MISMATCH');if(!lock||String(m.packageLock?.sha256||'').toLowerCase()!==String(lock.sha256||'').toLowerCase())errors.push('HANDOFF_CURRENT_LOCK_MISMATCH');if(!identity||String(m.releaseIdentitySha256||'').toLowerCase()!==String(identity.releaseIdentitySha256||'').toLowerCase())errors.push('HANDOFF_CURRENT_RELEASE_IDENTITY_MISMATCH')}
  return{ok:errors.length===0,errors,manifest:target,role:m.role,executionId:m.executionId,handoffId:m.handoffId,files:actual.length,aggregateSha256:aggregateRows(actual)};
}
function main(){const mode=has('create')?'create':has('verify')?'verify':'';if(!mode)return fail('HANDOFF_MODE_REQUIRED','Use --create or --verify.');try{if(mode==='create'){const res=createHandoff({dir:path.resolve(arg('dir')||'.'),out:arg('out'),role:arg('role'),executionId:arg('execution-id'),pointer:arg('pointer')});console.log(JSON.stringify(res,null,2));return}const res=verifyHandoff({dir:arg('dir')?path.resolve(arg('dir')):'',manifestPath:arg('manifest'),requireCurrentSource:!has('no-source-check'),lockPath:arg('lockfile')});console.log(JSON.stringify(res,null,2));if(!res.ok)process.exit(1)}catch(e){fail(e.code||'HANDOFF_OPERATION_FAILED',String(e.message||e))}}
if(require.main===module)main();
module.exports={SCHEMA,POINTER_SCHEMAS,POINTER_REFS,shaFile,fileRows,aggregateRows,createHandoff,verifyHandoff,insideOrSame,validatePointerFile,validatePointerDocument,normalizePointerRef};
