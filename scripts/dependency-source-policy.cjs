const crypto=require('crypto');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=canonical(v[k]);return o}return v}
function stable(v){return JSON.stringify(canonical(v))}
function policyHash(policy){return crypto.createHash('sha256').update(stable(policy||{})).digest('hex')}
function normalizedPolicy(pkg){
  const p=pkg?.workspaceAgentRelease?.dependencySourcePolicy||{};
  return {schemaVersion:String(p.schemaVersion||''),mode:String(p.mode||''),allowedRegistryOrigins:(p.allowedRegistryOrigins||[]).map(x=>String(x).replace(/\/$/,'').toLowerCase()).sort(),allowedResolvedProtocols:(p.allowedResolvedProtocols||[]).map(x=>String(x).toLowerCase()).sort(),forbidLinks:p.forbidLinks===true,forbidGit:p.forbidGit===true,forbidFile:p.forbidFile===true,requireIntegrityForRegistryArtifacts:p.requireIntegrityForRegistryArtifacts===true};
}
function validatePolicy(pkg){const p=normalizedPolicy(pkg),errors=[];if(p.schemaVersion!=='workspace-agent-dependency-source-policy-v1')errors.push('DEPENDENCY_SOURCE_POLICY_SCHEMA_INVALID');if(p.mode!=='allowlist')errors.push('DEPENDENCY_SOURCE_POLICY_MODE_INVALID');if(!p.allowedRegistryOrigins.length)errors.push('DEPENDENCY_SOURCE_POLICY_REGISTRY_ALLOWLIST_EMPTY');if(!p.allowedResolvedProtocols.length)errors.push('DEPENDENCY_SOURCE_POLICY_PROTOCOL_ALLOWLIST_EMPTY');if(!p.allowedResolvedProtocols.includes('https:'))errors.push('DEPENDENCY_SOURCE_POLICY_HTTPS_REQUIRED');if(p.forbidLinks!==true||p.forbidGit!==true||p.forbidFile!==true)errors.push('DEPENDENCY_SOURCE_POLICY_FAIL_CLOSED_FLAGS_REQUIRED');if(p.requireIntegrityForRegistryArtifacts!==true)errors.push('DEPENDENCY_SOURCE_POLICY_INTEGRITY_REQUIRED');return{ok:errors.length===0,errors,policy:p,sha256:policyHash(p)}}
function classifyResolved(resolved){const s=String(resolved||'').trim();if(!s)return{kind:'none'};const low=s.toLowerCase();if(low.startsWith('file:')||low.startsWith('link:'))return{kind:'file',value:s};if(low.startsWith('git:')||low.startsWith('git+')||low.startsWith('github:')||low.startsWith('gitlab:')||low.startsWith('bitbucket:'))return{kind:'git',value:s};try{const u=new URL(s);return{kind:'url',value:s,protocol:u.protocol.toLowerCase(),origin:u.origin.toLowerCase()}}catch{return{kind:'unknown',value:s}}}
function validateLockSources(lock,pkg){
  const pv=validatePolicy(pkg);const errors=[...pv.errors],origins=new Set(),protocols=new Set(),resolvedRows=[];
  for(const [name,row] of Object.entries(lock?.packages||{})){
    if(!name)continue;
    if(row?.link===true&&pv.policy.forbidLinks)errors.push(`DEPENDENCY_LINK_FORBIDDEN:${name}`);
    const c=classifyResolved(row?.resolved);if(c.kind==='none')continue;
    resolvedRows.push({name,resolved:String(row.resolved)});
    if(c.kind==='file'){if(pv.policy.forbidFile)errors.push(`DEPENDENCY_FILE_SOURCE_FORBIDDEN:${name}`);continue}
    if(c.kind==='git'){if(pv.policy.forbidGit)errors.push(`DEPENDENCY_GIT_SOURCE_FORBIDDEN:${name}`);continue}
    if(c.kind!=='url'){errors.push(`DEPENDENCY_RESOLVED_SOURCE_INVALID:${name}`);continue}
    protocols.add(c.protocol);origins.add(c.origin);
    if(!pv.policy.allowedResolvedProtocols.includes(c.protocol))errors.push(`DEPENDENCY_PROTOCOL_FORBIDDEN:${name}:${c.protocol}`);
    if(!pv.policy.allowedRegistryOrigins.includes(c.origin))errors.push(`DEPENDENCY_REGISTRY_ORIGIN_FORBIDDEN:${name}:${c.origin}`);
    if(pv.policy.requireIntegrityForRegistryArtifacts&&!row.integrity&&!row.link)errors.push(`DEPENDENCY_INTEGRITY_MISSING:${name}`);
  }
  return{ok:errors.length===0,errors,policy:pv.policy,policySha256:pv.sha256,resolvedOrigins:[...origins].sort(),resolvedProtocols:[...protocols].sort(),resolvedCount:resolvedRows.length};
}
module.exports={stable,policyHash,normalizedPolicy,validatePolicy,classifyResolved,validateLockSources};
