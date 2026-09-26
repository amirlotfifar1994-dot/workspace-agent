const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {cleanRelative,describePath,explorerSearch,buildWritePlan,executeWritePlan,verifyCompleted,undoCompleted}=require('../electron/services/file-explorer-service.cjs');
const {TransactionStore}=require('../electron/services/transaction-store.cjs');
const {RecoveryService,classifyOp}=require('../electron/services/recovery-service.cjs');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
const {explorerWriteCycle,explorerNavigateCycle,explorerSelectCycle}=require('../electron/services/file-explorer-cycles.cjs');
const {skillById,validateSkillStep}=require('../electron/services/skill-registry.cjs');
const {retrieveSkills}=require('../electron/services/skill-retriever.cjs');

(async()=>{
  const ipcSource=fs.readFileSync(path.join(__dirname,'..','electron','ipc.cjs'),'utf8');assert.ok(ipcSource.includes('RESTRICTED_EXPLORER_WRITE_ENTRYPOINT'));assert.ok(ipcSource.includes("wa:start-explorer-write"));
  assert.strictEqual(skillById('skill.explorer.copy').interactiveOnly,true);assert.strictEqual(validateSkillStep({skillId:'skill.explorer.copy',type:'explorer-copy'}).code,'SKILL_INTERACTIVE_ONLY');const retrieved=retrieveSkills('این فایل را کپی کن و در پوشه دیگر بگذار',{limit:20});assert.strictEqual(retrieved.some(x=>x.id==='skill.explorer.copy'),false);
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-explorer-v094-'));const root=path.join(base,'workspace');const data=path.join(base,'agent');await fsp.mkdir(root,{recursive:true});await fsp.mkdir(data,{recursive:true});
  await fsp.writeFile(path.join(root,'alpha.txt'),'alpha');await fsp.mkdir(path.join(root,'docs'));await fsp.writeFile(path.join(root,'docs','note.txt'),'note');
  assert.strictEqual(cleanRelative('docs/note.txt'),path.normalize('docs/note.txt'));
  assert.throws(()=>cleanRelative('../escape.txt'),e=>e.code==='EXPLORER_PATH_ESCAPE_BLOCKED');
  assert.throws(()=>cleanRelative(path.resolve(root,'alpha.txt')),e=>e.code==='EXPLORER_RELATIVE_PATH_REQUIRED');
  const props=await describePath(root,'docs/note.txt');assert.strictEqual(props.type,'file');assert.strictEqual(props.size,4);
  const search=await explorerSearch(root,{query:'note',limit:10,index:null,maxFiles:1000});assert.strictEqual(search.total,1);assert.ok(search.rows[0].path.endsWith('note.txt'));

  // Copy: preview plan -> exact SHA verify -> protected undo.
  const txStore=new TransactionStore(data);const copyPlan=await buildWritePlan({action:'copy',root,sourceRelative:'alpha.txt',destinationRelative:'docs/alpha-copy.txt'});const copied=await executeWritePlan(copyPlan,{cycleId:'copy-test',transactionStore:txStore});const copyVerify=await verifyCompleted(copied);assert.strictEqual(copyVerify.ok,true);assert.strictEqual(await fsp.readFile(path.join(root,'docs','alpha-copy.txt'),'utf8'),'alpha');assert.strictEqual(await fsp.readFile(path.join(root,'alpha.txt'),'utf8'),'alpha');const copyUndo=await undoCompleted(copied);assert.strictEqual(copyUndo[0].ok,true);assert.strictEqual(fs.existsSync(path.join(root,'docs','alpha-copy.txt')),false);

  // New folder and safe undo only while empty.
  const folderPlan=await buildWritePlan({action:'new-folder',root,destinationRelative:'new-folder'});const made=await executeWritePlan(folderPlan,{cycleId:'mkdir-test',transactionStore:txStore});assert.strictEqual((await verifyCompleted(made)).ok,true);await fsp.writeFile(path.join(root,'new-folder','keep.txt'),'x');let undo=await undoCompleted(made);assert.strictEqual(undo[0].error,'UNDO_FOLDER_NOT_EMPTY');await fsp.rm(path.join(root,'new-folder','keep.txt'));undo=await undoCompleted(made);assert.strictEqual(undo[0].ok,true);

  // Move directory and protect undo if destination changed.
  await fsp.mkdir(path.join(root,'move-me'));await fsp.writeFile(path.join(root,'move-me','x.txt'),'x');const movePlan=await buildWritePlan({action:'move',root,sourceRelative:'move-me',destinationRelative:'docs/moved-dir'});const moved=await executeWritePlan(movePlan,{cycleId:'move-test',transactionStore:txStore});assert.strictEqual((await verifyCompleted(moved)).ok,true);assert.strictEqual(fs.existsSync(path.join(root,'move-me')),false);assert.strictEqual(fs.existsSync(path.join(root,'docs','moved-dir','x.txt')),true);const moveUndo=await undoCompleted(moved);assert.strictEqual(moveUndo[0].ok,true);assert.strictEqual(fs.existsSync(path.join(root,'move-me','x.txt')),true);

  // Rename file.
  const renamePlan=await buildWritePlan({action:'rename',root,sourceRelative:'docs/note.txt',newName:'renamed.txt'});const renamed=await executeWritePlan(renamePlan,{cycleId:'rename-test',transactionStore:txStore});assert.strictEqual((await verifyCompleted(renamed)).ok,true);assert.strictEqual(fs.existsSync(path.join(root,'docs','renamed.txt')),true);assert.strictEqual((await undoCompleted(renamed))[0].ok,true);

  // Directory copy intentionally deferred in this foundation.
  await assert.rejects(()=>buildWritePlan({action:'copy',root,sourceRelative:'docs',destinationRelative:'docs-copy'}),e=>e.code==='EXPLORER_COPY_DIRECTORY_DEFERRED');

  // Symlink/junction-like traversal blocked for writes when supported by host.
  try{await fsp.symlink(base,path.join(root,'link-out'),'dir');await assert.rejects(()=>buildWritePlan({action:'new-folder',root,destinationRelative:path.join('link-out','bad')}),e=>e.code==='EXPLORER_REPARSE_PATH_BLOCKED');}catch(e){if(!['EPERM','EACCES','UNKNOWN'].includes(e.code))throw e;}

  // Copy transaction recovery semantics: source remains at every state.
  const src=path.join(root,'recovery-source.txt'),stage=path.join(root,'.workspace-agent-staging','recover','copy.part'),dest=path.join(root,'docs','recovered-copy.txt');await fsp.writeFile(src,'recover');await fsp.mkdir(path.dirname(stage),{recursive:true});const st=await fsp.stat(src);const tx=txStore.create({kind:'explorer-copy',cycleId:'recover-copy',root,operations:[{kind:'explorer-copy-file',source:src,destination:dest,stage,size:st.size}]});let op=txStore.get(tx.id).operations[0];assert.strictEqual(classifyOp(op).state,'copy-source');await fsp.copyFile(src,stage);op=txStore.get(tx.id).operations[0];assert.strictEqual(classifyOp(op).state,'copy-staged');const recovery=new RecoveryService({transactionStore:txStore});const rec=await recovery.act(tx.id,'resume');assert.strictEqual(rec.ok,true);assert.strictEqual(fs.existsSync(src),true);assert.strictEqual(fs.existsSync(dest),true);assert.strictEqual((await fsp.readFile(dest,'utf8')),'recover');

  // Cycle confirmation gate + Shell adapters.
  const cycleData=path.join(base,'cycles');const store=new CycleStore(cycleData);const engine=new CycleEngine({store});engine.register('explorer-new-folder',explorerWriteCycle({action:'new-folder',transactionStore:txStore}));const c=engine.create('explorer-new-folder',{root,destinationRelative:'cycle-folder'});const preview=await engine.run(c.id);assert.strictEqual(preview.status,'waiting-confirmation');assert.strictEqual(fs.existsSync(path.join(root,'cycle-folder')),false);const done=await engine.confirm(c.id,'approve');assert.strictEqual(done.status,'completed');assert.strictEqual(fs.existsSync(path.join(root,'cycle-folder')),true);
  let reconciles=0;engine.register('explorer-copy',explorerWriteCycle({action:'copy',transactionStore:txStore,onVerified:async()=>({ok:++reconciles>0})}));await fsp.writeFile(path.join(root,'reconcile.txt'),'r');let rc=engine.create('explorer-copy',{root,sourceRelative:'reconcile.txt',destinationRelative:'docs/reconcile-copy.txt'});rc=await engine.run(rc.id);assert.strictEqual(rc.status,'waiting-confirmation');rc=await engine.confirm(rc.id,'approve');assert.strictEqual(rc.status,'completed');assert.strictEqual(reconciles,1);assert.strictEqual(rc.reconcile.ok,true);assert.strictEqual((await engine.rollback(rc.id)).ok,true);
  const calls=[];engine.register('explorer-navigate',explorerNavigateCycle({platform:'win32',shellAdapter:{openPath:async p=>(calls.push(['open',p]),'')}}));engine.register('explorer-select',explorerSelectCycle({platform:'win32',shellAdapter:{showItemInFolder:p=>calls.push(['select',p])}}));let nav=engine.create('explorer-navigate',{root,relativePath:'docs'});nav=await engine.run(nav.id);assert.strictEqual(nav.status,'completed');let sel=engine.create('explorer-select',{root,relativePath:'alpha.txt'});sel=await engine.run(sel.id);assert.strictEqual(sel.status,'completed');assert.strictEqual(calls.length,2);

  await fsp.rm(base,{recursive:true,force:true});console.log('file-explorer-skill-pack-v094.test.cjs PASS');
})().catch(e=>{console.error(e);process.exit(1)});
