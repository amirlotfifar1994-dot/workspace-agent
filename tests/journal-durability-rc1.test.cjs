const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {EventJournal}=require('../electron/services/event-journal.cjs');

const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-journal-durable-'));
let j=new EventJournal(base,{maxBytes:420});
for(let i=0;i<40;i++)j.append('ROTATION_TEST',{payload:{i,text:'x'.repeat(80)}});
let v=j.verify();
assert.equal(v.ok,true);assert.equal(v.continuity,'full');assert(v.segments>=2,'rotation must create archived segments');assert.equal(v.count,40);assert.equal(j.list({limit:100}).length,40);
const archives=fs.readdirSync(path.join(base,'journal')).filter(x=>/^events-.+\.ndjson$/.test(x)).sort();
assert(archives.length>0);
const archived=path.join(base,'journal',archives[0]);
const original=fs.readFileSync(archived,'utf8');fs.writeFileSync(archived,original.replace('ROTATION_TEST','ROTATION_TAMPERED'));
v=j.verify();assert.equal(v.ok,false,'archived segment tamper must be detected');

const base2=fs.mkdtempSync(path.join(os.tmpdir(),'wa-journal-tail-'));
j=new EventJournal(base2,{maxBytes:1024*1024});
j.append('A',{payload:{ok:true}});j.append('B',{payload:{ok:true}});
const active=path.join(base2,'journal','events.ndjson');fs.appendFileSync(active,'{"seq":3,"broken":');
j=new EventJournal(base2,{maxBytes:1024*1024});
v=j.verify();assert.equal(v.ok,true);assert.equal(v.recovery.repaired,true);assert(v.recovery.discardedBytes>0);
const rows=j.list({limit:20});assert(rows.some(x=>x.type==='JOURNAL_TORN_TAIL_RECOVERED'));
assert.equal(rows.some(x=>x.type==='B'),true);
console.log('journal-durability-rc1 PASS');
