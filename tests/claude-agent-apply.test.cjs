const assert=require('assert');
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {ExplorerOperationCoordinator}=require('../electron/services/explorer-operation-coordinator.cjs');
const {batchCycle}=require('../electron/services/explorer-batch-cycles.cjs');
const {applyPlan,makeTools}=require('../electron/services/claude-file-agent.cjs');
(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-agent-apply-')),root=path.join(base,'workspace');await fsp.mkdir(root,{recursive:true});
  const cycles=new CycleStore(base),batches=new ExplorerBatchStore(base),coordinator=new ExplorerOperationCoordinator();
  try{
    const engine=new CycleEngine({store:cycles,maxIterations:100,maxWallTimeMs:60000});
    engine.register('explorer-batch-move',batchCycle({operation:'move',store:batches,chunkSize:4,operationCoordinator:coordinator}));
    await fsp.writeFile(path.join(root,'alpha-invoice.pdf'),'INV');await fsp.writeFile(path.join(root,'alpha-notes.txt'),'NOTES');await fsp.writeFile(path.join(root,'alpha-scan.pdf'),'SCAN');
    const t=makeTools(root,{});const r=t.propose_moves({summary:'s',moves:[{from:'alpha-invoice.pdf',to_folder:'Alpha/Docs'},{from:'alpha-scan.pdf',to_folder:'Alpha/Docs'},{from:'alpha-notes.txt',to_folder:'Alpha/Notes'}]});assert.equal(r.ok,true);
    const plan={summary:'s',moves:[{from:'alpha-invoice.pdf',toFolder:'Alpha/Docs'},{from:'alpha-scan.pdf',toFolder:'Alpha/Docs'},{from:'alpha-notes.txt',toFolder:'Alpha/Notes'}]};
    const out=await applyPlan({engine,root,plan});
    assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.results.length,2);
    assert.equal(await fsp.readFile(path.join(root,'Alpha','Docs','alpha-invoice.pdf'),'utf8'),'INV');assert.equal(await fsp.readFile(path.join(root,'Alpha','Notes','alpha-notes.txt'),'utf8'),'NOTES');
    assert.equal(fs.existsSync(path.join(root,'alpha-invoice.pdf')),false);
    const undo=await engine.rollback(out.results[0].cycleId);assert(undo);
    assert.equal(fs.existsSync(path.join(root,'alpha-invoice.pdf'))||fs.existsSync(path.join(root,'alpha-scan.pdf')),true,'undo should restore moved files');
    console.log('claude-agent-apply.test.cjs PASS',{moved:3,undo:true});
  }finally{batches.close?.();await fsp.rm(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
