const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const zlib=require('zlib');
const crypto=require('crypto');
const {atomicWriteJsonSync,atomicWriteBuffer}=require('./durable-state.cjs');

function now(){return new Date().toISOString();}
function safeId(value=''){return String(value).replace(/[^a-zA-Z0-9_-]/g,'_');}
function rootKey(root=''){return crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0,16);}
function snapshotId(){return `snap-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;}
function atomicJson(file,value){return atomicWriteJsonSync(file,value);}

class SnapshotStore{
  constructor(baseDir,{maxPerRoot=20}={}){
    this.dir=path.join(baseDir,'snapshots');this.indexFile=path.join(this.dir,'index.json');this.maxPerRoot=maxPerRoot;fs.mkdirSync(this.dir,{recursive:true});
  }
  readIndex(){try{const v=JSON.parse(fs.readFileSync(this.indexFile,'utf8'));return Array.isArray(v)?v:[];}catch{return [];}}
  writeIndex(rows){atomicJson(this.indexFile,rows);}
  file(id){return path.join(this.dir,`${safeId(id)}.json.gz`);}
  build(root,scan){
    const resolved=path.resolve(root);const entries=(scan?.files||[]).filter(f=>f?.path).map(f=>({
      rel:path.relative(resolved,path.resolve(f.path)),size:Number(f.size||0),mtimeMs:Number(f.mtimeMs||0),ext:String(f.ext||'')
    })).filter(e=>e.rel&&!e.rel.startsWith('..')&&!path.isAbsolute(e.rel)).sort((a,b)=>a.rel.localeCompare(b.rel));
    return {schemaVersion:'workspace-snapshot-v1',id:snapshotId(),root:resolved,rootKey:rootKey(resolved),createdAt:now(),files:entries.length,bytes:entries.reduce((n,e)=>n+e.size,0),entries};
  }
  async save(root,scan){
    const snapshot=this.build(root,scan);const raw=Buffer.from(JSON.stringify(snapshot),'utf8');const gz=await new Promise((resolve,reject)=>zlib.gzip(raw,{level:6},(e,b)=>e?reject(e):resolve(b)));
    const file=this.file(snapshot.id);await atomicWriteBuffer(file,gz);
    let rows=this.readIndex().filter(r=>r?.id!==snapshot.id);
    rows.unshift({id:snapshot.id,root:snapshot.root,rootKey:snapshot.rootKey,createdAt:snapshot.createdAt,files:snapshot.files,bytes:snapshot.bytes});
    const same=rows.filter(r=>r.rootKey===snapshot.rootKey).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const remove=new Set(same.slice(this.maxPerRoot).map(r=>r.id));
    for(const id of remove){try{await fsp.unlink(this.file(id));}catch{}}
    rows=rows.filter(r=>!remove.has(r.id)).slice(0,200);this.writeIndex(rows);
    return {...snapshot,entries:undefined};
  }
  async get(id){
    const data=await fsp.readFile(this.file(id));const raw=await new Promise((resolve,reject)=>zlib.gunzip(data,(e,b)=>e?reject(e):resolve(b)));return JSON.parse(raw.toString('utf8'));
  }
  list(root=''){
    const key=root?rootKey(root):'';return this.readIndex().filter(r=>!key||r.rootKey===key).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  latest(root){return this.list(root)[0]||null;}
  async remove(id){try{await fsp.unlink(this.file(id));}catch{}const rows=this.readIndex().filter(r=>r.id!==id);this.writeIndex(rows);return true;}
}

function compareSnapshot(snapshot,scan,{maxSamples=300}={}){
  const currentRoot=path.resolve(scan?.root||snapshot.root);if(path.resolve(snapshot.root)!==currentRoot)throw Object.assign(new Error('Snapshot متعلق به Workspace دیگری است.'),{code:'SNAPSHOT_ROOT_MISMATCH'});
  const oldMap=new Map((snapshot.entries||[]).map(e=>[String(e.rel),e]));
  const current=(scan?.files||[]).filter(f=>f?.path).map(f=>({rel:path.relative(currentRoot,path.resolve(f.path)),size:Number(f.size||0),mtimeMs:Number(f.mtimeMs||0),ext:String(f.ext||''),path:f.path})).filter(e=>e.rel&&!e.rel.startsWith('..')&&!path.isAbsolute(e.rel));
  const curMap=new Map(current.map(e=>[e.rel,e]));
  const added=[],removed=[],modified=[];let unchanged=0;
  for(const [rel,cur] of curMap){const old=oldMap.get(rel);if(!old){added.push(cur);continue;}if(Number(old.size)!==Number(cur.size)||Math.abs(Number(old.mtimeMs)-Number(cur.mtimeMs))>2)modified.push({rel,path:cur.path,before:{size:old.size,mtimeMs:old.mtimeMs},after:{size:cur.size,mtimeMs:cur.mtimeMs}});else unchanged+=1;}
  for(const [rel,old] of oldMap)if(!curMap.has(rel))removed.push({...old,rel,path:path.join(currentRoot,rel)});
  const sortRel=(a,b)=>String(a.rel).localeCompare(String(b.rel));added.sort(sortRel);removed.sort(sortRel);modified.sort(sortRel);
  return {snapshot:{id:snapshot.id,createdAt:snapshot.createdAt,root:snapshot.root,files:snapshot.files,bytes:snapshot.bytes},current:{files:current.length,bytes:current.reduce((n,e)=>n+e.size,0)},counts:{added:added.length,removed:removed.length,modified:modified.length,unchanged},added:added.slice(0,maxSamples),removed:removed.slice(0,maxSamples),modified:modified.slice(0,maxSamples),samplesTruncated:added.length>maxSamples||removed.length>maxSamples||modified.length>maxSamples};
}
module.exports={SnapshotStore,compareSnapshot,rootKey};
