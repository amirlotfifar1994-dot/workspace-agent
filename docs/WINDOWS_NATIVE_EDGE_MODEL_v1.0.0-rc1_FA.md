# مدل Windows-native Edge — Workspace Agent v1.0.0-rc1 / cert-kit9

## اصل طراحی

در ابهام میان «ادامه دادن عملیات» و «حفظ حقیقت فایل‌سیستم»، Agent باید عملیات اثرگذار را متوقف کند. cert-kit9 به‌جای Auto-Rebind/Overwrite یا حدس درباره نام/Volume، identity و canonical-name را دوباره بررسی می‌کند.

## UNC و Volume identity

برای مسیرهای UNC، identity روی `\\server\share\` ثابت می‌شود. برای Driveهای Windows، `Get-Volume` و `UniqueId` identity قوی می‌دهند. Batch از همین identity برای same-volume/cross-volume decision استفاده می‌کند. اگر probe قوی در دسترس نباشد fallback صریح به drive/root identity باقی می‌ماند.

## Probe cadence در Jobهای بزرگ

اجرای PowerShell برای تک‌تک فایل‌ها در Jobهای 100k/1M قابل قبول نیست. بنابراین هر Chunk با deep identity probe شروع می‌شود و آیتم‌های داخل Chunk availability را با identity cache معتبر می‌سنجند. Deep probe دوره‌ای `RootResilienceService` نیز مستقل ادامه دارد.

## Unicode و نام‌های مبهم

روی Windows، نام siblingها با Unicode NFC و case-fold مقایسه می‌شوند. اگر دو نام از نظر canonical key یکسان باشند ولی نام واقعی متفاوت باشد، Write قبل از Commit Block می‌شود. Case-only rename مسیر اختصاصی cert-kit8 را دارد؛ normalization-only rename برای جلوگیری از ambiguity Block است.

## Destination-local staging و ACL context

Stage برای Copy در Parent مقصد ایجاد می‌شود و سپس با rename داخل همان Parent Commit می‌شود. این طراحی احتمال تفاوت security context ناشی از Stage در یک پوشه مرکزی را کم می‌کند. **اثبات ACL inheritance/owner/ACE واقعی همچنان Windows UAT است** و Source test جای آن را نمی‌گیرد.

## Removable volume / Drive-letter change

اگر Root قدیمی ناپدید شود اما همان Volume UniqueId با Drive letter جدید پیدا شود، نتیجه `ROOT_RELOCATED_CANDIDATE` است. Agent مسیر را خودکار عوض نمی‌کند؛ candidate برای تصمیم صریح کاربر/Release UAT ارائه می‌شود.

## Windows-native UAT

UAT cert-kit9 عملیات مخرب روی دیسک کاربر انجام نمی‌دهد و فقط داخل `WA_CERT_ROOT_A` یک workspace موقت می‌سازد. Gateها: NTFS، Unicode/Persian/emoji، canonical collision، long display path، case-only rename + undo و lock واقعی Windows با `FileShare.None`.

این UAT باید در Windows 10 و Windows 11 به‌همراه ماتریس اصلی Certification اجرا شود.
