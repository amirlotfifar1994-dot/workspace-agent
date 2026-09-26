# Windows Path & Release Model — v0.8.2

## 1. اصل Path Identity
Workspace Agent دو نمایش از Path دارد:

- **Display/Stored path**: همان مسیر قابل‌فهم برای کاربر و DB، بدون `\\?\\`.
- **Filesystem path**: فقط هنگام File I/O روی Windows به namespaced path تبدیل می‌شود تا long-path/UNC قابل دسترس باشد.

هیچ Unicode normalization اجباری برای File Identity انجام نمی‌شود. Agent نباید دو filename متفاوت را صرفاً به‌دلیل NFC/NFD شبیه، یک رکورد فرض کند.

## 2. UNC / Long Path
`windows-path-utils.cjs` مسئول این موارد است:
- حذف namespace ورودی برای مقایسه/نمایش.
- تبدیل `C:\...` به `\\?\C:\...` در File I/O.
- تبدیل UNC مثل `\\server\share\...` به `\\?\UNC\server\share\...`.
- مقایسه case-insensitive فقط روی Windows.
- root-containment بدون escape از محدوده.

## 3. Reparse / Link Policy
- Scanner وارد `Dirent.isSymbolicLink()` نمی‌شود.
- link/junction skip در `scan_errors` با `SYMLINK_SKIPPED` audit می‌شود.
- reconcile روی symlink انجام نمی‌شود.
- Duplicate hashing از `lstat` استفاده می‌کند و symbolic-link target را با `HASH_LINK_BLOCKED` رد می‌کند.
- قبل و بعد از Hash، type/identity/size/mtime دوباره بررسی می‌شوند تا swap/race ساده تشخیص داده شود.

این Policy عمداً conservative است: Agent برای مدیریت فایل نیازی ندارد junction را دنبال کند.

## 4. Packaged Worker
`hash-worker.cjs` از utility محلی path استفاده می‌کند. بنابراین هر دو فایل باید unpack شوند:

```text
app.asar.unpacked/
  electron/services/hash-worker.cjs
  electron/services/windows-path-utils.cjs
```

`HashWorkerPool` اگر داخل `app.asar` باشد، Worker را به path متناظر `app.asar.unpacked` pin می‌کند. Release gate ابتدا target `dir` می‌سازد و smoke test واقعی Worker را از همان path اجرا می‌کند.

## 5. Reproducible Release Lane
Top-level dependencies exact pin هستند. Release رسمی:

1. Node/npm pin را بررسی می‌کند.
2. `package-lock.json` واقعی و همسان با `package.json` می‌خواهد.
3. فقط `npm ci` اجرا می‌کند.
4. Regression/UAT را می‌زند.
5. `win-unpacked` می‌سازد و Worker را smoke-test می‌کند.
6. NSIS و Portable را با نام artifact جدا می‌سازد.
7. SHA-256 و manifest ایجاد می‌کند.
8. در حالت signed release، Authenticode همه `.exe` artifactها را `Valid` می‌خواهد.

## 6. Secret / Certificate Policy
Private key یا signing certificate نباید در source ZIP/repository باشد. Source hygiene فایل‌های زیر را Block می‌کند:
- `.pfx`
- `.p12`
- `.key`
- `.env*`
- PEM حاوی PRIVATE KEY

Code signing فقط از secret store/CI environment مثل `CSC_LINK` یا `WIN_CSC_LINK` انجام می‌شود.

## 7. وضعیت Verification
در محیط فعلی:
- path utility unit tests: PASS
- link traversal/hash safety: PASS
- regression suite: PASS
- Windows >260/Unicode/junction UAT: Windows-only و اینجا SKIP
- packaged Worker smoke: نیازمند build واقعی `win-unpacked`
- signed artifact verification: نیازمند certificate و Windows build

پس v0.8.2 **foundation و gate را تکمیل می‌کند، نه اینکه Windows matrix را بدون اجرا تأییدشده اعلام کند.**
