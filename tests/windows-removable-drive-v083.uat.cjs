const assert=require('assert');
const fs=require('fs');
const path=require('path');
const os=require('os');
const {probeVolume,locateVolumeByUniqueId}=require('../electron/services/windows-volume-probe.cjs');

(async()=>{
 if(process.platform!=='win32'){console.log('windows-removable-drive-v083.uat.cjs SKIP (Windows only)');return;}
 const root=String(process.env.WA_REMOVABLE_ROOT||'').trim();const phase=String(process.env.WA_REMOVABLE_PHASE||'baseline').trim().toLowerCase();
 if(!root){console.log('windows-removable-drive-v083.uat.cjs SKIP (set WA_REMOVABLE_ROOT, e.g. E:\\Workspace)');return;}
 const stateFile=process.env.WA_REMOVABLE_STATE||path.join(os.tmpdir(),'workspace-agent-v083-removable-uat.json');let saved=null;try{saved=JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch{}
 if(phase==='baseline'){
  const p=await probeVolume(root);assert(p.available,'removable root must be connected in baseline phase');assert(p.volume?.uniqueId,'volume UniqueId is required');const state={schemaVersion:'wa-removable-uat-v1',root,identityKey:p.identityKey,uniqueId:p.volume.uniqueId,driveLetter:p.driveLetter,volume:p.volume,at:new Date().toISOString()};fs.writeFileSync(stateFile,JSON.stringify(state,null,2));console.log('windows-removable-drive-v083.uat.cjs BASELINE PASS',{stateFile,driveLetter:p.driveLetter,driveType:p.volume.driveType,uniqueId:p.volume.uniqueId});return;
 }
 assert(saved?.uniqueId,'baseline state missing; run WA_REMOVABLE_PHASE=baseline first');
 if(phase==='disconnected'){
  const p=await probeVolume(root);assert.strictEqual(p.available,false,'original root must be unavailable after physical disconnect');const located=await locateVolumeByUniqueId(saved.uniqueId);assert.strictEqual(located.found,false,'same volume should not still be mounted during disconnected phase');console.log('windows-removable-drive-v083.uat.cjs DISCONNECTED PASS',{root,code:p.code});return;
 }
 if(phase==='reconnected'){
  const located=await locateVolumeByUniqueId(saved.uniqueId);assert.strictEqual(located.found,true,'original volume must be discoverable by UniqueId after reconnect');const candidate=located.driveRoot?path.win32.join(located.driveRoot,path.win32.relative(`${saved.driveLetter}:\\`,saved.root)):saved.root;const p=await probeVolume(candidate);assert(p.available,'reconnected candidate root must be available');assert.strictEqual(p.volume?.uniqueId,saved.uniqueId,'reconnected volume identity must match baseline');console.log('windows-removable-drive-v083.uat.cjs RECONNECTED PASS',{originalRoot:saved.root,candidateRoot:candidate,driveLetterChanged:String(saved.driveLetter)!==String(located.volume?.driveLetter),uniqueId:saved.uniqueId});return;
 }
 throw Object.assign(new Error('WA_REMOVABLE_PHASE must be baseline|disconnected|reconnected'),{code:'UAT_PHASE_INVALID'});
})().catch(e=>{console.error(e);process.exit(1)});
