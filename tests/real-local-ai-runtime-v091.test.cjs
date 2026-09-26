const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {EventEmitter}=require('events');
const {PassThrough}=require('stream');
const {LocalAIRuntimeManager,validateRuntimeFiles,buildArgs,cleanLlamaEnv}=require('../electron/services/local-ai-runtime-manager.cjs');
const {recommendModel}=require('../electron/services/hardware-profile-service.cjs');

function profile(ramGB,cores=16,gpus=[]){return{memory:{totalBytes:ramGB*1024**3},cpu:{logicalCores:cores},gpus};}
function fakeChild(pid=4242){
  const child=new EventEmitter();
  child.pid=pid;
  child.stdout=new PassThrough();
  child.stderr=new PassThrough();
  child.kill=(signal='SIGTERM')=>{setImmediate(()=>child.emit('exit',0,signal));return true;};
  return child;
}

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v091-runtime-'));
  try{
    const exe=path.join(dir,'llama-server');
    const model=path.join(dir,'qwen-local.gguf');
    fs.writeFileSync(exe,'fake-runtime');
    fs.writeFileSync(model,Buffer.alloc(1024));

    const files=validateRuntimeFiles({runtimeExecutablePath:exe,runtimeModelPath:model},{platform:'linux'});
    assert.equal(files.exe,fs.realpathSync(exe));
    assert.equal(files.model,fs.realpathSync(model));
    assert.equal(files.modelBytes,1024);
    assert.throws(()=>validateRuntimeFiles({runtimeExecutablePath:path.join(dir,'server'),runtimeModelPath:model},{platform:'linux'}),e=>e.code==='AI_RUNTIME_EXECUTABLE_INVALID'||e.code==='AI_RUNTIME_EXECUTABLE_NAME_BLOCKED');

    const env=cleanLlamaEnv({PATH:'/safe',LLAMA_ARG_HOST:'0.0.0.0',LLAMA_ARG_MCP:'1',LLAMA_API_KEY:'secret',WA_OK:'yes'});
    assert.equal(env.PATH,'/safe');
    assert.equal(env.WA_OK,'yes');
    assert.equal(env.LLAMA_ARG_HOST,undefined);
    assert.equal(env.LLAMA_ARG_MCP,undefined);
    assert.equal(env.LLAMA_API_KEY,undefined);

    const cfg={
      enabled:true,managedRuntime:true,runtimeExecutablePath:exe,runtimeModelPath:model,
      runtimePort:18081,runtimeAlias:'wa-test-model',runtimeContextSize:8192,
      runtimeThreads:6,runtimeGpuLayers:'auto',runtimeStartupTimeoutMs:10000,runtimeStartOnLaunch:false,
      baseUrl:'http://127.0.0.1:18081/v1',model:'wa-test-model'
    };
    const built=buildArgs(cfg,files);
    const joined=built.join(' ');
    assert(joined.includes('--host 127.0.0.1'));
    assert(joined.includes('--no-webui'));
    assert(joined.includes('--reasoning off'));
    assert(joined.includes('--gpu-layers auto'));
    assert(!joined.includes('--mcp'));
    assert(!joined.includes('--agent'));

    let spawned=null;
    const provider={health:async()=>({ok:true,code:'AI_PROVIDER_READY',latencyMs:3,models:['wa-test-model']})};
    const manager=new LocalAIRuntimeManager({
      getConfig:()=>cfg,
      updateConfig:patch=>Object.assign(cfg,patch),
      provider,
      platform:'linux',
      spawnImpl:(file,args,opts)=>{spawned={file,args,opts};return fakeChild();}
    });
    const started=await manager.start();
    assert.equal(started.state,'running');
    assert.equal(started.pid,4242);
    assert.equal(spawned.file,files.exe);
    assert.equal(spawned.opts.detached,false);
    assert.equal(spawned.opts.windowsHide,true);
    assert.equal(spawned.opts.env.LLAMA_API_KEY,undefined);
    assert.equal(spawned.opts.env.LLAMA_ARG_HOST,undefined);
    assert(spawned.args.includes('127.0.0.1'));
    assert(spawned.args.includes('--no-webui'));
    await manager.stop();
    assert.equal(manager.status().state,'stopped');

    const badManager=new LocalAIRuntimeManager({
      getConfig:()=>cfg,
      updateConfig:patch=>Object.assign(cfg,patch),
      provider:{health:async()=>{await new Promise(r=>setTimeout(r,20));return{ok:false,code:'AI_PROVIDER_UNAVAILABLE'};}},
      platform:'linux',
      spawnImpl:()=>{const child=fakeChild(4343);setImmediate(()=>child.emit('error',new Error('spawn EACCES')));return child;}
    });
    await assert.rejects(()=>badManager.start(),e=>e.code==='AI_RUNTIME_PROCESS_ERROR'&&/EACCES/.test(e.message));
    assert.equal(badManager.status().state,'failed');

    const a=recommendModel(profile(6,8));
    const b=recommendModel(profile(16,16));
    const c=recommendModel(profile(32,24));
    const d=recommendModel(profile(64,32,[{vendor:'nvidia'}]));
    assert.equal(a.modelFamily,'Qwen3.5-0.8B');
    assert.equal(b.modelFamily,'Qwen3.5-4B');
    assert.equal(c.modelFamily,'Qwen3.5-9B');
    assert.equal(d.modelFamily,'Qwen3.6-35B-A3B');
    for(const x of [a,b,c,d]){assert.equal(x.guaranteedFit,false);assert.equal(x.gpuLayers,'auto');}

    console.log('real-local-ai-runtime-v091.test.cjs: PASS');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exit(1);});
