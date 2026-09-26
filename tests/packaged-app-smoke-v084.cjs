const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
if(process.platform!=='win32'){console.log('SKIP packaged app smoke v0.8.4 (Windows only)');process.exit(0)}
const exe=process.argv[2];if(!exe||!fs.existsSync(exe)){console.error('PACKAGED_EXE_REQUIRED');process.exit(2)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-cert-smoke-')),out=path.join(tmp,'smoke.json'),userData=path.join(tmp,'userdata');
const child=spawn(exe,[`--cert-smoke-output=${out}`,`--cert-user-data=${userData}`],{stdio:'ignore',windowsHide:true});
const timer=setTimeout(()=>{try{child.kill()}catch{};console.error('PACKAGED_APP_SMOKE_TIMEOUT');process.exit(3)},45000);
child.on('exit',(code)=>{clearTimeout(timer);try{if(code!==0)throw new Error(`PACKAGED_APP_EXIT_${code}`);const r=JSON.parse(fs.readFileSync(out,'utf8'));if(!r.ok)throw new Error('PACKAGED_APP_REPORT_NOT_OK');if(r.platform!=='win32')throw new Error('PACKAGED_APP_WRONG_PLATFORM');if(!r.journal?.ok)throw new Error('PACKAGED_APP_JOURNAL_FAILED');if(r.indexHealth&&!r.indexHealth.ok)throw new Error('PACKAGED_APP_SQLITE_HEALTH_FAILED');if(r.rcSelfCheck?.overall==='block')throw new Error('PACKAGED_APP_RC_SELF_CHECK_BLOCKED');if(r.updateGuard?.writeBlocked)throw new Error('PACKAGED_APP_UPDATE_GUARD_BLOCKED');console.log(`PASS packaged app smoke v0.8.4 ${r.appVersion} Electron ${r.electron}`);fs.rmSync(tmp,{recursive:true,force:true});process.exit(0);}catch(error){console.error(error.message);try{console.error(fs.readFileSync(out,'utf8'))}catch{}process.exit(4)}});
