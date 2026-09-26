const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {
  buildWritePlan,executeWritePlan,verifyCompleted,isCaseOnlyPathChange
}=require('../electron/services/file-explorer-service.cjs');

(async()=>{
  assert.equal(isCaseOnlyPathChange('C:\\Work\\File.TXT','c:\\work\\file.txt',{platform:'win32'}),true);
  assert.equal(isCaseOnlyPathChange('C:\\Work\\File.TXT','C:\\Work\\File.TXT',{platform:'win32'}),false);
  assert.equal(isCaseOnlyPathChange('/tmp/File','/tmp/file',{platform:'linux'}),false);

  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-ext-mutation-'));
  try{
    // Post-commit external mutation must be preserved rather than deleted by rollback cleanup.
    await fsp.writeFile(path.join(root,'source.txt'),'agent-snapshot');
    const copyPlan=await buildWritePlan({action:'copy',root,sourceRelative:'source.txt',destinationRelative:'copy.txt'});
    const origRename=fsp.rename.bind(fsp);
    let injected=false;
    fsp.rename=async(a,b)=>{
      await origRename(a,b);
      if(!injected&&path.resolve(b)===path.resolve(copyPlan.destination)){
        injected=true;
        await fsp.writeFile(b,'external-editor-change');
      }
    };
    let copyError=null;
    try{await executeWritePlan(copyPlan);}catch(e){copyError=e;}finally{fsp.rename=origRename;}
    assert(copyError,'copy should detect destination mutation');
    assert.equal(copyError.code,'EXPLORER_COPY_HASH_MISMATCH');
    assert.equal(copyError.details?.destinationPreserved,true);
    assert.equal(await fsp.readFile(copyPlan.destination,'utf8'),'external-editor-change');
    assert.equal(await fsp.readFile(copyPlan.source,'utf8'),'agent-snapshot');

    // Parent swap to a symlink/reparse-like path after preview must be rejected before commit.
    await fsp.mkdir(path.join(root,'dest'));
    await fsp.writeFile(path.join(root,'source2.txt'),'safe-data');
    const outside=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-ext-outside-'));
    const plan2=await buildWritePlan({action:'copy',root,sourceRelative:'source2.txt',destinationRelative:path.join('dest','copy2.txt')});
    let swapped=false;
    let parentError=null;
    try{
      await executeWritePlan(plan2,{commitGuard:async()=>{
        if(swapped)return;swapped=true;
        await fsp.rename(path.join(root,'dest'),path.join(root,'dest-original'));
        await fsp.symlink(outside,path.join(root,'dest'),'dir');
      }});
    }catch(e){parentError=e;}
    assert(parentError,'reparse-like parent swap must be blocked');
    assert(['EXPLORER_REPARSE_PATH_BLOCKED','EXPLORER_DESTINATION_PARENT_CHANGED'].includes(parentError.code),parentError.code);
    assert.equal(fs.existsSync(path.join(outside,'copy2.txt')),false);
    try{await fsp.rm(path.join(root,'dest'),{recursive:true,force:true});}catch{}
    try{await fsp.rename(path.join(root,'dest-original'),path.join(root,'dest'));}catch{}
    await fsp.rm(outside,{recursive:true,force:true});

    // A move that succeeds but is immediately modified by an external editor must be surfaced by verification.
    await fsp.writeFile(path.join(root,'move-source.txt'),'before-move');
    const movePlan=await buildWritePlan({action:'move',root,sourceRelative:'move-source.txt',destinationRelative:'move-dest.txt'});
    const origRename2=fsp.rename.bind(fsp);let changed=false;
    fsp.rename=async(a,b)=>{await origRename2(a,b);if(!changed&&path.resolve(b)===path.resolve(movePlan.destination)){changed=true;await fsp.writeFile(b,'modified-after-move');}};
    let completed;
    try{completed=await executeWritePlan(movePlan);}finally{fsp.rename=origRename2;}
    assert.equal(completed.externalMutation,true);
    const verification=await verifyCompleted(completed);
    assert.equal(verification.ok,false);
    assert(verification.mismatches.some(x=>x.code==='DESTINATION_MUTATED_AROUND_MOVE'));

    console.log('external-mutation-ntfs-hardening-rc1.test.cjs PASS',{caseOnly:true,preserveExternalEdit:true,reparseGuard:true,moveMutation:true});
  }finally{
    try{await fsp.rm(root,{recursive:true,force:true});}catch{}
  }
})().catch(e=>{console.error(e);process.exit(1)});
