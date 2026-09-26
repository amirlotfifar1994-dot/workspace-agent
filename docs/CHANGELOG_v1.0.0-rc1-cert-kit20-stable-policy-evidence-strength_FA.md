# Changelog — v1.0.0-rc1 cert-kit20

- Stable Certification Policy v1 اضافه شد و به Release Identity bind شد.
- Release Identity به schema v3 ارتقا یافت.
- Release Manifest به schema v10 ارتقا یافت.
- Signing برای Stable policy-bound و non-downgradable شد.
- Scale matrix 100k/1M policy-bound شد و SkipScale برای RC1 fail-closed شد.
- Manual Evidence به schema v4 ارتقا یافت.
- Primary Certification Report binding به Manual Evidence اضافه شد.
- attachment hash-bound برای هر Manual PASS اجباری شد.
- Promotion-time manual/leaf verification با قرارداد v4 همگام شد.
- `windows-release.ps1` و Windows Doctor با cert-kit20 همگام شدند.
- دو regression جدید برای Stable Policy و Manual Evidence Strength اضافه شد.
- Core feature set تغییر نکرد؛ Feature Freeze پابرجاست.
