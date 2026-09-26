const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');

(async()=>{
 if(process.platform!=='win32'){console.log('windows-scale-resilience-v083.uat.cjs SKIP (Windows only)');return;}
 const requested=Number(process.env.WA_SCALE_FILES||100000);const count=Math.max(10000,Math.min(1000000,Number.isFinite(requested)?requested:100000));
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-scale-state-'));const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-scale-root-'));let index;
 try{
  const perDir=1000,dirs=Math.ceil(count/perDir);const buildStart=Date.now();let written=0;
  for(let d=0;d<dirs;d++){const dir=path.join(root,`d-${String(d).padStart(5,'0')}`);await fsp.mkdir(dir);const jobs=[];for(let i=0;i<perDir&&written<count;i++,written++){jobs.push(fsp.writeFile(path.join(dir,`file-${String(written).padStart(8,'0')}.txt`),written%5000===0?'duplicate-marker':String(written)));if(jobs.length>=64){await Promise.all(jobs.splice(0));}}if(jobs.length)await Promise.all(jobs);}
  index=new PersistentFileIndex(base);const scanStart=Date.now();let st=await index.scan(root,{resume:false,maxWallTimeMs:15*60*1000,dbBatchSize:1000});let resumes=0;while(st.status!=='completed'){resumes+=1;assert(resumes<100,'scan resume loop runaway');st=await index.scan(root,{resume:true,maxWallTimeMs:15*60*1000,dbBatchSize:1000});}
  assert.strictEqual(st.files,count);const qStart=Date.now();const q=index.search({root,query:'file-000',limit:200});const queryMs=Date.now()-qStart;assert(q.total>0);const mem=process.memoryUsage();assert.strictEqual(index.health().ok,true);
  console.log('windows-scale-resilience-v083.uat.cjs PASS',{files:count,buildMs:Date.now()-buildStart,scanMs:Date.now()-scanStart,queryMs,rssMB:Math.round(mem.rss/1048576),heapMB:Math.round(mem.heapUsed/1048576),resumes,dbBytes:index.health().dbBytes});
 }finally{index?.close();await fsp.rm(base,{recursive:true,force:true});await fsp.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
