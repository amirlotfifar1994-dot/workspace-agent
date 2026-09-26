# مدل Production Grounding — v0.9.3

## هدف

Grounding باید در UI واقعی Windows با DPI/چندمانیتور، popup/dialog، کنترل‌های هم‌نام و تغییر layout همچنان fail-safe بماند.

## Pipeline

1. UIA از Process فعال تا چند Surface هم‌زمان capture می‌شود.
2. هر عنصر با Surface، Ancestor trail، geometry و ScrollItem capability نرمال می‌شود.
3. Ranking از semantic + structural + context + uniqueness + verified-memory استفاده می‌کند.
4. Vision فقط Candidate IDهای موجود در UIA را corroborate می‌کند.
5. قبل از Preview، Session با UIA تازه refresh می‌شود.
6. Candidate قبلی با recovery score روی map تازه match می‌شود.
7. match مبهم یا ضعیف Block می‌شود.
8. Action Core همچنان selector را resolve، target را pin و نتیجه را verify می‌کند.

## Popup / Dialog

Inspector فقط focused window را نمی‌خواند؛ top-level surfaceهای همان Process را نیز با بودجه محدود جمع‌آوری می‌کند. `surfaceKind` می‌تواند window/dialog/menu باشد و `surfaceIsModal` در ranking لحاظ می‌شود.

## Scroll

کنترل offscreen فقط وقتی Candidate می‌شود که `ScrollItemPattern` در دسترس باشد. تنها Action اضافه‌شده `scrollIntoView` است و coordinate scrolling یا mouse wheel آزاد نداریم.

## Multi-monitor / DPI

Bounding rectangleهای UIA در coordinate space صفحه نگهداری می‌شوند. Crop service بر اساس نسبت تصویر انتخابی یکی از sourceهای زیر را انتخاب می‌کند:

- exact window
- display containing window
- virtual desktop

اگر نسبت/هندسه با هیچ source قابل‌اعتمادی سازگار نباشد crop انجام نمی‌شود. این رفتار از crop اشتباه روی Screenshot کل صفحه یا مانیتور دیگر جلوگیری می‌کند.

## Recovery

`refreshActionContext()` درست قبل از Preview اجرا می‌شود. معیار recovery از AutomationId، Name، Class، ControlType، Framework، Process، Surface/Ancestor context و تغییر هندسه استفاده می‌کند. اگر دو match نزدیک باشند `UI_GROUNDING_STALE_AMBIGUOUS` صادر می‌شود.

## Privacy

Raw intent در Grounding Memory ذخیره نمی‌شود. Screenshot خودکار وجود ندارد. Vision فقط روی فایل انتخابی کاربر کار می‌کند.
