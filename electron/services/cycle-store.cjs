const fs = require('fs');
const path = require('path');
const {atomicWriteJsonSync}=require('./durable-state.cjs');

function safeId(id=''){return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');}
class CycleStore {
  constructor(baseDir,{maxCycles=500}={}) { this.dir = path.join(baseDir, 'cycles'); this.maxCycles=maxCycles; fs.mkdirSync(this.dir, { recursive: true }); }
  file(id) { return path.join(this.dir, `${safeId(id)}.json`); }
  save(cycle) {
    const file=this.file(cycle.id);
    atomicWriteJsonSync(file,cycle);this.prune();return cycle;
  }
  get(id) { try { return JSON.parse(fs.readFileSync(this.file(id), 'utf8')); } catch { return null; } }
  list(limit = 50) {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit);
  }

  reconcileInterrupted(){
    const rows=this.list(Math.max(this.maxCycles,5000));let changed=0;for(const cycle of rows){if(!['running'].includes(cycle.status))continue;cycle.meta=cycle.meta||{};const started=Date.parse(cycle.meta.runStartedAt||'');const checkpoint=Date.parse(cycle.updatedAt||'');const accumulated=Number.isFinite(Number(cycle.meta.activeElapsedMs))?Math.max(0,Number(cycle.meta.activeElapsedMs)):0;if(Number.isFinite(started)&&Number.isFinite(checkpoint)&&checkpoint>=started)cycle.meta.activeElapsedMs=accumulated+(checkpoint-started);else cycle.meta.activeElapsedMs=accumulated;cycle.meta.runStartedAt=null;cycle.status='interrupted';cycle.finishedAt=cycle.finishedAt||new Date().toISOString();cycle.updatedAt=cycle.finishedAt;cycle.evidence=Array.isArray(cycle.evidence)?cycle.evidence:[];cycle.evidence.push({at:cycle.finishedAt,level:'warning',code:'PROCESS_RESTART_INTERRUPTED',text:'برنامه در حالی بسته شد که چرخه Running بود؛ وضعیت فایل‌ها باید از Transaction Recovery بررسی شود.'});cycle.end={status:'interrupted',quality:'interrupted',completedSteps:(cycle.steps||[]).filter(s=>s.status==='completed').length,failedSteps:0,evidenceCount:cycle.evidence.length,nextCycleSuggestions:[],summary:'چرخه به دلیل Restart/Crash ناتمام ثبت شد. برای عملیات Write، Recovery Center را بررسی کنید.',at:cycle.finishedAt};this.save(cycle);changed++;}return changed;
  }
  prune(){
    let files=[];try{files=fs.readdirSync(this.dir).filter(f=>f.endsWith('.json')).map(f=>{const file=path.join(this.dir,f);let cycle=null;try{cycle=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}return{f,file,st:fs.statSync(file),cycle};}).sort((a,b)=>b.st.mtimeMs-a.st.mtimeMs);}catch{return;}
    const protectedStates=new Set(['created','running','waiting-confirmation','paused','interrupted']);
    const terminal=files.filter(row=>row.cycle&&!protectedStates.has(String(row.cycle.status||'')));
    for(const row of terminal.slice(this.maxCycles)){try{fs.unlinkSync(row.file);}catch{}}
  }
}
module.exports = { CycleStore };
