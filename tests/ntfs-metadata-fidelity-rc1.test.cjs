const assert=require('assert');
const {PROBE_COMMAND,APPLY_COMMAND,normalizeProfile,profilesEqual,unsupportedReasons,assertStatPortable,preserveWindowsMetadata,verifyWindowsMetadata,verifySourceMetadataStable,withTimeOverride}=require('../electron/services/windows-ntfs-metadata.cjs');
const base={kind:'file',attributes:32,creationTimeUtcTicks:'638900000000000000',lastAccessTimeUtcTicks:'638900000000000010',lastWriteTimeUtcTicks:'638900000000000020',aclSddl:'O:BAG:SYD:(A;;FA;;;SY)(A;;FA;;;BA)',namedStreams:[]};
assert(profilesEqual(base,normalizeProfile(base)));
assert.deepStrictEqual(unsupportedReasons(base,{nlink:1}),[]);
assert(unsupportedReasons({...base,streamProbeOk:false},{nlink:1}).includes('STREAM_ENUMERATION_UNAVAILABLE'));
assert(unsupportedReasons({...base,namedStreams:[{name:'Zone.Identifier',length:12}]},{nlink:1}).includes('ALTERNATE_DATA_STREAMS'));
assert(unsupportedReasons({...base,attributes:32|2048},{nlink:1}).includes('ATTRIBUTE_COMPRESSED'));
assert.throws(()=>assertStatPortable({nlink:2}),e=>e.code==='EXPLORER_NTFS_METADATA_UNSUPPORTED');
const overridden=withTimeOverride(base,{birthtimeMs:1700000000000,atimeMs:1700000001000,mtimeMs:1700000002000});assert.notStrictEqual(overridden.lastAccessTimeUtcTicks,base.lastAccessTimeUtcTicks);assert.notStrictEqual(overridden.lastWriteTimeUtcTicks,base.lastWriteTimeUtcTicks);
let current={...base};
const runner=async(command)=>{
  if(command===PROBE_COMMAND)return{ok:true,stdout:JSON.stringify(current)};
  if(command===APPLY_COMMAND)return{ok:true,stdout:JSON.stringify(current)};
  return{ok:false,code:'UNKNOWN'};
};
(async()=>{
  const rec=await preserveWindowsMetadata('C:\\src\\a.txt','D:\\dst\\a.txt',{platform:'win32',runner,sourceStat:{nlink:1}});assert.strictEqual(rec.platform,'win32');assert(rec.fingerprint);
  let v=await verifyWindowsMetadata('D:\\dst\\a.txt',rec,{platform:'win32',runner});assert(v.ok);current={...base,lastAccessTimeUtcTicks:'638900000000999999'};let stable=await verifySourceMetadataStable('C:\\src\\a.txt',rec,{platform:'win32',runner});assert(stable.ok,'last-access drift caused by reads must not look like a source mutation');current={...base,aclSddl:'O:BAG:SYD:(A;;FR;;;SY)'};stable=await verifySourceMetadataStable('C:\\src\\a.txt',rec,{platform:'win32',runner});assert.strictEqual(stable.ok,false,'ACL mutation must be detected');current={...base};
  current={...base,lastWriteTimeUtcTicks:'DIFFERENT'};v=await verifyWindowsMetadata('D:\\dst\\a.txt',rec,{platform:'win32',runner});assert.strictEqual(v.ok,false);
  current={...base,namedStreams:[{name:'secret',length:1}]};await assert.rejects(()=>preserveWindowsMetadata('C:\\src\\a.txt','D:\\dst\\a.txt',{platform:'win32',runner,sourceStat:{nlink:1}}),e=>e.code==='EXPLORER_NTFS_METADATA_UNSUPPORTED'&&e.details.reasons.includes('ALTERNATE_DATA_STREAMS'));
  console.log('ntfs-metadata-fidelity-rc1.test.cjs PASS',{acl:true,timestamps:true,attributes:true,adsFailClosed:true,streamProbeFailClosed:true,hardLinkFailClosed:true,sourceMetadataRace:true,atimeReadDriftIgnored:true});
})().catch(e=>{console.error(e);process.exit(1)});
