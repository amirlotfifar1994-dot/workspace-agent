const path=require('path');

function normalizeUnicode(v=''){const s=String(v);try{return s.normalize('NFC')}catch{return s;}}
function canonicalNameKey(v='',{platform=process.platform}={}){const s=normalizeUnicode(v);return platform==='win32'?s.toLocaleLowerCase('en-US'):s;}
function pathImpl(platform=process.platform){return platform==='win32'?path.win32:path.posix;}
function stripNamespacePrefix(input='',platform=process.platform){
  let v=String(input||'');
  if(platform!=='win32')return v;
  if(v.startsWith('\\\\?\\UNC\\'))return `\\\\${v.slice(8)}`;
  if(v.startsWith('\\\\?\\'))return v.slice(4);
  return v;
}
function normalizeDisplayPath(input='',{platform=process.platform,cwd=process.cwd()}={}){
  const impl=pathImpl(platform);const raw=stripNamespacePrefix(input,platform);
  if(!raw)return raw;
  const base=platform==='win32'?stripNamespacePrefix(cwd,platform):cwd;
  return impl.normalize(impl.resolve(base,raw));
}
function toFsPath(input='',{platform=process.platform,cwd=process.cwd()}={}){
  const display=normalizeDisplayPath(input,{platform,cwd});
  if(platform!=='win32'||!display)return display;
  return path.win32.toNamespacedPath(display);
}
function keyPath(input='',options={}){
  const platform=options.platform||process.platform;const v=normalizeDisplayPath(input,{...options,platform});
  return platform==='win32'?v.toLocaleLowerCase('en-US'):v;
}
function inside(root,target,options={}){
  const platform=options.platform||process.platform;const impl=pathImpl(platform);const r=keyPath(root,{...options,platform});const t=keyPath(target,{...options,platform});
  if(!r||!t)return false;const rel=impl.relative(r,t);return rel===''||(!rel.startsWith('..')&&!impl.isAbsolute(rel));
}
function pathDiagnostics(input='',options={}){
  const platform=options.platform||process.platform;const display=normalizeDisplayPath(input,{...options,platform});const fsPath=toFsPath(display,{...options,platform});
  const isUnc=platform==='win32'&&display.startsWith('\\\\');
  return{display,fsPath,isUnc,isNamespaced:platform==='win32'&&String(fsPath).startsWith('\\\\?\\'),displayLength:display.length,longPathCandidate:platform==='win32'&&display.length>=240};
}
module.exports={normalizeUnicode,canonicalNameKey,stripNamespacePrefix,normalizeDisplayPath,toFsPath,keyPath,inside,pathDiagnostics,pathImpl};
