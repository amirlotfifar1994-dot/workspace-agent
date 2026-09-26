const fs=require('fs');
const os=require('os');
const path=require('path');
const {LocalAIService}=require('../electron/services/local-ai-service.cjs');

(async()=>{
  if(process.platform!=='win32')return console.log('windows-local-ai-runtime-v091.uat.cjs: SKIP (Windows only)');
  const exe=String(process.env.WA_LLAMA_SERVER||'').trim();
  const model=String(process.env.WA_GGUF_MODEL||'').trim();
  if(!exe||!model)return console.log('windows-local-ai-runtime-v091.uat.cjs: SKIP (set WA_LLAMA_SERVER + WA_GGUF_MODEL)');
  if(!fs.existsSync(exe)||!fs.existsSync(model))throw new Error('WA_LLAMA_SERVER / WA_GGUF_MODEL path does not exist');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v091-real-ai-'));
  const service=new LocalAIService(dir);
  try{
    service.updateSettings({
      enabled:true,managedRuntime:true,runtimeExecutablePath:path.resolve(exe),runtimeModelPath:path.resolve(model),
      runtimePort:Number(process.env.WA_LLAMA_PORT||18089),runtimeAlias:'wa-real-local-model',runtimeContextSize:Number(process.env.WA_LLAMA_CTX||8192),
      runtimeThreads:Number(process.env.WA_LLAMA_THREADS||0),runtimeGpuLayers:'auto',runtimeStartupTimeoutMs:180000,
      allowVision:String(process.env.WA_LLAMA_VISION||'').toLowerCase()==='true'
    });
    const hardware=await service.hardwareProfile({visionPreferred:service.settings().allowVision});
    if(!hardware?.memory?.totalBytes)throw new Error('hardware profile failed');
    const started=await service.startManagedRuntime();
    if(started.state!=='running')throw new Error(`runtime state=${started.state}`);
    const caps=await service.capabilityProbe({includeVision:service.settings().allowVision});
    if(!caps.ok)throw new Error(`capability probe failed: ${JSON.stringify(caps)}`);
    const warm=await service.warmup();
    if(!warm.ok)throw new Error(`warmup failed: ${JSON.stringify(warm)}`);
    console.log(JSON.stringify({ok:true,runtime:service.runtimeStatus(),capabilities:caps,hardware:{memory:hardware.memory,cpu:hardware.cpu,gpus:hardware.gpus,advice:hardware.advice}},null,2));
    console.log('windows-local-ai-runtime-v091.uat.cjs: PASS');
  }finally{
    await service.stopManagedRuntime().catch(()=>{});
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exit(1);});
