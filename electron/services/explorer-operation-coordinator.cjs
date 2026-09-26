const crypto=require('crypto');
const {normalize,comparable,sameOrInside}=require('./path-policy.cjs');

function now(){return new Date().toISOString();}
function err(code,message,details=null){return Object.assign(new Error(message),{code,details});}
function leaseId(){return`lease-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;}
function normMode(mode='read'){return String(mode)==='write'?'write':'read';}
function normVolumeMode(mode='shared'){return String(mode)==='exclusive'?'exclusive':'shared';}
function overlaps(a,b){try{return sameOrInside(a,b)||sameOrInside(b,a);}catch{return comparable(a)===comparable(b);}}
function compactPathScopes(scopes=[]){
  const rows=[];
  for(const raw of Array.isArray(scopes)?scopes:[]){if(!raw?.path)continue;const p=normalize(raw.path),mode=normMode(raw.mode);const same=rows.find(x=>comparable(x.path)===comparable(p));if(same){if(mode==='write')same.mode='write';continue;}rows.push({path:p,mode});}
  return rows;
}
function compactVolumeScopes(scopes=[]){
  const rows=[];
  for(const raw of Array.isArray(scopes)?scopes:[]){const id=String(raw?.identity||raw?.id||'').trim();if(!id)continue;const mode=normVolumeMode(raw.mode);const same=rows.find(x=>x.identity===id);if(same){if(mode==='exclusive')same.mode='exclusive';continue;}rows.push({identity:id,mode});}
  return rows;
}
class ExplorerOperationCoordinator{
  constructor({journal=null,maxLeases=512}={}){this.journal=journal;this.maxLeases=Math.max(8,Number(maxLeases)||512);this.leases=new Map();this.epoch=1;this.barrier=null;}
  _conflict(request,existing){
    for(const a of request.paths)for(const b of existing.paths){if(overlaps(a.path,b.path)&&(a.mode==='write'||b.mode==='write'))return{kind:'path',requested:a,held:b};}
    for(const a of request.volumes)for(const b of existing.volumes){if(a.identity===b.identity&&(a.mode==='exclusive'||b.mode==='exclusive'))return{kind:'volume',requested:a,held:b};}
    return null;
  }
  acquire(owner,{paths=[],volumes=[],metadata=null}={}){
    const who=String(owner||'').trim();if(!who)throw err('EXPLORER_LEASE_OWNER_REQUIRED','Lease owner لازم است.');if(this.barrier){const details={reason:this.barrier.reason,at:this.barrier.at,epoch:this.epoch};this.journal?.append('EXPLORER_OPERATION_SYSTEM_BARRIER_BLOCKED',{payload:{owner:who,reason:this.barrier.reason,epoch:this.epoch}});return{ok:false,code:'EXPLORER_SYSTEM_TRANSITION',message:'عملیات Write در زمان Suspend/Resume یا بازاعتبارسنجی سیستم موقتاً متوقف است.',details};}if(this.leases.size>=this.maxLeases)throw err('EXPLORER_LEASE_CAPACITY','ظرفیت Leaseهای هم‌زمان پر شده است.',{maxLeases:this.maxLeases});
    const request={paths:compactPathScopes(paths),volumes:compactVolumeScopes(volumes)};if(!request.paths.length&&!request.volumes.length)throw err('EXPLORER_LEASE_SCOPE_REQUIRED','حداقل یک Path یا Volume scope برای Lease لازم است.');
    for(const held of this.leases.values()){const conflict=this._conflict(request,held);if(conflict){const details={holder:held.owner,holderLeaseId:held.id,kind:conflict.kind,requested:conflict.requested,held:conflict.held};this.journal?.append('EXPLORER_OPERATION_LEASE_BLOCKED',{payload:{owner:who,holder:held.owner,kind:conflict.kind}});return{ok:false,code:'EXPLORER_OPERATION_BUSY',message:'یک عملیات File Explorer دیگر روی مسیر/Volume هم‌پوشان فعال است.',details};}}
    const row={id:leaseId(),owner:who,paths:request.paths,volumes:request.volumes,metadata:metadata||null,epoch:this.epoch,acquiredAt:now()};this.leases.set(row.id,row);this.journal?.append('EXPLORER_OPERATION_LEASE_ACQUIRED',{payload:{owner:who,leaseId:row.id,pathScopes:row.paths.length,volumeScopes:row.volumes.length}});return{ok:true,lease:row};
  }
  acquireOrThrow(owner,scopes={}){const r=this.acquire(owner,scopes);if(!r.ok)throw err(r.code||'EXPLORER_OPERATION_BUSY',r.message||'Explorer operation busy',r.details||null);return r.lease;}
  release(token){const id=typeof token==='string'?token:token?.id;if(!id)return false;const row=this.leases.get(id);if(!row)return false;this.leases.delete(id);this.journal?.append('EXPLORER_OPERATION_LEASE_RELEASED',{payload:{owner:row.owner,leaseId:id}});return true;}
  releaseOwner(owner){const who=String(owner||'');let count=0;for(const [id,row] of [...this.leases])if(row.owner===who){this.leases.delete(id);count++;}if(count)this.journal?.append('EXPLORER_OPERATION_OWNER_RELEASED',{payload:{owner:who,count}});return count;}
  pause(reason='SYSTEM_TRANSITION'){this.epoch+=1;this.barrier={reason:String(reason||'SYSTEM_TRANSITION'),at:now(),epoch:this.epoch};this.journal?.append('EXPLORER_OPERATION_SYSTEM_BARRIER_SET',{payload:{reason:this.barrier.reason,epoch:this.epoch,activeLeases:this.leases.size}});return{...this.barrier};}
  resume(reason='SYSTEM_STABLE'){const prior=this.barrier;this.barrier=null;this.journal?.append('EXPLORER_OPERATION_SYSTEM_BARRIER_CLEARED',{payload:{reason:String(reason||'SYSTEM_STABLE'),epoch:this.epoch,priorReason:prior?.reason||null,activeLeases:this.leases.size}});return{ok:true,epoch:this.epoch,prior};}
  assertLeaseCurrent(token){const id=typeof token==='string'?token:token?.id;const row=id?this.leases.get(id):null;if(!row)throw err('EXPLORER_LEASE_NOT_ACTIVE','Lease عملیات دیگر فعال نیست.',{leaseId:id||null});if(this.barrier)throw err('EXPLORER_SYSTEM_TRANSITION','عملیات Write در زمان Suspend/Resume موقتاً متوقف است.',{reason:this.barrier.reason,epoch:this.epoch,leaseEpoch:row.epoch});if(Number(row.epoch)!==Number(this.epoch))throw err('EXPLORER_OPERATION_FENCE_STALE','Lease قبل از یک تغییر وضعیت سیستم گرفته شده است و قبل از Commit باید دوباره اجرا/اعتبارسنجی شود.',{epoch:this.epoch,leaseEpoch:row.epoch,leaseId:row.id});return{ok:true,lease:row};}
  status(){return{schemaVersion:'workspace-explorer-operation-coordinator-v2',active:this.leases.size,maxLeases:this.maxLeases,epoch:this.epoch,barrier:this.barrier?{...this.barrier}:null,leases:[...this.leases.values()].map(x=>({id:x.id,owner:x.owner,paths:x.paths,volumes:x.volumes,epoch:x.epoch,acquiredAt:x.acquiredAt}))};}
  close(){const count=this.leases.size;this.leases.clear();this.barrier=null;return count;}
}
module.exports={ExplorerOperationCoordinator,overlaps,compactPathScopes,compactVolumeScopes};
