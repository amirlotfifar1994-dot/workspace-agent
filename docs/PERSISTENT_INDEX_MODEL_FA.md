# Persistent File Index Model — v0.8.0

## هدف
نسخه‌های قبلی `scanTree()` تمام فایل‌های scan شده را در `files[]` نگه می‌داشتند. این مسیر برای Workspaceهای کوچک/متوسط ساده و مناسب است، اما برای چندصد هزار تا چندمیلیون فایل RAM زیادی مصرف می‌کند.

v0.8 مسیر جدیدی اضافه می‌کند که inventory را به‌صورت incremental داخل SQLite نگه می‌دارد و legacy scanner را برای backward compatibility حذف نمی‌کند.

## محل State
Database در `app.getPath('userData')/persistent-index/files.sqlite` قرار می‌گیرد و فایل Workspace کاربر را تغییر نمی‌دهد.

PRAGMAهای اصلی:
- `journal_mode=WAL`
- `synchronous=NORMAL`
- `foreign_keys=ON`
- `busy_timeout=5000`

## جداول اصلی
### `roots`
وضعیت هر Workspace، generation جاری، status، started/completed timestamps و شمارنده‌های scan.

### `scan_queue`
صف persistent پوشه‌های باقی‌مانده برای generation جاری. این جدول checkpoint واقعی scan است؛ stack بزرگ در RAM یا JSON blob لازم نیست.

### `files`
Metadata فایل‌ها با کلید `(root_key, path_key)` و indexهای کمکی برای size/ext/category/mtime/name.

### `scan_errors`
خطاهای generation جاری به‌صورت bounded-at-UI؛ خود DB تاریخ همان generation را نگه می‌دارد.

### `hash_cache`
SHA-256 فایل با `path + size + mtime` برای جلوگیری از hash مجدد Duplicate candidateهای بدون تغییر.

## Scan lifecycle
Fresh Scan:
1. `generation += 1`
2. queue قدیمی حذف می‌شود.
3. root در `scan_queue` ثبت می‌شود.
4. هر directory با `fs.promises.opendir()` به‌صورت streaming خوانده می‌شود.
5. file metadata در batchهای کوچک UPSERT می‌شود؛ بنابراین directoryهای بسیار بزرگ هم لازم نیست به یک آرایه کامل Dirent/Metadata تبدیل شوند.
6. child directoryها فقط بعد از پردازش موفق directory وارد queue می‌شوند.
7. directory جاری در همان transaction از queue حذف می‌شود.
8. در chunk boundary status=`paused` و queue دست‌نخورده باقی می‌ماند.
9. Resume همان generation و همان queue را ادامه می‌دهد.
10. فقط وقتی queue واقعاً صفر شد، stale rowهای generation قبلی حذف و root=`completed` می‌شود.

## Crash consistency
اگر process وسط `readdir` یا قبل از transaction crash کند، directory جاری هنوز در queue است و دوباره پردازش می‌شود.

اگر crash وسط SQLite transaction رخ دهد، SQLite transaction atomic است و checkpoint نصفه commit نمی‌شود.

اگر Fresh Scan ناقص بماند، rowهای generation قبلی عمداً حذف نمی‌شوند. بنابراین index کامل قبلی تا پایان successful generation از بین نمی‌رود.

## Indexed Search
Search مستقیماً از SQLite اجرا می‌شود و فقط page محدود نتیجه را به Renderer می‌فرستد. فیلترهای فعلی:
- query روی Name/Path
- extensions
- categories
- min/max size
- modified within N days
- older than N days
- limit/offset pagination

هدف v0.8 **low-RAM** است؛ FTS هنوز اضافه نشده و substring query ممکن است روی DB بسیار بزرگ scan دیتابیسی انجام دهد، اما دیگر میلیون‌ها object جاوااسکریپتی وارد RAM نمی‌شوند.

## Duplicate lifecycle
1. `GROUP BY size HAVING COUNT(*) > 1` روی SQLite.
2. فقط فایل‌های size-groupهای candidate خوانده می‌شوند.
3. Hash Cache با Size + mtime بررسی می‌شود.
4. cache miss → SHA-256 با stat-before/stat-after.
5. Hash یکسان + Size یکسان → Duplicate قطعی.

Zero-byte به‌صورت پیش‌فرض candidate نیست.

## File Watcher reconcile
`fs.watch` همچنان permission اجرای File Write ندارد. بعد از debounce، فقط اگر root قبلاً Persistent Index داشته باشد:
- File exists → metadata UPSERT.
- File missing → row فایل/زیرشاخه از Index حذف می‌شود.
- Directory جدید/rename → subtree bounded reconcile.
- Event مبهم یا root بدون index skip می‌شود.

این مسیر ممکن است برای directory بسیار بزرگ truncated شود؛ Full/Resume scan همچنان مرجع نهایی consistency است.

## Invariants امنیتی/صحت
- Index write فقط به state داخلی Agent می‌رود.
- هیچ Event Watcher عملیات Organize/Cleanup/Rename/Delete را trigger نمی‌کند.
- symlinkها در full scan skip می‌شوند تا loop/escape ایجاد نشود.
- path containment قبل از reconcile بررسی می‌شود.
- stale deletion فقط بعد از queue-zero successful commit انجام می‌شود.
- Hash فایل تغییرکرده invalid می‌شود.
- نبودن Runtime `node:sqlite` کل Agent را از کار نمی‌اندازد؛ Persistent Index با `INDEX_SQLITE_UNAVAILABLE` غیرفعال می‌شود و مسیرهای legacy باقی می‌مانند.

## محدودیت‌های فعلی
- Full NTFS UAT واقعی روی Windows 10/11 هنوز لازم است.
- Search هنوز FTS5/token index ندارد.
- watcher semantics روی بعضی filesystem/appها lossy است؛ Full scan periodic همچنان لازم است.
- Index DB encryption در v0.8 انجام نشده؛ DB فقط metadata مسیر/نام/size/time/hash cache را نگه می‌دارد، نه محتوای فایل.
