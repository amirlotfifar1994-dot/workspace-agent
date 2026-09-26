const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const crypto=require('crypto');
const {atomicWriteBufferSync}=require('./durable-state.cjs');
const os=require('os');
const {sanitizeDiagnostic}=require('./diagnostic-redaction.cjs');
function sha(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
class DiagnosticsBundleService{
 constructor({appVersion='',journal=null,selfCheckService=null,persistentFileIndex=null,recoveryService=null,watcherService=null,rootResilienceService=null,lifecycleState=null,resourcePressureGuard=null,localAIService=null,updateGuard=null}={}){Object.assign(this,{appVersion,journal,selfCheckService,persistentFileIndex,recoveryService,watcherService,rootResilienceService,lifecycleState,resourcePressureGuard,localAIService,updateGuard});}
 build(){const recent=(this.journal?.list?.({limit:120})||[]).map(e=>({at:e.at,type:e.type,cycleId:e.cycleId||null,transactionId:e.transactionId||null}));let indexHealth=null;try{indexHealth=this.persistentFileIndex?.health?.({deep:false})||null;}catch(error){indexHealth={ok:false,code:error.code||'INDEX_HEALTH_FAILED'};}const raw={schemaVersion:'workspace-agent-diagnostics-v1',generatedAt:new Date().toISOString(),app:{version:this.appVersion,platform:process.platform,arch:process.arch,node:process.versions.node,electron:process.versions.electron||null},system:{cpuCount:os.cpus()?.length||0,totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem()},selfCheck:this.selfCheckService?.run?.({deepIndex:false})||null,journal:{verification:this.journal?.verify?.()||null,recentEvents:recent},indexHealth,recovery:{pending:this.recoveryService?.inspect?.()?.length||0},watcher:this.watcherService?.status?.()||null,rootResilience:this.rootResilienceService?.status?.()||null,lifecycle:this.lifecycleState?.status?.()||null,resourcePressure:this.resourcePressureGuard?.snapshot?.()||null,localAI:this.localAIService?.status?.()||null,updateGuard:this.updateGuard?.status?.()||null,privacy:{workspaceContentsIncluded:false,journalPayloadsIncluded:false,secretsIncluded:false,pathsRedacted:true,rawPromptsIncluded:false,screenshotsIncluded:false}};return sanitizeDiagnostic(raw);}
 saveTo(file){const report=this.build();const raw=Buffer.from(JSON.stringify(report,null,2),'utf8');const gz=zlib.gzipSync(raw,{level:9});atomicWriteBufferSync(file,gz);const result={ok:true,file,basename:path.basename(file),bytes:gz.length,sha256:sha(gz),overall:report.selfCheck?.overall||null};this.journal?.append('DIAGNOSTICS_EXPORTED',{payload:{file:result.basename,bytes:result.bytes,sha256:result.sha256,overall:result.overall}});return result;}
}
module.exports={DiagnosticsBundleService};
