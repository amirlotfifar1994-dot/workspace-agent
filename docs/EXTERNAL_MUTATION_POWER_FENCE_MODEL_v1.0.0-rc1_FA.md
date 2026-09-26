# مدل External Mutation و Power Fence — Workspace Agent v1.0.0-rc1 / cert-kit8

## هدف

این لایه برای دو failure mode طراحی شده است: تغییر هم‌زمان فایل توسط برنامه‌های دیگر و ادامه‌ی یک Write قدیمی بعد از Suspend/Resume. اصل طراحی این است که Agent در مرز Commit دوباره حقیقت فایل‌سیستم و اعتبار Lease را بررسی کند و در ابهام، Pause/Manual Review را به overwrite/delete ترجیح دهد.

## Power transition barrier

`ExplorerOperationCoordinator` یک `epoch` process-local دارد. هر Lease epoch زمان acquisition را نگه می‌دارد.

- Suspend: epoch افزایش می‌یابد و barrier فعال می‌شود.
- هنگام barrier: acquisition جدید با `EXPLORER_SYSTEM_TRANSITION` رد می‌شود.
- Resume: ابتدا Root/Volume probe اجباری انجام می‌شود.
- بعد از probe: barrier برداشته می‌شود، ولی Leaseهای epoch قبلی stale باقی می‌مانند.
- Commit با Lease stale با `EXPLORER_OPERATION_FENCE_STALE` متوقف می‌شود.

Leaseها روی دیسک persist نمی‌شوند؛ پس Crash قفل مصنوعی باقی نمی‌گذارد. Startup recovery همچنان از Cycle/Transaction/Batch state و filesystem evidence استفاده می‌کند.

## Copy و editor خارجی

Single Copy و Batch Copy قبل از Commit:

1. Source snapshot را دوباره بررسی می‌کنند؛
2. فایل Stage را sync می‌کنند؛
3. SHA-256 Source و Stage را تطبیق می‌دهند؛
4. power fence و destination parent/reparse chain را دوباره بررسی می‌کنند؛
5. سپس rename اتمیک Stage → Destination انجام می‌شود؛
6. Destination با Hash commit-intent verify می‌شود.

اگر بعد از Commit برنامه دیگری Destination را تغییر داده باشد، cleanup فقط وقتی آن را حذف می‌کند که هنوز با Hash commit-intent برابر باشد. در غیر این صورت فایل حفظ و rollback ناقص/نیازمند بررسی اعلام می‌شود.

## Move / Rename

پیش از rename نهایی Source snapshot، parent مقصد، reparse chain و power fence دوباره بررسی می‌شوند. بعد از Move نیز Snapshot مقصد با Snapshot Preview مقایسه می‌شود تا تغییر هم‌زمان توسط editor پنهان نشود.

Case-only Rename روی Windows با staging دو مرحله‌ای انجام می‌شود تا `A.JPG → a.jpg` به‌عنوان NOOP اشتباه شناخته نشود و Crash window نیز Transaction evidence داشته باشد.

## Batch cross-volume

در Cross-volume Move دو مرز مستقل وجود دارد:

- Commit مقصد بعد از Copy؛
- حذف Source بعد از Verify مقصد.

Power fence در هر دو مرز بررسی می‌شود. بنابراین Sleep بین Copy و Delete باعث حذف Source با Lease قدیمی نمی‌شود.

## Reparse / parent swap

Containment صرفاً lexical کافی نیست. قبل از mutation/commit، Parent مقصد و زنجیره symlink/junction دوباره بررسی می‌شود. اگر Parent بعد از Preview عوض شده باشد یا traversal از reparse-like path عبور کند، Commit Block می‌شود.

## آنچه هنوز فقط Windows UAT می‌تواند اثبات کند

Source tests رفتار منطقی را پوشش می‌دهند، اما موارد زیر باید روی Windows 10/11 واقعی اجرا شوند:

- sharing modes واقعی Office/Corel/Photoshop؛
- ACL inheritance بعد از Copy/Move؛
- Junction / mount point / NTFS reparse points واقعی؛
- case-only rename روی NTFS؛
- Sleep/Hibernate/Resume وسط فایل‌های بزرگ؛
- رفتار SMB/UNC و removable volume هنگام transition.
