# Validation — v1.0.0-rc1 / cert-kit4 Release Lane Closure

## Source-side gates

| Gate | نتیجه |
|---|---|
| `check:rc1-source` | PASS |
| `check:source-hygiene` | PASS |
| Recursive JS syntax | PASS — 189 فایل |
| JSX syntax gate | PASS |
| dependency pins | PASS — 10 pin |
| Source tests | PASS — 63/63 |

## Regression جدید

`rc1-release-artifact-contract.test.cjs` قرارداد NSIS + Portable، manifest v7، ترتیب fingerprint بعد از lock resolution و evidence snapshotها را پوشش می‌دهد.

`manual-evidence-rc1.test.cjs` اکنون schema v2 و bind شدن SHA256 installer upgrade به NSIS Release را تست می‌کند.

`rc1-finalizer-contract.test.cjs` تضمین می‌کند Finalizer همیشه Dual-Windows، Artifact Contract و Manual Evidence را اجباری کند.

## محدودیت اعتبار

این Validation Source-side است و Windows Release Lane رسمی در این محیط اجرا نشده است. موارد زیر PENDING هستند:

- `package-lock.json` رسمی با Node 24.14.1 / npm 11.11.0؛
- `npm ci` رسمی؛
- Windows 10 و Windows 11؛
- دو Volume واقعی NTFS؛
- Scale واقعی 100k و 1M؛
- win-unpacked / NSIS / Portable؛
- upgrade واقعی v0.9.8 → rc1؛
- Authenticode در صورت policy.
