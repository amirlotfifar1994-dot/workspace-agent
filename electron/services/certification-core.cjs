const crypto=require('crypto');

const STATUS=new Set(['PASS','FAIL','INCOMPLETE','SKIP','PENDING_MANUAL']);
function normalizeStatus(value){const v=String(value||'').toUpperCase();return STATUS.has(v)?v:'FAIL';}
function classifyGate({exitCode=0,output='',required=true,explicitStatus=''}={}){
  if(explicitStatus){const s=normalizeStatus(explicitStatus);if(required&&s==='SKIP')return'INCOMPLETE';return s;}
  const text=String(output||'');
  const skip=/\bSKIP\b|PREREQ(?:UISITE)?_MISSING|PENDING_ENV|PENDING_WINDOWS/i.test(text);
  if(Number(exitCode)===0){if(skip)return required?'INCOMPLETE':'SKIP';return'PASS';}
  if(Number(exitCode)===3)return required?'INCOMPLETE':'SKIP';
  return'FAIL';
}
function overallStatus(gates=[]){
  const required=(Array.isArray(gates)?gates:[]).filter(g=>g&&g.required!==false);
  if(required.some(g=>normalizeStatus(g.status)==='FAIL'))return'FAIL';
  if(required.some(g=>['INCOMPLETE','SKIP','PENDING_MANUAL'].includes(normalizeStatus(g.status))))return'INCOMPLETE';
  return'PASS';
}
function safeGate({name,status,required=true,exitCode=0,detail=null,log=''}){return{name:String(name||''),status:normalizeStatus(status),required:Boolean(required),exitCode:Number(exitCode)||0,detail:detail??null,log:String(log||'')};}
function evidenceId(report={}){const clone=JSON.parse(JSON.stringify(report));delete clone.evidenceId;return crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');}
function summarize(gates=[]){const out={PASS:0,FAIL:0,INCOMPLETE:0,SKIP:0,PENDING_MANUAL:0};for(const g of gates){const s=normalizeStatus(g?.status);out[s]=(out[s]||0)+1;}return out;}
module.exports={STATUS,normalizeStatus,classifyGate,overallStatus,safeGate,evidenceId,summarize};
