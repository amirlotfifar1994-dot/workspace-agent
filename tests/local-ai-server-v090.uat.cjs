const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const {LocalAIService}=require('../electron/services/local-ai-service.cjs');
(async()=>{
 const baseUrl=String(process.env.WA_LOCAL_AI_BASE_URL||'').trim();const model=String(process.env.WA_LOCAL_AI_MODEL||'').trim();
 if(!baseUrl||!model){console.log('local-ai-server-v090.uat.cjs SKIP (set WA_LOCAL_AI_BASE_URL + WA_LOCAL_AI_MODEL)');return;}
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'wa-local-ai-uat-state-'));const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'wa-local-ai-uat-ws-'));fs.writeFileSync(path.join(workspace,'uat-note.txt'),'workspace agent local ai uat','utf8');
 const svc=new LocalAIService(state);svc.updateSettings({enabled:true,baseUrl,model,allowVision:Boolean(process.env.WA_LOCAL_AI_VISION_FILE)});
 const health=await svc.health();assert.equal(health.ok,true,health.message||health.code);
 const plan=await svc.plan('این Workspace را اول فقط بررسی کن و یک برنامه کوتاه و امن پیشنهاد بده. هیچ حذف دائمی نکن.',{root:workspace});assert.equal(plan.ok,true);assert(plan.goalPlan.steps.length>0);assert(plan.goalPlan.steps.every(x=>x.skillId&&x.type));assert(plan.goalPlan.steps.filter(x=>x.requiresConfirmation).every(x=>x.requiresConfirmation===true));
 let vision=null;const vf=String(process.env.WA_LOCAL_AI_VISION_FILE||'').trim();if(vf){vision=await svc.analyzeImageFile(vf);assert.equal(vision.ok,true);}
 console.log('local-ai-server-v090.uat.cjs PASS',{model:plan.model,latencyMs:plan.latencyMs,nodes:plan.goalPlan.steps.length,writes:plan.goalPlan.steps.filter(x=>x.requiresConfirmation).length,vision:Boolean(vision)});
 fs.rmSync(state,{recursive:true,force:true});fs.rmSync(workspace,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
