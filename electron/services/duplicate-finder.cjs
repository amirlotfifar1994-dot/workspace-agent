const fs = require('fs');
const fsp=fs.promises;
const crypto = require('crypto');
const {toFsPath}=require('./windows-path-utils.cjs');

function hashFile(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algorithm);
    const stream = fs.createReadStream(toFsPath(filePath));
    stream.on('data', d => h.update(d)); stream.on('error', reject); stream.on('end', () => resolve(h.digest('hex')));
  });
}
async function hashFileStable(file){
  const target=toFsPath(file.path);const before=await fsp.lstat(target);
  if(before.isSymbolicLink())throw Object.assign(new Error('Hash روی symbolic link/reparse target مجاز نیست.'),{code:'HASH_LINK_BLOCKED'});
  if(!before.isFile())throw Object.assign(new Error('Hash فقط روی فایل معمولی اجرا می‌شود.'),{code:'HASH_NOT_REGULAR_FILE'});
  const hash=await hashFile(file.path);const after=await fsp.lstat(target);
  const identityChanged=(Number.isFinite(before.ino)&&Number.isFinite(after.ino)&&Number(before.ino)!==Number(after.ino))||(Number.isFinite(before.dev)&&Number.isFinite(after.dev)&&Number(before.dev)!==Number(after.dev));
  if(after.isSymbolicLink()||!after.isFile()||identityChanged||Number(before.size)!==Number(after.size)||Math.abs(Number(before.mtimeMs)-Number(after.mtimeMs))>2)throw Object.assign(new Error('فایل هنگام Hash تغییر کرد یا Target آن عوض شد.'),{code:'FILE_CHANGED_DURING_HASH'});
  return {...file,size:Number(after.size),mtimeMs:Number(after.mtimeMs),hash};
}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let index=0;async function runner(){while(true){const i=index++;if(i>=items.length)return;out[i]=await worker(items[i],i);}}await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length||1))},runner));return out;
}

async function findExactDuplicates(files = [], { onProgress, concurrency=3, maxGroups=5000 } = {}) {
  const bySize = new Map();
  for (const file of files) {
    if (!file?.path || !Number.isFinite(file.size) || file.size <= 0) continue;
    const arr = bySize.get(file.size) || []; arr.push(file); bySize.set(file.size, arr);
  }
  const candidates = [...bySize.values()].filter(g => g.length > 1).flat();
  const errors=[];let hashed=0;
  const hashedRows=await mapLimit(candidates,concurrency,async file=>{
    try{return await hashFileStable(file);}catch(error){errors.push({path:file.path,error:error.code||error.message});return null;}finally{hashed+=1;if(hashed%10===0||hashed===candidates.length)onProgress?.({hashed,total:candidates.length});}
  });
  const byHash = new Map();
  for(const file of hashedRows.filter(Boolean)){const key=`${file.size}:${file.hash}`;const arr=byHash.get(key)||[];arr.push(file);byHash.set(key,arr);}
  const allGroups=[...byHash.values()].filter(g=>g.length>1).map((g,i)=>({id:`dup-${i+1}`,size:g[0].size,hash:g[0].hash,reclaimableBytes:g[0].size*(g.length-1),files:g.sort((a,b)=>a.mtimeMs-b.mtimeMs)})).sort((a,b)=>b.reclaimableBytes-a.reclaimableBytes);
  const groups=allGroups.slice(0,maxGroups);
  return { groups, groupsTotal:allGroups.length, groupsTruncated:allGroups.length>groups.length, duplicateFiles: allGroups.reduce((n,g) => n + g.files.length - 1, 0), reclaimableBytes: allGroups.reduce((n,g) => n + g.reclaimableBytes, 0), hashedFiles:hashedRows.filter(Boolean).length, candidateFiles:candidates.length, errors:errors.slice(0,200), errorsTotal:errors.length };
}
module.exports = { findExactDuplicates, hashFile, hashFileStable, mapLimit };
