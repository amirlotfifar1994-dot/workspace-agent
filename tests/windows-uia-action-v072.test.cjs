const assert=require('assert');const os=require('os');const fs=require('fs');const path=require('path');
const {validateActionRequest,buildActionPlan,verifyTargetPinned,selectorSpecificity}=require('../electron/services/windows-action-policy.cjs');
const {WindowsActionSessionStore}=require('../electron/services/windows-action-session-store.cjs');
const {listSkills,validateSkillStep}=require('../electron/services/skill-registry.cjs');
const {windowsUiActionCycle}=require('../electron/services/workspace-cycles.cjs');
const {CycleStore}=require('../electron/services/cycle-store.cjs');const {CycleEngine}=require('../electron/services/cycle-engine.cjs');

const selector={processId:4242,windowName:'Demo App',automationId:'saveButton',name:'Save',className:'Button',controlType:'Button',frameworkId:'WPF'};
const target={...selector,windowClassName:'DemoWindow',runtimeId:[42,7,9],isEnabled:true,isOffscreen:false,isPassword:false};
(async()=>{
  const valid=validateActionRequest({action:'invoke',selector});assert.equal(valid.ok,true);assert.ok(selectorSpecificity(selector)>=5);
  assert.equal(validateActionRequest({action:'coordinateClick',selector}).ok,false);
  assert.equal(validateActionRequest({action:'invoke',selector:{name:'Save'}}).code,'UIA_SELECTOR_TOO_BROAD');
  assert.equal(validateActionRequest({action:'setValue',selector,value:'secret',sensitive:true}).code,'UIA_SENSITIVE_VALUE_BLOCKED');

  const built=buildActionPlan({action:'invoke',selector},target);assert.equal(built.ok,true);assert.equal(built.plan.policy.coordinateClick,false);assert.equal(built.plan.policy.globalKeyboard,false);assert.ok(built.plan.planHash.length===64);
  assert.equal(verifyTargetPinned(built.plan,target).ok,true);
  assert.equal(verifyTargetPinned(built.plan,{...target,runtimeId:[1,2,3]}).code,'UIA_TARGET_CHANGED');
  assert.equal(buildActionPlan({action:'invoke',selector:{...selector,name:'Delete permanently'}},{...target,name:'Delete permanently'}).code,'UIA_HIGH_IMPACT_TARGET_BLOCKED');
  assert.equal(buildActionPlan({action:'setValue',selector:{...selector,automationId:'password',name:'Password',controlType:'Edit'}},{...target,automationId:'password',name:'Password',controlType:'Edit',isPassword:true}).code,'UIA_PASSWORD_CONTROL_BLOCKED');

  const interactive=listSkills().find(x=>x.cycleType==='windows-ui-action');assert.ok(interactive);assert.equal(interactive.interactiveOnly,true);assert.equal(validateSkillStep({type:'windows-ui-action'}).code,'SKILL_INTERACTIVE_ONLY');

  const sessions=new WindowsActionSessionStore({ttlMs:60000});const rawValue='ordinary non-secret text';const created=sessions.create({action:'setValue',selector:{...selector,automationId:'titleEdit',name:'Title',controlType:'Edit'},value:rawValue});assert.equal(created.ok,true);assert.ok(!JSON.stringify(created).includes(rawValue));assert.equal(sessions.get(created.token).value,rawValue);

  const actionTarget={...target,automationId:'titleEdit',name:'Title',controlType:'Edit'};
  const planResult=buildActionPlan({action:'setValue',selector:{...selector,automationId:'titleEdit',name:'Title',controlType:'Edit'},value:rawValue},actionTarget);assert.equal(planResult.ok,true);
  const prepareAction=async()=>({supported:true,ok:true,plan:planResult.plan,target:actionTarget});
  let executed=0;const executeAction=async(plan,value)=>{executed++;assert.equal(plan.planHash,planResult.plan.planHash);assert.equal(value,rawValue);return{supported:true,ok:true,code:'UIA_ACTION_VERIFIED',verification:{ok:true,mode:'value-equality',detail:'Value verified'},before:actionTarget,after:actionTarget};};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-uia-v072-'));const store=new CycleStore(dir);const engine=new CycleEngine({store,maxIterations:6});engine.register('windows-ui-action',windowsUiActionCycle({sessionStore:sessions,prepareAction,executeAction}));
  let c=engine.create('windows-ui-action',{sessionToken:created.token,action:'setValue',selector:created.redacted.selector,valueHash:created.redacted.valueHash,valueLength:created.redacted.valueLength});c=await engine.run(c.id);assert.equal(c.status,'waiting-confirmation');assert.equal(c.actionPlan.planHash,planResult.plan.planHash);assert.ok(!JSON.stringify(c).includes(rawValue),'raw setValue must not persist in cycle');
  c=await engine.confirm(c.id,'approve');assert.equal(c.status,'completed');assert.equal(executed,1);assert.equal(c.result.execution.verification.ok,true);assert.equal(sessions.get(created.token),null);

  const rejectSession=sessions.create({action:'invoke',selector});const rejectPlan=buildActionPlan({action:'invoke',selector},target);const prepareInvoke=async()=>({supported:true,ok:true,plan:rejectPlan.plan,target});engine.register('uia-reject-demo',windowsUiActionCycle({sessionStore:sessions,prepareAction:prepareInvoke,executeAction:async()=>{throw new Error('must not execute')}}));let r=engine.create('uia-reject-demo',{sessionToken:rejectSession.token,action:'invoke',selector:rejectSession.redacted.selector});r=await engine.run(r.id);assert.equal(r.status,'waiting-confirmation');r=await engine.confirm(r.id,'reject');assert.equal(r.status,'cancelled');assert.equal(sessions.get(rejectSession.token),null);

  console.log('windows-uia-action-v072.test: OK',{planHash:built.plan.planHash.slice(0,12),interactiveSkill:interactive.id,executed});
})().catch(e=>{console.error(e);process.exit(1)});
