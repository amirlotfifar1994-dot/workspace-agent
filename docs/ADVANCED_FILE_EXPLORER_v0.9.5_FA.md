# مدل Advanced File Explorer — v0.9.5

## هدف

عملیات حجیم File Explorer باید قابل توقف، قابل ادامه، قابل ممیزی و قابل Rollback باشند. v0.9.5 از یک SQLite Job Store مجزا استفاده می‌کند تا manifest و state هر item خارج از RAM و مستقل از UI نگهداری شود.

## State Machine آیتم

`pending → processing → staged → backed-up → committed → done`

حالت‌های انتهایی دیگر: `skipped` و `failed`.

Copy بدون Replace معمولاً `processing → staged → committed → done` است. Replace فایل بین `staged` و `committed` مقصد قبلی را به Backup منتقل می‌کند.

## Resume

`paused` یک وضعیت غیرنهایی Cycle است. Cycle Engine فقط برای handlerهایی که `resumable=true` دارند Resume را قبول می‌کند. Cycle `interrupted` نیز فقط برای همان handler قابل Resume است.

## Cancel

Cancel در Batch handler فقط در checkpoint امن اعمال می‌شود. Batch handler `allowCancel=true` و `allowPartialUndo=true` دارد. Rollback حالت cancelled/failed/interrupted فقط برای چنین handlerی مجاز است؛ رفتار Cycleهای قدیمی تغییر نکرده است.

## Recursive Copy

Directory Copy ابتدا Tree را با `opendir()` می‌خواند و itemهای `mkdir` و `file-copy` می‌سازد. Symlink/Junction داخل Tree Fail-closed است. برای جلوگیری از recursion، destination داخل source Block می‌شود.

## Conflict

`skip` و `rename` برای فایل و پوشه پشتیبانی می‌شوند. `replace` فقط فایل را پوشش می‌دهد. Merge/Replace کردن Directory موجود در v0.9.5 عمداً انجام نمی‌شود چون rollback کامل Tree نیاز به semantics جدا دارد.

## Duplicate-aware

اگر مقصد فایل وجود داشته باشد و اندازه برابر باشد، SHA-256 منبع/مقصد مقایسه می‌شود. فایل یکسان `skipped: identical-existing` می‌شود. در Move، Source حذف نمی‌شود؛ حذف duplicate تصمیم جداگانه و پرریسک است.

## Internal artifacts

Stage و Backup در `.workspace-agent-batch/<jobId>/` نگه‌داری می‌شوند. File Watcher مسیرهای `.workspace-agent-*` را ignore می‌کند و Persistent Index نیز اسکن hidden directory را در full scan کنار می‌گذارد.
