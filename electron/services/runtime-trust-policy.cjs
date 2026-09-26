const path=require('path');
const {pathToFileURL,fileURLToPath}=require('url');
const {keyPath}=require('./windows-path-utils.cjs');

function normalizeHttpOrigin(value=''){
  if(!value)return null;
  try{const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol))return null;return u.origin;}catch{return null;}
}
function rendererTrustPolicy({productionEntry='',devServerUrl=''}={}){
  const prod=productionEntry?path.resolve(String(productionEntry)):'';
  return{schemaVersion:'workspace-renderer-trust-v1',productionEntry:prod,productionHref:prod?pathToFileURL(prod).href:null,devOrigin:normalizeHttpOrigin(devServerUrl)};
}
function sameFileUrl(urlValue,productionEntry){
  if(!productionEntry)return false;
  try{const u=new URL(String(urlValue));if(u.protocol!=='file:')return false;const p=path.resolve(fileURLToPath(u));return keyPath(p)===keyPath(productionEntry);}catch{return false;}
}
function isTrustedRendererUrl(urlValue,policy={}){
  const raw=String(urlValue||'');if(!raw)return false;
  if(policy.productionEntry&&sameFileUrl(raw,policy.productionEntry))return true;
  if(policy.devOrigin){try{const u=new URL(raw);if(['http:','https:'].includes(u.protocol)&&u.origin===policy.devOrigin)return true;}catch{}}
  return false;
}
function senderUrl(event){return String(event?.senderFrame?.url||event?.sender?.getURL?.()||'');}
function trustedSender(event,policy={}){return isTrustedRendererUrl(senderUrl(event),policy);}
function shouldAllowNavigation(urlValue,policy={}){return isTrustedRendererUrl(urlValue,policy);}
module.exports={rendererTrustPolicy,isTrustedRendererUrl,trustedSender,shouldAllowNavigation,senderUrl,normalizeHttpOrigin,sameFileUrl};
