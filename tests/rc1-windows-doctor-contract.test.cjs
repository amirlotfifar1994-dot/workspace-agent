const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(pkg.workspaceAgentRelease.toolingRevision,'cert-kit21');
assert(pkg.scripts['doctor:windows:rc1']);
const doctor=fs.readFileSync(path.join(root,'scripts/windows-rc1-doctor.ps1'),'utf8');
for(const token of [
  "workspace-agent-rc1-windows-doctor-v2",
  "distinct-ntfs-volumes",
  "rootA-source-isolation",
  "rootB-source-isolation",
  "scale-source-isolation",
  "local-ai-runtime-sha256",
  "WA_LLAMA_SERVER_EXPECTED_SHA256",
  "Get-AuthenticodeSignature",
  "artifact-signing-config",
  "release-inputs",
  "npm ping",
  ".wa-doctor-"
])assert(doctor.includes(token),token);
const exec=fs.readFileSync(path.join(root,'scripts/windows-rc1-execution.ps1'),'utf8');
for(const token of [
  "'Doctor'",
  'Run-Doctor',
  'PRIMARY_BLOCKED_DOCTOR',
  'PEER_BLOCKED_DOCTOR',
  'workspace-agent-rc1-execution-state-v2',
  'previousStateSha256',
  'execution-history.jsonl',
  "^[A-Za-z0-9][A-Za-z0-9._-]*$",
  'path-trust-boundary.cjs',
  "PRIMARY_INCOMPLETE",
  "PEER_INCOMPLETE"
])assert(exec.includes(token),token);
const pathGuard=fs.readFileSync(path.join(root,'scripts','path-trust-boundary.cjs'),'utf8');assert(pathGuard.includes('EXECUTION_ROOT_SOURCE_OVERLAP_FORBIDDEN'));assert(pathGuard.includes('nearestExistingProjectedReal'));
console.log('rc1-windows-doctor-contract PASS');
