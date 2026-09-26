const path = require('path');
const { categoryFor } = require('./organizer.cjs');

function relativeParts(root, filePath='') {
  const rel = path.relative(path.resolve(root), path.resolve(filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return [];
  return rel.split(path.sep).filter(Boolean);
}

function aggregateFolders(root, files=[], { maxDepth=3, maxResults=120 } = {}) {
  const map = new Map();
  for (const file of files) {
    if (!file?.path || file.type === 'unreadable') continue;
    const parts = relativeParts(root, file.path);
    if (parts.length < 2) continue;
    const folders = parts.slice(0, -1);
    const depthLimit = Math.min(folders.length, maxDepth);
    for (let depth=1; depth<=depthLimit; depth+=1) {
      const rel = folders.slice(0, depth).join(path.sep);
      const full = path.join(path.resolve(root), rel);
      const row = map.get(full) || { path:full, relativePath:rel, depth, files:0, bytes:0 };
      row.files += 1;
      row.bytes += Number(file.size || 0);
      map.set(full, row);
    }
  }
  return [...map.values()].sort((a,b)=>b.bytes-a.bytes || b.files-a.files).slice(0,maxResults);
}

function staleFiles(files=[], { days=365, nowMs=Date.now(), maxResults=200 } = {}) {
  const cutoff = nowMs - Math.max(1, Number(days || 365)) * 86400000;
  const rows = files.filter(f=>f?.path && Number(f.mtimeMs||0)>0 && Number(f.mtimeMs)<cutoff)
    .map(f=>({...f, ageDays:Math.floor((nowMs-Number(f.mtimeMs))/86400000)}))
    .sort((a,b)=>Number(a.mtimeMs)-Number(b.mtimeMs));
  return { total:rows.length, rows:rows.slice(0,maxResults), days };
}

function recentFiles(files=[], { days=7, nowMs=Date.now(), maxResults=100 } = {}) {
  const cutoff = nowMs - Math.max(1, Number(days || 7)) * 86400000;
  const rows = files.filter(f=>f?.path && Number(f.mtimeMs||0)>=cutoff)
    .sort((a,b)=>Number(b.mtimeMs)-Number(a.mtimeMs));
  return { total:rows.length, rows:rows.slice(0,maxResults), days };
}

function zeroByteFiles(files=[], { maxResults=200 } = {}) {
  const rows = files.filter(f=>f?.path && Number(f.size||0)===0).sort((a,b)=>String(a.path).localeCompare(String(b.path)));
  return { total:rows.length, rows:rows.slice(0,maxResults) };
}

function longPaths(files=[], { threshold=220, maxResults=200 } = {}) {
  const rows = files.filter(f=>f?.path && String(f.path).length>=threshold)
    .map(f=>({...f,pathLength:String(f.path).length}))
    .sort((a,b)=>b.pathLength-a.pathLength);
  return { total:rows.length, rows:rows.slice(0,maxResults), threshold };
}

function suspiciousNames(files=[], { maxResults=200 } = {}) {
  const rows=[];
  for (const f of files) {
    const name=String(f?.name||''); if(!name) continue;
    const lower=name.toLowerCase(); const reasons=[];
    if (/\bcopy\b|کپی|duplicate/.test(lower)) reasons.push('copy-like-name');
    if (/\(\d+\)(\.[^.]+)?$/.test(lower)) reasons.push('numbered-copy-like-name');
    if (/(final[ _-]*){2,}|نهایی[ _-]*نهایی/.test(lower)) reasons.push('repeated-final-marker');
    if (/\s{2,}/.test(name)) reasons.push('repeated-spaces');
    if (/^[._ -]+|[. ]+$/.test(name)) reasons.push('risky-leading-trailing-chars');
    if (reasons.length) rows.push({...f,reasons});
  }
  rows.sort((a,b)=>b.reasons.length-a.reasons.length || String(a.path).localeCompare(String(b.path)));
  return { total:rows.length, rows:rows.slice(0,maxResults) };
}

function extensionStats(files=[], { maxResults=80 } = {}) {
  const map=new Map();
  for(const f of files){
    if(!f?.path) continue;
    const ext=String(f.ext||'').toLowerCase() || '(no extension)';
    const row=map.get(ext)||{ext,files:0,bytes:0,category:categoryFor(ext)};
    row.files+=1; row.bytes+=Number(f.size||0); map.set(ext,row);
  }
  return [...map.values()].sort((a,b)=>b.bytes-a.bytes || b.files-a.files).slice(0,maxResults);
}

function healthScore({ storage=null, junkBytes=0, scannedBytes=0, longPathCount=0, zeroByteCount=0, unreadableCount=0 }={}) {
  let score=100; const reasons=[];
  if(storage?.totalBytes){
    const freeRatio=Number(storage.freeBytes||0)/Number(storage.totalBytes||1);
    if(freeRatio<0.05){score-=30;reasons.push('free-space-critical');}
    else if(freeRatio<0.10){score-=18;reasons.push('free-space-low');}
    else if(freeRatio<0.20){score-=8;reasons.push('free-space-watch');}
  }
  if(scannedBytes>0){
    const junkRatio=Number(junkBytes||0)/Number(scannedBytes||1);
    if(junkRatio>0.05){score-=12;reasons.push('junk-high');}
    else if(junkRatio>0.01){score-=5;reasons.push('junk-present');}
  }
  if(longPathCount>50){score-=8;reasons.push('many-long-paths');}
  else if(longPathCount>0){score-=3;reasons.push('long-paths-present');}
  if(zeroByteCount>100){score-=5;reasons.push('many-zero-byte-files');}
  if(unreadableCount>0){score-=Math.min(10,Math.max(2,Math.ceil(unreadableCount/10)));reasons.push('unreadable-paths');}
  score=Math.max(0,Math.min(100,Math.round(score)));
  return { score, band:score>=90?'excellent':score>=75?'good':score>=55?'watch':'attention', reasons };
}

module.exports={aggregateFolders,staleFiles,recentFiles,zeroByteFiles,longPaths,suspiciousNames,extensionStats,healthScore};
