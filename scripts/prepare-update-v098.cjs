const path=require('path');
const fs=require('fs');
const {VersionUpdateGuard}=require('../electron/services/version-update-guard.cjs');
function arg(name){const p=`--${name}=`;const x=process.argv.find(v=>String(v).startsWith(p));return x?String(x).slice(p.length):'';}
const userData=arg('user-data'),current=arg('current'),target=arg('target'),artifact=arg('sha256'),backup=arg('backup');
if(!userData||!current||!target||!artifact){console.error('Usage: node scripts/prepare-update-v098.cjs --user-data=<path> --current=<version> --target=<version> --sha256=<64hex> [--backup=<file>]');process.exit(2);}
if(!fs.existsSync(path.resolve(userData)))fs.mkdirSync(path.resolve(userData),{recursive:true});
try{const g=new VersionUpdateGuard(path.resolve(userData),{currentVersion:current,observeBoot:false});const status=g.prepareUpdate({targetVersion:target,artifactSha256:artifact,backupFile:backup||null});console.log(JSON.stringify({ok:true,schemaVersion:'workspace-agent-update-preflight-v098-v1',currentVersion:current,targetVersion:status.pending?.targetVersion||null,artifactSha256:status.pending?.artifactSha256||null,backupFile:status.pending?.backupFile||null},null,2));}catch(error){console.error(`${error.code||'UPDATE_PREPARE_FAILED'}: ${error.message}`);process.exit(1);}
