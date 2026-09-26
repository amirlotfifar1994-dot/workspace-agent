const assert=require('assert');const fs=require('fs');const path=require('path');const cp=require('child_process');const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));assert(pkg.scripts['finalize:rc1']);
const s=fs.readFileSync(path.join(root,'scripts','rc1-finalize.cjs'),'utf8');for(const token of ['--require-dual-windows','--require-artifacts','--require-manual-evidence','artifact-report','peer-report','release-manifest','manual-evidence','rc1-final-verdict.json','artifactEvidenceBundle','peerEvidenceBundle'])assert(s.includes(token),`finalizer invariant missing: ${token}`);
const r=cp.spawnSync(process.execPath,['scripts/rc1-finalize.cjs'],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);assert(/FINALIZATION_INPUT_REQUIRED/.test(r.stderr));
const orchestrator=fs.readFileSync(path.join(root,'scripts','windows-rc1-certify.ps1'),'utf8');assert(orchestrator.includes("$envArgs+='--require-manual-evidence'"),'RC1 orchestrator final envelope must never PASS without manual evidence');
console.log('rc1-finalizer-contract.test.cjs PASS',{stagedFinalization:true,manualEvidenceMandatory:true,evidenceBundlesBound:true});
