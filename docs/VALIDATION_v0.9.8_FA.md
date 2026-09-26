# Validation v0.9.8

## Automated gates

- dependency pins: PASS
- source hygiene: PASS
- syntax: PASS
- JSX: PASS
- complete historical regression chain: PASS
- version/update guard: PASS
- semantic version/pre-release comparison: PASS
- future Data Epoch write block: PASS
- RC self-check pass/warn/block classification: PASS
- state backup gzip creation: PASS
- payload + bundle SHA256 integrity: PASS
- restore preview: PASS
- automatic pre-restore backup: PASS
- local AI settings restore: PASS
- corrupted backup rejection: PASS
- diagnostics path redaction: PASS
- diagnostics secret removal: PASS
- update-preflight CLI: PASS

## Test count

`51` main test suites/files PASS.

## Environment limits

این محیط Windows نیست و npm registry دسترسی مؤثر برای lock generation ندارد. بنابراین Windows-specific UAT، package-lock رسمی، npm ci، Installer/Portable و signing در این گزارش PASS اعلام نشده‌اند.

## Release boundary probes

```text
npm run check:release-inputs
→ LOCKFILE_REQUIRED (exit 1, expected fail-closed)

WA_CERT_STRICT=1 node tests/windows-certification-v097.uat.cjs
→ SKIP Windows only (exit 3, expected INCOMPLETE)

npm run build
→ vite: not found (exit 127; node_modules not installed in this environment)
```
