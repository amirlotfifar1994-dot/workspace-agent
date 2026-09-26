const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const {evaluateExecutionRoot}=require('../scripts/path-trust-boundary.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-exec-root-guard-'));
try{
  const source=path.join(tmp,'source'),outside=path.join(tmp,'outside');fs.mkdirSync(source);fs.mkdirSync(outside);const allowed=path.join(source,'rc1-execution');
  let r=evaluateExecutionRoot({sourceRoot:source,target:allowed,allowInsideExact:allowed});assert(r.ok,JSON.stringify(r.errors));
  r=evaluateExecutionRoot({sourceRoot:source,target:path.join(source,'other-execution'),allowInsideExact:allowed});assert(!r.ok);assert(r.errors.includes('EXECUTION_ROOT_SOURCE_OVERLAP_FORBIDDEN'));
  r=evaluateExecutionRoot({sourceRoot:source,target:tmp,allowInsideExact:allowed});assert(!r.ok);assert(r.errors.includes('EXECUTION_ROOT_SOURCE_OVERLAP_FORBIDDEN'));
  r=evaluateExecutionRoot({sourceRoot:source,target:path.join(outside,'execution'),allowInsideExact:allowed});assert(r.ok,JSON.stringify(r.errors));
  let linkMade=false;const link=path.join(tmp,'outside-alias');try{fs.symlinkSync(source,link,'dir');linkMade=true}catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e}
  if(linkMade){r=evaluateExecutionRoot({sourceRoot:source,target:path.join(link,'rc1-execution'),allowInsideExact:allowed});assert(!r.ok);assert(r.errors.includes('EXECUTION_ROOT_SOURCE_OVERLAP_FORBIDDEN'))}
  const exec=fs.readFileSync(path.join(__dirname,'..','scripts/windows-rc1-execution.ps1'),'utf8');assert(exec.includes('path-trust-boundary.cjs'));assert(exec.includes('--allow-inside-exact='));
  console.log('rc1-execution-root-realpath-guard PASS',{parentOverlapBlocked:true,realpathAliasBlocked:linkMade,defaultAllowed:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
