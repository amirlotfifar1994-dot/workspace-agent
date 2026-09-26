# Roadmap — v1 Release Candidate

## v1.0.0-rc1 — Feature Freeze

تا Stable فقط bug fix، security/resilience hardening، migration compatibility، Windows certification، reproducible build و installer/signing fix مجاز است.

## وضعیت بعد از cert-kit8

Source-side اکنون این موارد را enforce می‌کند:

- dual Windows 10/11 evidence aggregation؛
- Scale اجباری 100k + 1M؛
- clean-room build؛
- lockfile/report/source-fingerprint cross binding؛
- قرارداد دقیق دو Artifact: NSIS x64 + Portable x64؛
- `release-manifest.json` v7 + `SHA256SUMS.txt` و verifier مستقل؛
- بازبینی دوباره Manifest در RC1 orchestrator و Final Envelope؛
- snapshot کردن Release Manifest، SHA256SUMS و Peer Report در Session؛
- Manual Evidence v2 و bind شدن `installerSha256` upgrade واقعی به NSIS همان build؛
- `finalize:rc1` برای Final Envelope مرحله‌ای بعد از ساخته‌شدن installer و انجام upgrade واقعی؛
- bind شدن Artifact-owner Certification Report به SHA256 خود Release Manifest؛
- hardeningهای cert-kit3 برای cycle/recovery/batch.
- hardeningهای cert-kit5 برای write-integrity: Resume evidence، source revalidation، destination race guards، Undo prechecks و watcher/config truthfulness.
- hardeningهای cert-kit6 برای commit-window recovery، rollback retry idempotence، startup write-gap detection و index freshness truthfulness.
- hardeningهای cert-kit7 برای single-instance، cycle in-flight guard، Path/Root/Volume lease، multi-job write serialization و recoverable file-lock handling.
- hardeningهای cert-kit8 برای Suspend/Resume write barrier، stale-lease commit fence، external-editor-safe copy rollback، parent/reparse revalidation و case-only rename semantics.

## Gateهای باقی‌مانده تا v1.0.0 Stable

1. تولید `package-lock.json` روی Windows Release Lane با Node `24.14.1` و npm `11.11.0`؛
2. `npm ci` واقعی؛
3. Run کامل cert-kit8 روی Windows 10؛
4. Run کامل cert-kit8 روی Windows 11 با Peer Report خانواده دیگر؛
5. PASS واقعی Scale 100k و 1M؛
6. تولید و Smoke واقعی NSIS + Portable؛
7. upgrade واقعی `0.9.8 → 1.0.0-rc1` با installer SHA همان Release و Self-Check قبل/بعد؛
8. Authenticode در صورت policy اجباری؛
9. Final Envelope `PASS` بدون هیچ `INCOMPLETE`.

## بعد از Stable

Skill Pack بعدی می‌تواند CorelDRAW باشد. تا قبل از Stable capability اصلی جدید به Core اضافه نمی‌شود.
