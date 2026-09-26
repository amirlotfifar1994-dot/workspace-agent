const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { assertWriteRoot, assertInsideRoot } = require('./path-policy.cjs');
const CATEGORIES = {
  Images: ['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff','.heic','.svg'], Video: ['.mp4','.mov','.mkv','.avi','.webm','.m4v'], Audio: ['.mp3','.wav','.flac','.aac','.m4a','.ogg'], Documents: ['.pdf','.doc','.docx','.txt','.rtf','.odt','.md'], Spreadsheets: ['.xls','.xlsx','.csv','.ods'], Presentations: ['.ppt','.pptx','.odp'], Archives: ['.zip','.rar','.7z','.tar','.gz'], Design: ['.cdr','.ai','.eps','.psd','.indd','.dxf','.dwg'], Installers: ['.exe','.msi','.msix','.appx'], Code: ['.js','.jsx','.ts','.tsx','.py','.php','.html','.css','.json','.xml','.sql','.c','.cpp','.cs','.java']
};
function categoryFor(ext = '') { return Object.entries(CATEGORIES).find(([, exts]) => exts.includes(ext.toLowerCase()))?.[0] || 'Other'; }
function safeName(dest) { if (!fs.existsSync(dest)) return dest; const dir=path.dirname(dest),ext=path.extname(dest),base=path.basename(dest,ext);let i=2;while(fs.existsSync(path.join(dir,`${base} (${i})${ext}`)))i+=1;return path.join(dir,`${base} (${i})${ext}`); }
function planOrganization(root, files = [], { mode = 'type' } = {}) {
  const resolvedRoot = assertWriteRoot(root);
  return files.filter(f => f?.path && path.dirname(path.resolve(f.path)) === resolvedRoot).map(file => {
    const source=assertInsideRoot(file.path,resolvedRoot); const date = new Date(file.mtimeMs || Date.now());
    const folder = mode === 'date' ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` : categoryFor(file.ext);
    const destination = assertInsideRoot(path.join(resolvedRoot, folder, file.name),resolvedRoot);
    return { kind:'move',workspaceRoot:resolvedRoot,source,destination,category:folder,size:file.size,mtimeMs:file.mtimeMs };
  }).filter(op => path.resolve(op.source) !== path.resolve(op.destination));
}
async function preflightMoves(operations=[]){
  for(const op of operations){
    const source=assertInsideRoot(op.source,op.workspaceRoot);assertInsideRoot(op.destination,op.workspaceRoot);const st=await fsp.stat(source);
    if(Number.isFinite(op.size)&&Number(st.size)!==Number(op.size))throw Object.assign(new Error(`فایل از زمان Preview تغییر کرده است: ${source}`),{code:'SOURCE_CHANGED_SINCE_PREVIEW'});
    if(Number.isFinite(op.mtimeMs)&&Math.abs(Number(st.mtimeMs)-Number(op.mtimeMs))>2)throw Object.assign(new Error(`زمان ویرایش فایل از زمان Preview تغییر کرده است: ${source}`),{code:'SOURCE_MTIME_CHANGED_SINCE_PREVIEW'});
  }
}
async function executeMoves(operations = [], options={}) {
  await preflightMoves(operations);const transactionStore=options.transactionStore||null;const cycleId=options.cycleId||null;const completed=[];const actual=operations.map(op=>({...op,destination:safeName(assertInsideRoot(op.destination,op.workspaceRoot))}));const root=operations[0]?.workspaceRoot||process.cwd();const tx=transactionStore?.create({kind:'organize',cycleId,root,operations:actual})||null;
  try{
    transactionStore?.mark(tx.id,{status:'executing'});
    for (let i=0;i<actual.length;i++) {
      const op=actual[i],source=assertInsideRoot(op.source,op.workspaceRoot),destination=op.destination,before=await fsp.stat(source);await fsp.mkdir(path.dirname(destination),{recursive:true});await fsp.rename(source,destination);const after=await fsp.stat(destination);
      completed.push({...op,before:{size:before.size,mtimeMs:before.mtimeMs},after:{size:after.size,mtimeMs:after.mtimeMs},undo:{kind:'move',source:destination,destination:source}});transactionStore?.markOp(tx.id,i,{state:'committed'});
    }transactionStore?.mark(tx.id,{status:'completed'});
  }catch(error){
    const rollbackResults=await undoMoves(completed);const rollbackOk=rollbackResults.every(x=>x?.ok!==false);transactionStore?.mark(tx.id,{status:rollbackOk?'rolled-back':'rollback-failed',error:error.code||error.message});throw Object.assign(new Error(`مرتب‌سازی در میانه اجرا متوقف شد؛ نتیجه Rollback باید بررسی شود: ${error.message}`),{code:rollbackOk?'MOVE_BATCH_FAILED_ROLLED_BACK':'MOVE_BATCH_FAILED_ROLLBACK_INCOMPLETE',details:{cause:error.code||error.message,rollbackResults}});
  }return completed;
}
async function verifyMoves(completed=[]) {const mismatches=[];for(const op of completed){let st=null;try{st=await fsp.stat(op.destination)}catch{}const sourceExists=fs.existsSync(op.source);if(!st||sourceExists||Number(st?.size)!==Number(op.size))mismatches.push({source:op.source,destination:op.destination,sourceExists,destinationExists:Boolean(st),expectedSize:op.size,actualSize:st?.size??null});}return{ok:mismatches.length===0,mismatches};}
async function undoMoves(operations = []) {const results=[];for(const op of [...operations].reverse()){const u=op.undo;if(!u)continue;try{if(!fs.existsSync(u.source)){results.push({ok:false,...u,error:'UNDO_SOURCE_MISSING'});continue;}if(fs.existsSync(u.destination)){results.push({ok:false,...u,error:'UNDO_DESTINATION_EXISTS'});continue;}await fsp.mkdir(path.dirname(u.destination),{recursive:true});await fsp.rename(u.source,u.destination);results.push({ok:true,...u,destination:u.destination,exact:true});}catch(error){results.push({ok:false,...u,error:error.code||error.message});}}return results;}
module.exports = { CATEGORIES, categoryFor, planOrganization, preflightMoves, executeMoves, verifyMoves, undoMoves, safeName };
