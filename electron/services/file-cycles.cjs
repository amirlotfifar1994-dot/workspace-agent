const { scanTree } = require('./file-indexer.cjs');
const { findExactDuplicates } = require('./duplicate-finder.cjs');
const { planOrganization, executeMoves, verifyMoves, undoMoves } = require('./organizer.cjs');
const { analyzeWorkspace, summarizeCategories } = require('./file-analyzer.cjs');
const { buildDuplicateReviewPlan, executeQuarantine, verifyQuarantine, restoreQuarantine } = require('./quarantine.cjs');

function step(id, kind, status, label, detail='') { return { id, kind, status, label, detail, at: new Date().toISOString() }; }
function evidence(code,data={}){return {at:new Date().toISOString(),code,...data};}
function scanCycle() {
  return { async next(cycle) {
    if (cycle.steps.length) return { status:'completed' };
    const scan = await scanTree(cycle.input.root, { maxFiles: cycle.input.maxFiles || 250000 });
    const bytes=scan.files.reduce((n,f)=>n+Number(f.size||0),0);
    const result={filesCount:scan.files.length,dirs:scan.dirs,errors:scan.errors.length,errorSample:scan.errors.slice(0,100),truncated:scan.truncated,truncateReason:scan.truncateReason,bytes,categories:summarizeCategories(scan.files)};
    return { status: 'completed', result, steps: [step('scan','read','completed','اسکن فایل‌ها', `${scan.files.length} فایل · ${scan.dirs} پوشه · ${scan.errors.length} خطای دسترسی`),step('verify','verify','completed','Self-Audit Scan',scan.truncated?'اسکن به سقف ایمنی رسید':'اسکن کامل شد')], evidence: [...cycle.evidence, evidence('SCAN_COMPLETE',{files:scan.files.length,dirs:scan.dirs,errors:scan.errors.length,truncated:scan.truncated,bytes})] };
  }, async onEnd(cycle) { return { summary: `${cycle.result?.filesCount || 0} فایل بررسی شد؛ هیچ تغییری روی دیسک انجام نشد.`, quality:'verified', nextCycleSuggestions: ['workspace-health','duplicates','snapshot'] }; } };
}
function healthCycle() {
  return { async next(cycle){
    if(cycle.steps.length) return {status:'completed'};
    const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});
    const result=await analyzeWorkspace(cycle.input.root,scan,{largeThresholdBytes:cycle.input.largeThresholdBytes||500*1024*1024,staleDays:cycle.input.staleDays||365,recentDays:cycle.input.recentDays||7,longPathThreshold:cycle.input.longPathThreshold||220});
    const valid=Array.isArray(result.categories)&&Array.isArray(result.largest)&&Array.isArray(result.junk)&&Array.isArray(result.emptyFolders)&&result.healthScore?.score>=0;
    return {
      status:valid?'completed':'failed', result,
      steps:[
        step('scan','read','completed','اسکن فضای کاری',`${scan.files.length} فایل · ${scan.errors.length} خطای دسترسی`),
        step('analyze','analysis','completed','تحلیل سلامت Workspace',`Score ${result.healthScore.score}/100 · ${result.largestTotal} فایل حجیم · ${result.emptyFoldersTotal} پوشه خالی · ${result.junkTotal} Junk`),
        step('verify','verify',valid?'completed':'failed','Self‑Audit گزارش',valid?(scan.truncated?'گزارش معتبر است؛ اسکن محدود شده':'ساختار گزارش معتبر است'):'گزارش ناقص است')
      ],
      evidence:[...cycle.evidence,evidence('HEALTH_SELF_AUDIT',{valid,score:result.healthScore.score,files:result.scannedFiles,junk:result.junkTotal,emptyFolders:result.emptyFoldersTotal,longPaths:result.longPaths.total,zeroByte:result.zeroByte.total,unreadable:result.unreadableCount,truncated:scan.truncated})]
    };
  },async onEnd(cycle){return {summary:cycle.status==='completed'?`تحلیل سلامت روی ${cycle.result?.scannedFiles||0} فایل کامل شد؛ امتیاز Workspace: ${cycle.result?.healthScore?.score??'-'}/100. هیچ فایلی حذف یا جابه‌جا نشد.`:'تحلیل سلامت کامل نشد.',quality:cycle.status==='completed'?'verified':'failed',nextCycleSuggestions:['maintenance-cleanup','duplicates','snapshot']};}}
}
function duplicateCycle() {
  return { async next(cycle) {
    if(cycle.steps.length) return {status:'completed'};
    const scan = await scanTree(cycle.input.root, { maxFiles: cycle.input.maxFiles || 250000 });
    const result = await findExactDuplicates(scan.files,{concurrency:cycle.input.hashConcurrency||3,maxGroups:cycle.input.maxGroups||5000});
    return {
      status:'completed', result,
      steps:[
        step('scan','read','completed','اسکن فایل‌ها',`${scan.files.length} فایل`),
        step('hash','analysis','completed','هش‌گیری کنترل‌شده SHA‑256',`${result.hashedFiles} فایل کاندید · ${result.groupsTotal} گروه`),
        step('final','verify','completed','جمع‌بندی تکراری‌ها',`${result.duplicateFiles} فایل اضافه · ${result.errorsTotal} خطای Hash`)
      ],
      evidence:[...cycle.evidence,evidence('DUPLICATE_HASH_COMPLETE',{groups:result.groupsTotal,returnedGroups:result.groups.length,reclaimableBytes:result.reclaimableBytes,hashErrors:result.errorsTotal,truncated:scan.truncated})]
    };
  }, async onEnd(cycle){ return { summary:`${cycle.result?.groupsTotal ?? cycle.result?.groups?.length ?? 0} گروه تکراری قطعی پیدا شد. حذف خودکار انجام نشد.`, quality:'verified', nextCycleSuggestions: cycle.result?.groups?.length ? ['duplicate-review'] : [] }; } };
}
function duplicateReviewCycle({transactionStore=null}={}){
  return {resumable:true,async next(cycle){
    if(!cycle.steps.length){
      const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||250000});
      const duplicates=await findExactDuplicates(scan.files,{concurrency:cycle.input.hashConcurrency||3,maxGroups:cycle.input.maxGroups||5000});
      const plan=buildDuplicateReviewPlan(cycle.input.root,duplicates.groups,{selectedGroupIds:cycle.input.selectedGroupIds||null});
      const operations=plan.operations.slice(0,cycle.input.maxOperations||5000);const reviewIds=new Set(operations.map(o=>o.groupId));const review=plan.review.filter(r=>reviewIds.has(r.groupId));
      return {
        review,operations,reclaimableBytes:operations.reduce((n,o)=>n+Number(o.size||0),0),status:'waiting-confirmation',
        steps:[
          step('scan','read','completed','اسکن مجدد برای ایمنی',`${scan.files.length} فایل`),
          step('hash','analysis','completed','تأیید SHA‑256',`${duplicates.groupsTotal} گروه قطعی`),
          step('plan','simulation','completed','انتخاب Keeper و ساخت Preview',`${operations.length} فایل → قرنطینه`),
          step('confirm','approval','waiting-confirmation','تأیید قرنطینه','هیچ فایل دائماً حذف نمی‌شود'),
          step('execute','write','pending','انتقال به Quarantine'),
          step('verify','verify','pending','راستی‌آزمایی و قابلیت Restore')
        ],
        evidence:[...cycle.evidence,evidence('DUPLICATE_REVIEW_PREVIEW',{groups:review.length,operations:operations.length,reclaimableBytes:operations.reduce((n,o)=>n+Number(o.size||0),0),operationsCapped:plan.operations.length>operations.length,truncated:scan.truncated})]
      };
    }
    if(cycle.steps.find(s=>s.id==='confirm')?.status==='approved'&&cycle.steps.find(s=>s.id==='execute')?.status==='pending'){
      const q=await executeQuarantine(cycle.input.root,cycle.id,cycle.operations,cycle.review,{transactionStore}); const verification=await verifyQuarantine(q.completed);
      const steps=cycle.steps.map(s=>s.id==='execute'?step('execute','write','completed','انتقال به Quarantine',`${q.completed.length} فایل`):s.id==='verify'?step('verify','verify',verification.ok?'completed':'failed','راستی‌آزمایی و قابلیت Restore',verification.ok?'مبدأ حذف و مقصد/اندازه تأیید شد':`${verification.mismatches.length} مغایرت`):s);
      return {status:verification.ok?'completed':'failed',quarantineBase:q.base,completedOperations:q.completed,undoStack:q.completed.map(x=>x.undo),verification,steps,evidence:[...cycle.evidence,evidence('QUARANTINE_SELF_AUDIT',{ok:verification.ok,mismatches:verification.mismatches.length,files:q.completed.length})]};
    }
    return{status:cycle.status};
  },async onEnd(cycle){return{summary:cycle.status==='completed'?`${cycle.completedOperations?.length||0} فایل تکراری به قرنطینه منتقل و راستی‌آزمایی شد. Restore فعال است.`:cycle.status==='cancelled'?'قرنطینه لغو شد؛ هیچ فایل تکراری جابه‌جا نشد.':'چرخه قرنطینه کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:cycle.status==='completed'?['workspace-health','snapshot']:[]};},async undo(cycle){return restoreQuarantine(cycle.completedOperations||[]);}}
}
function organizeCycle({transactionStore=null}={}) {
  return { resumable:true, async next(cycle) {
    if (!cycle.steps.length) {
      const scan=await scanTree(cycle.input.root,{maxFiles:cycle.input.maxFiles||100000});
      const allOperations=planOrganization(cycle.input.root,scan.files,{mode:cycle.input.mode||'type'});const operations=allOperations.slice(0,cycle.input.maxOperations||10000);
      return {
        operations,status:'waiting-confirmation',
        steps:[
          step('scan','read','completed','اسکن پوشه',`${scan.files.length} فایل`),
          step('plan','analysis','completed','ساخت برنامه مرتب‌سازی',`${operations.length} انتقال${allOperations.length>operations.length?' (Batch capped)':''}`),
          step('confirm','approval','waiting-confirmation','تأیید کاربر','قبل از هر Write'),
          step('execute','write','pending','انتقال امن فایل‌ها'),
          step('verify','verify','pending','راستی‌آزمایی پایان چرخه')
        ],
        evidence:[...cycle.evidence,evidence('ORGANIZE_PREVIEW',{operations:operations.length,totalPlanned:allOperations.length,operationsCapped:allOperations.length>operations.length,truncated:scan.truncated})]
      };
    }
    if (cycle.steps.find(s=>s.id==='confirm')?.status==='approved' && cycle.steps.find(s=>s.id==='execute')?.status==='pending') {
      const completed=await executeMoves(cycle.operations,{transactionStore,cycleId:cycle.id}); const verification=await verifyMoves(completed);
      const steps=cycle.steps.map(s=>s.id==='execute'?step('execute','write','completed','انتقال امن فایل‌ها',`${completed.length} فایل`):s.id==='verify'?step('verify','verify',verification.ok?'completed':'failed','راستی‌آزمایی پایان چرخه',verification.ok?'مبدأ/مقصد و اندازه فایل‌ها تأیید شد':`${verification.mismatches.length} مغایرت`):s);
      return {status:verification.ok?'completed':'failed',completedOperations:completed,undoStack:completed.map(o=>o.undo),verification,steps,evidence:[...cycle.evidence,evidence('ORGANIZE_SELF_AUDIT',{ok:verification.ok,mismatch:verification.mismatches.length})]};
    }
    return {status:cycle.status};
  }, async onEnd(cycle){ return {summary:cycle.status==='completed'?`${cycle.completedOperations?.length||0} فایل منتقل و راستی‌آزمایی شد.`:cycle.status==='cancelled'?'مرتب‌سازی لغو شد؛ هیچ فایلی جابه‌جا نشد.':'چرخه مرتب‌سازی کامل نشد.',quality:cycle.status==='completed'?'verified':cycle.status==='cancelled'?'cancelled':'failed',nextCycleSuggestions:cycle.status==='completed'?['workspace-health','duplicates','snapshot']:[]};}, async undo(cycle){return undoMoves(cycle.completedOperations||[]);} };
}
module.exports = { scanCycle, healthCycle, duplicateCycle, duplicateReviewCycle, organizeCycle };
