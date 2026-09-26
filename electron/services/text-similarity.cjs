const fs=require('fs');const fsp=fs.promises;const path=require('path');const crypto=require('crypto');
const {clusterByHash,hammingHex}=require('./similarity-core.cjs');
const {mapLimit}=require('./duplicate-finder.cjs');
const {readOfficeText}=require('./office-text-extractor.cjs');
const {extractPdfText}=require('./pdf-text-extractor.cjs');
const OFFICE_TEXT_EXTS=new Set(['.docx','.pptx','.xlsx']);
const TEXT_EXTS=new Set(['.pdf','.txt','.md','.csv','.json','.xml','.html','.htm','.css','.js','.jsx','.ts','.tsx','.py','.sql','.ini','.cfg','.yaml','.yml','.log','.rtf',...OFFICE_TEXT_EXTS]);
const STOP=new Set(['the','and','for','with','that','this','from','are','was','were','have','has','not','you','your','به','از','در','و','را','که','این','برای','با','است','های','می','یک','شود','شده','کرد','روی']);
function normalizeText(text=''){return String(text).replace(/\u0000/g,' ').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}_-]+/gu,' ').replace(/\s+/g,' ').trim();}
function tokens(text=''){return normalizeText(text).split(' ').filter(t=>t.length>=2&&!STOP.has(t));}
function simHash64(text=''){
  const toks=tokens(text);if(!toks.length)return null;const freq=new Map();for(const t of toks)freq.set(t,(freq.get(t)||0)+1);const weights=new Array(64).fill(0);
  for(const [token,count] of freq){const digest=crypto.createHash('sha256').update(token).digest();for(let i=0;i<64;i++){const bit=(digest[Math.floor(i/8)]>>(7-(i%8)))&1;weights[i]+=bit?count:-count;}}
  let value=0n;for(const w of weights)value=(value<<1n)|(w>=0?1n:0n);return value.toString(16).padStart(16,'0');
}
function extractProfile(text='',filePath=''){
  const raw=String(text);const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const first=(lines[0]||'').replace(/^#+\s*/,'').replace(/[\[\]{}<>*_`]/g,' ').replace(/\s+/g,' ').trim();const ts=tokens(raw);const freq=new Map();for(const t of ts)freq.set(t,(freq.get(t)||0)+1);const keywords=[...freq.entries()].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).slice(0,8).map(([term,count])=>({term,count}));
  return {title:first.slice(0,120),keywords,characters:raw.length,words:ts.length,source:path.basename(filePath||'')};
}
async function readTextSample(filePath,maxBytes=262144){const ext=path.extname(filePath).toLowerCase();if(ext==='.pdf'){const r=await extractPdfText(filePath,{maxOutputChars:Math.max(maxBytes,262144)});return [r.metadata?.title,r.metadata?.subject,r.text].filter(Boolean).join('\n').slice(0,maxBytes);}if(OFFICE_TEXT_EXTS.has(ext))return (await readOfficeText(filePath,{maxOutputChars:Math.max(maxBytes,262144)})).slice(0,maxBytes);const fh=await fsp.open(filePath,'r');try{const st=await fh.stat();const size=Math.min(Number(st.size||0),maxBytes);const buf=Buffer.alloc(size);await fh.read(buf,0,size,0);return buf.toString('utf8');}finally{await fh.close();}}
function confidenceForDistance(distance,threshold=10){if(distance<=2)return .99;if(distance<=5)return .94;if(distance<=8)return .86;if(distance<=threshold)return .77;return .5;}
async function findSimilarTexts(files=[], {threshold=10,maxFiles=8000,maxBytes=262144,maxGroups=1000,maxPairs=12000,concurrency=4,resolveHashProfile=null,onProgress}={}){
  const candidates=files.filter(f=>f?.path&&TEXT_EXTS.has(String(f.ext||path.extname(f.path)).toLowerCase())&&Number(f.size||0)>0).slice(0,maxFiles);const errors=[];let processed=0;
  const processedRows=await mapLimit(candidates,Math.max(1,Math.min(8,Number(concurrency||4))),async file=>{try{let resolved;if(resolveHashProfile)resolved=await resolveHashProfile(file);else{const text=await readTextSample(file.path,maxBytes);resolved={simhash:simHash64(text),profile:extractProfile(text,file.path)};}return resolved?.simhash?{...file,simhash:resolved.simhash,profile:resolved.profile||null}:null;}catch(error){errors.push({path:file.path,error:error.code||error.message});return null;}finally{processed+=1;if(processed%50===0||processed===candidates.length)onProgress?.({processed,total:candidates.length,errors:errors.length});}});const rows=processedRows.filter(Boolean);
  const clustered=clusterByHash(rows,{hashKey:'simhash',threshold,maxPairs});const groups=clustered.groups.map((group,idx)=>{let max=0,total=0,pairs=0;for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const d=hammingHex(group[i].simhash,group[j].simhash);max=Math.max(max,d);total+=d;pairs+=1;}const avg=pairs?total/pairs:0;return{id:`simtxt-${idx+1}`,files:group,maxDistance:max,avgDistance:Number(avg.toFixed(2)),confidence:confidenceForDistance(avg,threshold),evidence:['SimHash 64-bit روی محتوای متنی',`میانگین فاصله Hamming: ${avg.toFixed(2)}`,`نمونه خوانده‌شده تا ${Math.round(maxBytes/1024)}KB`]};}).sort((a,b)=>b.files.length-a.files.length||a.avgDistance-b.avgDistance).slice(0,maxGroups);
  return {groups,groupsTotal:clustered.groups.length,groupsTruncated:clustered.groups.length>groups.length,pairsTruncated:clustered.pairsTruncated,processedFiles:rows.length,candidateFiles:candidates.length,errors:errors.slice(0,200),errorsTotal:errors.length,threshold};
}
module.exports={TEXT_EXTS,OFFICE_TEXT_EXTS,normalizeText,tokens,simHash64,extractProfile,readTextSample,findSimilarTexts,confidenceForDistance};
