# Changelog v0.8.0

## Persistent Index
- `persistent-file-index.cjs` اضافه شد.
- SQLite WAL + schema versioning + root generation.
- persistent `scan_queue` برای Resume بعد از pause/crash.
- `opendir()` streaming برای directoryهای بزرگ + batch write.
- chunk boundaries بر اساس time/files/dirs.
- stale generation cleanup فقط در commit نهایی.
- index status / roots / recent errors API.
- graceful-degrade با `INDEX_SQLITE_UNAVAILABLE`؛ نبودن SQLite کل Agent را متوقف نمی‌کند.

## Search
- `indexed-file-search` cycle اضافه شد.
- query مستقیم SQLite با pagination و فیلترهای موجود.
- Tree Search قدیمی برای compatibility حفظ شد.

## Duplicate
- `indexed-duplicate-finder.cjs` اضافه شد.
- size-group candidate query از SQLite.
- stable SHA-256 + persistent hash cache.
- cache invalidation روی Size/mtime و delete reconcile.
- candidate traversal سقف‌دار برای جلوگیری از اجرای بی‌حد.

## Watcher
- `FileWatcherService` callback اختیاری `onBatch` دارد.
- Watch batch فقط index موجود را incremental reconcile می‌کند.
- path containment نسبت به prefix string check قدیمی سخت‌گیرانه‌تر شد.
- root بدون index و Event مبهم skip می‌شود.

## Cycle / Skill / UI
- cycleهای `persistent-index-scan`, `indexed-file-search`, `indexed-duplicates`.
- سه Skill جدید در Skill Registry.
- چهار Capability جدید در Capability Registry.
- تب `Persistent Index` با Status/Generation/Queue/Error/Indexed Search.
- Duplicate Guardian مسیر Indexed را به‌عنوان گزینه اصلی نشان می‌دهد و legacy path را نگه می‌دارد.

## Validation
- `persistent-index-v080.test.cjs`
- `persistent-index-cycles-v080.test.cjs`
- `persistent-index-scale-v080.cjs`
- `persistent-index-windows.uat.cjs` (Windows-only; restart/resume + fs.watch reconcile)
- Regression suite v0.7.2 بدون شکست باقی ماند.
