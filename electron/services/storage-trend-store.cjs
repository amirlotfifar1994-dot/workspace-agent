const {atomicWriteJsonSync}=require('./durable-state.cjs');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
function atomic(file,value){return atomicWriteJsonSync(file,value);}
function rootKey(root){return crypto.createHash('sha1').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);}
class StorageTrendStore{
 constructor(baseDir){this.dir=path.join(baseDir,'storage-trends');fs.mkdirSync(this.dir,{recursive:true});}
 file(root){return path.join(this.dir,`${rootKey(root)}.json`);}
 list(root,{limit=180}={}){try{const v=JSON.parse(fs.readFileSync(this.file(root),'utf8'));return Array.isArray(v)?v.slice(-limit):[];}catch{return[];}}
 record(root,sample={}){const rows=this.list(root,{limit:1000});const row={at:new Date().toISOString(),root:path.resolve(root),...sample};rows.push(row);atomic(this.file(root),rows.slice(-365));return row;}
}
module.exports={StorageTrendStore,rootKey};
