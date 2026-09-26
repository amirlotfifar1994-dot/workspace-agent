const path = require('path');
const {normalizeDisplayPath,keyPath,inside}=require('./windows-path-utils.cjs');

function normalize(p='') { return normalizeDisplayPath(String(p || '')); }
function comparable(p=''){return keyPath(p);}
function sameOrInside(candidate, parent) { return inside(parent,candidate); }

function protectedRoots() {
  if (process.platform !== 'win32') return [];
  return [
    process.env.SystemRoot,
    process.env.windir,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramData,
  ].filter(Boolean).map(normalize);
}
function evaluateWriteRoot(root) {
  if (!root) return { ok:false, code:'ROOT_REQUIRED', message:'پوشه کاری مشخص نشده است.' };
  const resolved = normalize(root);
  if (path.parse(resolved).root === resolved) return { ok:false, code:'DRIVE_ROOT_WRITE_BLOCKED', message:'عملیات Write روی ریشه کامل درایو مجاز نیست؛ یک پوشه مشخص انتخاب کنید.' };
  const protectedHit = protectedRoots().find(p => sameOrInside(resolved, p) || sameOrInside(p, resolved));
  if (protectedHit) return { ok:false, code:'SYSTEM_PATH_BLOCKED', message:'این محدوده با پوشه‌های سیستمی ویندوز تداخل دارد و برای عملیات Write مسدود شده است.', protectedPath: protectedHit };
  return { ok:true, root:resolved };
}
function assertWriteRoot(root) {
  const verdict = evaluateWriteRoot(root);
  if (!verdict.ok) throw Object.assign(new Error(verdict.message), { code:verdict.code });
  return verdict.root;
}
function assertInsideRoot(candidate, root) {
  const c = normalize(candidate), r = normalize(root);
  if (!sameOrInside(c, r)) throw Object.assign(new Error('مسیر عملیات خارج از محدوده کاری است.'), { code:'PATH_ESCAPE_BLOCKED' });
  return c;
}
module.exports = { evaluateWriteRoot, assertWriteRoot, assertInsideRoot, sameOrInside, normalize, comparable, protectedRoots };
