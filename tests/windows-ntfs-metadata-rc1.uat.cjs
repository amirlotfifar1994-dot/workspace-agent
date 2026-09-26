const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
const {preserveWindowsMetadata,verifyWindowsMetadata,probeWindowsMetadata,profilesEqual,assertStatPortable}=require('../electron/services/windows-ntfs-metadata.cjs');
const strict=process.env.WA_CERT_STRICT==='1';
function skip(msg){console.log(`windows-ntfs-metadata-rc1.uat.cjs SKIP ${msg}`);process.exit(strict?2:0)}
if(process.platform!=='win32')skip('(Windows only)');
const rootA=process.env.WA_CERT_ROOT_A,rootB=process.env.WA_CERT_ROOT_B;if(!rootA||!rootB)skip('(WA_CERT_ROOT_A/B required)');
const id=`wa-ntfs-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,a=path.join(rootA,id),b=path.join(rootB,id);fs.mkdirSync(a,{recursive:true});fs.mkdirSync(b,{recursive:true});
let cleanupWritable=[];
(async()=>{const checks=[];try{
  const src=path.join(a,'متادیتا-é.txt'),dst=path.join(b,'متادیتا-é.txt');cleanupWritable=[src,dst];await fsp.writeFile(src,'workspace-agent ntfs fidelity','utf8');await fsp.utimes(src,new Date('2024-01-02T03:04:05Z'),new Date('2024-06-07T08:09:10Z'));await fsp.chmod(src,0o444);await fsp.copyFile(src,dst);await fsp.chmod(dst,0o666);const beforeSrc=await probeWindowsMetadata(src),beforeDst=await probeWindowsMetadata(dst);assert(beforeSrc.aclSddl&&beforeDst.aclSddl,'ACL SDDL must be observable');assert(!profilesEqual(beforeSrc,beforeDst),'UAT must start with intentionally different destination metadata');const rec=await preserveWindowsMetadata(src,dst,{sourceStat:await fsp.lstat(src)});const verified=await verifyWindowsMetadata(dst,rec);assert(verified.ok);checks.push({name:'cross-volume-file-metadata',status:'PASS',fingerprint:rec.fingerprint,aclObserved:true,attributesDifferedBeforeApply:true});
  const srcDir=path.join(a,'folder'),dstDir=path.join(b,'folder');await fsp.mkdir(srcDir);await fsp.mkdir(dstDir);await fsp.utimes(srcDir,new Date('2024-02-02T03:04:05Z'),new Date('2024-07-07T08:09:10Z'));const drec=await preserveWindowsMetadata(srcDir,dstDir,{sourceStat:await fsp.lstat(srcDir)});assert((await verifyWindowsMetadata(dstDir,drec)).ok);checks.push({name:'cross-volume-directory-metadata',status:'PASS',aclObserved:Boolean(drec.profile?.aclSddl)});
  const ads=path.join(a,'ads.txt'),adsDst=path.join(b,'ads.txt');await fsp.writeFile(ads,'main');await fsp.writeFile(`${ads}:wa_test_stream`,'stream');await fsp.copyFile(ads,adsDst);await assert.rejects(()=>preserveWindowsMetadata(ads,adsDst,{sourceStat:fs.lstatSync(ads)}),e=>e.code==='EXPLORER_NTFS_METADATA_UNSUPPORTED'&&e.details?.reasons?.includes('ALTERNATE_DATA_STREAMS'));checks.push({name:'ads-fail-closed',status:'PASS'});
  const hard=path.join(a,'hard.txt'),hard2=path.join(a,'hard-link.txt');await fsp.writeFile(hard,'hard');await fsp.link(hard,hard2);assert.throws(()=>assertStatPortable(fs.lstatSync(hard)),e=>e.code==='EXPLORER_NTFS_METADATA_UNSUPPORTED');checks.push({name:'hardlink-fail-closed',status:'PASS'});
  const result={schemaVersion:'workspace-agent-windows-ntfs-metadata-uat-v2',createdAt:new Date().toISOString(),overall:'PASS',rootA,rootB,checks};if(process.env.WA_CERT_NTFS_RESULT)fs.writeFileSync(process.env.WA_CERT_NTFS_RESULT,JSON.stringify(result,null,2));console.log('windows-ntfs-metadata-rc1.uat.cjs PASS',result);
} finally{for(const p of cleanupWritable){try{if(fs.existsSync(p))await fsp.chmod(p,0o666)}catch{}}await fsp.rm(a,{recursive:true,force:true});await fsp.rm(b,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1)});
