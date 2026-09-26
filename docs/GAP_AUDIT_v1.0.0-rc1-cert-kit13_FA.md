# Gap Audit — Workspace Agent v1.0.0-rc1 / cert-kit13

## نتیجه
دو شکاف اصلی cert-kit12 در Source بسته شده‌اند: Cross-volume NTFS دیگر silent metadata degradation نمی‌کند و State Restore دیگر import افزایشی نیست. با این حال Stable هنوز Block است، چون بخش مهمی از حقیقت فقط روی Windows واقعی قابل اثبات است.

## بسته‌شده در cert-kit13

### P0 — NTFS metadata fidelity policy — CLOSED IN SOURCE / WINDOWS EVIDENCE PENDING
- byte content با SHA-256 verify می‌شود.
- ACL/SDDL، Creation/Access/Write timestamps و attributes برای file/directory معمولی capture/apply/verify می‌شوند.
- LastAccessTime پس از content hash دوباره finalise می‌شود.
- mutation هم‌زمان ACL/attribute/stream metadata Source قبل از delete تشخیص داده می‌شود.
- ADS، hard-link، sparse/compressed/encrypted/offline/reparse/integrity/no-scrub و stream-probe uncertainty fail-closed هستند.
- directory metadata درست قبل از Source rmdir دوباره finalise می‌شود.
- Undo metadata evidence مستقل دارد.

این وضعیت «همه NTFS features supported» نیست؛ ادعا فقط **supported-or-blocked-without-silent-loss** است.

### P1 — Exact transactional State Restore — CLOSED IN SOURCE
- validate-all-before-commit
- exact replacement به‌جای additive import
- pre-restore backup
- durable restore intent
- automatic rollback
- startup crash recovery
- index/watcher freshness invalidation + Full Rescan requirement

## Blockerهای باقی‌مانده

### P0 — Real Windows Certification — OPEN / STABLE BLOCKER
هنوز باید روی Windows واقعی PASS شود:
- Windows 10 + Windows 11
- دو Volume NTFS مستقل
- UAT جدید NTFS metadata
- ACL/Junction/Reparse و FileShare lock واقعی Office/Corel/Photoshop
- Sleep/Resume و unclean shutdown
- USB disconnect/reconnect و drive-letter relocation
- disk-full recovery
- Scale 100k و 1M
- package-lock رسمی Node 24.14.1 / npm 11.11.0 + `npm ci`
- NSIS + Portable
- Upgrade واقعی `0.9.8 → 1.0.0-rc1`
- Final dual-Windows evidence envelope

### P1 — Local AI runtime provenance — OPEN HIGH
Managed Runtime فقط executable/model محلی صریح را اجرا می‌کند و raw args allowlist هستند، اما هنوز SHA-256/Signer/Authenticode provenance در UI و policy اجباری وجود ندارد. مرحله بعدی Source-hardening باید signer/hash evidence و policy اختیاری require-trusted-runtime اضافه کند.

### P1 — Background automation lifecycle — OPEN PRODUCT DECISION
Scheduler فقط وقتی GUI process باز است فعال است. برای v1 باید یکی از دو قرارداد صریح شود: foreground-only، یا Tray/Start-with-Windows/background host. اضافه‌کردن background host در RC feature freeze باید به‌عنوان تغییر محصولی جدا تصمیم‌گیری شود.

### P1 — Journal retention — OPEN OPERATIONAL
Rotation chain اکنون tamper-evident است، اما archive retention بدون سقف است. نیاز به anchor/checkpoint قابل verify و disk-pressure policy دارد.

### P1 — Update delivery — OPEN PRODUCT CONTRACT
Update Guard و upgrade certification داریم، ولی downloader/verified installer/automatic rollback updater کامل نداریم. v1 می‌تواند manual-update باشد، اما Contract باید صریح باشد.

## بعد از v1 Core
- CorelDRAW Skill Pack همچنان deferred است.
- Full disaster-recovery bundle خارج از scope State Backup v2 است.
- 1M-scale Electron responsiveness باید روی Windows profile شود، نه فقط throughput.

## ترتیب ادامه پیشنهادی
1. Local AI runtime SHA-256 + Authenticode signer provenance.
2. تصمیم رسمی foreground-only در v1 یا انتقال Tray/background به v1.1.
3. Journal retention anchor policy.
4. اجرای cert-kit13 روی Windows Primary/Peer.
5. فقط در صورت Final `PROMOTE_ALLOWED` ساخت Stable.
