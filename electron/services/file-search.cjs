const path=require('path');
const {categoryFor}=require('./organizer.cjs');

function normalizeText(v=''){return String(v||'').trim().toLowerCase();}
function searchFiles(files=[],{
  query='',extensions=[],categories=[],minBytes=0,maxBytes=0,modifiedWithinDays=0,olderThanDays=0,maxResults=500,nowMs=Date.now()
}={}){
  const q=normalizeText(query);const extSet=new Set((extensions||[]).map(e=>normalizeText(e).replace(/^([^.]?)/,(m)=>m&&m!=='.'?`.${m}`:m)).filter(Boolean));const catSet=new Set((categories||[]).map(normalizeText));
  const withinCutoff=modifiedWithinDays>0?nowMs-Number(modifiedWithinDays)*86400000:0;const olderCutoff=olderThanDays>0?nowMs-Number(olderThanDays)*86400000:0;
  const matches=[];let total=0;let totalBytes=0;
  for(const f of files){if(!f?.path)continue;const name=normalizeText(f.name);const p=normalizeText(f.path);const ext=normalizeText(f.ext);const cat=normalizeText(categoryFor(f.ext));const size=Number(f.size||0);const m=Number(f.mtimeMs||0);
    if(q&&!name.includes(q)&&!p.includes(q))continue;if(extSet.size&&!extSet.has(ext))continue;if(catSet.size&&!catSet.has(cat))continue;if(minBytes>0&&size<minBytes)continue;if(maxBytes>0&&size>maxBytes)continue;if(withinCutoff&&m<withinCutoff)continue;if(olderCutoff&&m>=olderCutoff)continue;
    total+=1;totalBytes+=size;if(matches.length<maxResults)matches.push({...f,category:categoryFor(f.ext)});
  }
  matches.sort((a,b)=>Number(b.mtimeMs)-Number(a.mtimeMs)||Number(b.size)-Number(a.size));
  return {query,total,totalBytes,rows:matches,samplesTruncated:total>matches.length,filters:{extensions:[...extSet],categories:[...catSet],minBytes,maxBytes,modifiedWithinDays,olderThanDays}};
}
module.exports={searchFiles};
