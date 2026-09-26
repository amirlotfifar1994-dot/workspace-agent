const fs=require('fs');
const fsp=fs.promises;
const {toFsPath}=require('./windows-path-utils.cjs');
const DEFAULT_RESERVE_BYTES=256*1024*1024;
const STORAGE_CODES=new Set(['ENOSPC','EDQUOT']);
const PERMISSION_CODES=new Set(['EACCES','EROFS']);
const LOCK_CODES=new Set(['EBUSY','ETXTBSY']);
const DISCONNECT_CODES=new Set(['ENODEV','ENXIO','ESTALE']);
function err(code,message,details=null){return Object.assign(new Error(message),{code,details});}
async function statfsBytes(root,{statfs=fsp.statfs}={}){
  const s=await statfs(toFsPath(root));const bsize=Number(s.bsize||s.frsize||4096);const bavail=Number(s.bavail??s.bfree??0);const blocks=Number(s.blocks||0);
  return{root,freeBytes:Math.max(0,bavail*bsize),totalBytes:Math.max(0,blocks*bsize),blockSize:bsize};
}
async function assertRootAvailable(root){let st;try{st=await fsp.stat(toFsPath(root));}catch(error){throw err('EXPLORER_ROOT_UNAVAILABLE','Root عملیات File Explorer در دسترس نیست.',{root,cause:error.code||error.message});}if(!st.isDirectory())throw err('EXPLORER_ROOT_UNAVAILABLE','Root عملیات File Explorer پوشه نیست.',{root});return true;}
async function assertFreeSpace(root,requiredBytes,{reserveBytes=DEFAULT_RESERVE_BYTES,statfs=fsp.statfs}={}){
  const stats=await statfsBytes(root,{statfs});const required=Math.max(0,Number(requiredBytes)||0),reserve=Math.max(16*1024*1024,Number(reserveBytes)||DEFAULT_RESERVE_BYTES),need=required+reserve;
  if(stats.freeBytes<need)throw err('EXPLORER_BATCH_INSUFFICIENT_SPACE','فضای آزاد مقصد برای عملیات امن کافی نیست.',{root,freeBytes:stats.freeBytes,requiredBytes:required,reserveBytes:reserve,neededBytes:need});
  return{ok:true,...stats,requiredBytes:required,reserveBytes:reserve,neededBytes:need};
}
function classifyIoError(error){const code=String(error?.code||'');if(STORAGE_CODES.has(code))return{recoverable:true,category:'storage',code:'EXPLORER_STORAGE_BLOCKED',cause:code};if(LOCK_CODES.has(code))return{recoverable:true,category:'locked',code:'EXPLORER_FILE_LOCKED',cause:code};if(code==='EPERM')return{recoverable:true,category:'permission-or-lock',code:'EXPLORER_FILE_LOCK_OR_PERMISSION',cause:code};if(PERMISSION_CODES.has(code))return{recoverable:true,category:'permission',code:'EXPLORER_PERMISSION_BLOCKED',cause:code};if(DISCONNECT_CODES.has(code))return{recoverable:true,category:'disconnect',code:'EXPLORER_ROOT_UNAVAILABLE',cause:code};if(code==='ENOENT')return{recoverable:true,category:'disconnect-or-race',code:'EXPLORER_ROOT_OR_PATH_UNAVAILABLE',cause:code};return{recoverable:false,category:'fatal',code:code||'EXPLORER_IO_FAILED',cause:code};}
module.exports={DEFAULT_RESERVE_BYTES,statfsBytes,assertRootAvailable,assertFreeSpace,classifyIoError};
