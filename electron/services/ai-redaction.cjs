const crypto=require('crypto');
const SECRET_PATTERNS=[
  [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,'[REDACTED_PRIVATE_KEY]'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED_API_KEY]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,'[REDACTED_ACCESS_KEY]'],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*/gi,'Bearer [REDACTED]'],
  [/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,'$1[REDACTED]@'],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]{4,})/gi,'$1=[REDACTED]']
];
function redactText(value,max=8000){let s=String(value??'');for(const [rx,repl] of SECRET_PATTERNS)s=s.replace(rx,repl);s=s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ');if(s.length>max)s=`${s.slice(0,max)}…[TRUNCATED ${s.length-max}]`;return s;}
function safeBasename(value=''){const s=String(value||'').replace(/[\\/]+$/,'');const parts=s.split(/[\\/]/);return redactText(parts[parts.length-1]||'',260);}
function sanitizeObject(value,{maxDepth=4,maxArray=80,maxString=2000}={},depth=0){if(depth>maxDepth)return'[DEPTH_LIMIT]';if(value===null||value===undefined||typeof value==='number'||typeof value==='boolean')return value;if(typeof value==='string')return redactText(value,maxString);if(Array.isArray(value))return value.slice(0,maxArray).map(x=>sanitizeObject(x,{maxDepth,maxArray,maxString},depth+1));if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,100)){if(/password|secret|token|api.?key|credential/i.test(k)){out[k]='[REDACTED]';continue;}out[k]=sanitizeObject(v,{maxDepth,maxArray,maxString},depth+1);}return out;}return redactText(String(value),maxString);}
function hashText(value=''){return crypto.createHash('sha256').update(String(value)).digest('hex');}
module.exports={redactText,safeBasename,sanitizeObject,hashText};
