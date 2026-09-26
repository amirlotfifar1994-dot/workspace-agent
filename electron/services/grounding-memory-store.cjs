const {atomicWriteJsonSync}=require('./durable-state.cjs');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
function atomic(file,value){return atomicWriteJsonSync(file,value);}
class GroundingMemoryStore{
 constructor(userData,{journal=null}={}){this.file=path.join(userData,'ui-grounding-memory.json');this.journal=journal;this.state=this.load();}
 load(){try{const x=JSON.parse(fs.readFileSync(this.file,'utf8'));if(x?.schemaVersion==='workspace-ui-grounding-memory-v1')return x;}catch{}return{schemaVersion:'workspace-ui-grounding-memory-v1',updatedAt:null,rows:{}};}
 key(intentClass,signature){return`${String(intentClass||'focus').slice(0,24)}:${String(signature||'').slice(0,64)}`;}
 boost({intentClass,signature}={}){const x=this.state.rows[this.key(intentClass,signature)];if(!x||!x.attempts)return 0;const reliability=(x.success+1)/(x.attempts+2);const volume=Math.min(1,Math.log2(x.attempts+1)/5);return Math.max(0,Math.min(1,reliability*volume));}
 recordVerified({intentClass,signature,action='focus'}={}){if(!signature)return null;const k=this.key(intentClass,signature),x=this.state.rows[k]||{attempts:0,success:0,lastVerifiedAt:null,actions:{}};x.attempts++;x.success++;x.lastVerifiedAt=new Date().toISOString();x.actions[action]=(x.actions[action]||0)+1;this.state.rows[k]=x;this.state.updatedAt=x.lastVerifiedAt;atomic(this.file,this.state);this.journal?.append('UI_GROUNDING_MEMORY_UPDATED',{payload:{intentClass:String(intentClass||'focus'),signature:String(signature).slice(0,16),action:String(action||'focus'),success:x.success,attempts:x.attempts}});return{intentClass,signature,success:x.success,attempts:x.attempts};}
 summary(){const rows=Object.entries(this.state.rows).map(([key,v])=>({key,attempts:v.attempts||0,success:v.success||0,lastVerifiedAt:v.lastVerifiedAt||null,actions:v.actions||{}})).sort((a,b)=>b.attempts-a.attempts).slice(0,100);return{schemaVersion:this.state.schemaVersion,updatedAt:this.state.updatedAt,total:rows.length,rows};}
}
module.exports={GroundingMemoryStore};
