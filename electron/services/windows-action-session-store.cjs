const crypto=require('crypto');
const {validateActionRequest,redactedRequest}=require('./windows-action-policy.cjs');
function safeContext(input={}){const g=input?.grounding||null;if(!g)return null;return{grounding:{sessionToken:String(g.sessionToken||'').slice(0,120),intentHash:String(g.intentHash||'').slice(0,64),intentClass:String(g.intentClass||'focus').slice(0,24),candidateId:String(g.candidateId||'').slice(0,80),signature:String(g.signature||'').slice(0,64),confidence:Math.max(0,Math.min(1,Number(g.confidence)||0)),visionConfidence:Math.max(0,Math.min(1,Number(g.visionConfidence)||0))}};}
class WindowsActionSessionStore{
  constructor({ttlMs=10*60*1000,maxEntries=64}={}){this.ttlMs=Math.max(30_000,Number(ttlMs||0));this.maxEntries=Math.max(8,Number(maxEntries||0));this.rows=new Map();}
  _purge(){const t=Date.now();for(const [k,v] of this.rows)if(v.expiresAt<=t)this.rows.delete(k);while(this.rows.size>this.maxEntries)this.rows.delete(this.rows.keys().next().value);}
  create(request={},options={}){this._purge();const valid=validateActionRequest(request);if(!valid.ok)return valid;const redacted=redactedRequest(request);const token=`uia-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;const context=safeContext(options.context);const row={token,request:{action:valid.action,selector:valid.selector,value:valid.value,sensitive:false,context},createdAt:Date.now(),expiresAt:Date.now()+this.ttlMs};this.rows.set(token,row);return{ok:true,token,expiresAt:new Date(row.expiresAt).toISOString(),redacted,context};}
  get(token){this._purge();const row=this.rows.get(String(token||''));return row?row.request:null;}
  consume(token){this._purge();const key=String(token||'');const row=this.rows.get(key)||null;this.rows.delete(key);return row?.request||null;}
  forget(token){return this.rows.delete(String(token||''));}
  size(){this._purge();return this.rows.size;}
}
module.exports={WindowsActionSessionStore,safeContext};
