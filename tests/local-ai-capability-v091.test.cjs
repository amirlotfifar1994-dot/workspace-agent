const assert=require('assert');
const http=require('http');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {LocalAIService}=require('../electron/services/local-ai-service.cjs');

function readJson(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});req.on('error',reject);});}

(async()=>{
  const calls={chat:0,llamaRejected:0,vision:0,props:0};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'&&req.url.startsWith('/v1/models')){res.end(JSON.stringify({data:[{id:'wa-cap-test',meta:{n_ctx_train:8192}}]}));return;}
    if(req.method==='GET'&&req.url.startsWith('/props')){calls.props++;res.end(JSON.stringify({modalities:{vision:true,audio:false},chat_template_caps:{supports_tools:true},total_slots:1,default_generation_settings:{n_ctx:8192},build_info:'test-build'}));return;}
    if(req.method==='POST'&&req.url==='/v1/chat/completions'){
      calls.chat++;const body=await readJson(req);
      if(Object.prototype.hasOwnProperty.call(body,'reasoning_effort')){calls.llamaRejected++;res.statusCode=400;res.end(JSON.stringify({error:{message:'compat field unsupported'}}));return;}
      const content=body.messages?.some(m=>Array.isArray(m.content)&&m.content.some(x=>x.type==='image_url'))?JSON.stringify({seen:true}):JSON.stringify({ok:true});
      if(content.includes('seen'))calls.vision++;
      res.end(JSON.stringify({model:'wa-cap-test',choices:[{message:{content}}],usage:{prompt_tokens:1,completion_tokens:1}}));return;
    }
    res.statusCode=404;res.end(JSON.stringify({error:{message:'not found'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v091-cap-'));
  try{
    const service=new LocalAIService(dir);
    service.updateSettings({enabled:true,baseUrl:`http://127.0.0.1:${port}/v1`,model:'wa-cap-test',allowVision:true,timeoutMs:5000});
    const health=await service.health();
    assert.equal(health.ok,true);
    assert(health.models.includes('wa-cap-test'));

    const caps=await service.capabilityProbe({includeVision:true});
    assert.equal(caps.ok,true);
    assert.equal(caps.props.ok,true);
    assert.equal(caps.props.modalities.vision,true);
    assert.equal(caps.schemaJson.ok,true);
    assert.equal(caps.vision.tested,true);
    assert.equal(caps.vision.ok,true);
    assert(calls.llamaRejected>=2,'expected llama-specific body to be rejected then retried minimally');
    assert(calls.vision>=1);
    assert(calls.props>=1);

    const warm=await service.warmup();
    assert.equal(warm.ok,true);
    assert(calls.chat>=5);
    console.log('local-ai-capability-v091.test.cjs: PASS');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exit(1);});
