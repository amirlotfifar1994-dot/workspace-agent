function norm(value=''){
  return String(value||'').toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200f\u202a-\u202e]/g,' ').replace(/\s+/g,' ').trim();
}
function has(text,patterns=[]){return patterns.some(p=>p instanceof RegExp?p.test(text):text.includes(p));}
function addStep(steps,type,label,input={},reason=''){
  if(steps.some(s=>s.type===type&&JSON.stringify(s.input||{})===JSON.stringify(input||{})))return;
  steps.push({id:`goal-step-${steps.length+1}`,type,label,input,reason,requiresConfirmation:['organize','duplicate-review','maintenance-cleanup','recommendation-apply'].includes(type)});
}
function planGoal(command=''){
  const text=norm(command);const steps=[];const notes=[];const blocked=[];
  const noWrite=has(text,['حذف نکن','پاک نکن','جابه جا نکن','جابجا نکن','تغییر نده','فقط گزارش','فقط بررسی','read only','readonly']);
  const permanentDelete=has(text,['حذف دائمی','برای همیشه پاک','شیفت دیلیت','shift delete']);
  if(permanentDelete){blocked.push('Permanent delete در این نسخه فعال نیست؛ عملیات خطرناک به Quarantine/Restore تبدیل می‌شود.');}

  if(has(text,['snapshot','اسنپ شات','اسنپ‌شات','وضعیت فعلی را ذخیره','وضعیت فعلی رو ذخیره','نقطه مقایسه'])) addStep(steps,'snapshot','ثبت Snapshot از Workspace',{},'برای مقایسه تغییرات آینده');
  if(has(text,['چه چیز تغییر','چه چیزی تغییر','تغییرات از','مقایسه با snapshot','مقایسه با اسنپ','فرق با قبل'])) addStep(steps,'snapshot-diff','مقایسه Workspace با آخرین Snapshot',{},'ردیابی فایل‌های اضافه/حذف/ویرایش‌شده');

  const wantsSimilarImages=has(text,['عکس مشابه','تصویر مشابه','عکس های مشابه','عکس‌های مشابه','تصاویر مشابه','near duplicate image','similar photo','similar image']);
  if(wantsSimilarImages) addStep(steps,'similar-images','پیدا کردن عکس‌های مشابه',{},'dHash perceptual + Confidence؛ فقط Read-only');
  const wantsSimilarTexts=has(text,['متن مشابه','فایل متنی مشابه','سند مشابه','نوشته مشابه','near duplicate text','similar text']);
  if(wantsSimilarTexts) addStep(steps,'similar-texts','پیدا کردن فایل‌های متنی نزدیک به هم',{},'SimHash محتوایی؛ فقط Read-only');
  const wantsIntelligence=has(text,['تشخیص پروژه','پروژه ها','پروژه‌ها','گروه بندی پروژه','گروه‌بندی پروژه','پیشنهاد مقصد','کجا ببرم','کجا منتقل','اسم مناسب','نام مناسب','هوشمند بررسی','intelligence']);
  if(wantsIntelligence) addStep(steps,'workspace-intelligence','تحلیل هوشمند ساختار Workspace',{},'Project/Destination/Rename suggestion با Confidence/Evidence و بدون Auto Apply');
  if(has(text,['صف پیشنهاد','صف پیشنهادها','review queue','بررسی پیشنهادها','پیشنهادها رو آماده','پیشنهادها را آماده'])) addStep(steps,'review-queue-build','ساخت Recommendation Review Queue',{},'فقط صف محلی Agent؛ بدون تغییر Workspace');
  if(has(text,['دانلودها','downloads','دسکتاپ','desktop','پوشه مدیریت شده','managed zone'])) addStep(steps,'managed-zone-audit','Audit پوشه مدیریت‌شده',{},'Clutter/Age/Partial downloads/Storage trend؛ Read-only روی فایل‌ها');
  if(has(text,['pdf','پی دی اف','پی‌دی‌اف','فایل های pdf','فایل‌های pdf'])) addStep(steps,'pdf-intelligence','تحلیل پایه PDFهای Workspace',{},'Metadata/Text extraction پایه؛ Read-only و بدون OCR');
  if(has(text,['کل درایو','drive audit','درایو رو بررسی','درایو را بررسی','هارد کامل'])) addStep(steps,'drive-audit','Drive-wide Audit',{},'پوشه‌های سیستمی از اسکن عمیق کنار گذاشته می‌شوند');

  const wantsDuplicates=has(text,['تکراری','duplicate','دوبل','نسخه یکسان','فایل یکسان']);
  if(wantsDuplicates) addStep(steps,'duplicates','پیدا کردن Duplicate قطعی',{},'Size + SHA-256');
  const wantsQuarantine=has(text,['قرنطینه','کنار بذار','کنار بگذار','ایزوله','جمع کن تکراری']);
  if(wantsDuplicates&&wantsQuarantine&&!noWrite) addStep(steps,'duplicate-review','Preview و قرنطینه Duplicateها',{},'بدون حذف دائمی و با Restore');

  const wantsHealth=has(text,['سلامت','بررسی هارد','بررسی پوشه','بررسی کن','آنالیز','تحلیل','فایل حجیم','فضای خالی','فضا گرفته','junk','temp','پوشه خالی','فایل قدیمی','فایل صفر','مسیر طولانی']);
  if(wantsHealth||(!steps.length&&has(text,['هارد','فایل','پوشه','workspace']))) addStep(steps,'workspace-health','تحلیل سلامت Workspace',{},'فقط خواندنی و دارای Self-Audit');

  const wantsCleanup=has(text,['cleanup','پاکسازی','پاک سازی','تمیز کن','junk ها','temp ها','فایل موقت','پوشه های خالی','پوشه‌های خالی']);
  if(wantsCleanup){
    if(noWrite) notes.push('به‌دلیل دستور «فقط گزارش/تغییر نده»، Cleanup به Health Scan خواندنی محدود شد.');
    else addStep(steps,'maintenance-cleanup','Cleanup امن به Quarantine',{includeLowRiskJunk:true,includeEmptyFolders:has(text,['پوشه خالی','پوشه های خالی','پوشه‌های خالی'])},'Preview → Confirm → Quarantine → Verify → Restore');
  }

  const wantsRename=has(text,['تغییر نام','rename','اسم فایل','نام فایل']);
  if(wantsRename){
    if(noWrite) notes.push('تغییر نام به دلیل حالت بدون تغییر اجرا نمی‌شود.');
    else notes.push('Bulk Rename نیازمند الگوی صریح Find/Replace/Prefix/Suffix است و از پنل Rename اجرا می‌شود؛ Agent بدون الگوی دقیق نام‌ها را حدس نمی‌زند.');
  }

  const wantsOrganize=has(text,['مرتب','دسته بندی','دسته‌بندی','ساماندهی','organize']);
  if(wantsOrganize){
    if(noWrite) notes.push('مرتب‌سازی به دلیل حالت بدون تغییر اجرا نمی‌شود.');
    else addStep(steps,'organize','مرتب‌سازی فایل‌ها',{mode:has(text,['تاریخ','ماه','سال'])?'date':'type'},has(text,['تاریخ','ماه','سال'])?'بر اساس تاریخ':'بر اساس نوع فایل');
  }

  const searchMatch=text.match(/(?:پیدا کن|جستجو|جست‌وجو|search)\s+(.{2,80})/);
  if(searchMatch&&!wantsDuplicates){
    let q=searchMatch[1].replace(/(?:در این پوشه|در پوشه|اینجا|رو|را)$/,'').trim();
    if(q&&q.length<80)addStep(steps,'file-search',`جست‌وجوی فایل: ${q}`,{query:q},'جست‌وجوی نام و مسیر؛ فقط خواندنی');
  }

  if(!steps.length){
    addStep(steps,'workspace-health','تحلیل اولیه Workspace',{},'فرمان به عملیات Write قطعی نگاشت نشد؛ Agent از بررسی امن شروع می‌کند.');
    notes.push('منظور فرمان با اطمینان کافی به عملیات اثرگذار نگاشت نشد؛ Agent فقط بررسی خواندنی انجام می‌دهد.');
  }
  // Read-only discovery should precede write steps where useful.
  steps.sort((a,b)=>Number(a.requiresConfirmation)-Number(b.requiresConfirmation));
  const writeSteps=steps.filter(s=>s.requiresConfirmation).length;
  const confidence=blocked.length?0.82:steps.length===1?0.9:0.94;
  return {
    schemaVersion:'workspace-goal-plan-v1',command,text,confidence,confidenceBand:confidence>=.9?'high':confidence>=.75?'medium':'low',
    constraints:{noWrite,permanentDeleteBlocked:permanentDelete},notes,blocked,
    steps,summary:`${steps.length} گام برنامه‌ریزی شد؛ ${writeSteps} گام نیازمند تأیید قبل از Write است.`
  };
}
module.exports={planGoal,norm};
