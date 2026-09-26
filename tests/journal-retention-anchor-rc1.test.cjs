const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {EventJournal}=require('../electron/services/event-journal.cjs');
function archives(base){return fs.readdirSync(path.join(base,'journal')).filter(x=>/^events-.+\.ndjson$/.test(x));}
{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-journal-retention-'));
 let j=new EventJournal(base,{maxBytes:360,maxArchiveFiles:3,maxArchiveBytes:5000,minArchives:1,pressureFreeBytes:0});
 for(let i=0;i<120;i++)j.append('R',{payload:{i,text:'x'.repeat(90)}});
 const v=j.verify();assert.equal(v.ok,true);assert.equal(v.continuity,'full');assert(v.anchor&&v.anchor.prunedEvents>0);assert(archives(base).length<=3);assert(v.count>=120);assert(v.retainedCount<120);assert.equal(v.retention.bounded,true);
 j=new EventJournal(base,{maxBytes:360,maxArchiveFiles:3,maxArchiveBytes:5000,minArchives:1,pressureFreeBytes:0});assert.equal(j.verify().ok,true);j.append('AFTER_RESTART',{payload:{ok:true}});assert.equal(j.verify().ok,true);
 const anchor=path.join(base,'journal','retention-anchor.json');const raw=fs.readFileSync(anchor,'utf8');fs.writeFileSync(anchor,raw.replace(/"prunedEvents":\s*\d+/, '"prunedEvents":999999'));
 const tampered=new EventJournal(base,{maxBytes:360,maxArchiveFiles:3,maxArchiveBytes:5000,minArchives:1,pressureFreeBytes:0});const before=tampered.verify();assert.equal(before.ok,false);assert.equal(before.code,'JOURNAL_RETENTION_ANCHOR_INVALID');assert.equal(before.internalRetainedChainOk,true);assert(tampered.seq>0);assert.notEqual(tampered.lastHash,'GENESIS');const prev=tampered.lastHash;const post=tampered.append('POST_TAMPER',{payload:{preserveTail:true}});assert.equal(post.prevHash,prev);const after=tampered.verify();assert.equal(after.ok,false);assert.equal(after.code,'JOURNAL_RETENTION_ANCHOR_INVALID');assert.equal(after.internalRetainedChainOk,true);
}
{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-journal-pressure-'));const j=new EventJournal(base,{maxBytes:360,maxArchiveFiles:20,maxArchiveBytes:100000,minArchives:1,pressureFreeBytes:1024,pressureArchiveFiles:2,pressureArchiveBytes:2000,freeBytesProvider:()=>0});for(let i=0;i<80;i++)j.append('P',{payload:{i,text:'y'.repeat(80)}});const v=j.verify();assert.equal(v.ok,true);assert.equal(v.retention.pressure,true);assert(archives(base).length<=2);
}
console.log('journal-retention-anchor-rc1 PASS',{bounded:true,anchor:true,restart:true,tamperDetected:true,diskPressure:true});
