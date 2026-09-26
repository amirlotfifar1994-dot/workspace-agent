# Gap Audit — Workspace Agent v1.0.0-rc1 / cert-kit12

## نتیجه اجرایی

cert-kit12 چند خلأ Source-level واقعی را بست، اما هنوز اجازه‌ی اعلام Stable نمی‌دهد. مهم‌ترین شکاف باقیمانده دیگر «یک باگ ساده در Cycle Engine» نیست؛ عمدتاً در مرز Windows/NTFS، fidelity فایل، restore semantics و محصولِ background قرار دارد.

## خلأهای بسته‌شده در cert-kit12

### P0 — Renderer / IPC trust boundary — CLOSED IN SOURCE
- IPC دیگر هر `file://` را trusted نمی‌داند؛ فقط `dist/index.html` دقیق production یا origin دقیق dev مجاز است.
- packaged build متغیر `VITE_DEV_SERVER_URL` را نادیده می‌گیرد.
- `will-navigate`، `will-redirect`، `window.open` و webview بسته شده‌اند.
- renderer permission request/check به‌صورت پیش‌فرض deny می‌شود.
- CSP اضافه شده است.
- `shell.openPath` از IPC فقط پوشه را باز می‌کند؛ فایل arbitrary executable از این مسیر اجرا/باز نمی‌شود.
- config-import token به `crypto.randomBytes` + TTL ده‌دقیقه‌ای منتقل شده است.

### P0 — Tamper-evident journal across rotation — CLOSED IN SOURCE
- chain در rotation جدید از GENESIS ریست نمی‌شود.
- verify/list آرشیوهای journal را هم بررسی می‌کنند.
- دستکاری archive قدیمی detect می‌شود.
- torn final write فقط در tail ناقص active journal recover می‌شود و recovery event ثبت می‌شود.
- append به fsync-backed durable append منتقل شده است.

### P0 — Critical JSON durability — CLOSED IN SOURCE
- Cycle/Transaction/Lifecycle/Update Guard و stateهای تنظیماتی اصلی به atomic write + fsync منتقل شدند.
- helper هم sync و هم async durable atomic write دارد.
- Snapshot payload/index، state backup، diagnostics و config export نیز از commit اتمیک استفاده می‌کنند.

### P1 — Hash-cache freshness — CLOSED IN SOURCE
- Persistent index schema به 3 ارتقا یافت.
- hash cache اکنون `size + mtime + ctime` را bind می‌کند.
- schema v2 به v3 مهاجرت می‌کند و rowهای قدیمی cache در اولین mismatch دوباره hash می‌شوند.

### P1 — Update version parsing — CLOSED IN SOURCE
- SemVer parsing end-anchored و strict شد.
- prerelease عددی با leading zero رد می‌شود.
- invalid persisted/current version write guard را Block می‌کند.
- target update malformed دیگر با prefix معتبر پذیرفته نمی‌شود.

## خلأهای باز — قبل از Stable

### P0 — NTFS metadata fidelity در Cross-volume Copy/Move — OPEN / STABLE BLOCKER
SHA-256 فعلی صحت stream اصلی فایل را ثابت می‌کند، اما هنوز fidelity کامل Windows metadata را ثابت نمی‌کند. مواردی که باید policy و UAT واقعی داشته باشند:
- Alternate Data Streams (ADS)
- ACL/security descriptor و inheritance semantics
- EFS/encryption attributes
- sparse/compressed attributes
- hard-link relationship
- creation/access timestamps و سایر file attributes

Same-volume rename ذاتاً وضعیت بهتری دارد، اما Cross-volume move یک Copy+Verify+Delete است. تا زمانی که metadata policy روشن و روی NTFS واقعی آزموده نشود، «byte-correct» مساوی «file-object faithful» نیست.

**تصمیم پیشنهادی:** قبل از Stable یا metadata-preserving Windows path بسازیم، یا Cross-volume move را برای metadata-rich files صریحاً Block/Require Manual Policy کنیم.

### P0 — Real Windows certification — OPEN / STABLE BLOCKER
هنوز باید با Runtime رسمی و Evidence واقعی PASS شود:
- Windows 10 + Windows 11
- دو Volume NTFS واقعی
- 100k و 1M scale
- واقعی FileShare lock با Office/Corel/Photoshop
- Junction/Reparse + ACL inheritance
- Sleep/Resume و unclean shutdown
- USB disconnect/reconnect + drive-letter relocation
- disk-full recovery
- `package-lock.json` رسمی با Node 24.14.1 / npm 11.11.0
- `npm ci`
- NSIS + Portable
- upgrade واقعی `0.9.8 -> 1.0.0-rc1`
- Authenticode در صورت Release Policy

### P1 — State Backup «Restore» هنوز exact transactional restore نیست — OPEN
Backup integrity بررسی می‌شود و pre-restore backup ساخته می‌شود، اما ConfigurationService import فعلی additive/skip-based است. در نتیجه Restore لزوماً state را دقیقاً به زمان Backup برنمی‌گرداند و اگر یک زیرمرحله fail شود rollback خودکار کامل وجود ندارد.

**نیاز:** validate-all-before-commit، exact replacement semantics، rollback خودکار و regression برای failure در وسط restore.

### P1 — Local AI runtime authenticity — OPEN
Agent فقط فایل محلی صریح انتخاب‌شده با نام `llama-server(.exe)` را اجرا می‌کند و args allowlisted هستند، اما اصالت binary با Publisher/Authenticode یا hash allowlist تثبیت نشده است.

**نیاز:** در Windows حداقل نمایش SHA-256 + signer و warning برای unsigned/untrusted runtime؛ policy اختیاری require-signed برای production.

### P1 — Background/Tray automation lifecycle — OPEN PRODUCT GAP
Automation scheduler فقط تا زمانی کار می‌کند که GUI process باز باشد. `window-all-closed` روی Windows برنامه را quit می‌کند. بنابراین «Agent دائمی» یا scheduler پس‌زمینه هنوز وجود ندارد.

**تصمیم محصول:** برای v1 Stable یا صریحاً foreground-only باقی بماند و UI این محدودیت را بگوید، یا Tray/Start-with-Windows/background host به milestone بعد منتقل شود.

### P1 — Journal retention / archive lifecycle — OPEN OPERATIONAL GAP
برای حفظ chain، archiveهای journal اکنون حذف خودکار نمی‌شوند. این از نظر integrity درست است ولی در استفاده چندساله رشد بدون سقف دارد.

**نیاز:** retention با checkpoint/anchor قابل‌verify، export/archive policy، و disk-pressure behavior.

### P1 — Update delivery/rollback installer workflow — OPEN PRODUCT GAP
VersionUpdateGuard، preflight و upgrade certification وجود دارد؛ اما updater کامل محصولی برای discovery/download/verified install/rollback خودکار وجود ندارد. Stable می‌تواند manual-update باشد، ولی باید صریحاً در product contract ثبت شود.

## خلأهای بعد از v1 Core

### P2 — CorelDRAW Skill Pack — DEFERRED BY DESIGN
Bridge قدیمی فقط در `docs/deferred/corel-bridge.cjs.txt` است و در Runtime/IPC فعال نیست. قابلیت‌هایی مثل document state، object selection، tracing-to-vector، drawing commands و visual verification باید به‌صورت Skill Pack جدا و با confirmation/undo طراحی شوند.

### P2 — Full state disaster-recovery bundle
Backup فعلی عمداً workspace contents، journal، persistent-index DB و transaction/cycle databases را bundle نمی‌کند. برای DR کامل باید export/import جدا با size policy و compatibility/versioning طراحی شود؛ برای v1 می‌تواند خارج از Scope بماند به شرط مستندسازی واضح.

### P2 — 1M-scale UI responsiveness profiling
Persistent index از `DatabaseSync` استفاده می‌کند. chunking و resource guards وجود دارند، اما responsiveness واقعی Electron main process روی 1M فایل باید در Windows profiling اندازه‌گیری شود؛ فقط throughput کافی نیست.

## ترتیب پیشنهادی ادامه

1. NTFS metadata fidelity policy + Windows-native UAT.
2. exact transactional state restore.
3. Local AI runtime signer/hash provenance.
4. اجرای cert-kit12 روی Windows Primary/Peer.
5. تصمیم رسمی foreground-only یا Tray/background برای v1.
6. اگر Gateها PASS شدند، فقط بعد از Final Envelope به Stable promotion برویم.
