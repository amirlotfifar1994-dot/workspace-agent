# Changelog — v1.0.0-rc1 / cert-kit4 Release Lane Closure

تاریخ: 2026-08-15

این revision تحت Feature Freeze انجام شده و capability اصلی جدیدی به Agent اضافه نمی‌کند. تمرکز روی بستن خلأهای Release/Certification است.

## Artifact Contract

- RC1 دیگر صرفاً «وجود یک exe» را قبول نمی‌کند؛ دقیقاً NSIS x64 و Portable x64 با نام نسخه جاری لازم‌اند.
- `release-manifest.json` به schema `workspace-agent-release-v7` ارتقا یافت.
- Manifest شامل kind/arch/bytes/SHA256، lock hash، source fingerprint، runtime pins و builder OS است.
- `SHA256SUMS.txt` از همان دو Artifact ساخته و با verifier مستقل cross-check می‌شود.
- `scripts/verify-release-manifest-rc1.cjs` هم در Release Lane، هم Orchestrator و هم Final Envelope قابل استفاده است.

## Fingerprint Correctness

- در certification standalone، Source Fingerprint بعد از lockfile generation/resolution گرفته می‌شود؛ بنابراین `-GenerateLockfile` دیگر Reportی با fingerprint قبل از lockfile تولید نمی‌کند.

## Manual Evidence v2

- هر PASS دارای `observedAt` معتبر است.
- Evidence مربوط به upgrade، `fromVersion`، `toVersion`، `installerSha256`، Self-Check قبل/بعد و `statePreserved` را ثبت می‌کند.
- Final Envelope SHA256 installer upgrade را به NSIS همان Release Manifest bind می‌کند.

## Staged Finalization

- Final PASS دیگر به اجرای هم‌زمان build و Evidence upgrade وابسته نیست.
- Artifact-owner Run ابتدا installer را می‌سازد؛ سپس upgrade واقعی انجام می‌شود؛ سپس `finalize:rc1` Reportهای دو Windows، Manifest همان Artifact و Manual Evidence را جمع می‌کند.
- Envelope، `releaseManifestSha256` و Artifact rows داخل Report را با Manifest منتخب cross-check می‌کند.
- Orchestrator RC1 همیشه Final Envelope را نیازمند Manual Evidence می‌داند؛ نبود Evidence دیگر نمی‌تواند PASS نهایی بسازد.

## Session Evidence Isolation

- Orchestrator snapshot از Release Manifest، SHA256SUMS و Peer Windows Report را داخل Session نگه می‌دارد.
- Result schema به v3 ارتقا یافت.

## Regression Evidence

- Source tests: `63/63 PASS`
- Recursive JS syntax: `189 files PASS`
- JSX syntax gate: PASS
- Source hygiene: PASS
- Dependency pins: PASS
- RC1 source contract: PASS

Windows 10/11 واقعی، package-lock رسمی، npm ci رسمی، dual NTFS، Scale واقعی، NSIS/Portable واقعی، upgrade واقعی و Authenticode هنوز در این محیط PASS اعلام نشده‌اند.
