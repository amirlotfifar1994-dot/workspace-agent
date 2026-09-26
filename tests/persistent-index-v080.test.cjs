const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {findExactDuplicatesFromIndex}=require('../electron/services/indexed-duplicate-finder.cjs');

(async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v080-base-'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wa-v080-root-'));
  try{
    fs.mkdirSync(path.join(root,'docs'),{recursive:true});
    fs.mkdirSync(path.join(root,'nested','deep'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs','invoice-a.txt'),'same-content');
    fs.writeFileSync(path.join(root,'docs','invoice-b.txt'),'same-content');
    fs.writeFileSync(path.join(root,'nested','deep','other.bin'),'other');
    const index=new PersistentFileIndex(base);

    // Crash-resumable/pauseable queue: first session intentionally stops after one directory.
    const partial=await index.scan(root,{resume:false,maxDirsSession:1,maxWallTimeMs:10000});
    assert.equal(partial.status,'paused');
    assert(partial.queue>0,'queue should persist for resume');
    const resumed=await index.scan(root,{resume:true,maxDirsSession:100,maxWallTimeMs:10000});
    assert.equal(resumed.status,'completed');
    assert.equal(resumed.files,3);
    assert.equal(resumed.queue,0);

    const search=index.search({root,query:'invoice',limit:1});
    assert.equal(search.total,2);assert.equal(search.rows.length,1);assert.equal(search.hasMore,true);
    const page2=index.search({root,query:'invoice',limit:1,offset:1});
    assert.equal(page2.rows.length,1);assert.equal(page2.hasMore,false);

    const candidates=index.duplicateCandidates(root);
    assert(candidates.some(x=>x.count===2&&x.size===Buffer.byteLength('same-content')));
    const firstDup=await findExactDuplicatesFromIndex(index,root,{maxCandidateFiles:1000});
    assert.equal(firstDup.groupsTotal,1);assert.equal(firstDup.duplicateFiles,1);assert(firstDup.hashedFiles>=2);
    const secondDup=await findExactDuplicatesFromIndex(index,root,{maxCandidateFiles:1000});
    assert.equal(secondDup.groupsTotal,1);assert(secondDup.cacheHits>=2,'second run should reuse stable hash cache');

    // Incremental add/delete reconciliation without a full tree scan.
    const added=path.join(root,'new-file.txt');fs.writeFileSync(added,'new');
    const addResult=await index.reconcilePath(root,added);assert.equal(addResult.ok,true);
    assert.equal((await index.status(root)).files,4);
    fs.rmSync(added);const delResult=await index.reconcilePath(root,added);assert.equal(delResult.ok,true);
    assert.equal((await index.status(root)).files,3);

    // Fresh generation keeps stale rows while paused; stale deletion only occurs at successful completion.
    const stale=path.join(root,'nested','deep','other.bin');fs.rmSync(stale);
    const freshPartial=await index.scan(root,{resume:false,maxDirsSession:1,maxWallTimeMs:10000});
    assert.equal(freshPartial.status,'paused');
    assert.equal(index.search({root,query:'other.bin'}).total,1,'stale row must remain until full generation commits');
    const freshComplete=await index.scan(root,{resume:true,maxDirsSession:100,maxWallTimeMs:10000});
    assert.equal(freshComplete.status,'completed');
    assert.equal(index.search({root,query:'other.bin'}).total,0,'stale row removed only after successful full scan');

    index.close();
    console.log('persistent-index-v080.test.cjs PASS');
  }finally{
    fs.rmSync(base,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1)});
