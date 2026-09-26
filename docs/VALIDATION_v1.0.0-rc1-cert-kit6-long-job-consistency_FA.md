# Validation — v1.0.0-rc1 / cert-kit6

محیط Validation فعلی non-Windows است؛ بنابراین هیچ PASS برای Windows UAT یا binary build ادعا نمی‌شود.

## نتایج Source

- `npm run check`: **PASS**
- Dependency pins: **PASS**
- RC1 source contract (`toolingRevision=cert-kit6`): **PASS**
- Source hygiene: **PASS**
- JS/CJS/MJS syntax discovery: **195/195 PASS**
- JSX gate: **PASS**
- Regression discovery: **68/68 PASS**

## Regression جدید

- Crash commit-window برای replace-copy و Resume با commit evidence.
- Rollback partial + retry idempotent.
- Recovery identity mismatch برای replacement هم‌اندازه.
- Directory reconcile truncation → root stale + Full Rescan.
- Persistent-index search روی completed و bounded fallback روی stale.
- Indexed Search/Duplicates روی stale → `INDEX_NOT_FRESH`.
- Watcher partial reconcile → dirty root.
- Startup interrupted batch/transaction → stale/dirty roots.

## مواردی که عمداً PENDING هستند

`package-lock.json` رسمی، `npm ci` در Runtime pin‌شده، Windows 10/11، دو Volume NTFS، Scale 100k/1M، NSIS/Portable، upgrade واقعی از 0.9.8 و در صورت policy، Authenticode.
