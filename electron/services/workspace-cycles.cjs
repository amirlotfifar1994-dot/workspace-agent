const {scanTree}=require('./file-indexer.cjs');
const {searchFiles}=require('./file-search.cjs');
const {buildMaintenancePlan,executeMaintenance,verifyMaintenance,restoreMaintenance}=require('./maintenance.cjs');
const {compareSnapshot}=require('./snapshot-store.cjs');
const {planGoal}=require('./goal-planner.cjs');
const {analyzeWorkspace}=require('./file-analyzer.cjs');
const {planRename,executeRenames,verifyRenames,undoRenames}=require('./renamer.cjs');
const {inspectWindowsSystem}=require('./windows-inspector.cjs');
const {inspectWindowsUi,listTopLevelWindows}=require('./windows-uia.cjs');
const {prepareWindowsUiAction,executePinnedWindowsUiAction}=require('./windows-uia-actions.cjs');
const {hash}=require('./windows-action-policy.cjs');
const {compileMissionPlan,verifyDag}=require('./mission-compiler.cjs');
const {findSimilarImages,dHashFromGray,defaultLoadGray}=require('./image-similarity.cjs');
const {findSimilarTexts,readTextSample,simHash64,extractProfile}=require('./text-similarity.cjs');
const {analyzeWorkspaceIntelligence}=require('./workspace-intelligence.cjs');
const {buildRecommendationPlan,executeRecommendationPlan,verifyRecommendationPlan,undoRecommendationPlan}=require('./recommendation-applier.cjs');
const {auditManagedZone}=require('./managed-zone-audit.cjs');
const {auditDrive}=require('./drive-audit.cjs');
const {analyzeStartupInventory}=require('./startup-advisor.cjs');
const {extractPdfText}=require('./pdf-text-extractor.cjs');

function step(id,kind,status,label,detail=''){return{id,kind,status,label,detail,at:new Date().toISOString()};}
function evidence(code,data={}){return{at:new Date().toISOString(),code,...data};}

function fileSearchCycle(){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});
    const result=searchFiles(scan.files,cycle.input.filters||cycle.input);
    return{status:'completed',result,steps:[step('scan','read','completed','اسکن Workspace',`${scan.files.length} فایل`),step('search','analysis','completed','اعمال فیلتر جست‌وجو',`${result.total} نتیجه`),step('verify','verify','completed','Self-Audit نتایج',result.samplesTruncated?'نمونه نتایج محدود شده است':'همه نتایج در گزارش حاضرند')],evidence:[...cycle.evidence,evidence('FILE_SEARCH_COMPLETE',{total:result.total,totalBytes:result.totalBytes,truncated:scan.truncated,samplesTruncated:result.samplesTruncated})]};
  },async onEnd(cycle){return{summary:`${cycle.result?.total||0} فایل مطابق جست‌وجو پیدا شد؛ هیچ تغییری انجام نشد.`,quality:'verified',nextCycleSuggestions:[]};}};
}

function snapshotCycle(snapshotStore){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});
    const saved=await snapshotStore.save(cycle.input.root,scan);
    const result={snapshot:saved,scan:{files:scan.files.length,dirs:scan.dirs,errors:scan.errors.length,truncated:scan.truncated}};
    return{status:'completed',result,steps:[step('scan','read','completed','اسکن برای Snapshot',`${scan.files.length} فایل`),step('snapshot','local-write','completed','ثبت Snapshot در داده محلی Agent',saved.id),step('verify','verify','completed','Self-Audit Snapshot',`${saved.files} رکورد · Workspace بدون تغییر`)],evidence:[...cycle.evidence,evidence('SNAPSHOT_CREATED',{snapshotId:saved.id,files:saved.files,bytes:saved.bytes,truncated:scan.truncated})]};
  },async onEnd(cycle){return{summary:`Snapshot با ${cycle.result?.snapshot?.files||0} فایل ثبت شد. این عملیات فقط دیتای داخلی Agent را نوشته و Workspace را تغییر نداده است.`,quality:'verified',nextCycleSuggestions:['snapshot-diff']};}};
}

function snapshotDiffCycle(snapshotStore){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const meta=cycle.input.snapshotId?{id:cycle.input.snapshotId}:snapshotStore.latest(cycle.input.root);
    if(!meta?.id)throw Object.assign(new Error('برای این Workspace هنوز Snapshot ثبت نشده است.'),{code:'SNAPSHOT_REQUIRED'});
    const snapshot=await snapshotStore.get(meta.id);const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});const result=compareSnapshot(snapshot,scan);
    return{status:'completed',result,steps:[step('snapshot','read','completed','خواندن Snapshot مبنا',meta.id),step('scan','read','completed','اسکن وضعیت فعلی',`${scan.files.length} فایل`),step('compare','analysis','completed','مقایسه تغییرات',`+${result.counts.added} / -${result.counts.removed} / ~${result.counts.modified}`),step('verify','verify','completed','Self-Audit Delta','مسیر نسبی + Size + Modified Time')],evidence:[...cycle.evidence,evidence('SNAPSHOT_DIFF_COMPLETE',{snapshotId:meta.id,...result.counts,truncated:scan.truncated})]};
  },async onEnd(cycle){const c=cycle.result?.counts||{};return{summary:`از Snapshot تا اکنون: ${c.added||0} اضافه، ${c.removed||0} حذف‌شده و ${c.modified||0} ویرایش‌شده.`,quality:'verified',nextCycleSuggestions:['snapshot']};}};
}

function maintenanceCleanupCycle({transactionStore=null}={}){
  return{resumable:true,async next(cycle){
    if(!cycle.steps.length){
      const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});
      const health=await analyzeWorkspace(cycle.input.root,scan,{largeThresholdBytes:cycle.input.largeThresholdBytes||500*1024*1024});
      const plan=buildMaintenancePlan(cycle.input.root,health,{includeLowRiskJunk:cycle.input.includeLowRiskJunk!==false,includeMediumRiskJunk:Boolean(cycle.input.includeMediumRiskJunk),includeEmptyFolders:Boolean(cycle.input.includeEmptyFolders),includeZeroByte:Boolean(cycle.input.includeZeroByte),minJunkAgeDays:cycle.input.minJunkAgeDays||7,minZeroByteAgeDays:cycle.input.minZeroByteAgeDays||30,maxOperations:cycle.input.maxOperations||5000,selectedPaths:cycle.input.selectedPaths||null});
      return{operations:plan.operations,planSummary:{estimatedBytes:plan.estimatedBytes,operations:plan.operations.length,skipped:plan.skipped.length,truncated:plan.truncated},status:'waiting-confirmation',steps:[step('scan','read','completed','اسکن مجدد قبل از Cleanup',`${scan.files.length} فایل`),step('analyze','analysis','completed','شناسایی کاندیدهای Cleanup',`${plan.operations.length} مورد`),step('plan','simulation','completed','ساخت Preview امن',`${plan.estimatedBytes} بایت → Quarantine`),step('confirm','approval','waiting-confirmation','تأیید Cleanup','Permanent Delete انجام نمی‌شود'),step('execute','write','pending','انتقال به Quarantine'),step('verify','verify','pending','Self-Audit و Restore Check')],evidence:[...cycle.evidence,evidence('MAINTENANCE_PREVIEW',{operations:plan.operations.length,estimatedBytes:plan.estimatedBytes,skipped:plan.skipped.length,truncated:plan.truncated})]};
    }
    if(cycle.steps.find(s=>s.id==='confirm')?.status==='approved'&&cycle.steps.find(s=>s.id==='execute')?.status==='pending'){
      if(!(cycle.operations||[]).length)return{status:'completed',completedOperations:[],verification:{ok:true,mismatches:[]},steps:cycle.steps.map(s=>s.id==='execute'?step('execute','write','completed','انتقال به Quarantine','۰ عملیات'):s.id==='verify'?step('verify','verify','completed','Self-Audit و Restore Check','نیازی به تغییر نبود'):s),evidence:[...cycle.evidence,evidence('MAINTENANCE_NOOP',{ok:true})]};
      const q=await executeMaintenance(cycle.input.root,cycle.id,cycle.operations,{transactionStore});const verification=await verifyMaintenance(q.completed);
      const steps=cycle.steps.map(s=>s.id==='execute'?step('execute','write',verification.ok?'completed':'failed','انتقال به Quarantine',`${q.completed.length} مورد`):s.id==='verify'?step('verify','verify',verification.ok?'completed':'failed','Self-Audit و Restore Check',verification.ok?'مبدأ/مقصد/نوع/اندازه تأیید شد':`${verification.mismatches.length} مغایرت`):s);
      return{status:verification.ok?'completed':'failed',quarantineBase:q.base,completedOperations:q.completed,undoStack:q.completed.map(x=>x.undo),verification,steps,evidence:[...cycle.evidence,evidence('MAINTENANCE_SELF_AUDIT',{ok:verification.ok,mismatches:verification.mismatches.length,operations:q.completed.length})]};
    }
    return{status:cycle.status};
  },async onEnd(cycle){return{summary:cycle.status==='completed'?`${cycle.completedOperations?.length||0} مورد Cleanup به Quarantine منتقل و راستی‌آزمایی شد؛ Restore فعال است.`:cycle.status==='cancelled'?'Cleanup لغو شد و Workspace تغییر نکرد.':'Cleanup کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:cycle.status==='completed'?['workspace-health','snapshot']:[]};},async undo(cycle){return restoreMaintenance(cycle.completedOperations||[]);}};
}



function windowsSystemCycle(){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const result=await inspectWindowsSystem();
    if(!result.supported)return{status:'completed',result,steps:[step('platform','read','completed','بررسی Runtime',`Platform: ${result.platform}`),step('inspect','analysis','completed','Windows System Doctor','این Runtime ویندوز نیست؛ قابلیت در Windows فعال می‌شود.')],evidence:[...cycle.evidence,evidence('WINDOWS_SYSTEM_UNSUPPORTED',{platform:result.platform})]};
    const diskCount=result.disks?.length||0,startupCount=result.startup?.length||0,procCount=result.topProcesses?.length||0;result.startupAdvisor=analyzeStartupInventory(result.startup||[]);
    return{status:'completed',result,steps:[step('inspect','read','completed','خواندن اطلاعات سیستم Windows',`${result.os?.caption||'Windows'} · Build ${result.os?.build||'-'}`),step('inventory','analysis','completed','System Inventory',`${diskCount} دیسک · ${startupCount} Startup · ${procCount} Process`),step('startup-advice','analysis','completed','Startup Review Advisor',`${result.startupAdvisor.summary.high} High · ${result.startupAdvisor.summary.medium} Medium · بدون Disable خودکار`),step('verify','verify','completed','Self-Audit System Report','Read-only CIM/Process snapshot')],evidence:[...cycle.evidence,evidence('WINDOWS_SYSTEM_CAPTURED',{disks:diskCount,startup:startupCount,processes:procCount,build:result.os?.build||'',startupReview:result.startupAdvisor.summary})]};
  },async onEnd(cycle){return{summary:cycle.result?.supported?`Windows System Doctor کامل شد؛ ${cycle.result?.disks?.length||0} دیسک و ${cycle.result?.startup?.length||0} Startup entry گزارش شد.`:'System Doctor در Runtime غیر-Windows فقط وضعیت پشتیبانی را گزارش کرد.',quality:'verified',nextCycleSuggestions:[]};}};
}

function renameCycle({transactionStore=null}={}){
  return{resumable:true,async next(cycle){
    if(!cycle.steps.length){
      const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||100000});
      const plan=planRename(cycle.input.root,scan.files,cycle.input.options||{});const operations=plan.operations.slice(0,cycle.input.maxOperations||5000);
      return{operations,renameSkipped:plan.skipped.slice(0,300),status:'waiting-confirmation',steps:[step('scan','read','completed','اسکن فایل‌های سطح Workspace',`${scan.files.length} فایل`),step('plan','simulation','completed','ساخت Preview تغییر نام',`${operations.length} Rename · ${plan.skipped.length} Skip`),step('confirm','approval','waiting-confirmation','تأیید Bulk Rename','دو مرحله‌ای + Rollback'),step('execute','write','pending','اجرای Rename اتمیک'),step('verify','verify','pending','Self-Audit Rename')],evidence:[...cycle.evidence,evidence('RENAME_PREVIEW',{operations:operations.length,skipped:plan.skipped.length,capped:plan.operations.length>operations.length})]};
    }
    if(cycle.steps.find(s=>s.id==='confirm')?.status==='approved'&&cycle.steps.find(s=>s.id==='execute')?.status==='pending'){
      const completed=await executeRenames(cycle.operations||[],{transactionStore,cycleId:cycle.id});const verification=await verifyRenames(completed);const steps=cycle.steps.map(s=>s.id==='execute'?step('execute','write',verification.ok?'completed':'failed','اجرای Rename اتمیک',`${completed.length} فایل`):s.id==='verify'?step('verify','verify',verification.ok?'completed':'failed','Self-Audit Rename',verification.ok?'نام مقصد و عدم وجود منبع تأیید شد':`${verification.mismatches.length} مغایرت`):s);
      return{status:verification.ok?'completed':'failed',completedOperations:completed,undoStack:completed.map(x=>x.undo),verification,steps,evidence:[...cycle.evidence,evidence('RENAME_SELF_AUDIT',{ok:verification.ok,mismatches:verification.mismatches.length,files:completed.length})]};
    }
    return{status:cycle.status};
  },async onEnd(cycle){return{summary:cycle.status==='completed'?`${cycle.completedOperations?.length||0} فایل تغییر نام داده و راستی‌آزمایی شد.`:cycle.status==='cancelled'?'Bulk Rename لغو شد؛ هیچ نامی تغییر نکرد.':'Bulk Rename کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:['snapshot','workspace-health']};},async undo(cycle){return undoRenames(cycle.completedOperations||[]);}};
}


function similarImagesCycle({fingerprintStore=null,loadGray=defaultLoadGray}={}){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});let cacheHits=0,cacheMisses=0;
    const resolveHash=async file=>{if(fingerprintStore){const cached=await fingerprintStore.get('image-dhash',file);if(cached?.dhash){cacheHits+=1;return cached.dhash;}}cacheMisses+=1;const gray=await loadGray(file.path,file);const dhash=dHashFromGray(gray);if(fingerprintStore)await fingerprintStore.set('image-dhash',file,{dhash});return dhash;};
    const result=await findSimilarImages(scan.files,{threshold:cycle.input.threshold??8,maxImages:cycle.input.maxImages||12000,maxGroups:cycle.input.maxGroups||1000,maxPairs:cycle.input.maxPairs||12000,resolveHash});
    if(fingerprintStore){await fingerprintStore.prune();await fingerprintStore.save();}result.cache={hits:cacheHits,misses:cacheMisses};
    return{status:'completed',result,steps:[step('scan','read','completed','اسکن تصاویر Workspace',`${result.candidateImages} تصویر کاندید`),step('fingerprint','analysis','completed','ساخت/خواندن dHash',`${result.processedImages} تصویر · Cache ${cacheHits}/${cacheMisses}`),step('cluster','analysis','completed','خوشه‌بندی Similar Photo',`${result.groupsTotal} گروه · threshold ${result.threshold}`),step('verify','verify','completed','Self-Audit Similarity','فقط پیشنهاد؛ هیچ فایل جابه‌جا/حذف نشد')],evidence:[...cycle.evidence,evidence('SIMILAR_IMAGES_COMPLETE',{groups:result.groupsTotal,processed:result.processedImages,errors:result.errorsTotal,cacheHits,cacheMisses,threshold:result.threshold,truncated:scan.truncated})]};
  },async onEnd(cycle){return{summary:`${cycle.result?.groupsTotal||0} گروه تصویر مشابه پیدا شد. نتیجه perceptual است و Duplicate قطعی محسوب نمی‌شود؛ هیچ تغییری انجام نشد.`,quality:'verified',nextCycleSuggestions:['duplicates','workspace-intelligence']};}};
}

function similarTextsCycle({fingerprintStore=null}={}){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});let cacheHits=0,cacheMisses=0;
    const resolveHashProfile=async file=>{if(fingerprintStore){const cached=await fingerprintStore.get('text-simhash',file);if(cached?.simhash){cacheHits+=1;return cached;}}cacheMisses+=1;const text=await readTextSample(file.path,cycle.input.maxBytes||262144);const value={simhash:simHash64(text),profile:extractProfile(text,file.path)};if(fingerprintStore)await fingerprintStore.set('text-simhash',file,value);return value;};
    const result=await findSimilarTexts(scan.files,{threshold:cycle.input.threshold??10,maxFiles:cycle.input.maxTextFiles||8000,maxBytes:cycle.input.maxBytes||262144,maxGroups:cycle.input.maxGroups||1000,maxPairs:cycle.input.maxPairs||12000,resolveHashProfile});
    if(fingerprintStore){await fingerprintStore.prune();await fingerprintStore.save();}result.cache={hits:cacheHits,misses:cacheMisses};
    return{status:'completed',result,steps:[step('scan','read','completed','اسکن فایل‌های متنی',`${result.candidateFiles} فایل کاندید`),step('fingerprint','analysis','completed','ساخت/خواندن SimHash',`${result.processedFiles} فایل · Cache ${cacheHits}/${cacheMisses}`),step('cluster','analysis','completed','خوشه‌بندی متن‌های مشابه',`${result.groupsTotal} گروه`),step('verify','verify','completed','Self-Audit Similarity','بر اساس محتوای متنی؛ فقط Read-only')],evidence:[...cycle.evidence,evidence('SIMILAR_TEXTS_COMPLETE',{groups:result.groupsTotal,processed:result.processedFiles,errors:result.errorsTotal,cacheHits,cacheMisses,threshold:result.threshold,truncated:scan.truncated})]};
  },async onEnd(cycle){return{summary:`${cycle.result?.groupsTotal||0} گروه فایل متنی نزدیک به هم پیدا شد؛ هیچ فایل تغییر نکرد.`,quality:'verified',nextCycleSuggestions:['workspace-intelligence']};}};
}

function workspaceIntelligenceCycle(){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});const result=await analyzeWorkspaceIntelligence(cycle.input.root,scan.files,{maxDepth:cycle.input.maxDepth||3,maxResults:cycle.input.maxResults||200,minConfidence:cycle.input.minConfidence??.58,maxFiles:cycle.input.maxRenameCandidates||200});
    const valid=result?.policy?.autoApply===false&&Array.isArray(result.projects)&&Array.isArray(result.destinationSuggestions)&&Array.isArray(result.renameSuggestions);
    return{status:valid?'completed':'failed',result,steps:[step('scan','read','completed','اسکن ساختار Workspace',`${scan.files.length} فایل`),step('projects','analysis','completed','تشخیص Project Candidate',`${result.summary.projectCandidates} پروژه احتمالی`),step('destinations','analysis','completed','پیشنهاد مقصد فایل‌های Loose',`${result.summary.destinationSuggestions} پیشنهاد`),step('renames','analysis','completed','پیشنهاد Rename محتوایی',`${result.summary.renameSuggestions} پیشنهاد`),step('verify','verify',valid?'completed':'failed','Policy Gate',valid?'Suggestion-only · Auto Apply خاموش است':'ساختار Policy نامعتبر')],evidence:[...cycle.evidence,evidence('WORKSPACE_INTELLIGENCE_COMPLETE',{valid,...result.summary,truncated:scan.truncated,policy:result.policy})]};
  },async onEnd(cycle){return{summary:cycle.status==='completed'?`Intelligence کامل شد: ${cycle.result?.summary?.projectCandidates||0} پروژه احتمالی، ${cycle.result?.summary?.destinationSuggestions||0} مقصد پیشنهادی و ${cycle.result?.summary?.renameSuggestions||0} Rename پیشنهادی. هیچ Write انجام نشد.`:'تحلیل Intelligence کامل نشد.',quality:cycle.status==='completed'?'verified':'failed',nextCycleSuggestions:['similar-images','similar-texts']};}};
}


function reviewQueueBuildCycle({reviewQueueStore}){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});const intelligence=await analyzeWorkspaceIntelligence(cycle.input.root,scan.files,{maxDepth:cycle.input.maxDepth||3,maxResults:cycle.input.maxResults||250,minConfidence:cycle.input.minConfidence??.58,maxFiles:cycle.input.maxRenameCandidates||250});const min=Number(cycle.input.queueMinConfidence??.72);const sourceMeta=new Map(scan.files.map(f=>[f.path,{size:f.size,mtimeMs:f.mtimeMs}]));const candidates=[];
    for(const x of intelligence.destinationSuggestions||[]){if(Number(x.confidence)<min)continue;candidates.push({root:cycle.input.root,actionType:'move',source:x.path,suggestedFolder:x.suggestedFolder,confidence:x.confidence,confidenceBand:x.confidenceBand,evidence:x.evidence,sourceMeta:sourceMeta.get(x.path)||null});}
    for(const x of intelligence.renameSuggestions||[]){if(Number(x.confidence)<min)continue;candidates.push({root:cycle.input.root,actionType:'rename',source:x.path,suggestedName:x.suggestedName,confidence:x.confidence,confidenceBand:x.confidenceBand,evidence:x.evidence,sourceMeta:sourceMeta.get(x.path)||null});}
    const queued=reviewQueueStore.upsertMany(candidates.slice(0,cycle.input.maxQueueItems||500));const result={queued:queued.length,pending:reviewQueueStore.list({root:cycle.input.root,status:'pending'}).length,minConfidence:min,intelligenceSummary:intelligence.summary,items:reviewQueueStore.list({root:cycle.input.root}).slice(0,500),policy:{autoApply:false,workspaceWrite:false}};
    return{status:'completed',result,steps:[step('scan','read','completed','اسکن Workspace',`${scan.files.length} فایل`),step('analyze','analysis','completed','ساخت پیشنهادهای Intelligence',`${intelligence.summary.destinationSuggestions} Move · ${intelligence.summary.renameSuggestions} Rename`),step('queue','local-write','completed','ثبت Recommendation Review Queue',`${queued.length} پیشنهاد با Confidence ≥ ${Math.round(min*100)}%`),step('verify','verify','completed','Policy Gate','صف فقط در دیتای Agent ثبت شد؛ Workspace تغییر نکرد')],evidence:[...cycle.evidence,evidence('REVIEW_QUEUE_BUILT',{queued:queued.length,pending:result.pending,minConfidence:min,truncated:scan.truncated})]};
  },async onEnd(cycle){return{summary:`${cycle.result?.queued||0} پیشنهاد وارد/به‌روزرسانی صف Review شد. هیچ Move/Rename اجرا نشد.`,quality:'verified',nextCycleSuggestions:['recommendation-apply']};}};
}

function recommendationApplyCycle({reviewQueueStore,transactionStore=null}){
  return{resumable:true,async next(cycle){
    if(!cycle.steps.length){const ids=Array.isArray(cycle.input.itemIds)?cycle.input.itemIds:[];const all=reviewQueueStore.list({root:cycle.input.root});const selected=all.filter(x=>ids.includes(x.id)&&x.status==='pending');const plan=await buildRecommendationPlan(cycle.input.root,selected);return{operations:plan.operations,selectedItemIds:[...new Set(plan.operations.flatMap(x=>x.itemIds))],status:'waiting-confirmation',result:{preview:{operations:plan.operations,bytes:plan.bytes,items:plan.items}},steps:[step('queue','read','completed','خواندن انتخاب‌های Review Queue',`${selected.length} پیشنهاد`),step('plan','simulation','completed','ترکیب Move/Rename و ساخت Preview',`${plan.operations.length} عملیات فایل`),step('confirm','approval','waiting-confirmation','تأیید اجرای پیشنهادها','Staging → Apply → Verify؛ بدون overwrite'),step('execute','write','pending','اجرای Recommendation Batch'),step('verify','verify','pending','Self-Audit مقصد و اندازه')],evidence:[...cycle.evidence,evidence('RECOMMENDATION_PREVIEW',{items:selected.length,operations:plan.operations.length,bytes:plan.bytes})]};}
    if(cycle.steps.find(s=>s.id==='confirm')?.status==='approved'&&cycle.steps.find(s=>s.id==='execute')?.status==='pending'){const completed=await executeRecommendationPlan(cycle.input.root,cycle.id,cycle.operations||[],{transactionStore});const verification=await verifyRecommendationPlan(completed);if(verification.ok)for(const op of completed)reviewQueueStore.mark(op.itemIds,{status:'applied',lastCycleId:cycle.id,appliedDestination:op.destination});const steps=cycle.steps.map(s=>s.id==='execute'?step('execute','write',verification.ok?'completed':'failed','اجرای Recommendation Batch',`${completed.length} فایل`):s.id==='verify'?step('verify','verify',verification.ok?'completed':'failed','Self-Audit مقصد و اندازه',verification.ok?'Source/Target/Size تأیید شد':`${verification.mismatches.length} مغایرت`):s);return{status:verification.ok?'completed':'failed',completedOperations:completed,undoStack:completed.map(x=>x.undo),verification,result:{...(cycle.result||{}),applied:completed.length},steps,evidence:[...cycle.evidence,evidence('RECOMMENDATION_SELF_AUDIT',{ok:verification.ok,mismatches:verification.mismatches.length,files:completed.length})]};}
    return{status:cycle.status};
  },async onEnd(cycle){return{summary:cycle.status==='completed'?`${cycle.completedOperations?.length||0} فایل طبق پیشنهادهای انتخاب‌شده تغییر و راستی‌آزمایی شد.`:cycle.status==='cancelled'?'اجرای پیشنهادها لغو شد؛ Workspace تغییر نکرد.':'اجرای پیشنهادها کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:['snapshot','workspace-health']};},async undo(cycle){const results=await undoRecommendationPlan(cycle.completedOperations||[]);if(results.length&&results.every(x=>x.ok!==false))reviewQueueStore.mark(cycle.selectedItemIds||[],{status:'reverted',lastCycleId:cycle.id,appliedDestination:null});return results;}};
}

function managedZoneAuditCycle({storageTrendStore}){
  return{async next(cycle){if(cycle.steps.length)return{status:'completed'};const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||150000,maxDirs:cycle.input.maxDirs||60000});const result=await auditManagedZone(cycle.input.root,scan,cycle.input);const sample=storageTrendStore.record(cycle.input.root,{files:result.files,scannedBytes:result.bytes,totalBytes:result.storage?.totalBytes||0,freeBytes:result.storage?.freeBytes||0,usedBytes:result.storage?.usedBytes||0,clutterScore:result.clutterScore});result.trend=storageTrendStore.list(cycle.input.root,{limit:90});const prev=result.trend.length>1?result.trend[result.trend.length-2]:null;result.trendSummary=prev?{filesDelta:sample.files-prev.files,scannedBytesDelta:sample.scannedBytes-prev.scannedBytes,freeBytesDelta:sample.freeBytes-prev.freeBytes,clutterDelta:sample.clutterScore-prev.clutterScore}:null;return{status:'completed',result,steps:[step('scan','read','completed','اسکن Managed Zone',`${result.files} فایل`),step('analyze','analysis','completed','Downloads/Desktop Workspace Audit',`Clutter ${result.clutterScore}/100 · ${result.old90} فایل > 90 روز`),step('trend','local-write','completed','ثبت Storage Trend',`${result.trend.length} نمونه تاریخی`),step('verify','verify','completed','Policy Gate','فقط گزارش و دیتای داخلی Agent؛ هیچ فایل تغییر نکرد')],evidence:[...cycle.evidence,evidence('MANAGED_ZONE_AUDIT',{files:result.files,bytes:result.bytes,clutterScore:result.clutterScore,old90:result.old90,partialDownloads:result.partialDownloads.length,truncated:scan.truncated,sampleAt:sample.at})]};},async onEnd(cycle){return{summary:`Managed Zone بررسی شد: ${cycle.result?.files||0} فایل، Clutter ${cycle.result?.clutterScore??'-'}/100. هیچ تغییر خودکاری انجام نشد.`,quality:'verified',nextCycleSuggestions:['workspace-intelligence','maintenance-cleanup']};}};
}

function driveAuditCycle(){
  return{async next(cycle){if(cycle.steps.length)return{status:'completed'};const result=await auditDrive(cycle.input.root,{driveRoot:cycle.input.driveRoot||'',maxFiles:cycle.input.maxFiles||350000,maxDirs:cycle.input.maxDirs||140000,skipSystem:cycle.input.skipSystem!==false,largeThresholdBytes:cycle.input.largeThresholdBytes||1024*1024*1024});return{status:'completed',result,steps:[step('scope','read','completed','تعیین Drive Scope',result.root),step('scan','read','completed','Drive-wide Audit',`${result.scannedFiles} فایل · ${result.scanDirs} پوشه`),step('analyze','analysis','completed','تحلیل مصرف و فایل‌های حجیم',`${result.largeFiles.length} فایل ≥ 1GB · ${result.topFolders.length} Folder summary`),step('verify','verify','completed','Safety/Scope Audit',result.truncated?`اسکن محدود شد: ${result.truncateReason}`:`System folders skipped: ${result.systemFoldersSkipped.length}`)],evidence:[...cycle.evidence,evidence('DRIVE_AUDIT_COMPLETE',{root:result.root,files:result.scannedFiles,bytes:result.scannedBytes,errors:result.errorsTotal,truncated:result.truncated,coverageEstimate:result.coverageEstimate})]};},async onEnd(cycle){return{summary:`Drive Audit روی ${cycle.result?.root||'-'} انجام شد؛ ${cycle.result?.scannedFiles||0} فایل کاربری/غیرسیستمی بررسی شد و هیچ Write انجام نشد.`,quality:'verified',nextCycleSuggestions:[]};}};
}

function pdfIntelligenceCycle(){
  return{async next(cycle){if(cycle.steps.length)return{status:'completed'};const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||100000});const pdfs=scan.files.filter(f=>String(f.ext||'').toLowerCase()==='.pdf').sort((a,b)=>Number(b.size||0)-Number(a.size||0)).slice(0,Math.max(1,Math.min(200,Number(cycle.input.maxPdfs||50))));const rows=[],errors=[];for(const f of pdfs){try{const x=await extractPdfText(f.path,{maxOutputChars:cycle.input.maxOutputChars||30000});rows.push({path:f.path,size:f.size,mtimeMs:f.mtimeMs,pages:x.pages,encrypted:x.encrypted,metadata:x.metadata,textPreview:x.text.slice(0,1200),chars:x.chars,streams:x.streams,skippedStreams:x.skippedStreams,limitations:x.limitations});}catch(error){errors.push({path:f.path,error:error.code||error.message});}}const result={schemaVersion:'pdf-intelligence-v1',pdfsFound:scan.files.filter(f=>String(f.ext||'').toLowerCase()==='.pdf').length,processed:rows.length,errorsTotal:errors.length,rows,errors:errors.slice(0,100),truncated:scan.truncated,policy:{readOnly:true,noOcr:true}};return{status:'completed',result,steps:[step('scan','read','completed','اسکن PDFهای Workspace',`${result.pdfsFound} PDF`),step('extract','analysis','completed','PDF Base Intelligence',`${result.processed} پردازش · ${result.errorsTotal} خطا`),step('verify','verify','completed','Policy Gate','Read-only · بدون OCR · PDF رمزگذاری‌شده فقط Metadata')],evidence:[...cycle.evidence,evidence('PDF_INTELLIGENCE_COMPLETE',{found:result.pdfsFound,processed:result.processed,errors:result.errorsTotal,truncated:scan.truncated})]};},async onEnd(cycle){return{summary:`${cycle.result?.processed||0} PDF با extractor پایه بررسی شد؛ هیچ تغییری انجام نشد.`,quality:'verified',nextCycleSuggestions:['similar-texts']};}};
}

function windowsUiMapCycle(){
  return{async next(cycle){
    if(cycle.steps.length)return{status:'completed'};
    const windows=await listTopLevelWindows({maxWindows:cycle.input.maxWindows||80});
    const focused=await inspectWindowsUi({maxNodes:cycle.input.maxNodes||500});
    if(!windows.supported||!focused.supported){
      const result={supported:false,platform:process.platform,windows:windows.windows||[],focused,policy:{readOnly:true,noClick:true,noKeyboard:true,noValueWrite:true}};
      return{status:'completed',result,steps:[step('platform','read','completed','بررسی Windows UI Automation',`Platform: ${process.platform}`),step('ground','analysis','completed','UIA Grounding','این Runtime ویندوز نیست؛ روی Windows 10/11 فعال می‌شود.')],evidence:[...cycle.evidence,evidence('WINDOWS_UIA_UNSUPPORTED',{platform:process.platform})]};
    }
    const result={schemaVersion:'windows-uia-map-v1',supported:true,platform:'win32',windows:windows.windows,totalWindows:windows.total,windowsTruncated:windows.truncated,focusedWindow:focused.window,focusedElement:focused.focus,elements:focused.elements,totalDescendants:focused.totalDescendants,elementsTruncated:focused.truncated,policy:focused.policy};
    return{status:'completed',result,steps:[step('windows','read','completed','Top-level Windows',`${result.windows.length}/${result.totalWindows} window`),step('focus','read','completed','Focused Window',result.focusedWindow?.name||'بدون عنوان'),step('ground','analysis','completed','UIA Control Grounding',`${result.elements.length}/${result.totalDescendants} control`),step('policy','verify','completed','Action Policy','Read-only · no click · no keyboard · no value write')],evidence:[...cycle.evidence,evidence('WINDOWS_UIA_MAP_COMPLETE',{windows:result.windows.length,elements:result.elements.length,totalDescendants:result.totalDescendants,truncated:result.elementsTruncated})]};
  },async onEnd(cycle){return{summary:cycle.result?.supported?`${cycle.result.elements?.length||0} کنترل UI از پنجره فعال با Windows UI Automation خوانده شد؛ هیچ Action اجرا نشد.`:'UIA Grounding فقط روی Windows runtime فعال است.',quality:'verified',nextCycleSuggestions:[]};}};
}


function windowsUiActionCycle({sessionStore,prepareAction=prepareWindowsUiAction,executeAction=executePinnedWindowsUiAction,onVerified=null}){
  return{async next(cycle){
    const token=cycle.input.sessionToken||'';
    if(!cycle.steps.length){
      const request=sessionStore.get(token);
      if(!request)throw Object.assign(new Error('Action session منقضی یا نامعتبر است؛ Preview جدید لازم است.'),{code:'UIA_ACTION_SESSION_EXPIRED'});
      const prepared=await prepareAction(request);
      if(!prepared.supported){sessionStore.forget(token);return{status:'completed',result:prepared,steps:[step('platform','read','completed','Windows UI Automation Action',`Platform: ${prepared.platform||process.platform}`),step('policy','verify','completed','Action Policy','اجرای UIA فقط روی Windows 10/11 runtime فعال است.')],evidence:[...cycle.evidence,evidence('WINDOWS_UIA_ACTION_UNSUPPORTED',{platform:prepared.platform||process.platform})]};}
      if(!prepared.ok)throw Object.assign(new Error(prepared.message||'UIA Action Preview ناموفق بود.'),{code:prepared.code||'UIA_ACTION_PREVIEW_FAILED',details:{candidateCount:prepared.candidateCount||0,blockedTerms:prepared.blockedTerms||[]}});
      const plan=prepared.plan;
      return{status:'waiting-confirmation',actionPlan:plan,result:{supported:true,phase:'preview',plan,target:prepared.target},steps:[
        step('resolve','read','completed','Resolve UIA Target',`${prepared.target.name||prepared.target.automationId||'(بدون نام)'} · PID ${prepared.target.processId}`),
        step('pin','simulation','completed','Pin selector + Runtime fingerprint',plan.planHash.slice(0,16)),
        step('confirm','approval','waiting-confirmation','تأیید Windows UI Action',`${plan.action} · بدون coordinate click/SendKeys/Shell`),
        step('execute','write','pending','اجرای UI Automation Pattern'),
        step('verify','verify','pending','Verify-after-action')
      ],evidence:[...cycle.evidence,evidence('WINDOWS_UIA_ACTION_PREVIEW',{action:plan.action,risk:plan.risk,planHash:plan.planHash,target:{processId:plan.target.processId,name:plan.target.name,automationId:plan.target.automationId,controlType:plan.target.controlType,windowName:plan.target.windowName},valueHash:plan.valueHash,valueLength:plan.valueLength})]};
    }
    if(cycle.steps.find(s=>s.id==='confirm')?.status==='approved'&&cycle.steps.find(s=>s.id==='execute')?.status==='pending'){
      const request=sessionStore.consume(token);
      if(!request){return{status:'failed',steps:cycle.steps.map(s=>s.id==='execute'?step('execute','write','failed','اجرای UI Automation Pattern','Session منقضی شد؛ هیچ Action اجرا نشد'):s.id==='verify'?step('verify','verify','failed','Verify-after-action','Preview جدید لازم است'):s),evidence:[...cycle.evidence,evidence('WINDOWS_UIA_ACTION_SESSION_EXPIRED',{safeAbort:true})]};}
      if(cycle.actionPlan?.valueHash&&hash(request.value||'')!==cycle.actionPlan.valueHash){return{status:'failed',steps:cycle.steps.map(s=>s.id==='execute'?step('execute','write','failed','اجرای UI Automation Pattern','Value با Preview تطبیق ندارد'):s.id==='verify'?step('verify','verify','failed','Verify-after-action','Action اجرا نشد'):s),evidence:[...cycle.evidence,evidence('WINDOWS_UIA_ACTION_VALUE_CHANGED',{safeAbort:true})]};}
      const out=await executeAction(cycle.actionPlan,request.value||'');
      const ok=Boolean(out.ok&&out.verification?.ok);let learned=null;
      if(ok&&onVerified){try{learned=await onVerified({cycle,plan:cycle.actionPlan,execution:out,context:request.context||null});}catch{learned=null;}}
      return{status:ok?'completed':'failed',result:{supported:true,phase:'executed',plan:cycle.actionPlan,execution:out,groundingLearned:Boolean(learned)},steps:cycle.steps.map(s=>s.id==='execute'?step('execute','write',out.code==='UIA_ACTION_VERIFIED'?'completed':'failed','اجرای UI Automation Pattern',out.code||'unknown'):s.id==='verify'?step('verify','verify',ok?'completed':'failed','Verify-after-action',out.verification?.detail||out.message||out.code||'ناموفق'):s),evidence:[...cycle.evidence,evidence(ok?'WINDOWS_UIA_ACTION_VERIFIED':'WINDOWS_UIA_ACTION_SAFE_ABORT',{ok,code:out.code,action:cycle.actionPlan?.action,planHash:cycle.actionPlan?.planHash,verificationMode:out.verification?.mode||null,safeAbort:!ok,groundingLearned:Boolean(learned)})]};
    }
    return{status:cycle.status};
  },async onEnd(cycle){sessionStore.forget(cycle.input.sessionToken||'');const ex=cycle.result?.execution;return{summary:cycle.status==='completed'&&cycle.result?.phase==='executed'?`UIA Action «${cycle.actionPlan?.action||'-'}» اجرا و با ${ex?.verification?.mode||'verification'} بررسی شد.`:cycle.status==='completed'&&!cycle.result?.supported?'UI Automation Action فقط روی Windows runtime فعال است.':cycle.status==='cancelled'?'UIA Action توسط کاربر لغو شد؛ هیچ Action اجرا نشد.':'UIA Action متوقف شد؛ در خطای Pin/Verify اجرای آزاد یا Retry کور انجام نشد.',quality:cycle.status==='completed'?(cycle.actionPlan?.action==='invoke'?'execution-verified':'verified'):cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:['windows-ui-map']};}};
}

function missionCycle({getEngine,onOutcome=null}){
  return{async next(cycle){
    const engine=getEngine();
    if(!cycle.goalPlan){
      const external=cycle.input?.planSource==='local-ai-token'&&cycle.input?.goalPlan?.schemaVersion==='workspace-ai-goal-plan-v1';
      const goalPlan=external?JSON.parse(JSON.stringify(cycle.input.goalPlan)):planGoal(cycle.input.command||'');
      const missionDag=compileMissionPlan(goalPlan,{maxNodes:cycle.input.maxNodes||24,maxWallTimeMs:cycle.input.maxWallTimeMs||30*60*1000});
      const dagCheck=verifyDag(missionDag);if(!dagCheck.ok)throw Object.assign(new Error('Mission DAG معتبر نیست.'),{code:dagCheck.code,details:dagCheck});
      return{goalPlan,missionDag,missionIndex:0,childCycles:[],steps:[step('understand','analysis','completed',external?'اعتبارسنجی Local AI Plan':'فهم فرمان فارسی',`Confidence ${Math.round(goalPlan.confidence*100)}%`),step('plan','planning','completed','ساخت Skill DAG',`${missionDag.summary.nodes} node · ${missionDag.summary.write} write`) ],evidence:[...cycle.evidence,evidence('MISSION_PLANNED',{source:external?'local-ai-token':'deterministic',confidence:goalPlan.confidence,steps:goalPlan.steps.map(s=>s.type),constraints:goalPlan.constraints,dag:missionDag.summary,policy:missionDag.policy})]};
    }
    const index=Number(cycle.missionIndex||0);const planSteps=cycle.missionDag?.nodes||[];
    if(index>=planSteps.length)return{status:'completed',result:{goalPlan:cycle.goalPlan,missionDag:cycle.missionDag,childCycles:cycle.childCycles||[]}};
    const missionStep=planSteps[index];
    const completedIds=(cycle.childCycles||[]).filter(x=>x.status==='completed'||x.status==='rolled-back').map(x=>x.missionStepId);
    const unmet=(missionStep.dependsOn||[]).filter(x=>!completedIds.includes(x));
    if(unmet.length)throw Object.assign(new Error('Dependencyهای Skill DAG هنوز کامل نشده‌اند.'),{code:'MISSION_DEPENDENCY_NOT_READY',details:{nodeId:missionStep.id,unmet}});
    let childEntry=(cycle.childCycles||[]).find(x=>x.missionStepId===missionStep.id);
    if(!childEntry){
      const child=engine.create(missionStep.cycleType,{root:cycle.input.root,...(missionStep.input||{})},{parentMissionId:cycle.id,missionStepId:missionStep.id,skillId:missionStep.skillId,risk:missionStep.risk});const run=await engine.run(child.id);childEntry={missionStepId:missionStep.id,skillId:missionStep.skillId,type:missionStep.cycleType,cycleId:run.id,status:run.status,label:missionStep.label,risk:missionStep.risk};
      const childCycles=[...(cycle.childCycles||[]),childEntry];
      const missionRow=step(`mission-${missionStep.id}`,'child',run.status==='completed'?'completed':run.status==='waiting-confirmation'?'waiting-confirmation':run.status,missionStep.label,`${missionStep.skillId} · ${missionStep.risk} · ${run.end?.summary||run.status}`);
      if(run.status==='waiting-confirmation')return{status:'waiting-confirmation',pendingChildId:run.id,pendingMissionStepId:missionStep.id,childCycles,steps:[...cycle.steps,missionRow],evidence:[...cycle.evidence,evidence('MISSION_CHILD_WAITING',{childCycleId:run.id,type:missionStep.cycleType,skillId:missionStep.skillId,risk:missionStep.risk})]};
      if(run.status!=='completed'&&run.status!=='rolled-back')return{status:'failed',childCycles,steps:[...cycle.steps,missionRow],evidence:[...cycle.evidence,evidence('MISSION_CHILD_FAILED',{childCycleId:run.id,type:missionStep.cycleType,skillId:missionStep.skillId,status:run.status})]};
      return{missionIndex:index+1,childCycles,steps:[...cycle.steps,missionRow],evidence:[...cycle.evidence,evidence('MISSION_CHILD_COMPLETE',{childCycleId:run.id,type:missionStep.cycleType,skillId:missionStep.skillId})]};
    }
    if(cycle.pendingChildId===childEntry.cycleId){
      const confirmStep=cycle.steps.find(s=>s.id===`mission-${missionStep.id}`);
      if(confirmStep?.status==='approved'){
        const child=await engine.confirm(childEntry.cycleId,'approve');const childCycles=(cycle.childCycles||[]).map(x=>x.cycleId===child.id?{...x,status:child.status}:x);
        const steps=cycle.steps.map(s=>s.id===`mission-${missionStep.id}`?step(s.id,'child',child.status==='completed'?'completed':child.status,missionStep.label,`${missionStep.skillId} · ${child.end?.summary||child.status}`):s);
        if(child.status!=='completed')return{status:'failed',childCycles,steps,pendingChildId:null,pendingMissionStepId:null,evidence:[...cycle.evidence,evidence('MISSION_CHILD_CONFIRM_FAILED',{childCycleId:child.id,skillId:missionStep.skillId,status:child.status})]};
        return{missionIndex:index+1,childCycles,steps,pendingChildId:null,pendingMissionStepId:null,evidence:[...cycle.evidence,evidence('MISSION_CHILD_CONFIRMED_COMPLETE',{childCycleId:child.id,skillId:missionStep.skillId})]};
      }
    }
    return{status:cycle.status};
  },async onEnd(cycle){if(cycle.status==='cancelled'&&cycle.pendingChildId){try{const child=getEngine().store.get(cycle.pendingChildId);if(child?.status==='waiting-confirmation')await getEngine().confirm(child.id,'reject');}catch{}}try{onOutcome?.(cycle.goalPlan,cycle.status);}catch{}return{summary:cycle.status==='completed'?`Mission با ${(cycle.childCycles||[]).length} Skill Cycle کامل شد.`:cycle.status==='cancelled'?'Mission در مرحله تأیید متوقف شد.':'Mission کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:[]};},async undo(cycle){
    const engine=getEngine();const results=[];for(const child of [...(cycle.childCycles||[])].reverse()){const live=engine.store.get(child.cycleId);if(live?.status!=='completed')continue;const handler=engine.handler(live.type);if(typeof handler?.undo!=='function')continue;const r=await engine.rollback(live.id);results.push({ok:r.ok,childCycleId:live.id,type:live.type,skillId:child.skillId,details:r.results});}
    return results.length?results:[{ok:false,error:'NO_UNDOABLE_CHILD_CYCLES'}];
  }};
}
module.exports={fileSearchCycle,snapshotCycle,snapshotDiffCycle,maintenanceCleanupCycle,windowsSystemCycle,windowsUiMapCycle,windowsUiActionCycle,renameCycle,similarImagesCycle,similarTextsCycle,workspaceIntelligenceCycle,reviewQueueBuildCycle,recommendationApplyCycle,managedZoneAuditCycle,driveAuditCycle,pdfIntelligenceCycle,missionCycle};
