const {atomicWriteJsonSync}=require('./durable-state.cjs');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
function atomic(file,value){return atomicWriteJsonSync(file,value);}
class SkillMemoryStore{
 constructor(userData,{journal=null}={}){this.file=path.join(userData,'ai-skill-memory.json');this.journal=journal;this.state=this.load();}
 load(){try{const x=JSON.parse(fs.readFileSync(this.file,'utf8'));if(x?.schemaVersion==='workspace-ai-skill-memory-v1')return x;}catch{}return{schemaVersion:'workspace-ai-skill-memory-v1',updatedAt:null,skills:{}};}
 stats(skillId){const x=this.state.skills[String(skillId||'')]||{};return{used:x.used||0,success:x.success||0,failed:x.failed||0,lastUsedAt:x.lastUsedAt||null,reliability:x.used?Math.max(0,Math.min(1,(x.success+1)/(x.used+2))):0.5};}
 record(skillIds=[],status='completed'){for(const id of [...new Set(skillIds.map(String))]){const x=this.state.skills[id]||{used:0,success:0,failed:0,lastUsedAt:null};x.used++;if(status==='completed'||status==='rolled-back')x.success++;else if(status==='failed')x.failed++;x.lastUsedAt=new Date().toISOString();this.state.skills[id]=x;}this.state.updatedAt=new Date().toISOString();atomic(this.file,this.state);this.journal?.append('AI_SKILL_MEMORY_UPDATED',{payload:{skills:[...new Set(skillIds.map(String))],status}});}
 summary(){return{schemaVersion:this.state.schemaVersion,updatedAt:this.state.updatedAt,totalSkills:Object.keys(this.state.skills).length,rows:Object.entries(this.state.skills).map(([skillId])=>({skillId,...this.stats(skillId)})).sort((a,b)=>b.used-a.used).slice(0,100)};}
}
module.exports={SkillMemoryStore};
