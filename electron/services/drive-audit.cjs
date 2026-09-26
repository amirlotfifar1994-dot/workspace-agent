const path=require('path');
const {scanTree}=require('./file-indexer.cjs');
const {storageStats,summarizeCategories}=require('./file-analyzer.cjs');
const {aggregateFolders,staleFiles,extensionStats,longPaths}=require('./file-insights.cjs');
const DEFAULT_SKIP=['Windows','Program Files','Program Files (x86)','ProgramData','Recovery','$WinREAgent','PerfLogs','System Volume Information','$RECYCLE.BIN'];
function resolveDriveRoot(inputRoot,explicit=''){if(explicit)return path.resolve(explicit);const rr=path.resolve(inputRoot);if(process.platform==='win32')return path.parse(rr).root;return rr;}
async function auditDrive(inputRoot,{driveRoot='',maxFiles=350000,maxDirs=140000,skipSystem=true,largeThresholdBytes=1024*1024*1024}={}){
 const root=resolveDriveRoot(inputRoot,driveRoot);const scan=await scanTree(root,{maxFiles,maxDirs,includeHidden:false,skipDirNames:skipSystem?DEFAULT_SKIP:[]});const files=scan.files;const storage=await storageStats(root);const large=files.filter(f=>Number(f.size)>=largeThresholdBytes).sort((a,b)=>b.size-a.size).slice(0,150);const folders=aggregateFolders(root,files,{maxDepth:2,maxResults:150});const stale=staleFiles(files,{days:730,maxResults:150});const extensions=extensionStats(files,{maxResults:100});const long=longPaths(files,{threshold:220,maxResults:100});const scannedBytes=files.reduce((n,f)=>n+Number(f.size||0),0);const coverage=storage?.usedBytes?Math.min(1,scannedBytes/Math.max(1,storage.usedBytes)):null;
 return{schemaVersion:'drive-audit-v1',root,storage,scannedFiles:files.length,scannedBytes,scanDirs:scan.dirs,errorsTotal:scan.errors.length,errorSample:scan.errors.slice(0,100),truncated:scan.truncated,truncateReason:scan.truncateReason,systemFoldersSkipped:skipSystem?DEFAULT_SKIP:[],coverageEstimate:coverage===null?null:Number(coverage.toFixed(3)),categories:summarizeCategories(files),topFolders:folders,largeFiles:large,largeThresholdBytes,stale,extensions,longPaths:long,policy:{readOnly:true,systemFoldersSkipped:skipSystem}};
}
module.exports={auditDrive,resolveDriveRoot,DEFAULT_SKIP};
