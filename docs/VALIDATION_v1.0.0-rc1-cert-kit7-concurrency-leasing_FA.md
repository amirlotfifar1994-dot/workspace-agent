# Validation — v1.0.0-rc1 / cert-kit7 Concurrency Leasing

Validation این بسته در محیط non-Windows انجام شده است و ادعای Windows certification ندارد.

## Source gates

- `npm run check`: PASS
- `npm test`: 72/72 PASS
- `npm run check:syntax`: 200 فایل PASS
- `npm run check:jsx`: PASS
- `npm run check:source-hygiene`: PASS
- `npm run check:dependency-pins`: PASS
- `npm run check:rc1-source`: PASS با `toolingRevision=cert-kit7`
- `npm run check:release-inputs`: عمداً `LOCKFILE_REQUIRED`؛ package-lock مصنوعی تولید نشده است.

## Concurrency regressions

- اجرای هم‌زمان همان Cycle فقط یک بار `handler.next()` را اجرا می‌کند.
- Rollback هنگام Cycle فعال با `CYCLE_BUSY` متوقف می‌شود.
- read/read روی Path هم‌پوشان مجاز، read/write و write/write هم‌پوشان Block می‌شوند.
- sibling pathهای مستقل می‌توانند هم‌زمان Write شوند.
- Cross-volume exclusive lease روی Volume مشترک contention را Block می‌کند.
- Batch هنگام Lease conflict بدون mutation Pause می‌شود و بعد از آزادشدن Lease Resume و Complete می‌شود.
- Explorer single write نیز در conflict Pause و سپس Resume می‌شود.
- `EBUSY`/`ETXTBSY` recoverable file lock و `EPERM` permission-or-lock شناخته می‌شوند.
- Main process وجود Single Instance Lock را enforce می‌کند.

## Gateهای خارج از این محیط

Windows 10، Windows 11، دو Volume NTFS، Scale 100k و 1M، package-lock رسمی با Node 24.14.1/npm 11.11.0، `npm ci`، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و Authenticode در صورت policy همچنان باید در Windows Release Lane اثبات شوند.
