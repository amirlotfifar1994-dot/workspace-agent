# Final Evidence Provenance — v1.0.0-rc1 cert-kit18

cert-kit18 هیچ قابلیت محصولی جدیدی به Core اضافه نمی‌کند و Feature Freeze پابرجاست. این revision فقط زنجیره‌ی شواهد Final Certification را سخت‌تر می‌کند.

## Manual Evidence v3

فایل Manual Evidence اکنون علاوه بر نسخه، اپراتور و ماشین، به این هویت‌ها bind می‌شود:

- `executionId`
- Source Fingerprint
- SHA-256 رسمی `package-lock.json`
- `releaseIdentitySha256`
- SHA-256 کامل `release-manifest.json`
- SHA-256 نصب‌کننده NSIS

بنابراین Evidence دستی یک اجرای دیگر یا یک Release Manifest دیگر، حتی اگر نام فایل مشابه باشد، در Finalize پذیرفته نمی‌شود.

اگر یک رکورد PASS به attachment استناد کند، attachment باید مسیر نسبی داخل پوشه Evidence داشته باشد و `attachmentSha256` و `attachmentBytes` آن دقیقاً verify شوند. در نبود attachment، توضیح معنادار حداقل 24 کاراکتر لازم است.

## Finalizer handoff binding

Finalizer دیگر فقط دو `certification-report.json` را قبول نمی‌کند. ورودی‌های زیر نیز الزامی‌اند:

- `--execution-id`
- Primary handoff manifest
- Peer handoff manifest

هر دو Handoff دوباره verify می‌شوند، role و executionId باید یکسان باشند و Pointer داخل Handoff باید دقیقاً به همان report/release-manifest داده‌شده به Finalizer اشاره کند.

## Promotion-time revalidation

`rc1-stable-readiness.cjs` تمام input metadata ثبت‌شده در Verdict را قبل از `PROMOTE_ALLOWED` دوباره از روی bytes واقعی re-hash می‌کند. تغییر Report، Manual Evidence یا Handoff Manifest بین Finalize و Promotion باعث BLOCK می‌شود.

Final Verdict schema به v3 و Stable Promotion Decision schema به v2 ارتقا یافته و هر دو `executionId` و Handoff IDها را حمل می‌کنند.

## مرز ادعا

این hardening اصالت انسانی اپراتور را cryptographically امضا نمی‌کند. هدف آن جلوگیری از mix-and-match، reuse تصادفی، stale evidence و تغییر فایل بعد از Finalize است. Windows 10/11 واقعی همچنان P0 نهایی Certification است.

## Authenticode live re-check

اگر `--require-signing` فعال باشد، Release Manifest verifier روی Windows امضای واقعی هر دو EXE را دوباره با `Get-AuthenticodeSignature` می‌سنجد. `Valid` بودن امضا و تطابق thumbprint با Manifest اجباری است؛ non-Windows حق PASS دادن به این gate را ندارد.
