const fs=require('fs');
const path=require('path');
const {inspectRuntimeProvenance,evaluateRuntimeTrust,normalizeSha256,normalizeThumbprint}=require('../electron/services/local-ai-runtime-provenance.cjs');
function finish(status,detail={},code=status==='PASS'?0:status==='INCOMPLETE'?3:1){const out={schemaVersion:'workspace-windows-local-ai-provenance-uat-v1',createdAt:new Date().toISOString(),platform:process.platform,status,...detail};const file=process.env.WA_CERT_LOCAL_AI_PROVENANCE_RESULT;if(file){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(path.resolve(file),JSON.stringify(out,null,2));}console.log(JSON.stringify(out,null,2));process.exit(code);}
(async()=>{
 const strict=process.env.WA_CERT_STRICT==='1';if(process.platform!=='win32')return finish(strict?'INCOMPLETE':'SKIP',{code:'WINDOWS_REQUIRED'},strict?3:0);
 const file=String(process.env.WA_LLAMA_SERVER_PATH||'').trim(),expectedSha=normalizeSha256(process.env.WA_LLAMA_SERVER_EXPECTED_SHA256||''),expectedSigner=normalizeThumbprint(process.env.WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT||'');
 if(!file||!expectedSha)return finish('INCOMPLETE',{code:'LOCAL_AI_PROVENANCE_INPUT_REQUIRED',required:['WA_LLAMA_SERVER_PATH','WA_LLAMA_SERVER_EXPECTED_SHA256'],optional:['WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT']},3);
 if(path.basename(file).toLowerCase()!=='llama-server.exe'||!fs.existsSync(file)||!fs.statSync(file).isFile())return finish('FAIL',{code:'LLAMA_SERVER_EXE_INVALID',file:path.basename(file)},1);
 const provenance=await inspectRuntimeProvenance(file,{platform:'win32'});const mode=expectedSigner?'hash-and-signer-required':'hash-required';const trust=evaluateRuntimeTrust(provenance,{runtimeTrustMode:mode,runtimeExpectedSha256:expectedSha,runtimeExpectedSignerThumbprint:expectedSigner},{platform:'win32'});
 const negative=evaluateRuntimeTrust(provenance,{runtimeTrustMode:'hash-required',runtimeExpectedSha256:'0'.repeat(64)},{platform:'win32'});
 if(!trust.allowed||negative.allowed)return finish('FAIL',{code:!trust.allowed?trust.code:'NEGATIVE_HASH_PIN_DID_NOT_BLOCK',trust,negative,provenance:{sha256:provenance.sha256,signer:provenance.signer}},1);
 return finish('PASS',{code:'LOCAL_AI_RUNTIME_PROVENANCE_VERIFIED',fileName:path.basename(file),trust,negativeHashPinBlocked:true,provenance:{sha256:provenance.sha256,signer:provenance.signer}},0);
})().catch(error=>finish('FAIL',{code:error.code||'LOCAL_AI_PROVENANCE_UAT_FAILED',message:String(error.message||error).slice(0,800)},1));
