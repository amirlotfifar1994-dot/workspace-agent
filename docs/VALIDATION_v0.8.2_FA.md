# Validation v0.8.2

تاریخ Validation: 2026-08-13

## محیط فعلی Validation
- Platform: non-Windows container
- Node: 22.16.0
- npm: 10.9.2
- TypeScript CLI: 5.8.3

این Runtime **Release runtime نیست**. Release lane پروژه روی Node/npm pin‌شده تعریف شده و Windows release script mismatch را Block می‌کند.

## Regression
`npm run check`:
- dependency exact-pin gate: PASS
- source hygiene: PASS
- syntax: PASS
- JSX parse/type syntax gate: PASS
- تمام regression tests v0.3 → v0.8.1: PASS
- windows path hardening v0.8.2: PASS

## Path hardening test
موارد PASS:
- Win32 long-path namespace conversion
- UNC namespace conversion
- namespace strip برای display/compare
- Windows case-insensitive path key
- root containment
- >240 path diagnostic
- simulated `app.asar.unpacked` Worker resolution
- Hash روی symlink: `HASH_LINK_BLOCKED`
- scanner عدم traversal به linked directory
- `SYMLINK_SKIPPED` audit

## Windows UAT
`node tests/windows-verification-v082.uat.cjs` در محیط فعلی:
- SKIP (Windows only)

روی Windows واقعی این UAT موارد زیر را می‌سنجد:
- path واقعی بیش از 260 کاراکتر
- filename فارسی + emoji
- Persistent Index روی long path
- junction به خارج Root نباید traverse شود
- Indexed Duplicate باید فایل long-path را Hash کند
- SQLite health باید ok باشد

## Reproducible release gate
`verify-release-inputs --pins-only`: PASS.

Strict release-input gate در این source tree به‌طور عمدی `LOCKFILE_REQUIRED` می‌دهد، چون registry در محیط فعلی قابل دسترس نبود و `package-lock.json` ساختگی تولید نشده است. Release رسمی تا تولید/commit lockfile واقعی مجاز نیست.

## Scale benchmark
در اجرای این مرحله:
- 100k synthetic rows: RSS حدود 67 MB، Search 169 ms
- 500k synthetic rows: RSS حدود 100 MB، Search 511 ms

اجرای ترکیبی benchmark و تلاش مستقل 1M هر دو به سقف زمانی ابزار رسیدند؛ عدد 1M برای این نسخه جعل/برآورد نشده و در Windows matrix دوباره اندازه‌گیری می‌شود.

## Binary Build
Binary Build در این محیط انجام نشده چون dependency install/lockfile واقعی موجود نیست. بنابراین موارد زیر هنوز Pending هستند:
- win-unpacked smoke واقعی
- NSIS artifact
- Portable artifact
- Authenticode signature verification
- SmartScreen/Defender UAT
