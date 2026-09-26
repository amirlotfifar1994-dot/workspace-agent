const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {Worker}=require('worker_threads');
(async()=>{
  const workerPath=path.resolve(String(process.argv[2]||''));
  if(!process.argv[2])throw Object.assign(new Error('Worker path argument required'),{code:'WORKER_PATH_REQUIRED'});
  assert(fs.existsSync(workerPath),`packaged worker missing: ${workerPath}`);
  const util=path.join(path.dirname(workerPath),'windows-path-utils.cjs');assert(fs.existsSync(util),`unpacked worker dependency missing: ${util}`);
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-pack-worker-'));const file=path.join(base,'فایل-😀.bin');
  try{
    await fsp.writeFile(file,'packaged-worker-smoke');const st=await fsp.stat(file);const worker=new Worker(workerPath);
    const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error('Packaged worker timeout'),{code:'PACKAGED_WORKER_TIMEOUT'})),10000);worker.once('error',reject);worker.on('message',msg=>{if(msg?.id!==1)return;clearTimeout(timer);if(msg.ok)resolve(msg.result);else reject(Object.assign(new Error(msg.error?.message||'worker failed'),{code:msg.error?.code||'PACKAGED_WORKER_FAILED'}));});worker.postMessage({id:1,file:{path:file,size:st.size,mtimeMs:st.mtimeMs}});});
    assert.strictEqual(result.hash.length,64);await worker.terminate();console.log('packaged-worker-smoke-v082.cjs PASS',{worker:workerPath,hash:result.hash.slice(0,12)});
  }finally{await fsp.rm(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
