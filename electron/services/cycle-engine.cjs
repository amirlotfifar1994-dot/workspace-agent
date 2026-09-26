const crypto = require('crypto');

const SCHEMA_VERSION = 'workspace-cycle-v4';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rolled-back', 'rollback-failed', 'interrupted']);
function now() { return new Date().toISOString(); }
function id(prefix = 'cycle') { return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function finiteMs(v){const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;}
function activeElapsedMs(cycle,atMs=Date.now()){const meta=cycle?.meta||{};const accumulated=finiteMs(meta.activeElapsedMs);const started=Date.parse(meta.runStartedAt||'');return accumulated+(Number.isFinite(started)?Math.max(0,atMs-started):0);}
function closeRunSegment(cycle,atMs=Date.now()){cycle.meta=cycle.meta||{};const started=Date.parse(cycle.meta.runStartedAt||'');if(Number.isFinite(started))cycle.meta.activeElapsedMs=finiteMs(cycle.meta.activeElapsedMs)+Math.max(0,atMs-started);else cycle.meta.activeElapsedMs=finiteMs(cycle.meta.activeElapsedMs);cycle.meta.runStartedAt=null;return cycle;}

class CycleEngine {
  constructor({ store, maxIterations = 16, maxWallTimeMs = 30 * 60 * 1000, journal = null, beforeRun = null, stepLease = null } = {}) {
    this.store = store;
    this.journal = journal;
    this.maxIterations = maxIterations;
    this.maxWallTimeMs = maxWallTimeMs;
    this.beforeRun = typeof beforeRun === 'function' ? beforeRun : null;
    this.stepLease = typeof stepLease === 'function' ? stepLease : null;
    this.handlers = new Map();
    this.inFlight = new Map();
  }
  register(type, handler) {
    if (!type || !handler) throw new Error('cycle type/handler required');
    this.handlers.set(type, handler);
  }
  handler(type){ return this.handlers.get(type) || null; }
  create(type, input = {}, meta = {}) {
    if (!this.handlers.has(type)) throw new Error(`Unknown cycle type: ${type}`);
    const cycle = {
      schemaVersion: SCHEMA_VERSION,
      id: id(), type, status: 'created', iteration: 0,
      input: clone(input), meta: clone(meta),
      steps: [], evidence: [], operations: [], undoStack: [],
      createdAt: now(), updatedAt: now(), finishedAt: null, end: null,
      budget: { maxIterations: Number(meta?.budget?.maxIterations || this.maxIterations), maxWallTimeMs: Number(meta?.budget?.maxWallTimeMs || this.maxWallTimeMs) },
    };
    this.store.save(cycle); this.journal?.append('CYCLE_CREATED',{cycleId:cycle.id,payload:{type:cycle.type,meta:cycle.meta}}); return cycle;
  }
  async finalize(cycle, context = {}) {
    if (!TERMINAL.has(cycle.status)) return cycle;
    if (!cycle.finishedAt) cycle.finishedAt = now();
    if (!cycle.end) cycle.end = await this.finish(cycle, context);
    this.journal?.append('CYCLE_FINALIZED',{cycleId:cycle.id,payload:{type:cycle.type,status:cycle.status,quality:cycle.end?.quality||null,iteration:cycle.iteration}});
    cycle.updatedAt = now(); this.store.save(cycle); return cycle;
  }
  async run(cycleId, context = {}) {
    const key=String(cycleId||'');
    if(this.inFlight.has(key))return this.inFlight.get(key);
    const task=this._runUnlocked(key,context);this.inFlight.set(key,task);
    try{return await task;}finally{if(this.inFlight.get(key)===task)this.inFlight.delete(key);}
  }
  async _runUnlocked(cycleId, context = {}) {
    let cycle = this.store.get(cycleId);
    if (!cycle) throw Object.assign(new Error('Cycle not found'),{code:'CYCLE_NOT_FOUND'});
    if (TERMINAL.has(cycle.status)) return this.finalize(cycle, context);
    const handler = this.handlers.get(cycle.type);
    if (!handler) throw new Error(`No handler for ${cycle.type}`);
    if(this.beforeRun){let gate;try{gate=await this.beforeRun(cycle,{...context,phase:'run'});}catch(error){gate={ok:false,code:error.code||'CYCLE_PREFLIGHT_FAILED',message:error.message}}if(gate?.ok===false){cycle.status='failed';cycle.evidence.push({at:now(),level:'error',code:gate.code||'CYCLE_PREFLIGHT_BLOCKED',text:gate.message||'Cycle preflight عملیات را متوقف کرد.',details:gate.details||gate.state||null});this.store.save(cycle);this.journal?.append('CYCLE_PREFLIGHT_BLOCKED',{cycleId:cycle.id,payload:{type:cycle.type,code:gate.code||'CYCLE_PREFLIGHT_BLOCKED'}});return this.finalize(cycle,context);}}
    cycle.status = 'running'; cycle.updatedAt = now(); cycle.meta = cycle.meta || {}; cycle.meta.activeElapsedMs = finiteMs(cycle.meta.activeElapsedMs); cycle.meta.runStartedAt = now(); this.store.save(cycle); this.journal?.append('CYCLE_RUNNING',{cycleId:cycle.id,payload:{type:cycle.type,iteration:cycle.iteration,budget:cycle.budget,activeElapsedMs:cycle.meta.activeElapsedMs}});

    while (!TERMINAL.has(cycle.status) && cycle.status !== 'waiting-confirmation' && cycle.status !== 'paused') {
      const maxIterations = Number(cycle.budget?.maxIterations || this.maxIterations);
      const maxWallTimeMs = Number(cycle.budget?.maxWallTimeMs || this.maxWallTimeMs);
      const elapsedMs = activeElapsedMs(cycle);
      if (elapsedMs > maxWallTimeMs) {
        cycle.status = 'failed';
        cycle.evidence.push({ at: now(), level: 'error', code: 'MAX_WALL_TIME', text: 'بودجه زمانی چرخه برای جلوگیری از اجرای بی‌پایان تمام شد.', details: { elapsedMs, maxWallTimeMs } });
        break;
      }
      if (cycle.iteration >= maxIterations) {
        cycle.status = 'failed';
        cycle.evidence.push({ at: now(), level: 'error', code: 'MAX_ITERATIONS', text: 'حد چرخه برای جلوگیری از Loop بی‌نهایت رسید.', details: { maxIterations } });
        break;
      }
      let lease=null;
      if(this.stepLease){let gate;try{gate=await this.stepLease(cycle,{...context,phase:'step'});}catch(error){gate={ok:false,code:error.code||'CYCLE_STEP_LEASE_FAILED',message:error.message,details:error.details||null}}if(gate?.ok===false){cycle.status='paused';cycle.evidence.push({at:now(),level:'warn',code:gate.code||'CYCLE_RESOURCE_BUSY',text:gate.message||'منبع موردنیاز چرخه موقتاً در اختیار عملیات دیگری است.',details:gate.details||null});this.journal?.append('CYCLE_STEP_LEASE_BLOCKED',{cycleId:cycle.id,payload:{type:cycle.type,code:gate.code||'CYCLE_RESOURCE_BUSY'}});break;}lease=gate?.lease||gate||null;}
      cycle.iteration += 1;
      try {
        const result = await handler.next(cycle, context);
        if (!result || typeof result !== 'object') throw new Error('Cycle handler returned no result');
        cycle = { ...cycle, ...result, updatedAt: now() };
      } catch (error) {
        cycle.status = 'failed';
        cycle.evidence.push({ at: now(), level: 'error', code: error.code || 'CYCLE_STEP_FAILED', text: error.message, details: error.details || null });
      } finally {try{if(lease&&typeof lease.release==='function')await lease.release();}catch(error){this.journal?.append('CYCLE_STEP_LEASE_RELEASE_WARNING',{cycleId:cycle.id,payload:{type:cycle.type,error:error.code||error.message}});}}
      this.store.save(cycle);
      this.journal?.append('CYCLE_CHECKPOINT',{cycleId:cycle.id,payload:{status:cycle.status,iteration:cycle.iteration,steps:cycle.steps.map(s=>({id:s.id,status:s.status}))}});
    }
    closeRunSegment(cycle); cycle.updatedAt=now(); this.store.save(cycle);
    if (TERMINAL.has(cycle.status)) cycle = await this.finalize(cycle, context);
    return cycle;
  }
  async confirm(cycleId, decision = 'approve', context = {}) {
    let cycle = this.store.get(cycleId);
    if (!cycle) throw Object.assign(new Error('Cycle not found'),{code:'CYCLE_NOT_FOUND'});
    if (cycle.status !== 'waiting-confirmation') return cycle;
    cycle.meta.confirmations = Array.isArray(cycle.meta.confirmations) ? cycle.meta.confirmations : [];
    cycle.meta.confirmations.push({ decision, at: now(), stepId:cycle.steps.find(s=>s.status==='waiting-confirmation')?.id||'' });
    cycle.status = decision === 'approve' ? 'running' : 'cancelled';
    cycle.steps = cycle.steps.map(s => s.status === 'waiting-confirmation' ? { ...s, status: decision === 'approve' ? 'approved' : 'cancelled', at:now() } : s);
    cycle.evidence.push({at:now(),code:'USER_CONFIRMATION',decision});
    this.store.save(cycle); this.journal?.append('CYCLE_CONFIRMATION',{cycleId:cycle.id,payload:{decision,status:cycle.status}});
    if (cycle.status === 'cancelled') return this.finalize(cycle, context);
    return this.run(cycle.id, context);
  }
  async resume(cycleId, context = {}) {
    let cycle=this.store.get(cycleId);if(!cycle)throw Object.assign(new Error('Cycle not found'),{code:'CYCLE_NOT_FOUND'});const handler=this.handlers.get(cycle.type);if(!handler?.resumable)throw Object.assign(new Error('این چرخه Resume پشتیبانی نمی‌کند.'),{code:'CYCLE_NOT_RESUMABLE'});if(!['paused','interrupted'].includes(cycle.status))return cycle;cycle.status='running';cycle.finishedAt=null;cycle.end=null;cycle.meta=cycle.meta||{};cycle.meta.runStartedAt=null;cycle.meta.resumedAt=now();cycle.evidence=Array.isArray(cycle.evidence)?cycle.evidence:[];cycle.evidence.push({at:now(),code:'CYCLE_RESUMED'});this.store.save(cycle);this.journal?.append('CYCLE_RESUMED',{cycleId:cycle.id,payload:{type:cycle.type}});return this.run(cycle.id,context);
  }
  async cancel(cycleId, context = {}) {
    let cycle=this.store.get(cycleId);if(!cycle)throw Object.assign(new Error('Cycle not found'),{code:'CYCLE_NOT_FOUND'});const handler=this.handlers.get(cycle.type);if(!handler?.allowCancel)throw Object.assign(new Error('Cancel برای این چرخه فعال نیست.'),{code:'CYCLE_CANCEL_NOT_ALLOWED'});if(TERMINAL.has(cycle.status)&&cycle.status!=='interrupted')return cycle;let patch={};if(typeof handler.cancel==='function')patch=await handler.cancel(cycle,context)||{};cycle={...cycle,...patch,status:'cancelled',finishedAt:now(),updatedAt:now()};cycle.evidence=Array.isArray(cycle.evidence)?cycle.evidence:[];cycle.evidence.push({at:cycle.finishedAt,code:'CYCLE_CANCELLED_SAFE_BOUNDARY'});cycle.end=null;this.store.save(cycle);this.journal?.append('CYCLE_CANCELLED',{cycleId:cycle.id,payload:{type:cycle.type}});return this.finalize(cycle,context);
  }
  async rollback(cycleId, context={}){
    if(this.inFlight.has(String(cycleId||'')))return{ok:false,code:'CYCLE_BUSY',message:'چرخه هنوز در حال اجراست؛ Rollback پس از رسیدن به checkpoint امن انجام شود.'};
    let cycle=this.store.get(cycleId);
    if(!cycle) return {ok:false,message:'چرخه پیدا نشد'};
    const handler=this.handlers.get(cycle.type);
    if(typeof handler?.undo!=='function') return {ok:false,message:'Undo برای این چرخه فعال نیست'};
    if(this.beforeRun){let gate;try{gate=await this.beforeRun(cycle,{...context,phase:'rollback'});}catch(error){gate={ok:false,code:error.code||'ROLLBACK_PREFLIGHT_FAILED',message:error.message}}if(gate?.ok===false){this.journal?.append('ROLLBACK_PREFLIGHT_BLOCKED',{cycleId:cycle.id,payload:{type:cycle.type,code:gate.code||'ROLLBACK_PREFLIGHT_BLOCKED'}});return{ok:false,code:gate.code||'ROLLBACK_PREFLIGHT_BLOCKED',message:gate.message||'Rollback preflight متوقف شد',results:[]};}}
    const rollbackAllowed=cycle.status==='completed'||cycle.status==='rollback-failed'||(handler?.allowPartialUndo&&['cancelled','failed','interrupted'].includes(cycle.status));
    if(!rollbackAllowed) return {ok:false,message:'این وضعیت چرخه قابل Undo نیست'};
    let results;
    try{results=await handler.undo(cycle,context);}catch(error){
      cycle.evidence.push({at:now(),code:'ROLLBACK_FAILED',ok:false,error:error.code||error.message});cycle.updatedAt=now();this.store.save(cycle);this.journal?.append('CYCLE_ROLLBACK_FAILED',{cycleId:cycle.id,payload:{error:error.code||error.message}});return{ok:false,message:error.message,results:[]};
    }
    const list=Array.isArray(results)?results:[results];const ok=list.length>0&&list.every(r=>r?.ok!==false);
    cycle.status=ok?'rolled-back':'rollback-failed';cycle.finishedAt=now();cycle.updatedAt=now();
    cycle.evidence.push({at:cycle.finishedAt,code:'ROLLBACK',ok,results:list});
    cycle.end={status:cycle.status,quality:ok?'verified':'failed',completedSteps:cycle.steps.filter(s=>s.status==='completed').length,failedSteps:ok?0:1,evidenceCount:cycle.evidence.length,nextCycleSuggestions:['workspace-health'],summary:ok?`${list.length} عملیات با موفقیت Restore/Undo شد.`:'Rollback با خطا کامل شد؛ نتایج را بررسی کنید.',at:cycle.finishedAt};
    this.store.save(cycle);this.journal?.append('CYCLE_ROLLBACK',{cycleId:cycle.id,payload:{ok,results:list.length,status:cycle.status}});return{ok,results:list,cycle};
  }
  async finish(cycle, context) {
    const handler = this.handlers.get(cycle.type);
    const handlerEnd = typeof handler?.onEnd === 'function' ? await handler.onEnd(cycle, context) : {};
    return {
      status: cycle.status,
      quality: handlerEnd?.quality || (cycle.status === 'completed' ? 'verified' : cycle.status),
      completedSteps: cycle.steps.filter(s => s.status === 'completed').length,
      failedSteps: cycle.steps.filter(s => s.status === 'failed').length,
      evidenceCount: cycle.evidence.length,
      nextCycleSuggestions: handlerEnd?.nextCycleSuggestions || [],
      summary: handlerEnd?.summary || '',
      at: now(),
    };
  }
}
module.exports = { CycleEngine, SCHEMA_VERSION, TERMINAL };
