# قراردادهای محصول v1 — cert-kit14

## Automation lifecycle
v1 به‌صورت رسمی **Foreground GUI Host** است. Scheduler فقط وقتی process اصلی Workspace Agent باز است اجرا می‌شود. Tray service، Windows Service و Start-with-Windows background host قابلیت v1 نیستند و به v1.1 موکول می‌شوند. UI این محدودیت را صریح نمایش می‌دهد.

## Update delivery
v1 به‌صورت رسمی **Manual + Verified Update** است. Update Guard، SemVer/data-epoch gate، artifact SHA-256، backup و first-boot self-check وجود دارند، اما downloader/installer خودکار و rollback installer خودکار وجود ندارد. دریافت و اجرای Installer یک مرحله دستی خارج از Runtime است.

## CorelDRAW
CorelDRAW Skill Pack همچنان خارج از v1 Core و در `docs/deferred/` باقی می‌ماند. ورود آن به Runtime قبل از Windows certification مجاز نیست.
