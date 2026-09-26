# RC1 Certification Envelope v2 — cert-kit8

Envelope برای جلوگیری از PASS کاذب، شواهد Release را cross-check می‌کند.

## Bindهای اجباری

- Source Tree Fingerprint؛
- Certification Report همان Session؛
- SHA256 واقعی `package-lock.json`؛
- Version / tooling revision / feature freeze؛
- Release Manifest v7؛
- SHA256 خود Release Manifest در `certification-report.json` Artifact-owner؛
- دقیقاً NSIS x64 + Portable x64؛
- SHA256 و bytes فایل‌های Artifact در برابر Manifest و `SHA256SUMS.txt`؛
- Authenticode در صورت `--require-signing`؛
- Manual Evidence v2؛
- bind شدن `realUpgradeFrom0_9_8.installerSha256` به NSIS همان Release؛
- Report خانواده دوم Windows در صورت `--require-dual-windows`.

## Dual-Windows

Final Envelope باید یک Report Windows 10 و یک Report Windows 11 با Source Fingerprint، lock hash، version و tooling revision یکسان داشته باشد. نبود Report دوم `INCOMPLETE` است؛ mismatch یا Report نامعتبر `FAIL` است.

## Artifact Contract

وقتی `--require-artifacts` فعال باشد، Envelope علاوه بر hash داخلی خودش، verifier مستقل `verify-release-manifest-rc1.cjs` را هم اجرا می‌کند. همچنین `releaseManifestSha256` و لیست Artifactهای Certification Report باید با Manifest انتخاب‌شده یکی باشند؛ بنابراین نمی‌توان Report یک build را به Artifactهای build دیگری وصل کرد. Manifest ناقص، Portable مفقود، اسم/معماری اشتباه یا SHA mismatch باعث `FAIL` می‌شود.

## تفکیک FAIL و INCOMPLETE

- prerequisite هنوز موجود نیست: `INCOMPLETE`؛
- Artifact/Hash/Fingerprint/Version/Tooling mismatch: `FAIL`؛
- Certification Report خودش `INCOMPLETE` است: Envelope نیز `INCOMPLETE`؛
- Certification Report `FAIL` است: Envelope `FAIL`.
