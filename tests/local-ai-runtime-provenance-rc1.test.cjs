const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const {inspectRuntimeProvenance,evaluateRuntimeTrust,normalizeSha256}=require('../electron/services/local-ai-runtime-provenance.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-ai-prov-'));const exe=path.join(dir,'llama-server');fs.writeFileSync(exe,'trusted-runtime-v1');const sha=crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
 const p=await inspectRuntimeProvenance(exe,{platform:'linux'});assert.equal(p.sha256,sha);assert.equal(p.signer.supported,false);
 let t=evaluateRuntimeTrust(p,{runtimeTrustMode:'inspect'},{platform:'linux'});assert.equal(t.allowed,true);assert.equal(t.sha256,sha);
 t=evaluateRuntimeTrust(p,{runtimeTrustMode:'hash-required',runtimeExpectedSha256:sha},{platform:'linux'});assert.equal(t.allowed,true);assert.equal(t.hashMatch,true);
 t=evaluateRuntimeTrust(p,{runtimeTrustMode:'hash-required',runtimeExpectedSha256:'0'.repeat(64)},{platform:'linux'});assert.equal(t.allowed,false);assert.equal(t.code,'AI_RUNTIME_SHA256_MISMATCH');
 t=evaluateRuntimeTrust({...p,signer:{supported:true,valid:true,status:'Valid',thumbprint:'AA11',subject:'CN=Test'}},{runtimeTrustMode:'hash-and-signer-required',runtimeExpectedSha256:sha,runtimeExpectedSignerThumbprint:'AA11'},{platform:'win32'});assert.equal(t.allowed,true);assert.equal(t.code,'AI_RUNTIME_HASH_AND_SIGNER_TRUSTED');
 t=evaluateRuntimeTrust({...p,signer:{supported:true,valid:true,status:'Valid',thumbprint:'BB22'}},{runtimeTrustMode:'hash-and-signer-required',runtimeExpectedSha256:sha,runtimeExpectedSignerThumbprint:'AA11'},{platform:'win32'});assert.equal(t.allowed,false);assert.equal(t.code,'AI_RUNTIME_SIGNER_MISMATCH');
 assert.equal(normalizeSha256(sha.toUpperCase()),sha);
 console.log('local-ai-runtime-provenance-rc1 PASS',{sha256:true,hashPin:true,signerPin:true,failClosed:true});
})().catch(e=>{console.error(e);process.exit(1)});
