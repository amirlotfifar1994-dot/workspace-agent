const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

function syncFileSync(file){
  let fd=null;
  try{fd=fs.openSync(file,'r+');fs.fsyncSync(fd);return true;}catch{return false;}finally{if(fd!==null)try{fs.closeSync(fd)}catch{}}
}
function syncDirBestEffort(dir){
  let fd=null;
  try{fd=fs.openSync(dir,'r');fs.fsyncSync(fd);return true;}catch{return false;}finally{if(fd!==null)try{fs.closeSync(fd)}catch{}}
}
function atomicWriteBufferSync(file,buffer,{mode=0o600}={}){
  const target=path.resolve(String(file));const dir=path.dirname(target);fs.mkdirSync(dir,{recursive:true});
  const tmp=path.join(dir,`.${path.basename(target)}.${process.pid}.${Date.now()}.${crypto.randomBytes(5).toString('hex')}.tmp`);
  let fd=null;let renamed=false;
  try{
    fd=fs.openSync(tmp,'wx',mode);fs.writeFileSync(fd,buffer);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
    fs.renameSync(tmp,target);renamed=true;
    syncFileSync(target);syncDirBestEffort(dir);
    return target;
  }catch(error){
    if(fd!==null)try{fs.closeSync(fd)}catch{}
    if(!renamed)try{fs.rmSync(tmp,{force:true})}catch{}
    throw error;
  }
}
function atomicWriteTextSync(file,text,options={}){return atomicWriteBufferSync(file,Buffer.from(String(text),'utf8'),options);}
function atomicWriteJsonSync(file,value,options={}){return atomicWriteTextSync(file,JSON.stringify(value,null,2),options);}

async function syncFile(file){let fh=null;try{fh=await fs.promises.open(file,'r+');await fh.sync();return true;}catch{return false;}finally{if(fh)try{await fh.close()}catch{}}}
async function syncDirBestEffortAsync(dir){let fh=null;try{fh=await fs.promises.open(dir,'r');await fh.sync();return true;}catch{return false;}finally{if(fh)try{await fh.close()}catch{}}}
async function atomicWriteBuffer(file,buffer,{mode=0o600}={}){
  const target=path.resolve(String(file));const dir=path.dirname(target);await fs.promises.mkdir(dir,{recursive:true});
  const tmp=path.join(dir,`.${path.basename(target)}.${process.pid}.${Date.now()}.${crypto.randomBytes(5).toString('hex')}.tmp`);let fh=null;let renamed=false;
  try{fh=await fs.promises.open(tmp,'wx',mode);await fh.writeFile(buffer);await fh.sync();await fh.close();fh=null;await fs.promises.rename(tmp,target);renamed=true;await syncFile(target);await syncDirBestEffortAsync(dir);return target;}
  catch(error){if(fh)try{await fh.close()}catch{}if(!renamed)try{await fs.promises.rm(tmp,{force:true})}catch{}throw error;}
}
async function atomicWriteText(file,text,options={}){return atomicWriteBuffer(file,Buffer.from(String(text),'utf8'),options);}
async function atomicWriteJson(file,value,options={}){return atomicWriteText(file,JSON.stringify(value,null,2),options);}

function appendLineDurableSync(file,line,{mode=0o600}={}){
  const target=path.resolve(String(file));const dir=path.dirname(target);fs.mkdirSync(dir,{recursive:true});let fd=null;
  try{fd=fs.openSync(target,'a',mode);fs.writeSync(fd,String(line));fs.fsyncSync(fd);}finally{if(fd!==null)try{fs.closeSync(fd)}catch{}}
  return target;
}
module.exports={atomicWriteBufferSync,atomicWriteTextSync,atomicWriteJsonSync,atomicWriteBuffer,atomicWriteText,atomicWriteJson,appendLineDurableSync,syncFileSync,syncDirBestEffort,syncFile,syncDirBestEffortAsync};
