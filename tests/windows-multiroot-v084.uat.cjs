const fs=require('fs');
const os=require('os');
const path=require('path');
const assert=require('assert');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
if(process.platform!=='win32'){console.log('SKIP windows multi-root UAT v0.8.4 (Windows only)');process.exit(0)}
const baseA=process.env.WA_CERT_ROOT_A||'',baseB=process.env.WA_CERT_ROOT_B||'';
if(!baseA||!baseB){console.log('SKIP windows multi-root UAT v0.8.4 (set WA_CERT_ROOT_A and WA_CERT_ROOT_B to two writable test locations, ideally separate volumes)');process.exit(0)}
const id=`wa-cert-${Date.now()}`,a=path.join(baseA,id+'-A'),b=path.join(baseB,id+'-B'),db=fs.mkdtempSync(path.join(os.tmpdir(),'wa-multi-index-'));
(async()=>{try{fs.mkdirSync(a,{recursive:true});fs.mkdirSync(b,{recursive:true});for(let i=0;i<300;i++){fs.writeFileSync(path.join(a,`a-${i}.txt`),`A-${i}`);fs.writeFileSync(path.join(b,`b-${i}.txt`),`B-${i}`)}const index=new PersistentFileIndex(db);await Promise.all([index.scan(a,{maxWallTimeMs:60000}),index.scan(b,{maxWallTimeMs:60000})]);const sa=await index.status(a),sb=await index.status(b);assert.equal(sa.status,'completed');assert.equal(sb.status,'completed');assert.equal(sa.files,300);assert.equal(sb.files,300);index.setRootRuntime(a,{available:false,status:'unavailable',identityKey:'volume:test-A'});const paused=await index.scan(a,{resume:false,maxWallTimeMs:3000});assert.equal(paused.status,'paused');const stillB=await index.status(b);assert.equal(stillB.status,'completed');assert.equal(stillB.files,300);const health=index.health({deep:true});assert.equal(health.ok,true);index.close();console.log('PASS windows multi-root UAT v0.8.4');}finally{try{fs.rmSync(a,{recursive:true,force:true})}catch{}try{fs.rmSync(b,{recursive:true,force:true})}catch{}try{fs.rmSync(db,{recursive:true,force:true})}catch{}}})().catch(e=>{console.error(e);process.exit(1)});
