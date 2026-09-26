# RC Readiness Model — v0.9.8

## هدف

v0.9.8 قابلیت جدید پرریسک اضافه نمی‌کند؛ هدف این است که Core موجود قبل از v1.0 RC بتواند خرابی State، downgrade ناسازگار، update ناقص و نیاز به گزارش تشخیصی را fail-safe مدیریت کند.

## 1. Startup Self‑Check

خروجی:

```text
pass  = runtime سالم
warn  = runtime قابل استفاده ولی نیازمند توجه
block = write safety قابل اعتماد نیست
```

Self‑Check read-only است و به‌جز نوشتن audit event، Workspace را تغییر نمی‌دهد.

## 2. Version / Update Guard

فایل داخلی: `runtime/update-guard.json`

State اصلی:

- `stableVersion`
- `lastSeenVersion`
- `dataEpoch`
- `pending.targetVersion`
- `pending.artifactSha256`
- `rollbackRecommended`
- `writeBlocked`

### Downgrade

اگر `lastSeenVersion > currentVersion` باشد، Writeها fail-closed می‌شوند.

### Data Epoch

v0.9.8 فقط `dataEpoch = 1` را می‌شناسد. اگر State دارای epoch بالاتر باشد، نسخه قدیمی اجازه Write ندارد حتی اگر version string به هر دلیل قابل مقایسه نباشد.

### Update boot

1. installer/updater آینده preflight را ثبت می‌کند.
2. نسخه target اولین boot را ثبت می‌کند.
3. Startup Self‑Check اجرا می‌شود.
4. `PASS` => نسخه stable می‌شود.
5. `WARN` => برنامه قابل استفاده است ولی update pending می‌ماند.
6. `BLOCK` => Write مسدود و `rollbackRecommended=true` می‌شود.

Rollback باینری خودکار در این نسخه وجود ندارد.

## 3. State Backup

فرمت: gzip JSON

Integrity:

- `payloadSha256`
- `bundleSha256`
- SHA256 خود فایل gzip در خروجی

Restore:

1. parse + gzip limit
2. schema validation
3. payload integrity
4. full bundle integrity
5. Preview
6. one-time IPC token
7. pre-restore backup
8. apply config/local AI settings
9. index roots فقط برای rebuild suggestion

## 4. Diagnostics privacy

Diagnostic export شامل raw path نیست. Pathها به این شکل تبدیل می‌شوند:

```json
{
  "redacted": true,
  "basename": "file-or-directory-name",
  "hash": "stable-truncated-sha256"
}
```

Journal payload حذف شده و فقط timestamp/type/cycle/transaction metadata نگه داشته می‌شود.

## 5. Packaged smoke

`packaged-app-smoke` فقط startup را بررسی نمی‌کند. موارد زیر نیز باید سالم باشند:

- Journal
- SQLite
- RC Self‑Check != BLOCK
- Update Guard writeBlocked = false

## 6. مرز v0.9.8

هنوز Pending واقعی:

- package-lock از npm registry واقعی
- Windows 10/11 Certification
- two-volume NTFS evidence
- scale 100k/1M واقعی
- NSIS/Portable build
- packaged app smoke واقعی روی Windows
- Authenticode
- updater/installer binary rollback implementation
