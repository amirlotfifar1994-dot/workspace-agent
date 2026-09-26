# Validation — v1.0.0-rc1 / cert-kit9 Windows-native Edge Hardening

Validation این بسته در محیط non-Windows انجام شده و ادعای Windows certification ندارد.

## Source gates

- Source tests: `76/76 PASS` (اجرای full runner تا test 74 بدون failure و دو test پایانی نیز جداگانه PASS شدند؛ timeout محیط فقط زمان کل runner را قطع کرد.)
- `npm run test:rc1-certkit`: PASS
- `npm run check:syntax`: `205 files PASS`
- `npm run check:jsx`: PASS
- `npm run check:source-hygiene`: PASS
- `npm run check:dependency-pins`: PASS
- `npm run check:rc1-source`: PASS با `toolingRevision=cert-kit9`
- `npm run test:windows-native-edge-rc1-uat`: `SKIP (Windows only)` در این محیط؛ Script syntax/source آماده است.
- `npm run check:release-inputs`: عمداً `LOCKFILE_REQUIRED`; package-lock مصنوعی تولید نشده است.

## Regressionهای cert-kit9

- UNC subdirectoryهای یک Share identity یکسان دارند.
- Batch Windows از strong Volume identity قابل تزریق/Probe استفاده می‌کند.
- Chunk boundary deep identity و item-level fast gate مستقل تست شده است.
- Unicode NFC/case canonical collision قبل از Write شناسایی می‌شود.
- normalization-only rename Block و case-only rename مجاز می‌ماند.
- Stage مسیر destination-local دارد.
- Root relocation candidate به‌جای generic unavailable صریح surface می‌شود.

## Gateهای خارج از این محیط

Windows 10، Windows 11، NTFS واقعی، ACL inheritance، FileShare واقعی Office/Corel/Photoshop، reparse/junction واقعی، Sleep/Resume واقعی، removable drive reconnect/drive-letter change، long-path policy، Scale 100k/1M، package-lock رسمی با Node 24.14.1/npm 11.11.0، `npm ci`، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و Authenticode در صورت policy همچنان باید در Windows Release Lane اثبات شوند.
