# Stable Certification Policy — v1.0.0-rc1 cert-kit20

cert-kit20 قابلیت محصولی جدیدی اضافه نمی‌کند. هدف این revision خارج‌کردن معیار Stable از اختیار اپراتور و تبدیل آن به policy ثابت و fail-closed داخل Source است.

## قرارداد ثابت

`package.json > workspaceAgentRelease.stableCertificationPolicy` باید دقیقاً این الزامات را نگه دارد:

- Authenticode برای Artifactهای Windows اجباری است؛
- NSIS و Portable هر دو اجباری‌اند؛
- Windows 10 و Windows 11 هر دو باید Evidence معتبر داشته باشند؛
- Scale matrix دقیقاً `100000` و `1000000` است؛
- Manual/Physical Evidence اجباری است؛
- هر Manual PASS باید attachment واقعی و hash-bound داشته باشد؛
- Final Certification Bundle اجباری است.

`check:stable-certification-policy` و `check:rc1-source` هر downgrade را قبل از Release رد می‌کنند.

## عدم امکان downgrade از CLI

Switchهایی مثل `-RequireSigning` و `-RunScaleUat` ممکن است برای سازگاری CLI باقی بمانند، اما نبود آن‌ها policy را ضعیف نمی‌کند. `EffectiveRequireSigning` و Scale matrix از Stable Policy محاسبه می‌شوند. `-SkipScale` برای RC1 با policy فعلی fail-closed است.

## Release Identity

Stable Policy با canonical SHA-256 داخل `workspace-agent-release-identity-v3` bind می‌شود. تغییر policy، حتی بدون تغییر lockfile، Release Identity را تغییر می‌دهد. Release Manifest v10 نیز خود policy و SHA آن را حمل می‌کند.

## Authenticode

Verifier ساختاری روی هر سیستم باید `signingRequired=true` و Signature rowهای `Valid` را ببیند. Promotion واقعی با `--require-signing` روی Windows علاوه بر آن، خود EXEها را با `Get-AuthenticodeSignature` دوباره می‌خواند و thumbprint واقعی باید با Manifest تطابق داشته باشد. محیط non-Windows نمی‌تواند live Authenticode را به‌عنوان PASS ادعا کند.
