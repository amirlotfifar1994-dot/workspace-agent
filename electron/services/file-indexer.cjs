const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {toFsPath,normalizeDisplayPath,inside}=require('./windows-path-utils.cjs');

const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', 'node_modules', '.git', '.workspace-agent-quarantine']);

async function assertReadableDirectory(root) {
  const resolved=normalizeDisplayPath(String(root||''));
  if(!root) throw Object.assign(new Error('پوشه کاری مشخص نشده است.'),{code:'ROOT_REQUIRED'});
  let st; try{st=await fsp.stat(toFsPath(resolved));}catch(error){throw Object.assign(new Error('پوشه کاری در دسترس نیست.'),{code:error.code||'ROOT_UNAVAILABLE'});}
  if(!st.isDirectory()) throw Object.assign(new Error('مسیر انتخاب‌شده پوشه نیست.'),{code:'ROOT_NOT_DIRECTORY'});
  return resolved;
}

async function scanTree(root, { maxFiles = 250000, maxDirs=100000, includeHidden = false, skipDirNames = [], skipPathPrefixes = [], signal, onProgress } = {}) {
  const resolved=await assertReadableDirectory(root);
  const files = [];
  const errors=[];
  const customSkipNames=new Set((skipDirNames||[]).map(x=>String(x).toLowerCase()));
  const customSkipPrefixes=(skipPathPrefixes||[]).map(x=>normalizeDisplayPath(String(x))).filter(Boolean);
  const shouldSkipPath=p=>customSkipPrefixes.some(prefix=>inside(prefix,p));
  const stack = [resolved];
  let dirs = 0;
  let truncated=false;
  let truncateReason='';
  while (stack.length) {
    if (signal?.aborted) throw Object.assign(new Error('Scan cancelled'), { code: 'SCAN_CANCELLED' });
    const current = stack.pop(); dirs += 1;
    if(dirs>maxDirs){truncated=true;truncateReason='MAX_DIRS';break;}
    let entries;
    try { entries = await fsp.readdir(toFsPath(current), { withFileTypes: true }); }
    catch (error) { errors.push({ path: current, error: error.code || error.message, kind: 'directory-unreadable' }); continue; }
    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && (SKIP_DIRS.has(entry.name) || customSkipNames.has(entry.name.toLowerCase()) || shouldSkipPath(full))) continue;
      if (entry.isSymbolicLink()) { errors.push({path:full,error:'SYMLINK_SKIPPED',kind:'link-skipped'}); continue; }
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!entry.isFile()) continue;
      try {
        const st = await fsp.stat(toFsPath(full));
        files.push({ path: full, name: entry.name, ext: path.extname(entry.name).toLowerCase(), size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs });
      } catch (error) { errors.push({path:full,error:error.code||error.message,kind:'file-unreadable'}); }
      if (files.length >= maxFiles) {truncated=true;truncateReason='MAX_FILES';break;}
      if (files.length > 0 && files.length % 500 === 0) onProgress?.({ files: files.length, dirs, errors:errors.length, current });
    }
    if(truncated&&truncateReason==='MAX_FILES') break;
  }
  return { root:resolved, files, errors, truncated, truncateReason, dirs };
}

module.exports = { scanTree, assertReadableDirectory, SKIP_DIRS };
