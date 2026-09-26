const fs=require('fs');
const path=require('path');
let Worker=null;try{({Worker}=require('worker_threads'));}catch{}
const {hashFileStable}=require('./duplicate-finder.cjs');
function clamp(n,min,max,fallback){const v=Number(n);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;}
function resolveWorkerScript(raw,{exists=fs.existsSync,sep=path.sep}={}){
  const marker=`${sep}app.asar${sep}`;if(String(raw).includes(marker)){const unpacked=String(raw).replace(marker,`${sep}app.asar.unpacked${sep}`);if(exists(unpacked))return unpacked;}return raw;
}
function workerScript(){return resolveWorkerScript(path.join(__dirname,'hash-worker.cjs'));}
class HashWorkerPool{
 constructor({size=3,journal=null}={}){this.size=clamp(size,1,8,3);this.journal=journal;this.workers=[];this.queue=[];this.jobs=new Map();this.nextId=1;this.closed=false;this.fallback=!Worker;this.fallbackDraining=false;this.faults=0;}
 _enableFallback(error){if(!this.fallback){this.fallback=true;this.journal?.append('HASH_WORKER_UNAVAILABLE',{payload:{error:error?.code||error?.message||'WORKER_UNAVAILABLE'}});}this._drainFallback();}
 async _drainFallback(){if(this.fallbackDraining||this.closed)return;this.fallbackDraining=true;try{while(this.queue.length&&!this.closed){const job=this.queue.shift();try{job.resolve(await hashFileStable(job.file));}catch(error){job.reject(error);}}}finally{this.fallbackDraining=false;}}
 _spawn(){if(this.closed||this.fallback)return null;let worker;try{worker=new Worker(workerScript());}catch(error){this._enableFallback(error);return null;}const slot={worker,busy:false,current:null,dead:false};worker.on('message',msg=>this._message(slot,msg));worker.on('error',error=>this._fault(slot,error));worker.on('exit',code=>{if(!this.closed&&code!==0)this._fault(slot,Object.assign(new Error(`Hash worker exit ${code}`),{code:'HASH_WORKER_EXIT'}));});this.workers.push(slot);return slot;}
 _message(slot,msg){if(slot.dead)return;const job=this.jobs.get(msg?.id);slot.busy=false;slot.current=null;if(job){this.jobs.delete(msg.id);if(msg.ok)job.resolve(msg.result);else job.reject(Object.assign(new Error(msg.error?.message||'Hash worker failed'),{code:msg.error?.code||'HASH_WORKER_FAILED'}));}this._pump();}
 _fault(slot,error){if(slot.dead)return;slot.dead=true;this.faults+=1;const job=slot.current?this.jobs.get(slot.current):null;if(job){this.jobs.delete(slot.current);job.reject(Object.assign(new Error(error.message||'Hash worker failed'),{code:error.code||'HASH_WORKER_FAILED'}));}slot.busy=false;slot.current=null;try{slot.worker.terminate();}catch{}this.workers=this.workers.filter(x=>x!==slot);this.journal?.append('HASH_WORKER_FAILED',{payload:{error:error.code||error.message,faults:this.faults}});if(!this.closed){if(this.faults>=Math.max(2,this.size*2))this._enableFallback(error);else this._spawn();}this._pump();}
 _pump(){if(this.closed)return;if(this.fallback){this._drainFallback();return;}while(this.queue.length){let slot=this.workers.find(x=>!x.busy&&!x.dead);if(!slot&&this.workers.length<this.size)slot=this._spawn();if(this.fallback){this._drainFallback();return;}if(!slot||slot.busy)break;const job=this.queue.shift();slot.busy=true;slot.current=job.id;this.jobs.set(job.id,job);try{slot.worker.postMessage({id:job.id,file:job.file});}catch(error){this._fault(slot,error);}}
 }
 async hash(file){if(this.closed)throw Object.assign(new Error('Hash worker pool بسته است.'),{code:'HASH_POOL_CLOSED'});if(this.fallback)return hashFileStable(file);return new Promise((resolve,reject)=>{const id=this.nextId++;this.queue.push({id,file,resolve,reject});this._pump();});}
 status(){return{schemaVersion:'hash-worker-pool-v1',size:this.size,workers:this.workers.length,busy:this.workers.filter(x=>x.busy&&!x.dead).length,queued:this.queue.length,fallback:this.fallback,faults:this.faults,workerScript:workerScript()};}
 async close(){this.closed=true;for(const job of this.queue.splice(0))job.reject(Object.assign(new Error('Hash worker pool بسته شد.'),{code:'HASH_POOL_CLOSED'}));for(const [id,job] of this.jobs){job.reject(Object.assign(new Error('Hash worker pool بسته شد.'),{code:'HASH_POOL_CLOSED'}));this.jobs.delete(id);}await Promise.all(this.workers.map(async s=>{s.dead=true;try{await s.worker.terminate();}catch{}}));this.workers=[];}
}
module.exports={HashWorkerPool,resolveWorkerScript,workerScript};
