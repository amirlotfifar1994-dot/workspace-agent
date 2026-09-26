const assert=require('assert');
const cp=require('child_process');
const path=require('path');
const cwd=path.resolve(__dirname,'..');
function run(){const s=cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd,encoding:'utf8'}).trim();return JSON.parse(s);}
const a=run(),b=run();assert.equal(a.schemaVersion,'workspace-agent-source-fingerprint-v2');assert.equal(a.scope,'frozen-source-excluding-release-lockfile');assert(Array.isArray(a.excludedFiles)&&a.excludedFiles.includes('package-lock.json'));assert.equal(a.version,JSON.parse(require('fs').readFileSync(path.join(cwd,'package.json'),'utf8')).version);assert(a.files>100);assert(/^[a-f0-9]{64}$/.test(a.sha256));assert.equal(a.sha256,b.sha256);
console.log('source-tree-fingerprint-v097.test.cjs PASS',a);
