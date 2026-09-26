const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { categoryFor } = require('./organizer.cjs');
const { aggregateFolders, staleFiles, recentFiles, zeroByteFiles, longPaths, suspiciousNames, extensionStats, healthScore } = require('./file-insights.cjs');

const JUNK_EXT = new Map([
  ['.tmp','low'],['.temp','low'],['.dmp','medium'],['.old','medium'],['.bak','medium'],['.log','medium'],['.chk','medium']
]);
const JUNK_NAMES = new Map([
  ['thumbs.db','low'],['desktop.ini','low'],['.ds_store','low']
]);

function classifyJunk(file) {
  const name = String(file?.name || '').toLowerCase();
  const ext = String(file?.ext || '').toLowerCase();
  if (name.startsWith('~$')) return { risk:'low', reason:'Office temporary file' };
  if (JUNK_NAMES.has(name)) return { risk:JUNK_NAMES.get(name), reason:'Known metadata/cache file' };
  if (JUNK_EXT.has(ext)) return { risk:JUNK_EXT.get(ext), reason:`Potential temporary/backup file (${ext})` };
  return null;
}

async function storageStats(root) {
  try {
    const st = await fsp.statfs(root);
    const totalBytes = Number(st.blocks) * Number(st.bsize);
    const freeBytes = Number(st.bavail) * Number(st.bsize);
    return { totalBytes, freeBytes, usedBytes: Math.max(0,totalBytes-freeBytes) };
  } catch { return null; }
}

function summarizeCategories(files=[]) {
  const out = new Map();
  for (const file of files) {
    if(!file?.path) continue;
    const key = categoryFor(file.ext);
    const row = out.get(key) || { category:key, files:0, bytes:0 };
    row.files += 1; row.bytes += Number(file.size || 0); out.set(key,row);
  }
  return [...out.values()].sort((a,b)=>b.bytes-a.bytes);
}

async function findEmptyDirectories(root, { maxDirs=50000, maxResults=2000, includeHidden=false } = {}) {
  const resolved = path.resolve(root); const stack=[resolved]; const sample=[]; let visited=0; let total=0; let truncated=false;
  while(stack.length) {
    const current=stack.pop(); visited += 1; if (visited>maxDirs) { truncated=true; break; }
    let entries; try { entries=await fsp.readdir(current,{withFileTypes:true}); } catch { continue; }
    const visible = entries.filter(e => includeHidden || !e.name.startsWith('.'));
    for (const e of visible) if (e.isDirectory() && !e.isSymbolicLink() && !['$RECYCLE.BIN','System Volume Information','node_modules','.git','.workspace-agent-quarantine'].includes(e.name)) stack.push(path.join(current,e.name));
    if (current!==resolved && visible.length===0) { total+=1; if(sample.length<maxResults) sample.push(current); }
  }
  return { folders:sample.sort((a,b)=>a.length-b.length), total, visited, truncated, sampleTruncated:total>sample.length };
}

async function analyzeWorkspace(root, scan, {
  largeThresholdBytes=500*1024*1024,
  maxLargest=100,
  maxJunk=500,
  staleDays=365,
  recentDays=7,
  longPathThreshold=220,
} = {}) {
  const files = Array.isArray(scan?.files) ? scan.files : [];
  const largestAll = files.filter(f=>Number(f.size)>=largeThresholdBytes).sort((a,b)=>b.size-a.size);
  const junkAll = files.map(file => ({file, finding:classifyJunk(file)})).filter(x=>x.finding).map(x=>({ ...x.file, ...x.finding })).sort((a,b)=>b.size-a.size);
  const emptyFolders = await findEmptyDirectories(root);
  const categories = summarizeCategories(files);
  const storage = await storageStats(root);
  const stale=staleFiles(files,{days:staleDays});
  const recent=recentFiles(files,{days:recentDays});
  const zero=zeroByteFiles(files);
  const long=longPaths(files,{threshold:longPathThreshold});
  const suspicious=suspiciousNames(files);
  const folders=aggregateFolders(root,files);
  const extensions=extensionStats(files);
  const scannedBytes=files.reduce((n,f)=>n+Number(f.size||0),0);
  const junkBytes=junkAll.reduce((n,f)=>n+Number(f.size||0),0);
  const unreadableCount=Array.isArray(scan?.errors)?scan.errors.length:0;
  const score=healthScore({storage,junkBytes,scannedBytes,longPathCount:long.total,zeroByteCount:zero.total,unreadableCount});
  return {
    scannedFiles:files.length,
    scannedBytes,
    scanTruncated:Boolean(scan?.truncated),
    scanTruncateReason:scan?.truncateReason||'',
    unreadableCount,
    unreadableSample:(scan?.errors||[]).slice(0,100),
    categories,
    extensions,
    largest:largestAll.slice(0,maxLargest),
    largestTotal:largestAll.length,
    largeThresholdBytes,
    junk:junkAll.slice(0,maxJunk),
    junkTotal:junkAll.length,
    junkBytes,
    emptyFolders:emptyFolders.folders,
    emptyFoldersTotal:emptyFolders.total,
    emptyScanTruncated:emptyFolders.truncated,
    topFolders:folders,
    stale,
    recent,
    zeroByte:zero,
    longPaths:long,
    suspiciousNames:suspicious,
    storage,
    healthScore:score,
  };
}
module.exports = { analyzeWorkspace, classifyJunk, findEmptyDirectories, summarizeCategories, storageStats };
