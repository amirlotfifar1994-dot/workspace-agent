# Gap Audit — Workspace Agent v1.0.0-rc1 / cert-kit14

## بسته‌شده در Source
### P1 — Local AI runtime provenance
SHA-256 evidence، optional hash pin، Authenticode Status/Subject/Thumbprint و optional signer pin اضافه شد. Trust درست قبل از Spawn دوباره enforce می‌شود و mutation فایل fail-closed است. Windows signer evidence واقعی هنوز Pending Certification است.

### P1 — Journal retention
Journal archive دیگر unbounded نیست. Bounded retention، disk-pressure policy، retention anchor، durable retention intent و startup recovery اضافه شد. Tamper در anchor نیز verify را fail می‌کند؛ retained tail داخلی حفظ می‌شود تا corruption باعث reset اشتباه chain به `GENESIS` نشود و pruning تا رفع integrity مشکل متوقف می‌ماند.

### P1 — Background automation lifecycle
تصمیم محصولی v1 بسته شد: `foreground-gui-v1`. Background host/Tray/Start-with-Windows به v1.1 deferred است و در UI صریح اعلام می‌شود.

### P1 — Update delivery
قرارداد v1 بسته شد: manual + verified. Downloader/installer خودکار بخشی از v1 نیست؛ Update Guard/backup/SHA/self-check باقی می‌ماند.

## Blocker اصلی باقی‌مانده
### P0 — Real Windows Certification
Stable همچنان تا Evidence واقعی Windows 10 + Windows 11 بلوکه است: دو NTFS volume، ACL/Junction/Reparse و locks واقعی، Sleep/Resume و unclean shutdown، USB relocation، disk-full، Scale 100k/1M، package-lock رسمی Node 24.14.1/npm 11.11.0، NSIS/Portable، upgrade واقعی 0.9.8→RC1 و final dual-Windows envelope.

## Windows evidence جدید cert-kit14
- SHA-256 ثبت‌شده برای `llama-server.exe` انتخابی.
- Authenticode Status/Subject/Thumbprint واقعی در Windows.
- یک تست negative با hash pin نادرست که باید Spawn را block کند.
- Journal retention verify بعد از rotation و restart روی NTFS واقعی.

## بعد از v1 Core
- CorelDRAW Skill Pack.
- Background host/Tray/Start-with-Windows در v1.1.
- Full disaster-recovery bundle.
- 1M Electron UI responsiveness profiling.
