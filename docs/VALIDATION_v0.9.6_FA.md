# Validation v0.9.6

## PASS در محیط فعلی

- `npm run check:dependency-pins`
- `npm run check:source-hygiene`
- Syntax همه فایل‌های Core جدید
- JSX compile-check
- تمام Regressionهای v0.1 تا v0.9.5
- `file-explorer-production-v096.test.cjs`
  - cross-volume recursive move
  - cross-volume undo
  - committed-state crash resume
  - low-space blocker/resume
  - root identity blocker/resume
  - permission blocker
- `explorer-batch-schema-v096.test.cjs`
  - migration schema v1→v2

زنجیره `npm run check`: 43 تست/سوییت بدون شکست.

## Windows-only / Pending

`tests/windows-file-explorer-v096.uat.cjs` در محیط فعلی `SKIP (Windows only)` است. برای UAT واقعی:

```powershell
$env:WA_V096_SOURCE_ROOT='C:\WA-UAT'
$env:WA_V096_DEST_ROOT='D:\WA-UAT'
npm run test:windows-explorer-v096-uat
```

سناریوهای disconnect واقعی، disk-full واقعی و ACL/read-only واقعی باید طبق `WINDOWS_FILE_EXPLORER_PRODUCTION_UAT_v0.9.6_FA.md` evidence شوند.

## Release boundary

- `npm run check:release-inputs` → `LOCKFILE_REQUIRED` تا package-lock واقعی ساخته و commit شود.
- `npm run build` در محیط فعلی → `vite: not found` چون dependencies نصب نیستند.
- NSIS/Portable/Authenticode هنوز Windows-certified نیستند.
