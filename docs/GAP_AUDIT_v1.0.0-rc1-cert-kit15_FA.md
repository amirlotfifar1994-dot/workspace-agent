# Gap Audit — v1.0.0-rc1 cert-kit15

## بسته‌شده در Source
### P1 — Frozen Source / lockfile identity ambiguity
بسته شد. Source Fingerprint v2 به‌طور صریح lockfile را از scope Source خارج می‌کند و Release Identity جداگانه هر دو را bind می‌کند.

### P1 — Cross-machine release identity drift
بسته شد. Primary/Peer/Handoff/Release Manifest/Final Envelope باید `releaseIdentitySha256` مشترک داشته باشند.

## باز مانده
### P0 — Real Windows certification
همچنان blocker اصلی Stable است: Windows 10 + Windows 11 واقعی، دو NTFS volume، 100k/1M، locks، ACL/Junction/Reparse، sleep/resume و unclean shutdown، USB/removable، disk-full، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و evidence واقعی Local AI signer/hash.

### P2 — Post-v1
CorelDRAW skill pack، background/tray host، auto-update workflow کامل، disaster recovery bundle و 1M Electron UI responsiveness profiling همچنان post-v1 هستند.
