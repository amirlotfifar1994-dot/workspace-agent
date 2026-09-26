# Validation — v1.0.0-rc1 / cert-kit2

## محیط فعلی

- Platform: non-Windows
- Node: `22.16.0`
- npm: `10.9.2`
- Release Lane رسمی همچنان Windows 10/11 + Node `24.14.1` + npm `11.11.0` است.

## Source Gate اجراشده

- Dependency exact pins: **PASS**
- RC1 source/freeze contract: **PASS**
- Tooling revision `cert-kit2`: **PASS**
- Source hygiene: **PASS**
- Recursive JS/CJS/MJS syntax discovery: **182 files PASS**
- Regression/source tests: **58/58 PASS**
- Dual-Windows matrix contract: **PASS**
- 100k + 1M scale contract: **PASS**
- Manual evidence provenance/upgrade contract: **PASS**
- Certification Envelope incomplete/fail semantics: **PASS**
- Generated-directory fingerprint isolation: **PASS**

## Release Boundary

`check:release-inputs` در این محیط عمداً با `LOCKFILE_REQUIRED` متوقف می‌شود، چون package-lock واقعی Release Lane هنوز تولید نشده است.

PowerShell/Windows UAT، دو Volume واقعی NTFS، Windows 10، Windows 11، 100k/1M واقعی، NSIS/Portable، packaged smoke و Authenticode در این محیط قابل اجرای واقعی نیستند و به‌عنوان PASS ادعا نمی‌شوند.

## نکته JSX

فایل‌های JSX/Core نسبت به cert-kit1 تغییر نکرده‌اند. در این Run به‌علت نبود `node_modules`، `tsc`/`check:jsx` دوباره اجرا نشده است؛ این مورد باید پس از `npm ci` در Release Lane رسمی دوباره PASS شود.
