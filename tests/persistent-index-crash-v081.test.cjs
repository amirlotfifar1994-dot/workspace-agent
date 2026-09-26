const assert=require('assert');const os=require('os');const path=require('path');const fs=require('fs');const fsp=fs.promises;const {fork}=require('child_process');const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-crash-v081-'));const root=path.join(base,'workspace');await fsp.mkdir(root);
 const dirs=80,perDir=35;for(let d=0;d<dirs;d++){const dir=path.join(root,`dir-${d}`);await fsp.mkdir(dir);for(let i=0;i<perDir;i++)await fsp.writeFile(path.join(dir,`file-${i}.txt`),`crash-${d}-${i}-${'x'.repeat(64)}`);}
 const child=fork(path.join(__dirname,'fixtures','persistent-index-crash-child-v081.cjs'),[base,root],{stdio:['ignore','ignore','ignore','ipc']});
 const outcome=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{try{child.kill('SIGKILL')}catch{}reject(new Error('crash child timeout'));},10000);child.on('message',msg=>{if(msg?.type==='kill-now'){clearTimeout(timer);child.kill('SIGKILL');resolve('killed');}else if(msg?.type==='finished'){clearTimeout(timer);resolve('finished');}else if(msg?.type==='error'){clearTimeout(timer);reject(new Error(msg.error));}});child.on('error',reject);});
 assert.strictEqual(outcome,'killed','fixture باید وسط اسکن kill شود');await new Promise(r=>child.once('exit',r));
 const index=new PersistentFileIndex(base);let st=await index.status(root);assert(['scanning','paused','failed'].includes(st.status));assert(st.queue>0,'queue باید بعد از crash برای resume باقی بماند');let loops=0;while(st.status!=='completed'&&loops++<20)st=await index.scan(root,{resume:true,maxDirsSession:50,dbBatchSize:100});assert.strictEqual(st.status,'completed');assert.strictEqual(st.files,dirs*perDir);assert.strictEqual(index.health().ok,true);index.close();await fsp.rm(base,{recursive:true,force:true});
 console.log('persistent-index-crash-v081.test.cjs PASS',{resumedFiles:st.files,loops});
})().catch(e=>{console.error(e);process.exit(1)});
