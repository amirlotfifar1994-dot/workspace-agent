const {mapLimit}=require('./duplicate-finder.cjs');
const {HashWorkerPool}=require('./hash-worker-pool.cjs');

async function findExactDuplicatesFromIndex(index,root,{onProgress,concurrency=3,maxGroups=5000,maxCandidateSizeGroups=10000,maxCandidateFiles=100000,minBytes=1,hashPool=null,journal=null}={}){
  const sizeGroups=index.duplicateCandidates(root,{minBytes,maxGroups:maxCandidateSizeGroups});
  const byHash=new Map();const errors=[];let candidateFiles=0,hashedFiles=0,cacheHits=0,groupsVisited=0,truncated=false;const ownPool=!hashPool;const pool=hashPool||new HashWorkerPool({size:concurrency,journal});
  try{
    for(const sg of sizeGroups){
      const files=index.filesBySize(root,sg.size);if(candidateFiles+files.length>maxCandidateFiles){truncated=true;break;}candidateFiles+=files.length;groupsVisited+=1;
      const rows=await mapLimit(files,concurrency,async file=>{
        try{
          const cached=index.getCachedHash(file);if(cached){cacheHits+=1;return{...file,hash:cached.sha256,cache:true};}
          const row=await pool.hash(file);hashedFiles+=1;index.setCachedHash(row,row.hash);return row;
        }catch(error){errors.push({path:file.path,error:error.code||error.message});return null;}
      });
      for(const file of rows.filter(Boolean)){const key=`${file.size}:${file.hash}`;const arr=byHash.get(key)||[];arr.push(file);byHash.set(key,arr);}
      onProgress?.({sizeGroups:groupsVisited,totalSizeGroups:sizeGroups.length,candidateFiles,hashedFiles,cacheHits,errors:errors.length,workers:pool.status?.()||null});
    }
  }finally{if(ownPool)await pool.close();}
  const allGroups=[...byHash.values()].filter(g=>g.length>1).map((g,i)=>({id:`idx-dup-${i+1}`,size:g[0].size,hash:g[0].hash,reclaimableBytes:g[0].size*(g.length-1),files:g.map(({cache,...f})=>f).sort((a,b)=>a.mtimeMs-b.mtimeMs)})).sort((a,b)=>b.reclaimableBytes-a.reclaimableBytes);
  const groups=allGroups.slice(0,maxGroups);
  return{schemaVersion:'indexed-duplicates-v1.1',groups,groupsTotal:allGroups.length,groupsTruncated:allGroups.length>groups.length,duplicateFiles:allGroups.reduce((n,g)=>n+g.files.length-1,0),reclaimableBytes:allGroups.reduce((n,g)=>n+g.reclaimableBytes,0),candidateSizeGroups:sizeGroups.length,visitedSizeGroups:groupsVisited,candidateFiles,hashedFiles,cacheHits,errors:errors.slice(0,200),errorsTotal:errors.length,candidateTraversalTruncated:truncated,policy:{source:'persistent-index',exactHash:'sha256',stableStat:true,hashCacheInvalidation:'size+mtime+ctime',hashExecution:'worker_threads-with-safe-fallback'}};
}
module.exports={findExactDuplicatesFromIndex};
