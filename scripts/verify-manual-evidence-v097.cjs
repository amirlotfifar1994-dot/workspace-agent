const fs=require('fs');
const path=require('path');
const file=process.argv[2];const requireAll=process.argv.includes('--require-all');
function fail(msg){console.error(msg);process.exit(1)}
if(!file||!fs.existsSync(file)){if(requireAll)fail('MANUAL_EVIDENCE_REQUIRED');console.log(JSON.stringify({status:'SKIP',code:'MANUAL_EVIDENCE_NOT_PROVIDED'}));process.exit(0)}
let d;try{d=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))}catch{fail('MANUAL_EVIDENCE_INVALID_JSON')}
if(d.schemaVersion!=='workspace-agent-manual-evidence-v097-v1'||String(d.version)!=='0.9.7')fail('MANUAL_EVIDENCE_SCHEMA_MISMATCH');
const keys=['physicalUsbDisconnectReconnect','actualDiskFullRecovery','realAclReadOnlyRecovery','uncleanShutdownPowerLoss'];let pending=[],failed=[];
for(const k of keys){const s=String(d.evidence?.[k]?.status||'').toUpperCase();if(s==='FAIL')failed.push(k);else if(s!=='PASS')pending.push(k);}
if(failed.length)fail(`MANUAL_EVIDENCE_FAILED:${failed.join(',')}`);if(requireAll&&pending.length)fail(`MANUAL_EVIDENCE_INCOMPLETE:${pending.join(',')}`);
console.log(JSON.stringify({status:pending.length?'INCOMPLETE':'PASS',pending,operator:String(d.operator||''),machine:String(d.machine||'')}));
