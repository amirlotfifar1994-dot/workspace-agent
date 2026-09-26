# Validation — Workspace Agent v1.0.0-rc1

## وضعیت Source Candidate

این بسته Feature-Frozen RC source candidate است؛ Windows-certified binary نیست.

## محیط Validation فعلی

- Platform: non-Windows container
- Node موجود: `22.16.0`
- npm موجود: `10.9.2`
- Release lane رسمی پروژه: Node `24.14.1` / npm `11.11.0`

وجود اختلاف Runtime در این محیط به این معنی است که نتیجه source-level قابل استفاده است، اما Build/Certification رسمی باید روی lane pin‌شده اجرا شود.

## نتایج

- RC source contract: PASS
- Dependency exact pins: PASS
- Source hygiene: PASS
- Syntax: PASS
- JSX: PASS
- Regression: **53/53 PASS**
- Upgrade `0.9.8 → 1.0.0-rc1`: PASS
- Mark-stable بعد از RC Self-Check: PASS
- Downgrade `1.0.0-rc1 → 0.9.8`: Write BLOCK PASS
- Data Epoch continuity = 1: PASS

## Release boundaries

- `check:release-inputs`: `LOCKFILE_REQUIRED` / exit 1
- strict Windows certification UAT: `SKIP (Windows only)` / exit 3
- Vite build: `vite: not found` / exit 127

این سه مورد Failure کد Core محسوب نشده‌اند؛ آن‌ها Evidence صریحی هستند که Binary Release هنوز اجرا/تأیید نشده است.

## Definition of Done برای RC Binary

Binary فقط بعد از package-lock واقعی، npm ci، Windows 10/11 certification، دو Volume NTFS، scale UAT، packaged smoke، NSIS/Portable و artifact verification قابل معرفی به‌عنوان RC منتشرشدنی است.
