# Validation — v1.0.0-rc1 / cert-kit13

Environment فعلی: Linux container. این محیط Windows Release Runtime رسمی نیست.

## Source gates
- `npm run check`: PASS
- Regression: **87/87 test files PASS** در یک اجرای کامل
- Syntax: **222 JS/CJS/MJS files PASS**
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins: PASS
- RC1 Source Contract: PASS
- toolingRevision: `cert-kit13`
- NTFS fidelity source regression: PASS
- Exact transactional restore regression: PASS

## Release-input truth
`npm run check:release-inputs` عمداً FAIL می‌شود با:
`LOCKFILE_REQUIRED`

package-lock مصنوعی ساخته نشده است. Runtime رسمی Release همچنان Node `24.14.1` و npm `11.11.0` است.

## Windows-only truth
`test:windows-ntfs-metadata-rc1-uat` روی non-Windows SKIP است. بنابراین ACL/NTFS/PowerShell behavior واقعی، Windows 10/11، دو Volume، Scale، NSIS/Portable و Upgrade هنوز PENDING هستند. این Source به‌عنوان Stable یا Windows-certified معرفی نمی‌شود.
