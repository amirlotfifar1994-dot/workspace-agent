# Validation — v1.0.0-rc1 / cert-kit8 External Mutation + Power Transition Fence

Validation این بسته در محیط non-Windows انجام شده و ادعای Windows certification ندارد.

## Source gates

- `npm run check`: PASS
- `npm test`: 75/75 PASS
- `npm run check:syntax`: 203 فایل PASS
- `npm run check:jsx`: PASS
- `npm run check:source-hygiene`: PASS
- `npm run check:dependency-pins`: PASS
- `npm run check:rc1-source`: PASS با `toolingRevision=cert-kit8`
- `npm run test:rc1-certkit`: PASS
- `npm run check:release-inputs`: عمداً `LOCKFILE_REQUIRED`؛ package-lock مصنوعی تولید نشده است.

## Regressionهای cert-kit8

- Suspend barrier جلوی Lease جدید را می‌گیرد و Lease قبلی بعد از Resume stale می‌شود.
- Resume barrier فقط بعد از Root/Volume probe برداشته می‌شود.
- Batch اگر fence درست قبل از Commit stale شود، بدون Commit Pause می‌شود و checkpoint قابل Resume باقی می‌ماند.
- Copy اگر مقصد بلافاصله بعد از Commit توسط برنامه دیگری تغییر کند، فایل تغییرکرده را در rollback cleanup حذف نمی‌کند.
- Swap شدن Parent مقصد با symlink/reparse-like path بعد از Preview قبل از Commit Block می‌شود.
- Move موفقی که بلافاصله توسط editor خارجی تغییر کند در Verify به‌عنوان mutation آشکار می‌شود.
- Case-only path semantics ویندوز در plan logic به‌صورت مستقل تست شده است.

## Gateهای خارج از این محیط

Windows 10، Windows 11، دو Volume NTFS واقعی، sharing-mode/file-lock واقعی Office/Corel/Photoshop، ACL inheritance، NTFS reparse points، Sleep/Resume واقعی، Scale 100k و 1M، package-lock رسمی با Node 24.14.1/npm 11.11.0، `npm ci`، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و Authenticode در صورت policy همچنان باید در Windows Release Lane اثبات شوند.
