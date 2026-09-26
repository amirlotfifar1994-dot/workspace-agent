const assert=require('assert');
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
function fp(){return JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'})).sha256}
const before=fp();
const dirs=[path.join(root,'dist'),path.join(root,'certification-rc1','fixture')];
try{
  fs.mkdirSync(dirs[0],{recursive:true});fs.writeFileSync(path.join(dirs[0],'generated.txt'),'generated');
  fs.mkdirSync(dirs[1],{recursive:true});fs.writeFileSync(path.join(dirs[1],'report.json'),'generated');
  const after=fp();assert.equal(after,before,'generated build/certification directories must not change source fingerprint');
  console.log('source-tree-fingerprint-generated-vrc1.test.cjs PASS',{sha256:before.slice(0,16)});
}finally{for(const d of [path.join(root,'dist'),path.join(root,'certification-rc1')])fs.rmSync(d,{recursive:true,force:true})}
