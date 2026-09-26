const {performance}=require('perf_hooks');
const path=require('path');
const {searchFiles}=require('../electron/services/file-search.cjs');
function build(n){const rows=new Array(n);for(let i=0;i<n;i++){const ext=i%11===0?'.pdf':i%7===0?'.jpg':'.txt';rows[i]={path:path.join('D:\\Data',`project-${i%500}`,`file-${i}${ext}`),name:`file-${i}${ext}`,ext,size:(i%10000)+100,mtimeMs:Date.now()-(i%1000)*86400000,category:ext==='.pdf'?'Documents':ext==='.jpg'?'Images':'Documents'};}return rows;}
for(const n of [100000,500000,1000000]){const t0=performance.now();const files=build(n);const built=performance.now();const result=searchFiles(files,{query:'project-42',ext:'.pdf',maxResults:250});const t1=performance.now();console.log(JSON.stringify({n,buildMs:Math.round(built-t0),searchMs:Math.round(t1-built),total:result.total,samples:result.rows?.length||result.results?.length||0,rssMB:Math.round(process.memoryUsage().rss/1024/1024)}));}
