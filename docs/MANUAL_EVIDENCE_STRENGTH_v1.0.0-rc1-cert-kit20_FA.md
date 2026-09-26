# Manual Evidence Strength — v1.0.0-rc1 cert-kit20

Manual Evidence در cert-kit20 از schema v3 به `workspace-agent-manual-evidence-rc1-v4` ارتقا یافته است.

## Binding اجباری

هر فایل Manual Evidence به این موارد bind است:

- `executionId`
- Source Fingerprint
- package-lock SHA-256
- Release Identity
- Release Manifest SHA-256
- NSIS installer SHA-256
- Primary Certification Report SHA-256
- Primary Certification `evidenceId`
- Primary Windows family

بنابراین Evidence یک execution یا Primary machine دیگر قابل reuse نیست.

## PASS فقط با attachment واقعی

برای پنج مورد زیر، متن یا notes به‌تنهایی کافی نیست:

1. physical USB disconnect/reconnect
2. actual disk-full recovery
3. real ACL/read-only recovery
4. unclean shutdown/power-loss
5. real upgrade `0.9.8 → 1.0.0-rc1`

هر PASS باید attachment نسبی داخل Evidence directory داشته باشد و verifier path containment، regular-file بودن، SHA-256 و byte count را دوباره بررسی می‌کند. Symlink/reparse-like leaf پذیرفته نمی‌شود.

Upgrade علاوه بر attachment باید installer hash، pre/post self-check و `statePreserved=true` را نیز داشته باشد.

## Primary binding

Prefill فقط بعد از یک Primary Certification Report با `overall=PASS` ایجاد می‌شود. Verifier نهایی خود Primary Report را دوباره hash می‌کند و source/lock/release identity/evidenceId/windowsFamily را با Manual Evidence تطبیق می‌دهد.

## Final Promotion

Manual Evidence و تمام attachmentهای آن در Final Bundle کپی می‌شوند و قبل از Promotion دوباره verify می‌شوند. تغییر attachment بعد از Finalization باعث Block شدن Stable Decision می‌شود.
