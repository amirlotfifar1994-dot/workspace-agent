const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const http=require('http');
const {LocalAIService}=require('../electron/services/local-ai-service.cjs');
const {LocalOpenAIProvider}=require('../electron/services/local-openai-provider.cjs');
const {validateBaseUrl}=require('../electron/services/local-ai-config-store.cjs');
const {redactText}=require('../electron/services/ai-redaction.cjs');
const {retrieveSkills}=require('../electron/services/skill-retriever.cjs');

(async()=>{
  assert.throws(()=>validateBaseUrl('https://example.com/v1'),e=>e.code==='AI_NON_LOOPBACK_BLOCKED');
  assert.throws(()=>validateBaseUrl('http://127.0.0.1:8080/not-openai'),e=>e.code==='AI_BASE_PATH_BLOCKED');
  assert.equal(redactText('token=abcdef1234567890'),'token=[REDACTED]');
  assert(!retrieveSkills('دکمه ویندوز را کلیک کن',{limit:30}).some(x=>x.interactiveOnly));

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-ai-v090-'));
  const workspace=path.join(tmp,'workspace');fs.mkdirSync(workspace);
  let chatCalls=0,visionCalls=0;
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/v1/huge'){res.statusCode=200;res.setHeader('content-length','2048');return res.end('{}');}
    if(req.url==='/v1/models'){
      res.setHeader('content-type','application/json');return res.end(JSON.stringify({object:'list',data:[{id:'qwen-local-test'}]}));
    }
    if(req.url==='/v1/chat/completions'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;const json=JSON.parse(body||'{}');
      const isVision=Array.isArray(json?.messages?.[1]?.content);
      res.setHeader('content-type','application/json');
      if(isVision){visionCalls++;return res.end(JSON.stringify({model:'qwen-local-test',choices:[{message:{content:JSON.stringify({summary:'A local test image',warnings:[],elements:[{label:'Window',role:'container',confidence:.91}]})}}],usage:{prompt_tokens:10,completion_tokens:10}}));}
      chatCalls++;
      const content={summary:'ابتدا فایل‌های تکراری را بررسی کن و سپس مرتب‌سازی را پیشنهاد بده.',confidence:.93,assumptions:['هیچ حذف دائمی انجام نشود.'],nodes:[{skillId:'skill.file.duplicates',reason:'ابتدا Duplicate قطعی را فقط بخوان.',input:{}},{skillId:'skill.file.organize',reason:'بعد از بررسی، مرتب‌سازی کنترل‌شده.',input:{mode:'type',root:'C:/must-be-stripped',shell:'bad',evil:'drop-me'}}]};
      return res.end(JSON.stringify({model:'qwen-local-test',choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:80}}));
    }
    res.statusCode=404;res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const journal={rows:[],append(type,row){this.rows.push({type,row});}};
  const svc=new LocalAIService(tmp,{journal});
  const settings=svc.updateSettings({enabled:true,baseUrl:`http://127.0.0.1:${port}/v1`,model:'qwen-local-test',allowVision:true,maxPlanNodes:6});
  assert.equal(settings.networkPolicy,'loopback-only');
  assert.equal(settings.storeRawPrompts,false);
  assert.throws(()=>svc.updateSettings({apiKey:'secret'}),e=>e.code==='AI_SECRET_STORAGE_BLOCKED');
  const health=await svc.health();assert.equal(health.ok,true);
  await assert.rejects(()=>svc.plan('test without workspace',{root:''}),e=>e.code==='AI_WORKSPACE_REQUIRED');
  const directProvider=new LocalOpenAIProvider({getConfig:()=>svc.settings()});await assert.rejects(()=>directProvider.request('/huge',{maxResponseBytes:1024}),e=>e.code==='AI_RESPONSE_TOO_LARGE');assert(health.models.includes('qwen-local-test'));
  const plan=await svc.plan('فایل های تکراری رو پیدا کن و بعد مرتب کن',{root:workspace});
  assert.equal(plan.ok,true);assert.equal(plan.goalPlan.steps.length,2);assert.equal(plan.goalPlan.steps[0].skillId,'skill.file.duplicates');
  const organize=plan.goalPlan.steps.find(x=>x.skillId==='skill.file.organize');assert(organize.requiresConfirmation);assert(!('root' in organize.input));assert(!('shell' in organize.input));assert(!('evil' in organize.input));
  assert.equal(plan.missionDag.summary.write,1);assert(plan.token.startsWith('ai-plan-'));assert.equal(chatCalls,1);
  const other=path.join(tmp,'other');fs.mkdirSync(other);assert.throws(()=>svc.consumePlan(plan.token,{root:other}),e=>e.code==='AI_PLAN_ROOT_CHANGED');
  const rec=svc.consumePlan(plan.token,{root:workspace});assert.equal(rec.goalPlan.schemaVersion,'workspace-ai-goal-plan-v1');
  assert.throws(()=>svc.consumePlan(plan.token,{root:workspace}),e=>e.code==='AI_PLAN_TOKEN_INVALID');

  const image=path.join(tmp,'screen.png');fs.writeFileSync(image,Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));
  const vision=await svc.analyzeImageFile(image);assert.equal(vision.ok,true);assert.equal(vision.elements[0].role,'container');assert.equal(visionCalls,1);
  const status=svc.status();assert.equal(status.privacy.rawPromptsStored,false);assert.equal(status.privacy.externalNetworkAllowed,false);assert.equal(status.guard.circuitOpen,false);
  server.close();fs.rmSync(tmp,{recursive:true,force:true});
  console.log('local-ai-foundation-v090.test.cjs PASS',{chatCalls,visionCalls,skills:plan.goalPlan.steps.map(x=>x.skillId)});
})().catch(error=>{console.error(error);process.exit(1)});
