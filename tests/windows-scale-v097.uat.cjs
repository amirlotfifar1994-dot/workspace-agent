const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {probeVolume}=require('../electron/services/windows-volume-probe.cjs');
function prereq(msg){console.log(`windows-scale-v097.uat.cjs SKIP (${msg})`);if(process.env.WA_CERT_STRICT==='1')process.exit(3);process.exit(0);}
(async()=>{
 if(process.platform!=='win32')prereq('Windows only');const baseRoot=String(process.env.WA_CERT_SCALE_ROOT||process.env.WA_CERT_ROOT_A||'').trim();if(!baseRoot)prereq('set WA_CERT_SCALE_ROOT or WA_CERT_ROOT_A');
 const vol=await probeVolume(baseRoot);assert(vol.available);assert.equal(String(vol.volume?.fileSystem).toUpperCase(),'NTFS','scale root must be NTFS');
 const requested=Number(process.env.WA_CERT_SCALE_FILES||100000),count=Math.max(10000,Math.min(1000000,Number.isFinite(requested)?requested:100000));const maxMinutes=Math.max(5,Math.min(120,Number(process.env.WA_CERT_SCALE_MAX_MINUTES||45)));
 const id=`wa-v097-scale-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,root=path.join(baseRoot,id,'files'),state=path.join(baseRoot,id,'state');let index;await fsp.mkdir(root,{recursive:true});
 try{const started=Date.now(),perDir=1000;let written=0;for(let d=0;written<count;d++){const dir=path.join(root,`d-${String(d).padStart(5,'0')}`);await fsp.mkdir(dir);let batch=[];for(let i=0;i<perDir&&written<count;i++,written++){batch.push(fsp.writeFile(path.join(dir,`f-${String(written).padStart(8,'0')}.txt`),written%10000===0?'duplicate-marker':String(written)));if(batch.length>=64){await Promise.all(batch);batch=[];}}if(batch.length)await Promise.all(batch);if(Date.now()-started>maxMinutes*60000)throw Object.assign(new Error('scale fixture creation exceeded time budget'),{code:'CERT_SCALE_TIME_BUDGET'});}
   const buildMs=Date.now()-started;index=new PersistentFileIndex(state);const scanAt=Date.now();let st=await index.scan(root,{resume:false,maxWallTimeMs:10*60*1000,dbBatchSize:1000});let resumes=0;while(st.status!=='completed'){if(++resumes>200)throw new Error('scale resume runaway');st=await index.scan(root,{resume:true,maxWallTimeMs:10*60*1000,dbBatchSize:1000});}const scanMs=Date.now()-scanAt;assert.equal(st.files,count);const qAt=Date.now();const q=index.search({root,query:'f-000',limit:200}),queryMs=Date.now()-qAt;assert(q.total>0);const health=index.health({deep:true});assert(health.ok);const mem=process.memoryUsage();const report={schemaVersion:'workspace-agent-windows-scale-v097-v1',status:'PASS',files:count,fixtureMs:buildMs,scanMs,queryMs,resumes,rssMB:Math.round(mem.rss/1048576),heapMB:Math.round(mem.heapUsed/1048576),dbBytes:health.dbBytes,volumeUniqueId:vol.volume?.uniqueId||'',fileSystem:vol.volume?.fileSystem||''};if(process.env.WA_CERT_RESULT)await fsp.writeFile(path.resolve(process.env.WA_CERT_RESULT),JSON.stringify(report,null,2));console.log('windows-scale-v097.uat.cjs PASS',report);
 }finally{index?.close();await fsp.rm(path.join(baseRoot,id),{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1)});
