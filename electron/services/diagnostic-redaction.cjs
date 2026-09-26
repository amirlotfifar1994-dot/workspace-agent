const crypto=require('crypto');
const path=require('path');
function hash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,20);}
const SECRET_KEY=/(password|passwd|secret|token|api.?key|credential|private.?key|authorization|cookie)/i;
const PATH_KEY=/(^|_)(path|root|source|destination|file|dir|directory|executable|model)(_|$)/i;
function pathDescriptor(v){const s=String(v||'');const base=/^[A-Za-z]:[\\/]/.test(s)||s.includes('\\')?path.win32.basename(s):path.basename(s);return{redacted:true,basename:String(base||'').slice(0,160),hash:hash(s)};}
function sanitize(value,{depth=0,key=''}={}){
 if(depth>8)return'[DEPTH_LIMIT]';
 if(value===null||value===undefined)return value;
 if(SECRET_KEY.test(key)&&!(/Included$/i.test(key)&&typeof value==='boolean'))return'[REDACTED]';
 if(typeof value==='string'){
   if(PATH_KEY.test(key))return pathDescriptor(value);
   if(/^[A-Za-z]:[\\/]/.test(value)||/^\\\\/.test(value)||value.startsWith('/home/')||value.startsWith('/Users/'))return pathDescriptor(value);
   return value.length>1200?`${value.slice(0,1200)}…[TRUNCATED]`:value;
 }
 if(typeof value==='number'||typeof value==='boolean')return value;
 if(Array.isArray(value))return value.slice(0,300).map(v=>sanitize(v,{depth:depth+1,key}));
 if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,300))out[k]=sanitize(v,{depth:depth+1,key:k});return out;}
 return String(value);
}
module.exports={sanitizeDiagnostic:sanitize,pathDescriptor,hashDiagnosticValue:hash};
