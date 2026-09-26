# Validation — v1.0.0-rc1 / cert-kit1

## محیط این Validation

- محیط فعلی: non-Windows.
- Node/npm این محیط، Release Lane رسمی نیست؛ برای Source tests استفاده شده است.
- Release Lane رسمی همچنان Node `24.14.1` + npm `11.11.0` + Windows 10/11 است.

## نتایج Source Gate

- Dependency exact pins: PASS
- RC1 source/freeze contract: PASS
- Tooling revision `cert-kit1`: PASS
- Source hygiene: PASS
- JS/CJS syntax: PASS
- JSX check: PASS
- Regression/test chain: **57/57 PASS**
- Manual Evidence RC1: PASS
- Certification Envelope behavior: PASS
- Generated-directory fingerprint isolation: PASS
- Non-destructive Certification Harness contract: PASS

## Source Fingerprint

Fingerprint نهایی پس از بسته‌بندی در artifact manifest مستقل کنار ZIP ثبت می‌شود تا self-reference داخل سورس ایجاد نشود.

## مرزهای واقعی Release

- `check:release-inputs`: `LOCKFILE_REQUIRED` — مورد انتظار، چون lockfile واقعی در این محیط آنلاین تولید نشده است.
- Windows strict two-volume UAT: exit code `3 / SKIP (Windows only)`.
- Windows strict scale UAT: exit code `3 / SKIP (Windows only)`.
- Vite build: exit `127`, علت `vite: not found` به دلیل نصب نبودن `node_modules` در این محیط.

هیچ‌کدام از موارد بالا به‌عنوان PASS واقعی Windows/Binary ثبت نشده‌اند.

## محدودیت تست PowerShell

در محیط فعلی PowerShell/Windows موجود نیست؛ بنابراین اجرای واقعی `windows-rc1-certify.ps1` فقط در Windows Release Lane قابل تأیید است. در Source Gate، invariantهای غیرمخرب و وجود مراحل حیاتی آن به‌صورت static test بررسی شده‌اند.
