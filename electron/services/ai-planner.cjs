const {skillById}=require('./skill-registry.cjs');
const {compileMissionPlan,verifyDag}=require('./mission-compiler.cjs');
const {retrieveSkills}=require('./skill-retriever.cjs');
const {redactText,safeBasename,hashText}=require('./ai-redaction.cjs');

function schemaFor(skills,maxNodes=12){
  return {
    type:'object',
    additionalProperties:false,
    required:['summary','confidence','assumptions','nodes'],
    properties:{
      summary:{type:'string',maxLength:500},
      confidence:{type:'number',minimum:0,maximum:1},
      assumptions:{type:'array',maxItems:8,items:{type:'string',maxLength:220}},
      nodes:{
        type:'array',minItems:1,maxItems:maxNodes,
        items:{
          type:'object',additionalProperties:false,required:['skillId','reason','input'],
          properties:{
            skillId:{type:'string',enum:skills.map(x=>x.id)},
            reason:{type:'string',maxLength:320},
            input:{type:'object',additionalProperties:true}
          }
        }
      }
    }
  };
}
const FORBIDDEN_INPUT_KEYS=/^(root|path|source|destination|target|command|shell|script|powershell|cmd|executable|url|password|secret|token|api.?key|__proto__|prototype|constructor)$/i;
const SAFE_INPUT_KEYS=new Set(['query','extension','category','minSize','maxSize','olderThanDays','mode','resume','includeLowRiskJunk','includeEmptyFolders','includeZeroByte','find','replace','prefix','suffix','sequence','threshold','maxGroups','minConfidence','deep','relativePath','limit']);
function safeInput(input={}){if(!input||typeof input!=='object'||Array.isArray(input))return{};const out=Object.create(null);for(const [k,v] of Object.entries(input).slice(0,30)){if(FORBIDDEN_INPUT_KEYS.test(k)||!SAFE_INPUT_KEYS.has(k))continue;if(typeof v==='string')out[k]=redactText(v,500);else if(typeof v==='number'||typeof v==='boolean'||v===null)out[k]=v;else if(Array.isArray(v))out[k]=v.slice(0,20).filter(x=>['string','number','boolean'].includes(typeof x)).map(x=>typeof x==='string'?redactText(x,200):x);}return out;}
function validateAiResult(raw,{candidates,maxNodes=12}={}){if(!raw||typeof raw!=='object')throw Object.assign(new Error('AI plan object نامعتبر است.'),{code:'AI_PLAN_INVALID'});const allowed=new Set(candidates.map(x=>x.id));const nodes=Array.isArray(raw.nodes)?raw.nodes:[];if(!nodes.length||nodes.length>maxNodes)throw Object.assign(new Error('تعداد گام‌های AI plan نامعتبر است.'),{code:'AI_PLAN_NODE_LIMIT'});const seen=new Set();const steps=[];for(const n of nodes){const skill=skillById(n?.skillId);if(!skill||!allowed.has(skill.id)||skill.interactiveOnly)throw Object.assign(new Error(`Skill غیرمجاز در AI plan: ${n?.skillId||'-'}`),{code:'AI_PLAN_SKILL_BLOCKED'});const sig=`${skill.id}:${JSON.stringify(safeInput(n.input))}`;if(seen.has(sig))continue;seen.add(sig);steps.push({id:`ai-step-${steps.length+1}`,skillId:skill.id,type:skill.cycleType,label:skill.title,input:safeInput(n.input),reason:redactText(n.reason||'',320),requiresConfirmation:Boolean(skill.confirmation)});}if(!steps.length)throw Object.assign(new Error('AI plan پس از validation خالی شد.'),{code:'AI_PLAN_EMPTY'});steps.sort((a,b)=>Number(a.requiresConfirmation)-Number(b.requiresConfirmation));const goalPlan={schemaVersion:'workspace-ai-goal-plan-v1',commandHash:null,text:'[LOCAL_AI_REDACTED_COMMAND]',confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0)),confidenceBand:Number(raw.confidence)>=.9?'high':Number(raw.confidence)>=.7?'medium':'low',constraints:{noArbitraryShell:true,writeRequiresConfirmation:true,interactiveSkillsBlocked:true},notes:(raw.assumptions||[]).slice(0,8).map(x=>redactText(x,220)),blocked:[],steps,summary:redactText(raw.summary||`${steps.length} گام توسط Local AI پیشنهاد شد.`,500)};const dag=compileMissionPlan(goalPlan,{maxNodes,maxWallTimeMs:30*60*1000});const check=verifyDag(dag);if(!check.ok)throw Object.assign(new Error('AI Mission DAG معتبر نیست.'),{code:check.code});return{goalPlan,dag};}
class AIPlanner{
 constructor({provider,guard,memory,journal=null,getConfig}={}){this.provider=provider;this.guard=guard;this.memory=memory;this.journal=journal;this.getConfig=getConfig;}
 async plan(command,{root=''}={}){const cfg=this.getConfig();const clean=redactText(command,6000);if(clean.trim().length<3)throw Object.assign(new Error('فرمان برای AI plan خیلی کوتاه است.'),{code:'AI_COMMAND_TOO_SHORT'});const candidates=retrieveSkills(clean,{limit:Math.min(14,Math.max(6,cfg.maxPlanNodes+2)),memory:this.memory});if(!candidates.length)throw Object.assign(new Error('Skill مناسبی برای فرمان پیدا نشد.'),{code:'AI_NO_SKILLS'});const skillText=candidates.map(s=>`- ${s.id} | ${s.title} | risk=${s.risk} | confirm=${s.confirmation} | cycle=${s.cycleType}`).join('\n');const system=`You are the LOCAL planner for a Windows workspace agent. You NEVER execute tools. You may ONLY choose skillId values listed by the application. Never invent shell commands, paths, URLs, executables, UI clicks, registry edits, deletion, or credentials. Prefer read-only discovery before write skills. Write skills are only proposals; the application enforces a separate user confirmation. Do not include root/path/source/destination in input. Return only schema-valid JSON.`;const user=`User command (redacted):\n${clean}\n\nWorkspace label only: ${safeBasename(root)||'(none)'}\n\nAllowed skills:\n${skillText}\n\nCreate the smallest safe plan that satisfies the command.`;const promptChars=system.length+user.length;const ticket=this.guard.begin({promptChars,kind:'plan'});try{const out=await this.provider.chatJson({messages:[{role:'system',content:system},{role:'user',content:user}],schema:schemaFor(candidates,cfg.maxPlanNodes),kind:'plan'});const checked=validateAiResult(out.parsed,{candidates,maxNodes:cfg.maxPlanNodes});checked.goalPlan.commandHash=hashText(command);this.guard.success(ticket,{latencyMs:out.latencyMs});this.journal?.append('AI_PLAN_VALIDATED',{payload:{commandHash:checked.goalPlan.commandHash.slice(0,16),skills:checked.goalPlan.steps.map(x=>x.skillId),writes:checked.goalPlan.steps.filter(x=>x.requiresConfirmation).length,confidence:checked.goalPlan.confidence,model:out.model,latencyMs:out.latencyMs}});return{ok:true,source:'local-ai',model:out.model,latencyMs:out.latencyMs,usage:out.usage||null,goalPlan:checked.goalPlan,missionDag:checked.dag,candidates:candidates.map(x=>({id:x.id,title:x.title,risk:x.risk,confirmation:x.confirmation,score:x.score}))};}catch(error){this.guard.failure(ticket,error);throw error;}}
}
module.exports={AIPlanner,schemaFor,validateAiResult,safeInput,SAFE_INPUT_KEYS};
