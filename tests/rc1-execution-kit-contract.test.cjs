const assert=require('assert');const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));assert.equal(pkg.workspaceAgentRelease.toolingRevision,'cert-kit21');
for(const s of ['certify:execution:rc1','handoff:rc1','manual:prefill:rc1','stable:decision:rc1','test:rc1-execution'])assert(pkg.scripts[s],s);
const ps=fs.readFileSync(path.join(root,'scripts/windows-rc1-execution.ps1'),'utf8');for(const mode of ["'Primary'","'Peer'","'PrepareEvidence'","'Finalize'","'Status'"])assert(ps.includes(mode),mode);for(const token of ['PRIMARY_READY','PEER_READY','PROMOTE_ALLOWED','rc1-execution-handoff.cjs','prefill-manual-evidence-rc1.cjs','rc1-stable-readiness.cjs','--require-artifact-binding'])assert(ps.includes(token),token);
const fp=fs.readFileSync(path.join(root,'scripts/source-tree-fingerprint.cjs'),'utf8');assert(fp.includes("'rc1-execution'"));assert(fp.includes("'final-certification'"));assert(fp.includes('PRIMARY-HANDOFF'));assert(fp.includes('MANUAL_EVIDENCE'));
console.log('rc1-execution-kit-contract PASS');
