# Validation v0.9.5

## PASS در محیط فعلی

- `npm run check:dependency-pins`
- `npm run check:source-hygiene`
- `npm run check:syntax`
- `npm run check:jsx`
- تمام Regressionهای نسخه‌های قبل
- `tests/file-explorer-batch-v095.test.cjs`
- `tests/explorer-batch-recovery-v095.test.cjs`

سناریوهای جدید تأییدشده: Recursive Copy چندسطحی، checkpoint/resume، Duplicate Skip، Conflict Rename، Replace+Undo، Cancel+Partial Rollback، Resume از Interrupted، Symlink rejection، Replace-directory rejection، Recovery بعد از Backup و Recovery بعد از Commit.

**زنجیره اصلی `npm test`: 41 تست/سوییت PASS.**

## Windows-only

`npm run test:windows-explorer-v095-uat` در محیط فعلی `SKIP (Windows only)` است و PASS واقعی Windows محسوب نشده است.

## Release boundary

- `npm run check:release-inputs` → `LOCKFILE_REQUIRED` چون lockfile واقعی هنوز باید روی محیط آنلاین تولید/review شود.
- `npm run build` → `vite: not found` چون node_modules در محیط فعلی نصب نیست.
- NSIS/Portable/Authenticode هنوز Windows-certified نیستند.
