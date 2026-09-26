const {atomicWriteJsonSync}=require('./durable-state.cjs');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
function atomic(file,value){return atomicWriteJsonSync(file,value);}
function keyFor(x){return crypto.createHash('sha256').update([x.root,x.actionType,x.source,x.suggestedFolder||'',x.suggestedName||''].join('|')).digest('hex').slice(0,24);}
class ReviewQueueStore{
  constructor(baseDir){this.dir=path.join(baseDir,'review-queue');this.file=path.join(this.dir,'items.json');fs.mkdirSync(this.dir,{recursive:true});}
  list({root='',status=''}={}){let rows=[];try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));rows=Array.isArray(v)?v:[];}catch{}const rr=root?path.resolve(root):'';return rows.filter(x=>(!rr||path.resolve(x.root)===rr)&&(!status||x.status===status)).sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0)||String(b.updatedAt).localeCompare(String(a.updatedAt)));}
  save(rows){atomic(this.file,rows.slice(0,2000));return rows;}
  upsertMany(items=[]){const rows=this.list();const byKey=new Map(rows.map(x=>[x.key||keyFor(x),x]));const now=new Date().toISOString();const touched=[];for(const raw of items){const item={...raw,root:path.resolve(raw.root),source:path.resolve(raw.source)};const key=keyFor(item);const prev=byKey.get(key);const next={id:prev?.id||`rq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,key,status:prev?.status||'pending',createdAt:prev?.createdAt||now,updatedAt:now,...item};if(['applied','reverted'].includes(prev?.status)&&prev?.sourceMeta&&item.sourceMeta&&Number(prev.sourceMeta.mtimeMs)!==Number(item.sourceMeta.mtimeMs))next.status='pending';byKey.set(key,next);touched.push(next);}this.save([...byKey.values()]);return touched;}
  update(id,patch={}){const rows=this.list();const i=rows.findIndex(x=>x.id===id);if(i<0)return null;const allowed=new Set(['pending','dismissed','applied','reverted']);const next={...rows[i]};if(patch.status&&allowed.has(patch.status))next.status=patch.status;if(patch.lastCycleId!==undefined)next.lastCycleId=patch.lastCycleId;if(patch.appliedDestination!==undefined)next.appliedDestination=patch.appliedDestination;next.updatedAt=new Date().toISOString();rows[i]=next;this.save(rows);return next;}
  mark(ids=[],patch={}){const set=new Set(ids);const rows=this.list();const now=new Date().toISOString();for(let i=0;i<rows.length;i++){if(!set.has(rows[i].id))continue;rows[i]={...rows[i],...patch,updatedAt:now};}this.save(rows);return rows.filter(x=>set.has(x.id));}
  clear(root,{statuses=['dismissed','reverted']}={}){const rr=path.resolve(root);const before=this.list();const set=new Set(statuses);const next=before.filter(x=>path.resolve(x.root)!==rr||!set.has(x.status));this.save(next);return before.length-next.length;}
}
module.exports={ReviewQueueStore,keyFor};
