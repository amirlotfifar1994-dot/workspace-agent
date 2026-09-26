const crypto=require('crypto');
class UIGroundingSessionStore{
 constructor({ttlMs=10*60*1000,maxEntries=32}={}){this.ttlMs=Math.max(60_000,Number(ttlMs||0));this.maxEntries=Math.max(8,Number(maxEntries||0));this.rows=new Map();}
 purge(){const now=Date.now();for(const[k,v]of this.rows)if(v.expiresAt<=now)this.rows.delete(k);while(this.rows.size>this.maxEntries)this.rows.delete(this.rows.keys().next().value);}
 create(data={}){this.purge();const token=`ground-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`,row={...data,token,createdAt:Date.now(),expiresAt:Date.now()+this.ttlMs};this.rows.set(token,row);return row;}
 get(token){this.purge();return this.rows.get(String(token||''))||null;}
 update(token,patch={}){const row=this.get(token);if(!row)return null;Object.assign(row,patch);return row;}
 candidate(token,candidateId){const row=this.get(token);if(!row)return null;const c=(row.result?.candidates||[]).find(x=>x.id===String(candidateId||''));return c?{row,candidate:c}:null;}
 forget(token){return this.rows.delete(String(token||''));}
}
module.exports={UIGroundingSessionStore};
