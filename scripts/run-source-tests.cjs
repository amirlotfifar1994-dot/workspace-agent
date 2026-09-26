const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'tests');
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.test.cjs')).sort((a,b)=>a.localeCompare(b));
let passed=0;
for(const file of files){const r=cp.spawnSync(process.execPath,[path.join('tests',file)],{cwd:root,stdio:'inherit',env:process.env});if(r.status!==0){console.error(`SOURCE_TEST_FAILED ${file} exit=${r.status}`);process.exit(r.status||1)}passed++}
console.log(`run-source-tests PASS ${passed}/${files.length}`);
