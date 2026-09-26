# تغییرات Workspace Agent v0.6.0

## Controlled Intelligence
- Recommendation Review Queue برای تبدیل پیشنهادهای هوشمند به آیتم‌های قابل انتخاب.
- صف در دیتای داخلی Agent نگهداری می‌شود و هیچ Auto Apply ندارد.
- Move و Rename مربوط به یک فایل در Preview به یک عملیات Move+Rename ترکیب می‌شوند.
- Recommendation Apply از مسیر Preview → Confirm → Staging → Execute → Verify عبور می‌کند.
- Collision Guard، بررسی Size/Modified Time بعد از Preview، Auto-Rollback و Undo اضافه شد.

## Downloads / Desktop / Managed Zones
- Downloads، Desktop و Documents به‌عنوان Known Zone در Windows ثبت می‌شوند.
- امکان افزودن Workspace سفارشی به Managed Zones وجود دارد.
- Zone Audit شامل Clutter Score، فایل‌های قدیمی، Partial Download، Installer، Archive، Screenshot و پیشنهادهای Read-only است.
- هیچ پیشنهاد Zone به‌صورت خودکار روی فایل‌ها اعمال نمی‌شود.

## Storage Trend
- بعد از Managed Zone Audit یک Sample محلی از Files/Scanned bytes/Free space/Clutter ثبت می‌شود.
- تاریخچه به 365 نمونه محدود می‌شود تا State بدون رشد کنترل‌نشده باقی بماند.

## Drive-wide Audit
- Audit خواندنی از Drive مرتبط با Workspace اضافه شد.
- روی Windows پوشه‌های Windows، Program Files، ProgramData، Recovery، System Volume Information و Recycle Bin از اسکن عمیق کنار گذاشته می‌شوند.
- Top folders، Large files، Stale files، Extension stats، Long paths و خطاهای دسترسی گزارش می‌شوند.
- سقف File/Directory برای جلوگیری از Scan نامحدود فعال است.

## Conditional Automation
- Ruleهای Automation حالا Condition دارند: Always، Free Space below percent، Free Space below bytes.
- Condition در بازه Rule ارزیابی می‌شود و اگر برقرار نباشد Cycle اجرا نمی‌شود.
- Automation همچنان فقط Health / Duplicates / Snapshot / Snapshot Delta را اجرا می‌کند و Write روی Workspace مجاز نیست.

## Windows Startup Review Advisor
- Startup Inventory با Review Priority و Evidence غنی شد.
- Duplicate-like entry، Helper/Updater/Launcher و مسیر Temp/Downloads علامت‌گذاری می‌شوند.
- Auto Disable، Registry Write و Process Kill همچنان غیرفعال هستند.

## Safety
- Permanent Delete همچنان وجود ندارد.
- Recommendation write فقط با انتخاب صریح آیتم و Confirmation ممکن است.
- Undo روی مسیر اصلی collision را overwrite نمی‌کند و در صورت اشغال مسیر، خطا گزارش می‌دهد.
