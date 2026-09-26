const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {atomicWriteJsonSync}=require('./durable-state.cjs');
function safeId(v=''){return String(v).replace(/[^a-zA-Z0-9_-]/g,'_');}
function atomic(file,value){return atomicWriteJsonSync(file,value);}
function statType(st){if(!st)return'missing';if(st.isFile())return'file';if(st.isDirectory())return'directory';if(st.isSymbolicLink())return'link';return'other';}
function sourceSnapshot(file){try{const st=fs.lstatSync(file);return{type:statType(st),size:Number(st.size||0),mtimeMs:Number(st.mtimeMs||0),ctimeMs:Number(st.ctimeMs||0),dev:Number(st.dev||0),ino:Number(st.ino||0)};}catch{return null;}}
class TransactionStore{
 constructor(baseDir,{journal=null,maxTransactions=500}={}){this.dir=path.join(baseDir,'transactions');this.journal=journal;this.maxTransactions=maxTransactions;fs.mkdirSync(this.dir,{recursive:true});}
 file(id){return path.join(this.dir,`${safeId(id)}.json`);}
 create({kind,cycleId=null,root='',operations=[]}){const id=`tx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;const now=new Date().toISOString();const tx={schemaVersion:'workspace-file-transaction-v1',id,kind,cycleId,root:path.resolve(root||'.'),status:'prepared',createdAt:now,updatedAt:now,finishedAt:null,operations:operations.map((o,i)=>{const src=path.resolve(o.source),meta={...(o.meta&&typeof o.meta==='object'?o.meta:{}),kind:String(o.kind||o.meta?.kind||''),itemIds:Array.isArray(o.itemIds)?o.itemIds:Array.isArray(o.meta?.itemIds)?o.meta.itemIds:[]};if(!meta.sourceSnapshot)meta.sourceSnapshot=sourceSnapshot(src);return{index:i,source:src,destination:path.resolve(o.destination),stage:o.stage?path.resolve(o.stage):null,size:Number(o.size||meta.sourceSnapshot?.size||0),meta,state:'pending',error:null};})};this.save(tx);this.journal?.append('TRANSACTION_PREPARED',{cycleId,transactionId:id,payload:{kind,operations:tx.operations.length,root:tx.root}});return tx;}
 save(tx){tx.updatedAt=new Date().toISOString();atomic(this.file(tx.id),tx);this.prune();return tx;}
 get(id){try{return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}catch{return null;}}
 list({recoverableOnly=false,limit=500}={}){let rows=[];try{rows=fs.readdirSync(this.dir).filter(f=>f.endsWith('.json')).map(f=>{try{return JSON.parse(fs.readFileSync(path.join(this.dir,f),'utf8'))}catch{return null}}).filter(Boolean);}catch{}if(recoverableOnly)rows=rows.filter(x=>!['completed','rolled-back','abandoned'].includes(x.status));return rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,limit);}
 mark(id,patch={}){const tx=this.get(id);if(!tx)return null;Object.assign(tx,patch);if(['completed','rolled-back','abandoned'].includes(tx.status)&&!tx.finishedAt)tx.finishedAt=new Date().toISOString();this.save(tx);this.journal?.append('TRANSACTION_STATE',{cycleId:tx.cycleId,transactionId:tx.id,payload:{status:tx.status}});return tx;}
 markOp(id,index,patch={}){const tx=this.get(id);if(!tx||!tx.operations[index])return null;tx.operations[index]={...tx.operations[index],...patch};this.save(tx);this.journal?.append('TRANSACTION_OPERATION',{cycleId:tx.cycleId,transactionId:tx.id,payload:{index,state:tx.operations[index].state,error:tx.operations[index].error||null}});return tx;}
 prune(){let files=[];try{files=fs.readdirSync(this.dir).filter(f=>f.endsWith('.json')).map(f=>{const file=path.join(this.dir,f);let tx=null;try{tx=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}return{f,file,st:fs.statSync(file),tx};}).sort((a,b)=>b.st.mtimeMs-a.st.mtimeMs);}catch{return;}const terminalStates=new Set(['completed','rolled-back','abandoned']);const terminal=files.filter(row=>row.tx&&terminalStates.has(String(row.tx.status||'')));for(const row of terminal.slice(this.maxTransactions)){try{fs.unlinkSync(row.file);}catch{}}}
}
module.exports={TransactionStore};
