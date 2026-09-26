const path=require('path');
const {normalizeDisplayPath,keyPath}=require('./windows-path-utils.cjs');

function uniq(values=[]){const out=[];const seen=new Set();for(const value of values||[]){if(!value)continue;const v=normalizeDisplayPath(String(value));const k=keyPath(v);if(seen.has(k))continue;seen.add(k);out.push(v);}return out;}
function isInside(root,target){try{const rel=path.relative(path.resolve(root),path.resolve(target));return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));}catch{return false;}}
function markWatcherDirty(watcher,root,reason){try{if(typeof watcher?.markDirty==='function')return watcher.markDirty(root,reason);if(typeof watcher?._markDirty==='function')return watcher._markDirty(root,reason);}catch{}return null;}
function markRootsUncertain({index=null,watcher=null,journal=null,roots=[],reason='WRITE_STATE_UNCERTAIN',details=null}={}){
  const normalized=uniq(roots);const results=[];
  for(const root of normalized){let indexResult=null;try{indexResult=index?.markStale?.(root,reason,details)||null;}catch(error){indexResult={ok:false,code:error.code||'INDEX_MARK_STALE_FAILED',message:error.message};}
    const watcherResult=markWatcherDirty(watcher,root,reason);results.push({root,index:indexResult,watcherDirty:Boolean(watcherResult)});
  }
  if(normalized.length)journal?.append?.('INDEX_FRESHNESS_GAP_RECORDED',{payload:{reason,roots:normalized.length,details:details||null}});
  return{ok:true,reason,roots:normalized,results};
}
async function reconcilePathsForRoots({index=null,watcher=null,journal=null,roots=[],paths=[],reason='INDEX_RECONCILE_INCOMPLETE'}={}){
  if(!index)return{ok:false,code:'INDEX_SQLITE_UNAVAILABLE',results:[]};
  const normalizedRoots=uniq(roots),normalizedPaths=uniq(paths);const results=[];const staleRoots=new Set();
  for(const target of normalizedPaths){const root=normalizedRoots.find(r=>isInside(r,target));if(!root){results.push({ok:false,path:target,code:'INDEX_RECONCILE_PATH_OUTSIDE_ROOTS'});continue;}
    try{const result=await index.reconcilePath(root,target);const row={root,path:target,...result};results.push(row);if(result?.requiresFullRescan||(result?.ok===false&&result?.code!=='INDEX_ROOT_NOT_REGISTERED'))staleRoots.add(root);}catch(error){results.push({ok:false,root,path:target,code:error.code||'INDEX_RECONCILE_FAILED',message:error.message,requiresFullRescan:true});staleRoots.add(root);}
  }
  for(const root of normalizedRoots){try{const status=await index.status?.(root);if(status?.status==='stale')staleRoots.add(root);}catch{}}
  if(staleRoots.size)markRootsUncertain({index,watcher,journal,roots:[...staleRoots],reason,details:{paths:normalizedPaths.length}});
  const hardFailures=results.filter(x=>x?.ok===false&&x?.code!=='INDEX_ROOT_NOT_REGISTERED');const requiresFullRescan=staleRoots.size>0;
  return{ok:hardFailures.length===0&&!requiresFullRescan,requiresFullRescan,staleRoots:[...staleRoots],results};
}
async function reconcileRecoveryTransaction({tx,action,index=null,watcher=null,journal=null}={}){
  if(!tx)return{ok:false,code:'RECOVERY_TRANSACTION_REQUIRED'};
  const roots=uniq([tx.root]);const paths=uniq((tx.operations||[]).flatMap(op=>[op.source,op.stage,op.destination]));
  const matched=paths.filter(p=>roots.some(r=>isInside(r,p)));
  const result=await reconcilePathsForRoots({index,watcher,journal,roots,paths:matched,reason:'RECOVERY_INDEX_RECONCILE_INCOMPLETE'});
  journal?.append?.('RECOVERY_INDEX_RECONCILED',{cycleId:tx.cycleId,transactionId:tx.id,payload:{action,ok:result.ok,paths:matched.length,requiresFullRescan:Boolean(result.requiresFullRescan)}});
  return result;
}
async function reconcileStartupWriteFreshness({cycleStore=null,batchStore=null,recoveryService=null,index=null,watcher=null,journal=null,maxCycles=5000}={}){
  const cycles=cycleStore?.list?.(Math.max(1,Number(maxCycles)||5000))||[];const interruptedIds=cycles.filter(c=>c?.status==='interrupted').map(c=>String(c.id));
  let batch={changed:0,jobs:[]};try{batch=batchStore?.reconcileInterruptedJobs?.({cycleIds:interruptedIds})||batch;}catch(error){journal?.append?.('STARTUP_BATCH_RECONCILE_FAILED',{payload:{error:error.code||error.message}});}
  let recovery=[];try{recovery=recoveryService?.inspect?.()||[];}catch(error){journal?.append?.('STARTUP_RECOVERY_INSPECT_FAILED',{payload:{error:error.code||error.message}});}
  const roots=uniq([
    ...(batch.jobs||[]).flatMap(job=>[job.source_root||job.root,job.destination_root||job.root]),
    ...recovery.flatMap(tx=>[tx.root])
  ]);
  const marked=roots.length?markRootsUncertain({index,watcher,journal,roots,reason:'STARTUP_WRITE_INTERRUPTION_GAP',details:{interruptedCycles:interruptedIds.length,batchJobs:(batch.jobs||[]).length,recoveryTransactions:recovery.length}}):{ok:true,roots:[],results:[]};
  const result={schemaVersion:'startup-write-freshness-v1',ok:true,interruptedCycles:interruptedIds.length,batchJobs:(batch.jobs||[]).length,batchJobsChanged:Number(batch.changed||0),recoveryTransactions:recovery.length,rootsMarked:marked.roots.length,roots:marked.roots};
  if(result.interruptedCycles||result.batchJobs||result.recoveryTransactions)journal?.append?.('STARTUP_WRITE_FRESHNESS_RECONCILED',{payload:result});
  return result;
}
module.exports={markRootsUncertain,reconcilePathsForRoots,reconcileRecoveryTransaction,reconcileStartupWriteFreshness,isInside};
