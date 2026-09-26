const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const roots=['electron','scripts','tests'];
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='node_modules'||e.name==='release'||e.name==='dist'||e.name.startsWith('certification-'))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&/\.(?:cjs|mjs|js)$/.test(e.name))files.push(p)}}
for(const r of roots){const p=path.join(root,r);if(fs.existsSync(p))walk(p)}
for(const name of ['vite.config.js']){const p=path.join(root,name);if(fs.existsSync(p))files.push(p)}
const failed=[];
for(const file of files){const r=cp.spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});if(r.status!==0)failed.push({file:path.relative(root,file).replace(/\\/g,'/'),stderr:String(r.stderr||r.stdout||'')})}
if(failed.length){console.error(JSON.stringify({ok:false,failed},null,2));process.exit(1)}
console.log(`check-source-syntax PASS ${files.length} files`);
