# Validation — v1.0.0-rc1 cert-kit14

## نتیجه Source Validation
- `npm run check`: **PASS**
- تمام Source Testها: **89/89 PASS در یک اجرای کامل**
- Syntax: **PASS — 226 فایل**
- JSX: **PASS**
- Source hygiene: **PASS**
- Dependency pins: **PASS**
- RC source contract: **PASS — toolingRevision=cert-kit14**
- Local AI runtime provenance: **PASS در Source**؛ hash pin، signer pin، mutation detection و fail-closed پوشش داده شد.
- Journal retention: **PASS در Source**؛ bounded retention، anchor، restart recovery، disk-pressure، anchor tamper detection و حفظ tail معتبر پس از anchor corruption پوشش داده شد.
- Regression cert-kit13: NTFS metadata fidelity و exact transactional state restore در suite کامل PASS ماندند.

## Release/Windows gates
- `check:release-inputs`: **EXPECTED BLOCK — `LOCKFILE_REQUIRED`**. هیچ `package-lock.json` ساختگی تولید نشده است.
- Build در این محیط انجام نشد چون dependencyهای release نصب نیستند و `vite` در دسترس نیست؛ این وضعیت به‌عنوان Build PASS ثبت نشده است.
- `windows-local-ai-provenance-rc1.uat.cjs`: روی این محیط Linux به‌درستی **SKIP / WINDOWS_REQUIRED**.
- Windows 10/11، دو Volume واقعی NTFS، scale 100k/1M، USB، locks/ACL/Junction، sleep/power، disk-full، package/upgrade و Local-AI Authenticode evidence همچنان باید در Release Lane ویندوزی اجرا شوند.

## Runtime این Validation
- Linux
- Node `v22.16.0`
- npm `10.9.2`

Runtime رسمی Release طبق pin پروژه: Node `24.14.1` و npm `11.11.0`.
