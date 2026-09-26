# Validation — v1.0.0-rc1 / cert-kit3 Resilience Hardening

## Source-side gates

| Gate | نتیجه |
|---|---|
| `npm run check:rc1-source` | PASS |
| `npm run check:source-hygiene` | PASS |
| `npm run check:syntax` | PASS — 185 فایل JS/CJS/MJS |
| `npm run check:jsx` | PASS |
| `npm run check:dependency-pins` | PASS — 10 dependency/runtime pin |
| `npm test` | PASS — 61/61 |

## Regressionهای جدید

`product-resilience-hardening-vrc1.test.cjs` موارد active-time accounting، retention، exact undo و hash-safe recovery را پوشش می‌دهد.

`cycle-rollback-truthfulness-rc1.test.cjs` تضمین می‌کند rollback ناقص `rollback-failed` ثبت شود و پس از رفع conflict قابل Retry باشد.

`ui-batch-auto-progress-rc1.test.cjs` قرارداد Auto Continue، Safe-boundary Pause/Cancel و هماهنگی version labelهای RC را بررسی می‌کند. JSX نیز جداگانه با TypeScript syntax gate parse شده است.

## محدودیت اعتبار این Validation

این گزارش فقط Source-side است. محیط فعلی Windows Release Lane رسمی نیست و `package-lock.json` رسمی موجود نیست. بنابراین موارد زیر عمداً PASS اعلام نشده‌اند:

- Windows 10 certification
- Windows 11 certification و dual-OS envelope
- دو Volume واقعی NTFS
- 100k و 1M scale UAT واقعی
- `npm ci` با Node 24.14.1 / npm 11.11.0
- win-unpacked / NSIS / Portable smoke
- upgrade واقعی v0.9.8 → v1.0.0-rc1
- Authenticode

Fingerprint نهایی Source در manifest بیرونی artifact ثبت می‌شود تا self-referential hash ایجاد نشود.
