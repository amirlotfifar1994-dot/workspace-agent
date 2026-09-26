const crypto = require('crypto');

const ACTION_SCHEMA_VERSION = 'windows-uia-action-v1';
const ALLOWED_ACTIONS = Object.freeze(['focus','invoke','toggle','expand','collapse','scrollIntoView','setValue']);
const ACTION_RISK = Object.freeze({ focus:'interaction', invoke:'write', toggle:'write', expand:'interaction', collapse:'interaction', scrollIntoView:'interaction', setValue:'write' });
const BLOCKED_TARGET_TERMS = Object.freeze([
  'format','erase','factory reset','reset this pc','shutdown','shut down','restart','reboot','uninstall','delete permanently','permanent delete','wipe',
  'purchase','buy now','place order','pay now','confirm payment','transfer money','send money','publish','post publicly','submit application',
  'فرمت','پاک کردن دائمی','حذف دائمی','بازنشانی کارخانه','ریست کارخانه','خاموش کردن','راه‌اندازی مجدد','ری‌استارت','حذف نصب','پرداخت','انتقال وجه','خرید','انتشار عمومی'
]);

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function cleanText(value,max=300){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function cleanControlType(value){return cleanText(value,120).replace(/^ControlType\./i,'');}
function normalizeSelector(input={}){
  const processId=Number(input.processId||0);
  const selector={
    processId:Number.isInteger(processId)&&processId>0?processId:0,
    windowName:cleanText(input.windowName,300),
    windowClassName:cleanText(input.windowClassName,200),
    automationId:cleanText(input.automationId,300),
    name:cleanText(input.name,300),
    className:cleanText(input.className,200),
    controlType:cleanControlType(input.controlType),
    frameworkId:cleanText(input.frameworkId,80),
  };
  return selector;
}
function selectorSpecificity(selector={}){
  const s=normalizeSelector(selector);let score=0;
  if(s.processId)score+=3;if(s.windowName)score+=2;if(s.windowClassName)score+=1;if(s.automationId)score+=5;if(s.name)score+=2;if(s.className)score+=2;if(s.controlType)score+=2;if(s.frameworkId)score+=1;
  return score;
}
function blockedTermsForTarget(target={}){
  const text=[target.name,target.automationId,target.className,target.windowName].map(x=>String(x||'').toLowerCase()).join(' ');
  return BLOCKED_TARGET_TERMS.filter(term=>text.includes(term.toLowerCase()));
}
function allowedActionsForControlType(value='',target={}){const t=cleanControlType(value);const out=['focus'];if(/^(Button|MenuItem|Hyperlink)$/.test(t))out.push('invoke');if(/^(CheckBox|RadioButton|ToggleButton)$/.test(t))out.push('toggle');if(/^(ComboBox|TreeItem)$/.test(t))out.push('expand','collapse');if(/^(Edit|Document)$/.test(t))out.push('setValue');if(target.canScrollIntoView)out.push('scrollIntoView');return [...new Set(out)];}
function validateActionRequest(input={}){
  const action=cleanText(input.action,40);
  if(!ALLOWED_ACTIONS.includes(action))return{ok:false,code:'UIA_ACTION_NOT_ALLOWED',message:'Action خارج از allowlist امن UI Automation است.'};
  const selector=normalizeSelector(input.selector||input);
  if(selectorSpecificity(selector)<5)return{ok:false,code:'UIA_SELECTOR_TOO_BROAD',message:'Selector برای اجرای امن کافی نیست؛ Process/AutomationId/Name/ControlType را دقیق‌تر مشخص کنید.',selector};
  if(action==='setValue'){
    if(input.sensitive===true)return{ok:false,code:'UIA_SENSITIVE_VALUE_BLOCKED',message:'ورود Password/Secret توسط Action Layer این نسخه ممنوع است.'};
    const value=String(input.value??'');
    if(value.length>2048)return{ok:false,code:'UIA_VALUE_TOO_LONG',message:'Value بیش از سقف ۲۰۴۸ کاراکتر است.'};
  }
  return{ok:true,action,selector,value:action==='setValue'?String(input.value??''):undefined,risk:ACTION_RISK[action],sensitive:false};
}
function targetIdentity(target={}){
  return{
    processId:Number(target.processId||0),windowName:cleanText(target.windowName||target.window?.name,300),windowClassName:cleanText(target.windowClassName||target.window?.className,200),
    automationId:cleanText(target.automationId,300),name:cleanText(target.name,300),className:cleanText(target.className,200),controlType:cleanControlType(target.controlType),frameworkId:cleanText(target.frameworkId,80),
    runtimeId:Array.isArray(target.runtimeId)?target.runtimeId.map(Number).filter(Number.isFinite).slice(0,32):[],isEnabled:Boolean(target.isEnabled),isOffscreen:Boolean(target.isOffscreen),isPassword:Boolean(target.isPassword),canScrollIntoView:Boolean(target.canScrollIntoView)
  };
}
function buildActionPlan(request,target={}){
  const validated=validateActionRequest(request);if(!validated.ok)return validated;
  const identity=targetIdentity(target);const blockedTerms=blockedTermsForTarget(identity);
  const compatibleActions=allowedActionsForControlType(identity.controlType,identity);if(!compatibleActions.includes(validated.action))return{ok:false,code:'UIA_ACTION_CONTROL_MISMATCH',message:'Action انتخاب‌شده با ControlType هدف سازگار نیست.',allowedActions:compatibleActions,controlType:identity.controlType};
  if(identity.isPassword)return{ok:false,code:'UIA_PASSWORD_CONTROL_BLOCKED',message:'کنترل Password برای Value/Invoke خودکار مجاز نیست.'};
  if(!identity.isEnabled)return{ok:false,code:'UIA_TARGET_DISABLED',message:'کنترل هدف Disabled است.'};
  if(identity.isOffscreen&&!['focus','scrollIntoView'].includes(validated.action))return{ok:false,code:'UIA_TARGET_OFFSCREEN',message:'کنترل هدف Offscreen است؛ ابتدا scrollIntoView را اجرا کنید.'};
  if(validated.action==='scrollIntoView'&&!identity.canScrollIntoView)return{ok:false,code:'UIA_SCROLL_PATTERN_UNAVAILABLE',message:'کنترل هدف ScrollItemPattern ندارد.'};
  if(blockedTerms.length)return{ok:false,code:'UIA_HIGH_IMPACT_TARGET_BLOCKED',message:'هدف UI دارای نشانه عملیات پرریسک است و در Action Layer پایه مسدود است.',blockedTerms};
  const core={schemaVersion:ACTION_SCHEMA_VERSION,action:validated.action,risk:validated.risk,selector:validated.selector,target:identity,valueHash:validated.action==='setValue'?hash(validated.value):null,valueLength:validated.action==='setValue'?validated.value.length:0,policy:{coordinateClick:false,globalKeyboard:false,shell:false,passwordWrite:false,highImpactBlocked:true,confirmationRequired:true,verifyAfterAction:true}};
  return{ok:true,plan:{...core,planHash:hash(core)},value:validated.value};
}
function verifyTargetPinned(plan,target={}){
  if(!plan?.target)return{ok:false,code:'UIA_PLAN_TARGET_MISSING'};
  const before=plan.target,after=targetIdentity(target);const fields=['processId','automationId','name','className','controlType','frameworkId','windowName'];
  const mismatches=fields.filter(k=>String(before[k]??'')!==String(after[k]??''));
  if(before.runtimeId?.length&&after.runtimeId?.length&&JSON.stringify(before.runtimeId)!==JSON.stringify(after.runtimeId))mismatches.push('runtimeId');
  return mismatches.length?{ok:false,code:'UIA_TARGET_CHANGED',mismatches,before,after}:{ok:true,target:after};
}
function redactedRequest(input={}){
  const v=validateActionRequest(input);if(!v.ok)return v;
  return{ok:true,action:v.action,selector:v.selector,risk:v.risk,valueLength:v.action==='setValue'?v.value.length:0,valueHash:v.action==='setValue'?hash(v.value):null};
}
module.exports={ACTION_SCHEMA_VERSION,ALLOWED_ACTIONS,ACTION_RISK,BLOCKED_TARGET_TERMS,hash,normalizeSelector,selectorSpecificity,blockedTermsForTarget,allowedActionsForControlType,validateActionRequest,targetIdentity,buildActionPlan,verifyTargetPinned,redactedRequest};
