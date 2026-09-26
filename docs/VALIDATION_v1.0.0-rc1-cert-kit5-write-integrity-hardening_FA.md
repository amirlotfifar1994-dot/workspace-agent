# Validation — v1.0.0-rc1 / cert-kit5 Write-Integrity Hardening

این فایل پس از Freeze نهایی Source با خروجی واقعی Gateها تکمیل می‌شود.

## Source-side gates

- Regression suite: `PASS 65/65`
- JS/CJS/MJS syntax: `PASS 191 files`
- JSX gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS / cert-kit5`
- Write-integrity hardening tests: `PASS`
- Watcher/config resilience tests: `PASS`
- Fresh-extract regression: `PENDING_PACKAGE`

## Windows-only gates

- package-lock / npm ci: `PENDING_WINDOWS_RELEASE_LANE`
- Windows 10: `PENDING_WINDOWS`
- Windows 11: `PENDING_WINDOWS`
- distinct NTFS volumes: `PENDING_WINDOWS`
- Scale 100k + 1M: `PENDING_WINDOWS`
- NSIS + Portable: `PENDING_WINDOWS_BUILD`
- real 0.9.8 → 1.0.0-rc1 upgrade: `PENDING_MANUAL_WINDOWS_EVIDENCE`
- final dual-Windows envelope: `PENDING`

## Release-input truth

- `npm run check:release-inputs`: `LOCKFILE_REQUIRED` (expected fail-closed; no fabricated package-lock)
- Validation runtime: Node `22.16.0`, npm `10.9.2`, non-Windows
- Official release runtime remains Node `24.14.1`, npm `11.11.0`.
