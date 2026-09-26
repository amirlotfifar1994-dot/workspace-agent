const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {atomicWriteJsonSync,atomicWriteJson,atomicWriteBuffer,appendLineDurableSync}=require('../electron/services/durable-state.cjs');
;(async()=>{
const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-durable-state-'));
const file=path.join(base,'nested','state.json');
for(let i=0;i<20;i++){atomicWriteJsonSync(file,{schemaVersion:'t',i,payload:'x'.repeat(i)});const parsed=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(parsed.i,i);}
assert.equal(fs.readdirSync(path.dirname(file)).some(x=>x.endsWith('.tmp')),false,'no temp file should remain after successful commit');
const log=path.join(base,'log','a.ndjson');appendLineDurableSync(log,'one\n');appendLineDurableSync(log,'two\n');assert.equal(fs.readFileSync(log,'utf8'),'one\ntwo\n');
const asyncFile=path.join(base,'async','state.json');await atomicWriteJson(asyncFile,{ok:true,n:7});assert.deepEqual(JSON.parse(fs.readFileSync(asyncFile,'utf8')),{ok:true,n:7});const bin=path.join(base,'async','blob.bin');await atomicWriteBuffer(bin,Buffer.from([1,2,3,4]));assert.deepEqual([...fs.readFileSync(bin)],[1,2,3,4]);
console.log('durable-state-rc1 PASS');
})().catch(e=>{console.error(e);process.exit(1)});
