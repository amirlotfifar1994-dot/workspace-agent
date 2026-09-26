const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const defaultRoot=path.resolve(__dirname,'..');
const excludedDirs=new Set(['node_modules','release','dist','certification','.git','.workspace-agent-batch','coverage','rc1-execution','final-certification']);
const excludedFiles=new Set(['package-lock.json']);
const excludedFilePatterns=[/^RC1-.*-(?:PRIMARY-HANDOFF|PEER-RETURN|FINAL-CERTIFICATION)\.zip(?:\.sha256)?$/i,/^MANUAL_EVIDENCE(?:\..+)?\.json$/i,/^stable-promotion-decision\.json$/i,/^rc1-final-(?:envelope|verdict)\.json$/i];
function excludedDir(name){return excludedDirs.has(name)||name.startsWith('certification-');}
function excludedFile(name){return excludedFiles.has(name)||excludedFilePatterns.some(re=>re.test(name));}
function walk(root,dir=root,base=''){
  const rows=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(e.isDirectory()&&excludedDir(e.name))continue;
    const abs=path.join(dir,e.name),rel=path.posix.join(base,e.name),st=fs.lstatSync(abs);
    if(st.isSymbolicLink()){const err=new Error(`SOURCE_REPARSE_OR_SYMLINK_FORBIDDEN:${rel}`);err.code='SOURCE_REPARSE_OR_SYMLINK_FORBIDDEN';throw err;}
    if(st.isDirectory())rows.push(...walk(root,abs,rel));
    else if(st.isFile()&&!excludedFile(e.name))rows.push({abs,rel});
    else if(!st.isFile()&&!st.isDirectory()){const err=new Error(`SOURCE_SPECIAL_FILE_FORBIDDEN:${rel}`);err.code='SOURCE_SPECIAL_FILE_FORBIDDEN';throw err;}
  }
  return rows;
}
function computeFingerprint(root=defaultRoot){
  root=path.resolve(root);
  const files=walk(root),manifest=[],aggregate=crypto.createHash('sha256');
  for(const f of files){
    const data=fs.readFileSync(f.abs),sha=crypto.createHash('sha256').update(data).digest('hex');
    manifest.push({path:f.rel,bytes:data.length,sha256:sha});
    aggregate.update(f.rel);aggregate.update('\0');aggregate.update(sha);aggregate.update('\n');
  }
  const pkgPath=path.join(root,'package.json');
  const version=fs.existsSync(pkgPath)?JSON.parse(fs.readFileSync(pkgPath,'utf8')).version:null;
  return{schemaVersion:'workspace-agent-source-fingerprint-v2',scope:'frozen-source-excluding-release-lockfile',version,files:manifest.length,sha256:aggregate.digest('hex'),excludedFiles:['package-lock.json'],manifest};
}
function main(){
  const rootArg=process.argv.find(x=>x.startsWith('--root='));const root=rootArg?path.resolve(rootArg.slice(7)):defaultRoot;
  const report=computeFingerprint(root);const outArg=process.argv.find(x=>x.startsWith('--out='));
  if(outArg){const out=path.resolve(defaultRoot,outArg.slice(6));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));}
  console.log(JSON.stringify({schemaVersion:report.schemaVersion,scope:report.scope,version:report.version,files:report.files,sha256:report.sha256,excludedFiles:report.excludedFiles}));
}
if(require.main===module)main();
module.exports={walk,computeFingerprint,excludedFile,excludedDir};
