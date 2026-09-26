const {atomicWriteJson}=require('./durable-state.cjs');
const fs=require('fs');const fsp=fs.promises;const path=require('path');
function clone(v){return JSON.parse(JSON.stringify(v));}
class FingerprintStore{
  constructor(userData){this.file=path.join(userData,'fingerprints-v1.json');this.data={schemaVersion:'workspace-fingerprints-v1',rows:{},updatedAt:null};this.loaded=false;}
  async load(){if(this.loaded)return;this.loaded=true;try{const raw=JSON.parse(await fsp.readFile(this.file,'utf8'));if(raw?.rows)this.data=raw;}catch{} }
  key(type,filePath){return `${type}:${process.platform==='win32'?String(filePath).toLowerCase():String(filePath)}`;}
  async get(type,file){await this.load();const row=this.data.rows[this.key(type,file.path)];if(!row)return null;if(Number(row.size)!==Number(file.size)||Math.abs(Number(row.mtimeMs)-Number(file.mtimeMs))>2)return null;return clone(row.value);}
  async set(type,file,value){await this.load();this.data.rows[this.key(type,file.path)]={path:file.path,size:Number(file.size||0),mtimeMs:Number(file.mtimeMs||0),value:clone(value),at:new Date().toISOString()};}
  async save(){await this.load();this.data.updatedAt=new Date().toISOString();await atomicWriteJson(this.file,this.data);}
  async prune({maxRows=80000}={}){await this.load();const rows=Object.entries(this.data.rows);if(rows.length<=maxRows)return 0;rows.sort((a,b)=>String(a[1].at||'').localeCompare(String(b[1].at||'')));const remove=rows.length-maxRows;for(let i=0;i<remove;i++)delete this.data.rows[rows[i][0]];return remove;}
}
module.exports={FingerprintStore};
