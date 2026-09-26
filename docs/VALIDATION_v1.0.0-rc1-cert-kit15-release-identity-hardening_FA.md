# Validation — v1.0.0-rc1 cert-kit15

Validation این revision باید شامل موارد زیر باشد:
- Source syntax / JSX / source hygiene / dependency pins
- full source test suite در یک run
- fingerprint invariance با اضافه/تغییر `package-lock.json`
- تغییر Release Identity هنگام تغییر lockfile
- تغییر Source Fingerprint و Release Identity هنگام تغییر Source
- contract tests برای release manifest v8، dual-Windows identity، handoff و stable readiness
- fresh-extract fingerprint و full test suite

Windows-only UAT همچنان در محیط non-Windows PASS اعلام نمی‌شود.
